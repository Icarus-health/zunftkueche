using System.Net;
using System.Net.Http.Headers;
using System.Text.Json.Nodes;
using Kitchen.Inventory;
using PackageActivationPreparation;
using Zunftkueche;
namespace Kitchen.Release;

// Pure stable identity deliberately excludes file ID, ETag and changing row-version.
// Those remain in the complete bracket and are checked independently.
public static class PackageIdentity
{
    public static string Stable(JsonObject p) {
        Inspector.ValidatePackage(p);
        return Check.Fingerprint(new JsonObject{["organization"]=FixedTarget.Organization,["origin"]=FixedTarget.Origin,["package"]=FixedTarget.Package,["assembly"]=FixedTarget.Assembly,["name"]=p["name"]!.DeepClone(),["uniquename"]=p["uniquename"]!.DeepClone(),["version"]=p["version"]!.DeepClone(),["state"]=p["statecode"]!.DeepClone()});
    }
}
public interface ICurrentReleaseCheckpoint
{
    // Implementation must remeasure current source+schema+access+package+client and compare retained file pins.
    // An old manifest timestamp is never compared with a newly generated backup timestamp.
    Task<Checkpoint> RemeasureAndVerifyRetainedEvidence(CancellationToken cancellation);
    Task VerifyInstalledTypeApiSolutionClosure(CancellationToken cancellation);
}
public sealed class FixedPackageBoundary : IFixedPackageBoundary, IDisposable
{
    readonly Reader reader;readonly Func<Task<string>> token;readonly HttpClient client;readonly ICurrentReleaseCheckpoint checkpoint;readonly IAttemptJournal journal;
    readonly ReviewedTransition transition;int attempted;string? fileId;string? rowVersion;
    internal FixedPackageBoundary(Reader reader,Func<Task<string>> token,ICurrentReleaseCheckpoint checkpoint,IAttemptJournal journal,ReviewedTransition transition,HttpMessageHandler? handler=null) {
        Check.Require(ReviewedRelease.Transitions.Contains(transition));
        if(transition.Kind!=TransitionKind.V5ToRefusalDiagnostic)ReleaseScope.RequireProduction(transition.ExpectedScope);
        this.reader=reader;this.token=token;this.checkpoint=checkpoint;this.journal=journal;this.transition=transition;
        client=new(handler??new HttpClientHandler{AllowAutoRedirect=false,UseCookies=false}){Timeout=Timeout.InfiniteTimeSpan};
    }
    public async Task<PackageMetadata> ReadCanonicalMetadataAsync(CancellationToken cancellation) {
        var p=await reader.Object(Queries.Package).WaitAsync(cancellation);Inspector.ValidatePackage(p);
        var currentFile=Check.Id(p,"package");var currentRow=Check.Text(p,"@odata.etag");
        // On the second side of a bracket both file locator and row version must match.
        if(fileId!=null){Check.Require(fileId==currentFile&&rowVersion==currentRow);fileId=null;rowVersion=null;}
        else{fileId=currentFile;rowVersion=currentRow;}
        await checkpoint.VerifyInstalledTypeApiSolutionClosure(cancellation);
        return new(FixedTarget.Organization,FixedTarget.Origin,FixedTarget.Package,FixedTarget.Assembly,FixedTarget.Name,FixedTarget.Name,FixedTarget.Version,currentRow,PackageIdentity.Stable(p));
    }
    public Task<byte[]> ReadCanonicalContentAsync(CancellationToken cancellation)=>reader.Get(Queries.PackageBytes).WaitAsync(cancellation);
    public Task<Checkpoint> ReadCompleteCheckpointAsync(CancellationToken cancellation)=>checkpoint.RemeasureAndVerifyRetainedEvidence(cancellation);
    public async Task<WriteOutcome> UpdateExistingPackageContentOnceAsync(ReadOnlyMemory<byte> content,WriteCondition condition,CancellationToken cancellation) {
        Check.Require(Interlocked.Exchange(ref attempted,1)==0&&condition.Mode==transition.Mode&&Check.Hash(content.ToArray())==transition.Package.Sha256&&content.Length==transition.Package.Length);
        journal.Begin("activate-existing-package-"+transition.Kind); // Persistence failure => zero transport writes.
        fileId=null;rowVersion=null;
        using var request=new HttpRequestMessage(HttpMethod.Patch,Target.Api+"pluginpackages("+Target.Package+")");
        request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",await token());request.Headers.TryAddWithoutValidation("If-Match",condition.IfMatch);
        request.Headers.Add("MSCRM.SolutionUniqueName","zk_Zunftkueche");
        request.Content=new StringContent(new JsonObject{["content"]=Convert.ToBase64String(content.Span)}.ToJsonString(),System.Text.Encoding.UTF8,"application/json");
        using var response=await client.SendAsync(request,HttpCompletionOption.ResponseHeadersRead,cancellation);
        return response.StatusCode==HttpStatusCode.NoContent?WriteOutcome.Success204:response.StatusCode==HttpStatusCode.PreconditionFailed?WriteOutcome.Refusal412:WriteOutcome.Unknown;
    }
    public void Dispose()=>client.Dispose();
}
public static class PackageActivation
{
    public static async Task<ActivationResult> Run(ReviewedTransition transition,string evidenceRoot,Checkpoint current,string etag,string stable,
        IFixedPackageBoundary boundary,IAttemptJournal journal,CancellationToken token=default) {
        Check.Require(ReviewedRelease.Transitions.Contains(transition));
        if(transition.Kind!=TransitionKind.V5ToRefusalDiagnostic)ReleaseScope.RequireProduction(transition.ExpectedScope);
        _=transition.SourceBuild.Verify(evidenceRoot);_=transition.IndependentReview.Verify(evidenceRoot);
        if(transition.Mode==WriteMode.ExclusiveWriterNoAtomicCas)_=transition.WriterExclusion.Verify(evidenceRoot);
        var bytes=transition.Package.Verify(evidenceRoot);
        var plan=new ActivationPlan(transition.Mode,etag,stable,transition.Package.Sha256,checked((int)transition.Package.Length),transition.SourceBuild.Sha256,transition.IndependentReview.Sha256,current,transition.PriorHash,transition.PriorLength);
        var result=await new ActivationCore().ActivateAsync(plan,bytes,boundary,token);
        if(result.WriteAttempted){try{journal.Observe(result.Status.ToString());}catch{return result with{Status=ActivationStatus.AmbiguousStop};}}
        return result;
    }
}

public sealed record CheckpointInput(Checkpoint Accepted,EvidenceFile BackupManifest,EvidenceFile ValidatorEvidence,EvidenceFile InventoryManifest,
    EvidenceFile CompletenessReview,EvidenceFile ClientManifest,string MetadataAccessClientSha256,string CallerId,string[] RequiredOriginalHashes,OriginalVersion[] Originals);
internal sealed class NativeCheckpoint : ICurrentReleaseCheckpoint
{
    readonly Reader reader;readonly Backup capture;readonly string root;readonly CheckpointInput input;readonly BackupScopeBinding? expectedScope;readonly ReviewedPhase? preparation;
    readonly Func<CancellationToken,Task>? routePrerequisite;
    internal NativeCheckpoint(Reader reader,Backup capture,string root,CheckpointInput input,BackupScopeBinding? expectedScope,Func<CancellationToken,Task>? routePrerequisite=null,ReviewedPhase? preparation=null) {
        Check.Require(input.Accepted.Valid());this.reader=reader;this.capture=capture;this.root=root;this.input=input;this.expectedScope=expectedScope;this.preparation=preparation;
        if(expectedScope!=null)ReleaseScope.Require(expectedScope);
        else Check.Require(preparation!=null&&ReleaseScope.Phase(preparation)==null);
        this.routePrerequisite=routePrerequisite;
    }
    public async Task<Checkpoint> RemeasureAndVerifyRetainedEvidence(CancellationToken token) {
        VerifyRetained();reader.ReleaseQueries(ReleaseQueries.All);
        var first=await reader.Object(Queries.Workspace).WaitAsync(token);Inspector.ValidateWorkspace(first);
        var receipts=await reader.Rows(Queries.Receipts,"zk_kitchenoperationid",4000).WaitAsync(token);
        var docs=await Store(TableKind.Document,token);var drafts=await Store(TableKind.Draft,token);
        var raw=new System.Text.UTF8Encoding(false,true).GetBytes(Check.Text(first,"zk_state"));
        if(expectedScope!=null)ReleaseScope.ValidateState(expectedScope,raw,(int)first["zk_revision"]!,receipts);
        else CompleteInventory.ValidateCurrentPolicy(raw,(int)first["zk_revision"]!,receipts);
        // Current document/source rows are hashed completely, including immutable histories and acceptance receipts.
        // Cloud originals require a separately implemented fixed version-byte reader; retained bytes alone do not prove fresh cloud state.
        var originals=ValidateFreshOriginals(root,raw,docs,drafts,input.Originals,input.RequiredOriginalHashes);
        var closure=await ReadClosure(docs,drafts,first,receipts,token);
        Check.Require(Check.Fingerprint(closure)==input.MetadataAccessClientSha256);
        var repeated=await reader.Rows(Queries.Receipts,"zk_kitchenoperationid",4000).WaitAsync(token);var docsAgain=await Store(TableKind.Document,token);var draftsAgain=await Store(TableKind.Draft,token);
        Check.Require(CompleteInventory.Collection("receipts",receipts,"zk_kitchenoperationid")==CompleteInventory.Collection("receipts",repeated,"zk_kitchenoperationid")&&docs.Hash==docsAgain.Hash&&docs.SchemaHash==docsAgain.SchemaHash&&drafts.Hash==draftsAgain.Hash&&drafts.SchemaHash==draftsAgain.SchemaHash&&Check.Fingerprint(first)==Check.Fingerprint(await reader.Object(Queries.Workspace).WaitAsync(token)));
        var closureAgain=await ReadClosure(docsAgain,draftsAgain,first,receipts,token);
        Check.Require(Check.Fingerprint(closure)==Check.Fingerprint(closureAgain));
        Check.Require(Check.Fingerprint(first)==Check.Fingerprint(await reader.Object(Queries.Workspace).WaitAsync(token))&&CompleteInventory.Collection("receipts",receipts,"zk_kitchenoperationid")==CompleteInventory.Collection("receipts",await reader.Rows(Queries.Receipts,"zk_kitchenoperationid",4000).WaitAsync(token),"zk_kitchenoperationid"));
        VerifyRetained();
        if(routePrerequisite!=null)await routePrerequisite(token);
        var measured=input.Accepted with{OwnerId=Check.Id(first,"_ownerid_value"),OwnerType=Check.Text(first,"_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname"),Revision=(long)first["zk_revision"]!,WorkspaceRowVersion=first["versionnumber"]!.ToJsonString(),RawStateSha256=Check.Hash(raw),ReceiptCount=receipts.Length,ReceiptCollectionSha256=CompleteInventory.Collection("receipts",receipts,"zk_kitchenoperationid"),DocumentCount=docs.Rows.Length,DocumentCollectionSha256=docs.Hash,DraftCount=drafts.Rows.Length,DraftCollectionSha256=drafts.Hash,OriginalVersionCount=input.Originals.Length,OriginalVersionsAndBytesManifestSha256=originals};
        Check.Require(measured==input.Accepted);return measured;
    }
    void VerifyRetained() {
        Check.Require(Check.Hash(input.BackupManifest.Verify(root))==input.Accepted.BackupManifestSha256&&Check.Hash(input.ValidatorEvidence.Verify(root))==input.Accepted.ValidatorEvidenceSha256&&Check.Hash(input.InventoryManifest.Verify(root))==input.Accepted.InventoryManifestSha256);
        _=input.CompletenessReview.Verify(root);_=input.ClientManifest.Verify(root);
        var folder=Path.GetDirectoryName(Path.Combine(root,input.BackupManifest.RelativePath))!;Check.Require(Backup.IsComplete(folder));
        Check.Require(Check.Parse(input.BackupManifest.Verify(root))["fullCurrentNativeBackup"]?.GetValue<bool>()==true);
    }
    internal static string ValidateFreshOriginals(string root,byte[] raw,CurrentStore docs,CurrentStore drafts,OriginalVersion[] originals,string[] assertedHashes) =>
        OriginalRequirements.ValidateLocal(root,raw,docs.Rows.Select(r=>Zunftkueche.Protocol.Parse(Check.Text(r,"zk_payload"))),drafts.Rows.Select(r=>Zunftkueche.Protocol.Parse(Check.Text(r,"zk_payload"))),originals,assertedHashes);
    async Task<CurrentStore> Store(TableKind table,CancellationToken token) {
        using var boundary=new FixedDocumentSchemaBoundary(reader,()=>throw new Stop(),new DurableAttemptJournal(Path.Combine(root,"attempts"),"checkpoint-no-write"));
        var schema=await boundary.ReadCanonicalSchema(table,token);
        if(expectedScope!=null)ReleaseScope.ValidateStore(expectedScope,CurrentDocumentStore.Classify(table,schema));
        var current=await CurrentDocumentStore.Read(table,schema,reader,expectedScope?.Scope==BackupScope.Documents||expectedScope==null&&preparation!.Mode!=ReleaseMode.ProvisionDocumentSchema,token);
        return current;
    }
    internal static async Task<JsonObject> ReadCoreClosure(Reader reader,Backup capture,string prefix,string? expectedCaller,CancellationToken token,JsonObject? workspace=null,JsonObject[]? receipts=null) {
        var metadata=new Metadata(reader,capture,prefix);await metadata.Read().WaitAsync(token);
        if(workspace!=null)metadata.ValidateRecordFields(workspace,receipts??throw new Stop());
        var who=await reader.Object("WhoAmI").WaitAsync(token);var caller=Check.Id(who,"UserId");
        Check.Require(Check.Id(who,"OrganizationId")==Target.Organization&&(expectedCaller==null||caller==expectedCaller));
        var access=await reader.Object(Queries.Access(caller)).WaitAsync(token);Inspector.ValidateRights(access);
        var privileges=await reader.Object(Queries.Privileges(caller)).WaitAsync(token);Check.Require(privileges["RolePrivileges"] is JsonArray);
        capture.Json(prefix+"caller-identity.json",who);capture.Json(prefix+"access.json",access);capture.Json(prefix+"privileges-team-depth-limited.json",privileges);
        return new JsonObject{["core"]=metadata.Fingerprint,["who"]=who,["access"]=access,["privileges"]=privileges};
    }
    async Task<JsonObject> ReadClosure(CurrentStore docs,CurrentStore drafts,JsonObject workspace,JsonObject[] receipts,CancellationToken token) {
        var prefix="checkpoint-"+Guid.NewGuid().ToString("N")+"-";
        var closure=new JsonObject{["schema"]="kitchen-scoped-checkpoint-closure-v1",["scope"]=expectedScope?.Scope.ToString()??"preparation-not-backup-scope",["scopeFingerprint"]=expectedScope==null?null:ReleaseScope.Fingerprint(expectedScope),["coreMetadataAccess"]=await ReadCoreClosure(reader,capture,prefix,input.CallerId,token,workspace,receipts),["documentSchema"]=docs.SchemaHash,["draftSchema"]=drafts.SchemaHash,["clientManifest"]=Check.Hash(input.ClientManifest.Verify(root))};
        if(expectedScope?.Scope!=BackupScope.Core) {
            foreach(var pair in new[]{("roles",ReleaseQueries.Roles,"roleid"),("users",ReleaseQueries.Users,"systemuserid"),("routes",ReleaseQueries.Steps,"sdkmessageprocessingstepid")}) {
                var rows=await reader.Rows(pair.Item2,pair.Item3,pair.Item1=="users"?10:10000).WaitAsync(token);var array=new JsonArray(rows.Select(r=>r.DeepClone()).ToArray());capture.Json(prefix+pair.Item1+".json",array);closure[pair.Item1]=array;
            }
        }
        return closure;
    }
    public async Task VerifyInstalledTypeApiSolutionClosure(CancellationToken token) {var metadata=new Metadata(reader,capture,"package-readback-"+Guid.NewGuid().ToString("N")+"-");await metadata.Read().WaitAsync(token);}
}

internal static class PhaseDispatch
{
    internal static async Task<int> Run(ReleaseMode mode,ReviewedPhase phase,string root,Reader reader,Func<Task<string>> token,Backup capture) {
        Check.Require(ReviewedRelease.Phases.Contains(phase)&&phase.Mode==mode);
        _=phase.Plan.Verify(root);_=phase.Review.Verify(root);
        var input=System.Text.Json.JsonSerializer.Deserialize<CheckpointInput>(phase.Checkpoint.Verify(root))??throw new Stop();
        var scope=ReleaseScope.Phase(phase);if(scope!=null)ReleaseScope.RequireProduction(scope);
        // One operation per reviewed invocation, fixed journal scope blocks restart until independent reconciliation.
        var journal=new DurableAttemptJournal(Path.Combine(root,"attempts"),mode+"-"+phase.Plan.Sha256);
        using var routeBoundary=new FixedDocumentGuardBoundary(reader,token,journal);
        async Task InstalledDiagnostic(CancellationToken t) {
            var preparation=phase.Preparation??throw new Stop();
            var before=await reader.Object(Queries.Package).WaitAsync(t);Inspector.ValidatePackage(before);
            var bytes=await reader.Get(Queries.PackageBytes).WaitAsync(t);var after=await reader.Object(Queries.Package).WaitAsync(t);
            Check.Require(Check.Fingerprint(before)==Check.Fingerprint(after)&&bytes.LongLength==preparation.DiagnosticPackage.Length&&Check.Hash(bytes)==preparation.DiagnosticPackage.Sha256);
        }
        Task Routes(CancellationToken t)=>PhaseRoutePrerequisites.Validate(phase,root,routeBoundary,InstalledDiagnostic,t);
        if(PhaseRoutePrerequisites.Required(phase))using(var deadline=new CancellationTokenSource(TimeSpan.FromSeconds(180)))await Routes(deadline.Token); // Before any phase attempt.
        if(phase.Preparation!=null)Console.WriteLine("REFUSAL_PREPARATION_ONLY: ordinary use remains disabled; unproved native witnesses are not release acceptance.");
        var checkpoint=new NativeCheckpoint(reader,capture,root,input,scope,PhaseRoutePrerequisites.Required(phase)?Routes:null,scope==null?phase:null);
        async Task<bool> Fresh(CancellationToken t)=>await checkpoint.RemeasureAndVerifyRetainedEvidence(t)==input.Accepted;
        if(mode==ReleaseMode.ProvisionDocumentSchema) {
            Check.Require(phase.Schema!=null&&phase.Guard==null&&phase.Transition==null);
            using var boundary=new FixedDocumentSchemaBoundary(reader,token,journal);
            var result=await SchemaPhase.Run(phase.Schema!,boundary,Fresh,journal);Console.WriteLine("SCHEMA_"+result);return result is AdditiveResult.ExistingExact or AdditiveResult.CreatedObservedExact?0:2;
        }
        if(mode==ReleaseMode.RegisterDocumentGuards) {
            Check.Require(phase.Guard!=null&&ReviewedRelease.Bindings.Contains(phase.Guard)&&phase.Schema==null&&phase.Transition==null);
            using var boundary=new FixedDocumentGuardBoundary(reader,token,journal);
            var result=await GuardPhase.Run(phase.Guard!,boundary,Fresh,journal);Console.WriteLine("GUARD_"+result);return result is AdditiveResult.ExistingExact or AdditiveResult.CreatedObservedExact?0:2;
        }
        Check.Require(mode==ReleaseMode.ActivatePackage&&phase.Transition!=null&&phase.Schema==null&&phase.Guard==null);
        using var package=new FixedPackageBoundary(reader,token,checkpoint,journal,phase.Transition!);
        var metadata=await reader.Object(Queries.Package);Inspector.ValidatePackage(metadata);
        var resultPackage=await PackageActivation.Run(phase.Transition!,root,input.Accepted,Check.Text(metadata,"@odata.etag"),PackageIdentity.Stable(metadata),package,journal);
        Console.WriteLine("PACKAGE_"+resultPackage.Status+" "+resultPackage.Guarantee);
        return resultPackage.Status is ActivationStatus.AlreadyNew or ActivationStatus.ObservedNewAfterAttempt?0:2;
    }
}
