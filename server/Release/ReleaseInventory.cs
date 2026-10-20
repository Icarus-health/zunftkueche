using System.Text;
using System.Text.Json.Nodes;
using Kitchen.Inventory;
using Newtonsoft.Json.Linq;
namespace Kitchen.Release;

public static class ReleaseQueries
{
    public static string Entities(TableKind t)=>$"EntityDefinitions?$filter=LogicalName eq '{DocumentSchema.Logical(t)}' or SchemaName eq '{DocumentSchema.Schema(t)}'&$count=true";
    public static string Rows(TableKind t)=>$"{DocumentSchema.Set(t)}?$filter=_zk_workspace_value eq {Target.Workspace}&$orderby={DocumentSchema.Logical(t)}id asc&$count=true";
    public static string Filters(TableKind t)=>$"sdkmessagefilters?$filter=primaryobjecttypecode eq '{DocumentSchema.Logical(t)}'&$expand=sdkmessageid&$count=true";
    public const string Steps="sdkmessageprocessingsteps?$filter=sdkmessagefilterid/primaryobjecttypecode eq 'zk_kitchendocument' or sdkmessagefilterid/primaryobjecttypecode eq 'zk_kitchendraft' or _sdkmessagefilterid_value eq null&$expand=sdkmessageid,sdkmessagefilterid,eventhandler_plugintype&$count=true";
    public const string Roles="roles?$expand=roleprivileges_association&$count=true";
    public const string Users="systemusers?$filter=domainname eq 'Vorstand@Schelmenzunft.onmicrosoft.com'&$expand=systemuserroles_association,teammembership_association&$count=true";
    public static string ValidParents(TableKind t)=>"GetValidReferencedEntities(ReferencingEntityName='"+DocumentSchema.Logical(t)+"')";
    public const string ValidChildren="GetValidReferencingEntities(ReferencedEntityName='zk_kitchenworkspace')";
    public static readonly string[] All=Enum.GetValues<TableKind>().SelectMany(t=>new[]{Entities(t),Rows(t),Filters(t),ValidParents(t)}.Concat(new[]{"/Attributes/Microsoft.Dynamics.CRM.StringAttributeMetadata","/Attributes/Microsoft.Dynamics.CRM.MemoAttributeMetadata","/Attributes/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata","/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata"}.Select(s=>Queries.Table(DocumentSchema.Logical(t))+s))).Concat(new[]{Steps,Roles,Users,ValidChildren}).ToArray();
}
public enum StoreState { Unknown, NotInstalledByNativeEvidence, Installed }
public sealed record StoreCapture(StoreState State,JsonObject[] Rows,string MetadataHash,bool CompletenessProven);
public sealed record OriginalVersion(string Provenance,string SourceHash,string ByteHash,long Length,string? Site,string? Library,string? Item,string? Version,string? ETag,EvidenceFile Bytes);
public static class CompleteInventory
{
    public static string Collection(string kind,JsonObject[] rows,string idField) {
        Check.Require(rows.Length<=4000);
        var sorted=rows.OrderBy(r=>Check.Id(r,idField),StringComparer.Ordinal).ToArray();
        Check.Require(sorted.Select(r=>Check.Id(r,idField)).Distinct().Count()==rows.Length);
        var envelope=new JsonObject{["schema"]="kitchen-native-inventory-v1",["collection"]=kind,["count"]=rows.Length,["rows"]=new JsonArray(sorted.Select(r=>r.DeepClone()).ToArray())};
        Check.Require(Encoding.UTF8.GetByteCount(envelope.ToJsonString())<=8388608);return Check.Fingerprint(envelope);
    }
    public static void ValidateStore(StoreCapture store,bool requireInstalled) {
        Check.Require(store.State!=StoreState.Unknown&&store.CompletenessProven&&DocumentGuards.Hash(store.MetadataHash));
        Check.Require(store.State!=StoreState.NotInstalledByNativeEvidence||!requireInstalled&&store.Rows.Length==0);
        Check.Require(Enum.IsDefined(store.State));
    }
    public static string ValidateOriginals(string root,IReadOnlyCollection<string> requiredHashes,IReadOnlyList<OriginalVersion> originals) {
        Check.Require(requiredHashes.All(DocumentGuards.Hash)&&requiredHashes.ToHashSet().SetEquals(originals.Select(o=>o.SourceHash)));
        var rows=new JsonArray();var versions=new HashSet<string>();
        foreach(var o in originals.OrderBy(o=>o.SourceHash,StringComparer.Ordinal).ThenBy(o=>o.Version,StringComparer.Ordinal)) {
            Check.Require(DocumentGuards.Hash(o.SourceHash)&&DocumentGuards.Hash(o.ByteHash)&&o.Length>0&&o.Bytes.Sha256==o.ByteHash&&o.Bytes.Length==o.Length);
            Check.Require(Check.Hash(o.Bytes.Verify(root))==o.SourceHash);
            if(o.Provenance=="retained-local-import")Check.Require(o.Site==null&&o.Library==null&&o.Item==null&&o.Version==null&&o.ETag==null);
            else Check.Require(o.Provenance=="sharepoint-version"&&o.Site==Zunftkueche.DocumentProtocol.Site&&o.Library==Zunftkueche.DocumentProtocol.Library&&!string.IsNullOrWhiteSpace(o.Item)&&!string.IsNullOrWhiteSpace(o.Version)&&!string.IsNullOrWhiteSpace(o.ETag));
            Check.Require(versions.Add(o.Provenance+"|"+o.SourceHash+"|"+o.Site+"|"+o.Library+"|"+o.Item+"|"+o.Version+"|"+o.ETag));
            rows.Add(System.Text.Json.JsonSerializer.SerializeToNode(o));
        }
        return Check.Fingerprint(new JsonObject{["schema"]="kitchen-original-versions-v1",["count"]=originals.Count,["originals"]=rows});
    }
    public static string ValidateCurrentPolicy(byte[] raw,int revision,JsonObject[] receipts) {
        var text=new UTF8Encoding(false,true).GetString(raw);Inspector.ValidateState(text,revision);
        var state=Zunftkueche.Protocol.Parse(text); // Separate parse; originals are never normalized or mutated.
        var ids=state["operationIds"]!.Values<string>().Select(x=>x??throw new Stop()).ToHashSet();var seen=new HashSet<string>();
        foreach(var r in receipts) {
            var id=Check.Text(r,"zk_operationid");var hash=Check.Text(r,"zk_requesthash");
            Check.Require(seen.Add(id)&&ids.Contains(id)&&(string?)state["operationRequests"]?[id]==hash);
            Check.Require((int?)r["zk_appliedrevision"] is int applied&&applied>0&&applied<=revision);
            Check.Id(Check.Text(r,"zk_actor"));Inspector.RequireVersion(r);
        }
        Check.Require(seen.SetEquals(ids));return Check.Hash(raw);
    }
    public static void SameCheckpoint(string before,string after)=>Check.Require(before==after);
}
public sealed class ReleaseInspector(Reader reader,Backup backup,string objectId,RunStatus status)
{
    readonly List<JObject> capturedPayloads=[];
    public async Task<bool> Inspect(bool includeOriginals=false,string? root=null) {
        // Accepted identity, exact core/API/intrinsic checks and final pure policy validation.
        var core=new Inspector(reader,backup,objectId,status);await core.Run(false);
        reader.ReleaseQueries(ReleaseQueries.All);
        var before=await core.ReadWorkspace();var receipts=await core.ReadReceipts();
        var first=await ReadNewStores("release-before-");
        var second=await ReadNewStores("release-after-");
        Check.Require(Check.Fingerprint(first)==Check.Fingerprint(second));
        Check.Require(Check.Fingerprint(before)==Check.Fingerprint(await core.ReadWorkspace())&&Inspector.ReceiptFingerprint(receipts)==Inspector.ReceiptFingerprint(await core.ReadReceipts()));
        CompleteInventory.ValidateCurrentPolicy(new UTF8Encoding(false,true).GetBytes(Check.Text(before,"zk_state")),(int)before["zk_revision"]!,receipts);
        var originals=includeOriginals ? CaptureOriginals(root!,new UTF8Encoding(false,true).GetBytes(Check.Text(before,"zk_state"))) : "not_requested";
        var complete=includeOriginals&&DocumentGuards.Hash(originals)&&VerifyCurrentSourceReview(root!,before,receipts,first);
        // This native artifact never manufactures a server-issued sourceContract or full-backup assertion.
        backup.Finish(new{artifact="native-inspection-v1",currentPolicyValidated=true,completeCheckpoint=complete,originals,newStores=first,
            missing="original-version bytes; both-principal effective direct/team rights; native route witnesses; exact final build/client review"},complete);
        return complete;
    }
    bool VerifyCurrentSourceReview(string root,JsonObject workspace,JsonObject[] receipts,JsonObject stores) {
        try {
            var review=ReviewedRelease.CurrentSourceCompletenessReview??throw new Stop();
            var proof=Check.Parse(review.Verify(root));
            Check.Match(proof,new JsonObject{["organization"]=Target.Organization,["workspace"]=Target.Workspace,["workspaceFingerprint"]=Check.Fingerprint(workspace),["receiptFingerprint"]=CompleteInventory.Collection("receipts",receipts,"zk_kitchenoperationid"),["storeAndAccessFingerprint"]=Check.Fingerprint(stores)});
            var installed=new List<string>{"zk_kitchenworkspace","zk_kitchenoperation"};
            foreach(var table in Enum.GetValues<TableKind>())if((string?)stores[DocumentSchema.Logical(table)]?["status"]=="InstalledVisibilityNotProvenComplete")installed.Add(DocumentSchema.Logical(table));
            Check.Require(proof["completeReadStoreCoverage"] is JsonArray a&&a.Count==installed.Count&&a.Select(x=>x!.GetValue<string>()).ToHashSet().SetEquals(installed));
            backup.Json("current-source-completeness-reviewed.json",proof);return true;
        }catch{return false;}
    }
    string CaptureOriginals(string root,byte[] rawState) {
        // Input bytes must be retained by the parent under this fixed private review folder.
        // The external launch gate pins this manifest independently; it never chooses arbitrary source paths.
        try {
            var pin=Environment.GetEnvironmentVariable("KITCHEN_REVIEW_ORIGINALS_SHA256");
            var manifestPath=Path.Combine(root,"review","originals-manifest.json");
            Check.Require(pin!=null&&DocumentGuards.Hash(pin));
            var manifestBytes=File.ReadAllBytes(manifestPath);Check.Require(Check.Hash(manifestBytes)==pin);
            var manifest=Check.Parse(manifestBytes);
            var originals=System.Text.Json.JsonSerializer.Deserialize<OriginalVersion[]>(manifest["originals"]!.ToJsonString())??throw new Stop();
            var required=new HashSet<string>();var state=Zunftkueche.Protocol.Parse(new UTF8Encoding(false,true).GetString(rawState));
            foreach(var obj in state.DescendantsAndSelf().OfType<JObject>()) {
                var source=obj["source"] as JObject;
                if(source?["hash"] is JValue v){var h=(string?)v;Check.Require(DocumentGuards.Hash(h));required.Add(h!);}
                if(obj["localPath"]?.Type==JTokenType.String||obj["documentUrl"]?.Type==JTokenType.String)
                    Check.Require(source?["hash"]!=null||obj["intake"]!=null);
            }
            foreach(var payload in capturedPayloads)foreach(var value in payload.DescendantsAndSelf().OfType<JObject>())if(value["sha256"] is JValue v){var h=(string?)v;Check.Require(DocumentGuards.Hash(h));required.Add(h!);}
            // A retained cloud-version file is insufficient for fresh remote-version verification.
            Check.Require(originals.All(o=>o.Provenance=="retained-local-import"));
            var fingerprint=CompleteInventory.ValidateOriginals(Path.Combine(root,"review"),required,originals);
            backup.Write("originals-reviewed-manifest.json",manifestBytes);
            foreach(var original in originals.DistinctBy(o=>o.ByteHash))backup.Write("original-"+original.ByteHash+".bin",original.Bytes.Verify(Path.Combine(root,"review")));
            return fingerprint;
        }catch{return "Incomplete_originals_missing_or_unverified";}
    }
    async Task<JsonObject> ReadNewStores(string prefix) {
        var result=new JsonObject();
        foreach(var t in Enum.GetValues<TableKind>()) {
            var name=DocumentSchema.Logical(t);var entities=await reader.Rows(ReleaseQueries.Entities(t),"MetadataId",2);
            backup.Json(prefix+name+"-discovery.json",new JsonArray(entities.Select(e=>e.DeepClone()).ToArray()));
            Check.Require(entities.Length<=1);
            if(entities.Length==0){result[name]=new JsonObject{["status"]="NotInstalledByNativeEvidence",["discoveryHash"]=CompleteInventory.Collection(name+"-discovery",entities,"MetadataId")};continue;}
            Check.Require(Check.Text(entities[0],"LogicalName")==name&&Check.Text(entities[0],"SchemaName")==DocumentSchema.Schema(t));
            var all=new JsonObject();
            foreach(var suffix in new[]{"/Attributes","/Keys","/ManyToOneRelationships","/OneToManyRelationships","/Attributes/Microsoft.Dynamics.CRM.StringAttributeMetadata","/Attributes/Microsoft.Dynamics.CRM.MemoAttributeMetadata","/Attributes/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata","/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata"}) {
                var rows=await reader.Rows(Queries.Table(name)+suffix,"MetadataId",500);all[suffix]=new JsonArray(rows.Select(r=>r.DeepClone()).ToArray());
            }
            var data=await reader.Rows(ReleaseQueries.Rows(t),name+"id",4000);
            var attributes=all["/Attributes"]!.AsArray();Check.Require(attributes.All(a=>a?["IsSecured"]?.GetValue<bool>()==false));
            var columns=attributes.Select(a=>Check.Text(a,"LogicalName")).ToHashSet(StringComparer.Ordinal);
            foreach(var row in data){Inspector.RequireVersion(row);Metadata.ValidateFields(row,columns);Check.Require(Check.Id(row,"_zk_workspace_value")==Target.Workspace);var payload=Zunftkueche.Protocol.Parse(Check.Text(row,"zk_payload"));capturedPayloads.Add(payload);Check.Require((string?)payload["id"]==Check.Id(row,name+"id")&&(string?)payload["workspaceId"]==Target.Workspace&&(string?)payload["eventId"]==Check.Text(row,"zk_eventid"));}
            all["rows"]=new JsonArray(data.Select(r=>r.DeepClone()).ToArray());
            all["filters"]=new JsonArray((await reader.Rows(ReleaseQueries.Filters(t),"sdkmessagefilterid",1000)).Select(r=>r.DeepClone()).ToArray());
            backup.Json(prefix+name+"-inventory.json",all);
            result[name]=new JsonObject{["status"]="InstalledVisibilityNotProvenComplete",["observedRows"]=data.Length,["hash"]=Check.Fingerprint(all)};
        }
        foreach(var pair in new[]{("all-new-and-global-steps",ReleaseQueries.Steps,"sdkmessageprocessingstepid"),("roles",ReleaseQueries.Roles,"roleid"),("current-caller-roles-teams",ReleaseQueries.Users,"systemuserid")}) {
            var rows=await reader.Rows(pair.Item2,pair.Item3,10000);var array=new JsonArray(rows.Select(r=>r.DeepClone()).ToArray());backup.Json(prefix+pair.Item1+".json",array);result[pair.Item1]=Check.Fingerprint(array);
        }
        return result;
    }
}
internal static class ReadOnlyReleaseVerification
{
    internal static async Task ReadServerBackup(Reader reader,Func<Task<string>> token,EvidenceFile finalPackage,string root,Backup backup) {
        Check.Require(ReferenceEquals(finalPackage,ReviewedRelease.FinalVerificationPackage));
        _=finalPackage.Verify(root);
        var before=await reader.Object(Queries.Package);var bytes=await reader.Get(Queries.PackageBytes);var after=await reader.Object(Queries.Package);
        Check.Require(Check.Fingerprint(before)==Check.Fingerprint(after)&&bytes.LongLength==finalPackage.Length&&Check.Hash(bytes)==finalPackage.Sha256);
        var who=await reader.Object("WhoAmI");Check.Require(Check.Id(who,"OrganizationId")==Target.Organization);
        using var schema=new FixedDocumentSchemaBoundary(reader,token,new DurableAttemptJournal(Path.Combine(root,"attempts"),"readonly-never-used"));
        foreach(var table in Enum.GetValues<TableKind>())Check.Require(DocumentSchema.Compare(table,await schema.ReadCanonicalSchema(table,CancellationToken.None))==Presence.ExistingExact);
        using var client=new HttpClient(new HttpClientHandler{AllowAutoRedirect=false,UseCookies=false}){Timeout=TimeSpan.FromSeconds(90)};
        var requestBody=new JsonObject{["protocolVersion"]=2,["workspaceId"]=Target.Workspace,["view"]="backup",["identity"]=new JsonObject{["organizationId"]=Target.Organization,["workspaceId"]=Target.Workspace,["userId"]=Check.Id(who,"UserId")}};
        using var request=new HttpRequestMessage(HttpMethod.Post,Target.Api+"zk_KitchenLoad");request.Headers.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",await token());request.Content=new StringContent(new JsonObject{["RequestJson"]=requestBody.ToJsonString()}.ToJsonString(),Encoding.UTF8,"application/json");
        using var cancel=new CancellationTokenSource(TimeSpan.FromSeconds(90));using var response=await client.SendAsync(request,HttpCompletionOption.ResponseHeadersRead,cancel.Token);Check.Require(response.IsSuccessStatusCode);
        using var stream=await response.Content.ReadAsStreamAsync(cancel.Token);using var content=new MemoryStream();var buffer=new byte[81920];int n;
        while((n=await stream.ReadAsync(buffer,cancel.Token))>0){Check.Require(content.Length+n<=8388608);content.Write(buffer,0,n);}
        var raw=content.ToArray();backup.Write("server-backup-response.raw.json",raw);
        var result=Check.Parse(Encoding.UTF8.GetBytes(Check.Text(Check.Parse(raw),"ResultJson")));
        Check.Match(result,new JsonObject{["protocolVersion"]=2,["workspaceId"]=Target.Workspace,["view"]="backup"});
        Check.Match(result["snapshot"]?["sourceContract"],new JsonObject{["id"]="kitchen-documents-v1",["documents"]="required",["drafts"]="required",["manifestVersion"]=1});
        backup.Finish(new{artifact="server-issued-v2-backup-observation",originalBytesExternal=true,releaseReady=false,remaining="native route/access/device/restore/publication acceptance"});
    }
}
