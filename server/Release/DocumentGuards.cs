using System.Text.Json.Nodes;
using Kitchen.Inventory;
namespace Kitchen.Release;
public enum RouteDisposition { RegisterDenialOrOwnCud, Traversal, Unavailable }
public sealed record ReviewedBinding(TableKind Table,string Message,string FilterId,string MessageId,string TypeId,string PlanHash);
public sealed record RouteEvidence(TableKind Table,string Message,RouteDisposition Disposition,string AuthoritativeEvidenceHash,string NativeWitnessHash);
public sealed record RouteInventory(bool Complete,JsonObject[] Filters,JsonObject[] Steps,JsonObject[] GlobalSteps);
public static class DocumentGuards
{
    public static readonly string[] RequiredMessages=["Create","Update","Delete","Upsert","CreateMultiple","UpdateMultiple","UpsertMultiple","DeleteMultiple","Assign","GrantAccess","ModifyAccess","RevokeAccess","SetState"];
    public static readonly string[] DiscoveryMessages=["CreateMultipleLegacy","UpdateMultipleLegacy","Restore","SetStateDynamicEntity"];
    public static bool IndividualMessage(string m)=>m is "Create" or "Update" or "Delete" or "Assign" or "GrantAccess" or "ModifyAccess" or "RevokeAccess" or "SetState";
    public static void Validate(RouteInventory inventory,IReadOnlyList<RouteEvidence> evidence) {
        Check.Require(inventory.Complete);
        foreach(var table in Enum.GetValues<TableKind>()) {
            var discovered=inventory.Filters.Where(f=>(string?)f["primaryobjecttypecode"]==DocumentSchema.Logical(table)).Select(f=>Check.Text(f["sdkmessageid"],"name"));
            var steps=inventory.Steps.Concat(inventory.GlobalSteps).Select(f=>Check.Text(f["sdkmessageid"],"name"));
            foreach(var message in RequiredMessages.Concat(DiscoveryMessages).Concat(discovered).Concat(steps).Distinct(StringComparer.Ordinal)) {
                var rows=evidence.Where(e=>e.Table==table&&e.Message==message).ToArray();Check.Require(rows.Length==1);
                var r=rows[0];Check.Require(Hash(r.AuthoritativeEvidenceHash)&&Hash(r.NativeWitnessHash));
                if(r.Disposition==RouteDisposition.RegisterDenialOrOwnCud)Check.Require(IndividualMessage(message));
                if(message=="DeleteMultiple")Check.Require(r.Disposition==RouteDisposition.Unavailable);
                if(message is "Upsert" or "CreateMultiple" or "UpdateMultiple" or "UpsertMultiple")Check.Require(r.Disposition==RouteDisposition.Traversal);
                Check.Require(Enum.IsDefined(r.Disposition));
            }
        }
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
    Task<RouteInventory> ReadCanonicalInventory(CancellationToken token);
    Task CreateFixedGuardOnce(ReviewedBinding binding,CancellationToken token);
}
internal sealed class FixedDocumentGuardBoundary : IDocumentGuardBoundary,IDisposable
{
    readonly Reader reader;readonly Func<Task<string>> token;readonly IAttemptJournal journal;readonly HttpClient client;int attempted;
    internal FixedDocumentGuardBoundary(Reader reader,Func<Task<string>> token,IAttemptJournal journal,HttpMessageHandler? handler=null){this.reader=reader;this.token=token;this.journal=journal;client=new(handler??new HttpClientHandler{AllowAutoRedirect=false,UseCookies=false}){Timeout=TimeSpan.FromSeconds(90)};}
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
    public static Presence Observe(ReviewedBinding binding,RouteInventory inventory) {
        if(!inventory.Complete)return Presence.Unknown;
        try {
            var rows=inventory.Steps.Concat(inventory.GlobalSteps).Where(s=>(string?)s["_sdkmessagefilterid_value"]==binding.FilterId&&(string?)s["_eventhandler_value"]==binding.TypeId).ToArray();
            if(rows.Length==0){_=DocumentGuards.BindingShape(binding,inventory);return Presence.Missing;}
            if(rows.Length!=1)return Presence.DriftOrDuplicate;DocumentGuards.VerifyStep(rows[0],binding);return Presence.ExistingExact;
        }catch{return Presence.DriftOrDuplicate;}
    }
    public static Task<AdditiveResult> Run(ReviewedBinding binding,IDocumentGuardBoundary boundary,Func<CancellationToken,Task<bool>> checkpoint,IAttemptJournal journal,CancellationToken token=default)=>AdditiveAttempt.Run(
        t=>AdditiveAttempt.ReadBoth(async c=>Observe(binding,await boundary.ReadCanonicalInventory(c)),async c=>Observe(binding,await boundary.ReadCanonicalInventory(c)),t),
        t=>boundary.CreateFixedGuardOnce(binding,t),checkpoint,journal,token);
}
