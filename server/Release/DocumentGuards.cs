using System.Text.Json.Nodes;
using Kitchen.Inventory;
namespace Kitchen.Release;
public enum RouteDisposition { RegisterDenialOrOwnCud, Traversal, Unavailable }
public sealed record ReviewedBinding(TableKind Table,string Message,string FilterId,string MessageId,string TypeId,string PlanHash);
public sealed record RouteEvidence(TableKind Table,string Message,RouteDisposition Disposition,string AuthoritativeEvidenceHash,string? NativeWitnessHash);
public sealed record RouteInventory(bool Complete,JsonObject[] Filters,JsonObject[] Steps,JsonObject[] GlobalSteps);
public static class DocumentGuards
{
    public static readonly string[] RequiredMessages=["Create","Update","Delete","Upsert","CreateMultiple","UpdateMultiple","UpsertMultiple","DeleteMultiple","Assign","GrantAccess","ModifyAccess","RevokeAccess","SetState"];
    public static readonly string[] DiscoveryMessages=["CreateMultipleLegacy","UpdateMultipleLegacy","Restore","SetStateDynamicEntity"];
    public static bool IndividualMessage(string m)=>m is "Create" or "Update" or "Delete" or "Assign" or "GrantAccess" or "ModifyAccess" or "RevokeAccess" or "SetState";
    public static void Validate(RouteInventory inventory,IReadOnlyList<RouteEvidence> evidence)=>ValidateCore(inventory,evidence,true);
    internal static void ValidatePreparationPlan(RouteInventory inventory,IReadOnlyList<RouteEvidence> evidence)=>ValidateCore(inventory,evidence,false);
    static void ValidateCore(RouteInventory inventory,IReadOnlyList<RouteEvidence> evidence,bool final) {
        Check.Require(inventory.Complete);
        var required=new HashSet<(TableKind,string)>();
        foreach(var table in Enum.GetValues<TableKind>()) {
            var discovered=inventory.Filters.Where(f=>(string?)f["primaryobjecttypecode"]==DocumentSchema.Logical(table)).Select(f=>Check.Text(f["sdkmessageid"],"name"));
            var steps=inventory.Steps.Concat(inventory.GlobalSteps).Select(f=>Check.Text(f["sdkmessageid"],"name"));
            foreach(var message in RequiredMessages.Concat(DiscoveryMessages).Concat(discovered).Concat(steps).Distinct(StringComparer.Ordinal)) {
                required.Add((table,message));
                var rows=evidence.Where(e=>e.Table==table&&e.Message==message).ToArray();Check.Require(rows.Length==1);
                var r=rows[0];Check.Require(Hash(r.AuthoritativeEvidenceHash)&&(!final||Hash(r.NativeWitnessHash)));
                if(r.Disposition==RouteDisposition.RegisterDenialOrOwnCud)Check.Require(IndividualMessage(message));
                if(message is "Create" or "Update" or "Delete")Check.Require(r.Disposition==RouteDisposition.RegisterDenialOrOwnCud);
                if(message=="DeleteMultiple")Check.Require(r.Disposition==RouteDisposition.Unavailable);
                if(message is "Upsert" or "CreateMultiple" or "UpdateMultiple" or "UpsertMultiple")Check.Require(r.Disposition==RouteDisposition.Traversal);
                Check.Require(Enum.IsDefined(r.Disposition));
            }
        }
        Check.Require(evidence.Count==required.Count&&evidence.All(e=>required.Contains((e.Table,e.Message))));
    }
    public static bool Hash(string? h)=>h!=null&&System.Text.RegularExpressions.Regex.IsMatch(h,"\\A[0-9a-f]{64}\\z");
    public static JsonObject Binding(ReviewedBinding b,RouteInventory inventory) {
        Check.Require(ReviewedRelease.Bindings.Contains(b));
        return BindingShape(b,inventory);
    }
    internal static JsonObject BindingShape(ReviewedBinding b,RouteInventory inventory) {
        Check.Require(inventory.Complete&&IndividualMessage(b.Message));Check.Id(b.TypeId);
        var filters=inventory.Filters.Where(f=>(string?)f["primaryobjecttypecode"]==DocumentSchema.Logical(b.Table)&&(string?)f["sdkmessageid"]?["name"]==b.Message).ToArray();
        Check.Require(filters.Length==1);var filter=filters[0];
        Check.Require(Check.Id(filter,"sdkmessagefilterid")==b.FilterId && Check.Id(filter["sdkmessageid"],"sdkmessageid")==b.MessageId && filter["isvisible"]?.GetValue<bool>()==true&&filter["iscustomprocessingstepallowed"]?.GetValue<bool>()==true&&filter["sdkmessageid"]?["isprivate"]?.GetValue<bool>()==false);
        Check.Require(!inventory.Steps.Concat(inventory.GlobalSteps).Any(s=>(string?)s["_sdkmessagefilterid_value"]==b.FilterId&&(string?)s["_eventhandler_value"]==b.TypeId));
        return new JsonObject{["name"]="zk_KitchenDocumentGuard_"+DocumentSchema.Logical(b.Table)+"_"+b.Message,["stage"]=20,["mode"]=0,["rank"]=1,["supporteddeployment"]=0,["filteringattributes"]=null,["configuration"]=null,["sdkmessageid@odata.bind"]="/sdkmessages("+b.MessageId+")",["sdkmessagefilterid@odata.bind"]="/sdkmessagefilters("+b.FilterId+")",["eventhandler_plugintype@odata.bind"]="/plugintypes("+b.TypeId+")"};
    }
    public static void VerifyStep(JsonObject step,ReviewedBinding b) {
        Check.Id(step,"sdkmessageprocessingstepid");
        Check.Match(step,new JsonObject{["stage"]=20,["mode"]=0,["rank"]=1,["statecode"]=0,["supporteddeployment"]=0,["filteringattributes"]=null,["configuration"]=null,["_impersonatinguserid_value"]=null,["_sdkmessageid_value"]=b.MessageId,["_sdkmessagefilterid_value"]=b.FilterId,["_eventhandler_value"]=b.TypeId});
    }
}
public interface IDocumentGuardBoundary {
    Task<TargetObservation> ReadExactGuard(ReviewedBinding binding,CancellationToken token);
    Task<RouteInventory> ReadCanonicalInventory(CancellationToken token);
    Task CreateFixedGuardOnce(ReviewedBinding binding,CancellationToken token);
}
internal sealed class FixedDocumentGuardBoundary : IDocumentGuardBoundary,IDisposable
{
    readonly Reader reader;readonly Func<Task<string>> token;readonly IAttemptJournal journal;readonly HttpClient client;int attempted;
    internal FixedDocumentGuardBoundary(Reader reader,Func<Task<string>> token,IAttemptJournal journal,HttpMessageHandler? handler=null){this.reader=reader;this.token=token;this.journal=journal;client=new(handler??new HttpClientHandler{AllowAutoRedirect=false,UseCookies=false}){Timeout=TimeSpan.FromSeconds(90)};}
    public async Task<TargetObservation> ReadExactGuard(ReviewedBinding binding,CancellationToken cancellation) {
        try {
            var rows=await reader.ExactGuardCandidates(binding).WaitAsync(cancellation);
            if(rows.Length==0)return new(Presence.Missing);
            if(rows.Length!=1)return new(Presence.DriftOrDuplicate);
            var exact=await reader.ExactObservedRow(rows[0],true,cancellation);
            Check.Require(AdditiveAttempt.SameRow(exact,rows[0]));DocumentGuards.VerifyStep(exact,binding);
            return new(Presence.ExistingExact,exact);
        }catch{return new(Presence.Unknown);}
    }
    public async Task<RouteInventory> ReadCanonicalInventory(CancellationToken cancellation) {
        try {
            reader.ReleaseQueries(ReleaseQueries.All);var filters=new List<JsonObject>();
            foreach(var table in Enum.GetValues<TableKind>())filters.AddRange(await reader.Rows(ReleaseQueries.Filters(table),"sdkmessagefilterid",1000).WaitAsync(cancellation));
            var steps=await reader.Rows(ReleaseQueries.Steps,"sdkmessageprocessingstepid",10000).WaitAsync(cancellation);
            return new(true,filters.ToArray(),steps.Where(s=>s["_sdkmessagefilterid_value"]!=null).ToArray(),steps.Where(s=>s["_sdkmessagefilterid_value"]==null).ToArray());
        }catch{return new(false,[],[],[]);}
    }
    public async Task CreateFixedGuardOnce(ReviewedBinding binding,CancellationToken cancellation) {
        Check.Require(ReviewedRelease.CanExecute(ReleaseMode.RegisterDocumentGuards));
        var payload=DocumentGuards.Binding(binding,await ReadCanonicalInventory(cancellation));
        Check.Require(Interlocked.Exchange(ref attempted,1)==0);Check.Require(journal.AttemptPersisted);
        using var request=new HttpRequestMessage(HttpMethod.Post,Target.Api+"sdkmessageprocessingsteps");
        request.Headers.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",await token());request.Headers.Add("MSCRM.SolutionUniqueName","zk_Zunftkueche");
        request.Content=new StringContent(payload.ToJsonString(),System.Text.Encoding.UTF8,"application/json");
        using var response=await client.SendAsync(request,HttpCompletionOption.ResponseHeadersRead,cancellation);Check.Require(response.IsSuccessStatusCode);
    }
    public void Dispose()=>client.Dispose();
}
public static class GuardPhase
{
    internal static TargetObservation FromCollection(ReviewedBinding binding,RouteInventory inventory) {
        var state=Observe(binding,inventory);return state==Presence.ExistingExact?new(state,inventory.Steps.Concat(inventory.GlobalSteps).Single(s=>(string?)s["_sdkmessagefilterid_value"]==binding.FilterId&&(string?)s["_eventhandler_value"]==binding.TypeId)):new(state);
    }
    public static Presence Observe(ReviewedBinding binding,RouteInventory inventory) {
        if(!inventory.Complete)return Presence.Unknown;
        try {
            var rows=inventory.Steps.Concat(inventory.GlobalSteps).Where(s=>(string?)s["_sdkmessagefilterid_value"]==binding.FilterId&&(string?)s["_eventhandler_value"]==binding.TypeId).ToArray();
            if(rows.Length==0){_=DocumentGuards.BindingShape(binding,inventory);return Presence.Missing;}
            if(rows.Length!=1)return Presence.DriftOrDuplicate;DocumentGuards.VerifyStep(rows[0],binding);return Presence.ExistingExact;
        }catch{return Presence.DriftOrDuplicate;}
    }
    public static Task<AdditiveResult> Run(ReviewedBinding binding,IDocumentGuardBoundary boundary,Func<CancellationToken,Task<bool>> checkpoint,IAttemptJournal journal,CancellationToken token=default)=>AdditiveAttempt.Run(
        t=>AdditiveAttempt.ReadTargets(c=>boundary.ReadExactGuard(binding,c),async c=>FromCollection(binding,await boundary.ReadCanonicalInventory(c)),t),
        t=>boundary.CreateFixedGuardOnce(binding,t),checkpoint,journal,token);
}

public enum RouteReviewKind { FinalWitnessed,RefusalPreparation }
public enum NativeWitnessState { Observed,Unproved }
public sealed record PinnedRouteEvidence(RouteEvidence Route,EvidenceFile Authoritative,EvidenceFile? NativeWitness,NativeWitnessState WitnessState=NativeWitnessState.Observed);
public sealed record RouteReview(string Schema,string Organization,string Solution,PinnedRouteEvidence[] Evidence,RouteReviewKind Kind=RouteReviewKind.FinalWitnessed,string? InventorySha256=null)
{
    internal static RouteReview Load(EvidenceFile? pin,string root) {
        Check.Require(pin!=null);
        var raw=pin!.Verify(root);_=Check.Parse(raw); // Reject duplicate keys before typed deserialization.
        var review=System.Text.Json.JsonSerializer.Deserialize<RouteReview>(raw,new System.Text.Json.JsonSerializerOptions{UnmappedMemberHandling=System.Text.Json.Serialization.JsonUnmappedMemberHandling.Disallow})??throw new Stop();
        review.VerifyFiles(root);return review;
    }
    internal void VerifyFiles(string root) {
        Check.Require(Schema=="kitchen-document-route-review-v1"&&Organization==Target.Organization&&Solution==Target.Solution);
        Check.Require(Enum.IsDefined(Kind));
        if(Evidence==null)throw new Stop();
        foreach(var item in Evidence) {
            if(item==null||item.Route==null||item.Authoritative==null)throw new Stop();
            Check.Require(Check.Hash(item.Authoritative.Verify(root))==item.Route.AuthoritativeEvidenceHash);
            if(item.WitnessState==NativeWitnessState.Unproved)Check.Require(Kind==RouteReviewKind.RefusalPreparation&&item.NativeWitness==null&&item.Route.NativeWitnessHash==null);
            else {Check.Require(item.WitnessState==NativeWitnessState.Observed&&item.NativeWitness!=null);Check.Require(Check.Hash(item.NativeWitness!.Verify(root))==item.Route.NativeWitnessHash);}
        }
    }
    internal void Validate(RouteInventory current,ReviewedBinding? binding=null) {
        if(Kind==RouteReviewKind.RefusalPreparation) {
            Check.Require(DocumentGuards.Hash(InventorySha256)&&InventorySha256==Check.Fingerprint(System.Text.Json.JsonSerializer.SerializeToNode(current)!));
            DocumentGuards.ValidatePreparationPlan(current,Evidence.Select(e=>e.Route).ToArray());
        } else DocumentGuards.Validate(current,Evidence.Select(e=>e.Route).ToArray());
        if(binding!=null)Check.Require(Evidence.Single(e=>e.Route.Table==binding.Table&&e.Route.Message==binding.Message).Route.Disposition==RouteDisposition.RegisterDenialOrOwnCud);
    }
}
internal static class PhaseRoutePrerequisites
{
    // New tables do not have usable routes before schema installation. Schema-only creation
    // remains gated by native current-source completeness; final package/guard phases require this review.
    internal static bool Required(ReleaseMode mode)=>mode is ReleaseMode.ActivatePackage or ReleaseMode.RegisterDocumentGuards;
    internal static bool Required(ReviewedPhase phase) {
        var scope=ReleaseScope.Phase(phase);
        return phase.Mode==ReleaseMode.RegisterDocumentGuards||phase.Mode==ReleaseMode.ActivatePackage&&scope?.Scope!=Zunftkueche.BackupScope.Core;
    }
    internal static RouteReview Load(ReviewedPhase phase,string root) {
        Check.Require(Required(phase));
        var preparation=phase.Mode==ReleaseMode.ActivatePackage
            ? (phase.Transition??throw new Stop()).Kind switch{TransitionKind.V5ToRefusalDiagnostic=>true,TransitionKind.RefusalDiagnosticToFinal=>false,_=>throw new Stop()}
            : phase.Preparation!=null;
        Check.Require(preparation==(phase.Preparation!=null));
        phase.Preparation?.Verify(root,phase);
        var review=RouteReview.Load(phase.Routes,root);Check.Require(review.Kind==(preparation?RouteReviewKind.RefusalPreparation:RouteReviewKind.FinalWitnessed));
        return review;
    }
    internal static async Task Validate(ReviewedPhase phase,string root,IDocumentGuardBoundary boundary,Func<CancellationToken,Task> verifyInstalledDiagnostic,CancellationToken cancellation) {
        if(!Required(phase))return;
        var review=Load(phase,root);review.Validate(await boundary.ReadCanonicalInventory(cancellation),phase.Guard);
        if(review.Kind==RouteReviewKind.RefusalPreparation&&phase.Mode==ReleaseMode.RegisterDocumentGuards)await verifyInstalledDiagnostic(cancellation);
    }
    internal static async Task Validate(ReleaseMode mode,EvidenceFile? pin,string root,IDocumentGuardBoundary boundary,ReviewedBinding? binding,CancellationToken cancellation) {
        if(!Required(mode))return;
        var review=RouteReview.Load(pin,root);Check.Require(review.Kind==RouteReviewKind.FinalWitnessed);
        review.Validate(await boundary.ReadCanonicalInventory(cancellation),binding);
    }
}
