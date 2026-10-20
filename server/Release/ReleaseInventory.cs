using System.Text;
using System.Text.Json.Nodes;
using Kitchen.Inventory;
using Newtonsoft.Json.Linq;
using Zunftkueche;
using PackageActivationPreparation;
namespace Kitchen.Release;

public static class ReleaseQueries
{
    public static string Entities(TableKind t)=>$"EntityDefinitions?$filter=LogicalName eq '{DocumentSchema.Logical(t)}' or SchemaName eq '{DocumentSchema.Schema(t)}'&$count=true";
    public static string Rows(TableKind t)=>$"{DocumentSchema.Set(t)}?$filter=_zk_workspace_value eq {Target.Workspace}&$orderby={DocumentSchema.Logical(t)}id asc&$count=true";
    public static string AllRows(TableKind t)=>$"{DocumentSchema.Set(t)}?$orderby={DocumentSchema.Logical(t)}id asc&$count=true";
    public static string Filters(TableKind t)=>$"sdkmessagefilters?$filter=primaryobjecttypecode eq '{DocumentSchema.Logical(t)}'&$expand=sdkmessageid&$count=true";
    // Logical table-name filters resolve through MetadataCache even when OR includes
    // global steps. Read the fixed, bounded metadata superset so absent tables remain valid.
    public const string Steps="sdkmessageprocessingsteps?$expand=sdkmessageid,sdkmessagefilterid,eventhandler_plugintype&$count=true";
    public const string Roles="roles?$expand=roleprivileges_association&$count=true";
    public const string Users="systemusers?$filter=domainname eq 'Vorstand@Schelmenzunft.onmicrosoft.com'&$expand=systemuserroles_association,teammembership_association&$count=true";
    public static string ValidParents(TableKind t)=>"GetValidReferencedEntities(ReferencingEntityName='"+DocumentSchema.Logical(t)+"')";
    public const string ValidChildren="GetValidReferencingEntities(ReferencedEntityName='zk_kitchenworkspace')";
    public static readonly string[] All=Enum.GetValues<TableKind>().SelectMany(t=>new[]{Entities(t),Rows(t),AllRows(t),Filters(t),ValidParents(t)}.Concat(new[]{"/Attributes/Microsoft.Dynamics.CRM.StringAttributeMetadata","/Attributes/Microsoft.Dynamics.CRM.MemoAttributeMetadata","/Attributes/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata","/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata"}.Select(s=>Queries.Table(DocumentSchema.Logical(t))+s))).Concat(new[]{Steps,Roles,Users,ValidChildren}).ToArray();
}
public enum DocumentSchemaProgress { NotInstalled,Partial,Exact }
public sealed record CurrentStore(DocumentSchemaProgress Progress,CanonicalSchema Schema,JsonObject[] Rows,string Hash,string SchemaHash);
internal static class NativeSystemMetadata
{
    static JsonObject Contract() {using var stream=typeof(NativeSystemMetadata).Assembly.GetManifestResourceStream("Kitchen.Release.contracts.user-owned-system-shape.json")??throw new Stop();using var bytes=new MemoryStream();stream.CopyTo(bytes);return Check.Parse(bytes.ToArray());}
    internal static void Validate(TableKind table,CanonicalSchema schema) {
        var contract=Contract();var primary=(JsonObject)contract["primary"]!.DeepClone();primary["LogicalName"]=DocumentSchema.Logical(table)+"id";
        var expected=contract["system"]!.AsArray().Select(x=>(JsonObject)x!).Append(primary).ToDictionary(x=>Check.Text(x,"LogicalName"),StringComparer.Ordinal);
        var fields=schema.Attributes.ToDictionary(a=>Check.Text(a,"LogicalName"),StringComparer.Ordinal);
        foreach(var pair in expected){Check.Require(fields.TryGetValue(pair.Key,out var row));Check.Id(row,"MetadataId");Check.Match(row,pair.Value);}
        var business=Enum.GetValues<ColumnKind>().Select(DocumentSchema.Field).ToHashSet();
        foreach(var row in schema.Attributes) {
            var name=Check.Text(row,"LogicalName");if(business.Contains(name)||expected.ContainsKey(name))continue;
            // The one generated lookup display attribute is conditional on the fixed lookup.
            Check.Require(name=="zk_workspacename"&&fields.ContainsKey("zk_workspace"));
            Check.Match(row,new JsonObject{["AttributeOf"]="zk_workspace",["AttributeType"]="String",["AttributeTypeName"]=new JsonObject{["Value"]="StringType"},["IsCustomAttribute"]=false,["IsLogical"]=true,["IsPrimaryId"]=false,["IsPrimaryName"]=false,["IsValidForCreate"]=false,["IsValidForRead"]=true,["IsValidForUpdate"]=false,["IsSecured"]=false});
        }
        // Primary SchemaName casing and metadata IDs are measured, never inferred from an old table.
        Check.Require(schema.Attributes.Count(a=>(bool?)a["IsPrimaryId"]==true)==1);
    }
}
internal static class CurrentDocumentStore
{
    internal static DocumentSchemaProgress Classify(TableKind table,CanonicalSchema schema) {
        Check.Require(schema.Complete);
        var comparison=DocumentSchema.Compare(table,schema);
        if(comparison==Presence.Missing)return DocumentSchemaProgress.NotInstalled;
        // A partially constructed table may be captured only if every present fixed object is
        // exact, the primary name exists and no custom collision/unknown secured field is hidden.
        Check.Require(SchemaPhase.Observe(new(table,SchemaAction.Table),schema)==Presence.ExistingExact&&schema.Keys.Length==0);
        Check.Require(schema.Attributes.Select(a=>Check.Text(a,"LogicalName")).Distinct().Count()==schema.Attributes.Length);
        NativeSystemMetadata.Validate(table,schema);
        var known=Enum.GetValues<ColumnKind>().Select(DocumentSchema.Field).ToHashSet();
        foreach(var attribute in schema.Attributes) {
            var name=Check.Text(attribute,"LogicalName");Check.Require((bool?)attribute["IsSecured"]==false);
            if(known.Contains(name)) {
                var kind=Enum.GetValues<ColumnKind>().Single(c=>DocumentSchema.Field(c)==name);SchemaPhase.ValidateColumn(kind,attribute);
                Check.Match(attribute,new JsonObject{["IsValidForCreate"]=true,["IsValidForRead"]=true,["IsValidForUpdate"]=true});
            }
        }
        Check.Require(SchemaPhase.Observe(new(table,SchemaAction.Relationship),schema) is Presence.Missing or Presence.ExistingExact);
        Check.Require(schema.ManyToOne.All(r=>(string?)r["SchemaName"]==DocumentSchema.Relation(table)||r["IsHierarchical"]?.GetValue<bool>()==false&&r["CascadeConfiguration"] is JsonObject c&&new[]{"Reparent","Share","Unshare","Assign","Delete"}.All(k=>(string?)c[k] is "NoCascade" or "Restrict" or "RemoveLink")));
        var ids=new[]{(Check.Id(schema.Entities.Single(),"MetadataId"),1)}.Concat(schema.Attributes.Where(a=>known.Contains(Check.Text(a,"LogicalName"))).Select(a=>(Check.Id(a,"MetadataId"),2))).Concat(schema.ManyToOne.Where(r=>(string?)r["SchemaName"]==DocumentSchema.Relation(table)).Select(r=>(Check.Id(r,"MetadataId"),10)));
        foreach(var(id,type) in ids) {
            var members=schema.Components.Where(c=>(string?)c["objectid"]==id).ToArray();
            Check.Require(members.Length<=1&&members.All(c=>(int?)c["componenttype"]==type&&(string?)c["_solutionid_value"]==Target.Solution));
        }
        return comparison==Presence.ExistingExact?DocumentSchemaProgress.Exact:DocumentSchemaProgress.Partial;
    }
    internal static async Task<CurrentStore> Read(TableKind table,CanonicalSchema schema,Reader reader,bool requireExact,CancellationToken token) {
        var progress=Classify(table,schema);Check.Require(!requireExact||progress==DocumentSchemaProgress.Exact);
        var schemaHash=Check.Fingerprint(System.Text.Json.JsonSerializer.SerializeToNode(schema)!);
        if(progress==DocumentSchemaProgress.NotInstalled)return new(progress,schema,[],Check.Fingerprint(new JsonObject{["schema"]="kitchen-native-inventory-v1",["table"]=DocumentSchema.Logical(table),["state"]="NotInstalledByNativeEvidence"}),schemaHash);
        reader.ReleaseQueries(ReleaseQueries.All);
        // No workspace/payload filter is valid until those columns exist. All-table zero rows
        // is mandatory for partial metadata; caller complete-read visibility still needs review.
        var rows=await reader.Rows(progress==DocumentSchemaProgress.Partial?ReleaseQueries.AllRows(table):ReleaseQueries.Rows(table),DocumentSchema.Logical(table)+"id",progress==DocumentSchemaProgress.Partial?1:4000).WaitAsync(token);
        Check.Require(progress!=DocumentSchemaProgress.Partial||rows.Length==0);
        foreach(var row in rows){Inspector.RequireVersion(row);Check.Require(Check.Id(row,"_zk_workspace_value")==Target.Workspace);Metadata.ValidateFields(row,schema.Attributes.Select(a=>Check.Text(a,"LogicalName")).ToHashSet());}
        var hash=Check.Fingerprint(new JsonObject{["progress"]=progress.ToString(),["rowsHash"]=CompleteInventory.Collection(DocumentSchema.Logical(table),rows,DocumentSchema.Logical(table)+"id"),["schemaHash"]=schemaHash});
        return new(progress,schema,rows,hash,schemaHash);
    }
}
public enum StoreState { Unknown, NotInstalledByNativeEvidence, Installed }
public sealed record StoreCapture(StoreState State,JsonObject[] Rows,string MetadataHash,bool CompletenessProven);
public sealed record OriginalVersion(string Provenance,string SourceHash,string ByteHash,long Length,string? Site,string? Library,string? Item,string? Version,string? ETag,EvidenceFile Bytes);
public enum OriginalSourceKind { LocalImport,CloudVersion,Unresolved }
public sealed record OriginalRequirement(OriginalSourceKind Kind,string? Sha256,string Location,string? Site=null,string? Library=null,string? Item=null,string? Version=null);
internal static class OriginalRequirements
{
    internal static OriginalRequirement[] Derive(byte[] rawState,IEnumerable<JObject> documents,IEnumerable<JObject> drafts) {
        var result=new List<OriginalRequirement>();
        string? Hash(JToken? value){var s=(string?)value;return s!=null&&s.Length==64&&s.All(Uri.IsHexDigit)?s.ToLowerInvariant():null;}
        void Add(OriginalSourceKind kind,JToken? hash,string path,JObject? reference=null) {
            var h=Hash(hash);result.Add(new(kind==OriginalSourceKind.LocalImport&&h==null?OriginalSourceKind.Unresolved:kind,h,path,(string?)reference?["siteCollectionId"],(string?)reference?["libraryId"],(string?)reference?["itemId"],(string?)reference?["version"]));
        }
        void Walk(JObject root,string origin) {
            foreach(var value in root.DescendantsAndSelf().OfType<JObject>()) {
                var path=origin+"."+value.Path;var source=value["source"] as JObject;
                if(source?["hash"]!=null)Add(OriginalSourceKind.LocalImport,source["hash"],path+".source");
                if(value["localPath"]?.Type==JTokenType.String&&source?["hash"]==null)Add(OriginalSourceKind.Unresolved,null,path+".localPath");
                if(value["documentUrl"]?.Type==JTokenType.String)Add(OriginalSourceKind.CloudVersion,source?["hash"],path+".documentUrl");
                if(value["provider"]!=null)Add((string?)value["provider"]=="sharepoint"?OriginalSourceKind.CloudVersion:OriginalSourceKind.Unresolved,value["sha256"],path,value);
                if(value["sha256"]!=null&&value["provider"]==null) {
                    if(value["ref"] is JObject reference)Add((string?)reference["provider"]=="sharepoint"?OriginalSourceKind.CloudVersion:OriginalSourceKind.Unresolved,value["sha256"],path,reference);
                    else if((string?)value["status"]=="selected"&&value["uploadId"]?.Type==JTokenType.String)Add(OriginalSourceKind.LocalImport,value["sha256"],path);
                    else Add(OriginalSourceKind.Unresolved,value["sha256"],path); // Draft page/version and unknown hash-bearing history require source proof.
                }
            }
        }
        Walk(Zunftkueche.Protocol.Parse(new UTF8Encoding(false,true).GetString(rawState)),"aggregate");
        var index=0;foreach(var doc in documents)Walk(doc,"document["+(index++)+"]");index=0;foreach(var draft in drafts)Walk(draft,"draft["+(index++)+"]");
        return result.ToArray();
    }
    internal static string ValidateLocal(string root,byte[] rawState,IEnumerable<JObject> documents,IEnumerable<JObject> drafts,IReadOnlyList<OriginalVersion> originals,IReadOnlyCollection<string>? assertedHashes=null) {
        var required=Derive(rawState,documents,drafts);
        Check.Require(required.All(r=>r.Kind==OriginalSourceKind.LocalImport)&&originals.All(o=>o.Provenance=="retained-local-import"));
        var hashes=required.Select(r=>r.Sha256!).ToHashSet(StringComparer.Ordinal);
        // A supplied hash list may corroborate a fresh derivation; it can never omit sources.
        if(assertedHashes!=null)Check.Require(hashes.SetEquals(assertedHashes));
        var bytes=CompleteInventory.ValidateOriginals(root,hashes,originals);
        return Check.Fingerprint(new JsonObject{["schema"]="kitchen-source-original-requirements-v1",["requirements"]=System.Text.Json.JsonSerializer.SerializeToNode(required),["verifiedLocalBytes"]=bytes});
    }
}
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
        var revisions=new HashSet<int>();
        foreach(var r in receipts) {
            var id=Check.Text(r,"zk_operationid");var hash=Check.Text(r,"zk_requesthash");
            Check.Require(seen.Add(id)&&ids.Contains(id)&&DocumentGuards.Hash(hash));
            // operationRequests retains the canonical OPERATION signature (legacy v1
            // omits targetEventId), not the SHA256 of the full wire request. Neither
            // value can reconstruct or cryptographically prove the other.
            var signature=(string?)state["operationRequests"]?[id];
            Check.Require(!string.IsNullOrWhiteSpace(signature));
            var operation=Zunftkueche.Protocol.Parse(signature!);
            Check.Require(operation.Count is 2 or 3 && operation["payload"] is JObject
                && operation["type"]?.Type==JTokenType.String && ((string)operation["type"]!).Length is >0 and <=100
                && operation.Properties().All(p=>p.Name is "type" or "payload" or "targetEventId"));
            if(operation.Count==3)Check.Require(operation["targetEventId"]?.Type==JTokenType.String
                && ((string)operation["targetEventId"]!).Length is >0 and <=500);
            Check.Require(signature==Zunftkueche.Protocol.Canonical(operation).ToString(Newtonsoft.Json.Formatting.None));
            Check.Require((int?)r["zk_appliedrevision"] is int applied&&applied>0&&applied<=revision&&revisions.Add(applied));
            Check.Id(Check.Text(r,"zk_actor"));Inspector.RequireVersion(r);
        }
        Check.Require(seen.SetEquals(ids));return Check.Hash(raw);
    }
    public static void SameCheckpoint(string before,string after)=>Check.Require(before==after);
}
internal static class CaptureConsistency
{
    internal static async Task<(T Facts,JsonObject Stores)> Run<T>(CoreCaptureFacts retained,Func<Task<(JsonObject Workspace,JsonObject[] Receipts)>> readCore,Func<Task<JsonObject>> readExtended,Func<JsonObject,JsonObject[],JsonObject,Task<T>> captureFacts) {
        var start=await readCore();retained.Match(start.Workspace,start.Receipts); // Reject the core-to-extension gap before combining facts.
        var first=await readExtended();
        var facts=await captureFacts(start.Workspace,start.Receipts,first);
        var last=await readExtended();Check.Require(Check.Fingerprint(first)==Check.Fingerprint(last));
        var end=await readCore();retained.Match(end.Workspace,end.Receipts);
        return(facts,first);
    }
}
public sealed class ReleaseInspector
{
    readonly Reader reader;readonly Backup backup;readonly string objectId;readonly RunStatus status;readonly BackupScopeBinding? expectedScope;
    public ReleaseInspector(Reader reader,Backup backup,string objectId,RunStatus status):this(reader,backup,objectId,status,ReviewedRelease.InspectionScope){}
    internal ReleaseInspector(Reader reader,Backup backup,string objectId,RunStatus status,BackupScopeBinding? expectedScope) {
        this.reader=reader;this.backup=backup;this.objectId=objectId;this.status=status;this.expectedScope=expectedScope;
    }
    readonly List<JObject> capturedDocuments=[],capturedDrafts=[];
    public async Task<bool> Inspect(bool includeOriginals=false,string? root=null) {
        // Accepted identity, exact core/API/intrinsic checks and final pure policy validation.
        var core=new Inspector(reader,backup,objectId,status);var retained=await core.Run(false);
        reader.ReleaseQueries(ReleaseQueries.All);
        var sequence=0;
        var connected=await CaptureConsistency.Run(retained,async()=>(await core.ReadWorkspace(),await core.ReadReceipts()),()=>ReadObservation(sequence++==0?"release-before-":"release-after-"),(before,receipts,stores)=>{
            var raw=new UTF8Encoding(false,true).GetBytes(Check.Text(before,"zk_state"));
            ReleaseScope.ValidateState(ReleaseScope.Require(expectedScope),raw,(int)before["zk_revision"]!,receipts);
            var originals=includeOriginals?CaptureOriginals(root!,raw):"not_requested";
            var complete=includeOriginals&&DocumentGuards.Hash(originals)&&VerifyCurrentSourceReview(root!,before,receipts,stores);
            return Task.FromResult((Originals:originals,Complete:complete));
        });
        // This native artifact never manufactures a server-issued sourceContract or full-backup assertion.
        backup.Finish(new{artifact="native-inspection-v1",currentPolicyValidated=true,completeCheckpoint=connected.Facts.Complete,originals=connected.Facts.Originals,coreCapture=retained,newStores=connected.Stores,
            missing="original-version bytes; both-principal effective direct/team rights; native route witnesses; exact final build/client review"},connected.Facts.Complete);
        return connected.Facts.Complete;
    }
    bool VerifyCurrentSourceReview(string root,JsonObject workspace,JsonObject[] receipts,JsonObject stores) {
        try {
            var review=ReviewedRelease.CurrentSourceCompletenessReview??throw new Stop();
            var proof=Check.Parse(review.Verify(root));
            Check.Match(proof,new JsonObject{["organization"]=Target.Organization,["workspace"]=Target.Workspace,["workspaceFingerprint"]=Check.Fingerprint(workspace),["receiptFingerprint"]=CompleteInventory.Collection("receipts",receipts,"zk_kitchenoperationid"),["storeAndAccessFingerprint"]=Check.Fingerprint(stores),["scopeFingerprint"]=ReleaseScope.Fingerprint(ReleaseScope.Require(expectedScope)),["coreMetadataAccessFingerprint"]=Check.Fingerprint(stores["coreMetadataAccess"]??throw new Stop())});
            var installed=new List<string>{"zk_kitchenworkspace","zk_kitchenoperation"};
            foreach(var table in Enum.GetValues<TableKind>())if((string?)stores[DocumentSchema.Logical(table)]?["status"] is "InstalledVisibilityNotProvenComplete" or "PartialInstalledEmptyVisibilityNotProvenComplete")installed.Add(DocumentSchema.Logical(table));
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
            return RetainAndValidateOriginals(backup,Path.Combine(root,"review"),rawState,capturedDocuments,capturedDrafts,manifestBytes);
        }catch{return "Incomplete_originals_missing_or_unverified";}
    }
    internal static string RetainAndValidateOriginals(Backup backup,string root,byte[] rawState,IEnumerable<JObject> documents,IEnumerable<JObject> drafts,byte[] manifestBytes) {
        var manifest=Check.Parse(manifestBytes);
        var originals=System.Text.Json.JsonSerializer.Deserialize<OriginalVersion[]>(manifest["originals"]!.ToJsonString())??throw new Stop();
        // Retain verified historical imports even if an actual cloud/unresolved requirement
        // prevents completeness. A local byte match never supplies remote version provenance.
        Check.Require(originals.All(o=>o.Provenance=="retained-local-import"));
        _=CompleteInventory.ValidateOriginals(root,originals.Select(o=>o.SourceHash).ToHashSet(),originals);
        backup.Write("originals-reviewed-manifest.json",manifestBytes);
        foreach(var original in originals.DistinctBy(o=>o.ByteHash))backup.Write("original-"+original.ByteHash+".bin",original.Bytes.Verify(root));
        var required=OriginalRequirements.Derive(rawState,documents,drafts);
        backup.Json("original-source-requirements.json",System.Text.Json.JsonSerializer.SerializeToNode(required)!);
        return OriginalRequirements.ValidateLocal(root,rawState,documents,drafts,originals);
    }
    async Task<JsonObject> ReadObservation(string prefix) {
        ReleaseScope.Require(expectedScope);
        var core=await NativeCheckpoint.ReadCoreClosure(reader,backup,prefix,null,CancellationToken.None);
        var result=await ReadNewStores(prefix);result["coreMetadataAccess"]=core;return result;
    }
    internal async Task<JsonObject> ReadNewStores(string prefix) {
        var scope=ReleaseScope.Require(expectedScope);
        var result=new JsonObject{["schema"]="kitchen-scoped-store-observation-v1",["scope"]=scope.Scope.ToString(),["scopeFingerprint"]=ReleaseScope.Fingerprint(scope),["extensionCoverage"]=scope.Scope==BackupScope.Core?"outside-core-review:document-roles-users-global-routes":"document-roles-users-global-routes-observed-visibility-unproved"};
        foreach(var t in Enum.GetValues<TableKind>()) {
            var name=DocumentSchema.Logical(t);
            using var boundary=new FixedDocumentSchemaBoundary(reader,()=>throw new Stop(),new DurableAttemptJournal(Path.Combine("/private/tmp","kitchen-readonly-no-write"),"inventory"));
            var schema=await boundary.ReadCanonicalSchema(t,CancellationToken.None);
            // Validate before any row read: installed/partial stores can never be read as Core.
            ReleaseScope.ValidateStore(scope,CurrentDocumentStore.Classify(t,schema));
            var current=await CurrentDocumentStore.Read(t,schema,reader,scope.Scope==BackupScope.Documents,CancellationToken.None);
            var all=new JsonObject{["schema"]=System.Text.Json.JsonSerializer.SerializeToNode(current.Schema),["progress"]=current.Progress.ToString(),["rows"]=new JsonArray(current.Rows.Select(r=>r.DeepClone()).ToArray())};
            foreach(var row in current.Rows){var payload=Zunftkueche.Protocol.Parse(Check.Text(row,"zk_payload"));(t==TableKind.Document?capturedDocuments:capturedDrafts).Add(payload);Check.Require((string?)payload["id"]==Check.Id(row,name+"id")&&(string?)payload["workspaceId"]==Target.Workspace&&(string?)payload["eventId"]==Check.Text(row,"zk_eventid"));}
            if(current.Progress!=DocumentSchemaProgress.NotInstalled)all["filters"]=new JsonArray((await reader.Rows(ReleaseQueries.Filters(t),"sdkmessagefilterid",1000)).Select(r=>r.DeepClone()).ToArray());
            backup.Json(prefix+name+"-inventory.json",all);
            result[name]=new JsonObject{["status"]=current.Progress switch{DocumentSchemaProgress.NotInstalled=>"NotInstalledByNativeEvidence",DocumentSchemaProgress.Partial=>"PartialInstalledEmptyVisibilityNotProvenComplete",_=>"InstalledVisibilityNotProvenComplete"},["observedRows"]=current.Rows.Length,["schemaHash"]=current.SchemaHash,["hash"]=Check.Fingerprint(all)};
        }
        if(scope.Scope==BackupScope.Documents)foreach(var pair in new[]{("all-new-and-global-steps",ReleaseQueries.Steps,"sdkmessageprocessingstepid"),("roles",ReleaseQueries.Roles,"roleid"),("current-caller-roles-teams",ReleaseQueries.Users,"systemuserid")}) {
            var rows=await reader.Rows(pair.Item2,pair.Item3,10000);var array=new JsonArray(rows.Select(r=>r.DeepClone()).ToArray());backup.Json(prefix+pair.Item1+".json",array);result[pair.Item1]=Check.Fingerprint(array);
        }
        return result;
    }
}
internal static class ReadOnlyReleaseVerification
{
    internal static async Task ReadServerBackup(Reader reader,Func<Task<string>> token,FinalVerificationBinding final,string root,Backup backup) {
        Check.Require(ReferenceEquals(final,ReviewedRelease.FinalVerification));ReleaseScope.RequireProduction(final.ExpectedScope);
        var input=final.Verify(root);
        var checkpoint=new NativeCheckpoint(reader,backup,root,input,final.ExpectedScope);
        var native=await checkpoint.RemeasureAndVerifyRetainedEvidence(CancellationToken.None);
        var before=await ReadPackage(reader,final.Package);
        var documents=await ReadFinalStore(reader,final.ExpectedScope,TableKind.Document);
        var drafts=await ReadFinalStore(reader,final.ExpectedScope,TableKind.Draft);
        var workspace=await reader.Object(Queries.Workspace);var receipts=await reader.Rows(Queries.Receipts,"zk_kitchenoperationid",4000);
        var who=await reader.Object("WhoAmI");Check.Require(Check.Id(who,"OrganizationId")==Target.Organization&&Check.Id(who,"UserId")==input.CallerId);
        using var client=new HttpClient(new HttpClientHandler{AllowAutoRedirect=false,UseCookies=false}){Timeout=TimeSpan.FromSeconds(90)};
        var requestBody=new JsonObject{["protocolVersion"]=2,["workspaceId"]=Target.Workspace,["view"]="backup",["identity"]=new JsonObject{["organizationId"]=Target.Organization,["workspaceId"]=Target.Workspace,["userId"]=Check.Id(who,"UserId")}};
        using var request=new HttpRequestMessage(HttpMethod.Post,Target.Api+"zk_KitchenLoad");request.Headers.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",await token());request.Content=new StringContent(new JsonObject{["RequestJson"]=requestBody.ToJsonString()}.ToJsonString(),Encoding.UTF8,"application/json");
        using var cancel=new CancellationTokenSource(TimeSpan.FromSeconds(90));using var response=await client.SendAsync(request,HttpCompletionOption.ResponseHeadersRead,cancel.Token);Check.Require(response.IsSuccessStatusCode);
        using var stream=await response.Content.ReadAsStreamAsync(cancel.Token);using var content=new MemoryStream();var buffer=new byte[81920];int n;
        while((n=await stream.ReadAsync(buffer,cancel.Token))>0){Check.Require(content.Length+n<=8388608);content.Write(buffer,0,n);}
        var raw=content.ToArray();backup.Write("server-backup-response.raw.json",raw);
        var result=Check.Parse(Encoding.UTF8.GetBytes(Check.Text(Check.Parse(raw),"ResultJson")));
        ValidateServerSnapshot(final.ExpectedScope,result,native,input.CallerId,workspace,receipts,documents,drafts);
        Check.Require(Check.Fingerprint(workspace)==Check.Fingerprint(await reader.Object(Queries.Workspace))&&CompleteInventory.Collection("receipts",receipts,"zk_kitchenoperationid")==CompleteInventory.Collection("receipts",await reader.Rows(Queries.Receipts,"zk_kitchenoperationid",4000),"zk_kitchenoperationid"));
        var documentsAgain=await ReadFinalStore(reader,final.ExpectedScope,TableKind.Document);var draftsAgain=await ReadFinalStore(reader,final.ExpectedScope,TableKind.Draft);
        Check.Require(documents.Hash==documentsAgain.Hash&&documents.SchemaHash==documentsAgain.SchemaHash&&drafts.Hash==draftsAgain.Hash&&drafts.SchemaHash==draftsAgain.SchemaHash);
        Check.Require(native==await checkpoint.RemeasureAndVerifyRetainedEvidence(CancellationToken.None));
        Check.Require(before==await ReadPackage(reader,final.Package));_=final.Verify(root);
        backup.Finish(new{artifact="server-issued-v2-backup-observation",scope=final.ExpectedScope.Scope.ToString(),scopeFingerprint=ReleaseScope.Fingerprint(final.ExpectedScope),nativeCheckpoint=native,originalBytesExternal=true,releaseReady=false,remaining="original-byte completeness/restore/iPhone/two-account behavior/ACL/global-route/publication acceptance"});
    }
    internal static async Task<string> ReadPackage(Reader reader,EvidenceFile package) {
        var before=await reader.Object(Queries.Package);Inspector.ValidatePackage(before);
        var bytes=await reader.Get(Queries.PackageBytes);var after=await reader.Object(Queries.Package);Inspector.ValidatePackage(after);
        Check.Require(Check.Fingerprint(before)==Check.Fingerprint(after)&&bytes.LongLength==package.Length&&Check.Hash(bytes)==package.Sha256);
        return Check.Fingerprint(before);
    }
    internal static void ValidateServerSnapshot(BackupScopeBinding expected,JsonObject result,Checkpoint native,string caller,JsonObject workspace,JsonObject[] receipts,CurrentStore? documents=null,CurrentStore? drafts=null) {
        ReleaseScope.Require(expected);Check.Require(native.Valid());Inspector.ValidateWorkspace(workspace);
        Check.Match(result,new JsonObject{["protocolVersion"]=2,["workspaceId"]=Target.Workspace,["view"]="backup",["canEdit"]=true,["canConfigure"]=true,["canClose"]=true});
        Exact(result["features"],new JsonObject{["documents"]=false,["receiptIntake"]=false});
        Exact(result["identity"],new JsonObject{["organizationId"]=Target.Organization,["workspaceId"]=Target.Workspace,["userId"]=caller});
        var snapshot=result["snapshot"] as JsonObject??throw new Stop();
        Check.Match(snapshot,new JsonObject{["environment"]=Target.Organization,["workspaceId"]=Target.Workspace});
        var raw=Encoding.UTF8.GetBytes(Check.Text(workspace,"zk_state"));var revision=(int)workspace["zk_revision"]!;
        ReleaseScope.ValidateState(expected,raw,revision,receipts);
        Check.Require(native.RawStateSha256==Check.Hash(raw)&&native.Revision==revision&&native.WorkspaceRowVersion==workspace["versionnumber"]!.ToJsonString()&&native.OwnerId==Check.Id(workspace,"_ownerid_value")&&native.OwnerType==Check.Text(workspace,"_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname")&&native.ReceiptCount==receipts.Length&&native.ReceiptCollectionSha256==CompleteInventory.Collection("receipts",receipts,"zk_kitchenoperationid"));
        var evidence=snapshot["workspaceEvidence"] as JsonObject??throw new Stop();
        Check.Match(evidence,new JsonObject{["rawState"]=Check.Text(workspace,"zk_state"),["rawStateSha256"]=native.RawStateSha256,["rowVersion"]=native.WorkspaceRowVersion,["ownerId"]=native.OwnerId,["ownerType"]=native.OwnerType,["protocolVersion"]=2});
        Check.Require(native.OwnerType=="systemuser"&&native.OwnerId==caller);
        Check.Require(JsonNode.DeepEquals(snapshot["state"],Check.Parse(raw)));
        Check.Match(evidence["rawRow"],new JsonObject{["zk_kitchenworkspaceid"]=Target.Workspace,["zk_state"]=Check.Text(workspace,"zk_state"),["zk_revision"]=revision,["@rowVersion"]=native.WorkspaceRowVersion,["ownerid"]=new JsonObject{["id"]=native.OwnerId,["logicalName"]=native.OwnerType}});
        Check.Match(snapshot["schemaValidation"],new JsonObject{["policy"]=BackupProtocol.PolicyVersion,["rawStateSha256"]=native.RawStateSha256});
        var operations=snapshot["operationReceipts"] as JsonArray??throw new Stop();Check.Require(operations.Count==receipts.Length);
        var seen=new HashSet<string>();
        foreach(var operation in operations) {
            var id=Check.Id(operation,"id");Check.Require(seen.Add(id));var r=receipts.SingleOrDefault(r=>Check.Id(r,"zk_kitchenoperationid")==id)??throw new Stop();
            Check.Match(operation,new JsonObject{["workspaceId"]=Target.Workspace,["operationId"]=Check.Text(r,"zk_operationid"),["requestHash"]=Check.Text(r,"zk_requesthash"),["actorId"]=Check.Text(r,"zk_actor"),["appliedRevision"]=r["zk_appliedrevision"]!.DeepClone(),["rowVersion"]=r["versionnumber"]!.ToJsonString()});
            Check.Require(DateTimeOffset.TryParse(Check.Text(r,"zk_recordedat"),out var nativeTime));
            Check.Require(DateTimeOffset.TryParse(Check.Text(operation,"recordedAt"),out var serverTime)&&serverTime==nativeTime);
            Check.Require(DateTimeOffset.TryParse(Check.Text(operation!["rawRow"],"zk_recordedat"),out var rawTime)&&rawTime==nativeTime);
            Check.Match(operation!["rawRow"],new JsonObject{["zk_kitchenoperationid"]=id,["zk_operationid"]=Check.Text(r,"zk_operationid"),["zk_requesthash"]=Check.Text(r,"zk_requesthash"),["zk_actor"]=Check.Text(r,"zk_actor"),["zk_appliedrevision"]=r["zk_appliedrevision"]!.DeepClone(),["@rowVersion"]=r["versionnumber"]!.ToJsonString(),["_zk_workspace_value"]=Target.Workspace,["zk_workspace"]=new JsonObject{["id"]=Target.Workspace,["logicalName"]="zk_kitchenworkspace"}});
        }
        if(expected.Scope==BackupScope.Core) {
            Exact(snapshot["sourceContract"],new JsonObject{["id"]="kitchen-core-v1",["documents"]="not_in_contract",["drafts"]="not_in_contract"});
            Check.Require(snapshot.ContainsKey("documents")&&snapshot["documents"]==null&&snapshot.ContainsKey("drafts")&&snapshot["drafts"]==null&&native.DocumentCount==0&&native.DraftCount==0);
        } else {
            Exact(snapshot["sourceContract"],new JsonObject{["id"]="kitchen-documents-v1",["documents"]="required",["drafts"]="required",["manifestVersion"]=1});
            // Server document rows use SDK rawRow envelopes, not Web API collection hashes.
            // Compare their exact typed row envelopes to the native schema-bound stores separately.
            Check.Require(snapshot["documents"] is JsonArray&&snapshot["drafts"] is JsonArray);
            Check.Require(documents!=null&&drafts!=null&&documents.Hash==native.DocumentCollectionSha256&&drafts.Hash==native.DraftCollectionSha256);
            ValidateDocuments(TableKind.Document,snapshot["documents"]!.AsArray(),documents!,native.DocumentCount);ValidateDocuments(TableKind.Draft,snapshot["drafts"]!.AsArray(),drafts!,native.DraftCount);
        }
    }
    static async Task<CurrentStore> ReadFinalStore(Reader reader,BackupScopeBinding scope,TableKind table) {
        using var boundary=new FixedDocumentSchemaBoundary(reader,()=>throw new Stop(),new DurableAttemptJournal("/private/tmp/kitchen-final-no-write","readonly"));
        var schema=await boundary.ReadCanonicalSchema(table,CancellationToken.None);ReleaseScope.ValidateStore(scope,CurrentDocumentStore.Classify(table,schema));
        return await CurrentDocumentStore.Read(table,schema,reader,scope.Scope==BackupScope.Documents,CancellationToken.None);
    }
    static void ValidateDocuments(TableKind table,JsonArray rows,CurrentStore native,long count) {
        Check.Require(native.Progress==DocumentSchemaProgress.Exact&&rows.Count==count&&native.Rows.Length==count&&rows.Count<=4000);var ids=new HashSet<string>();
        foreach(var row in rows) {
            var id=Check.Id(row,"id");Check.Require(ids.Add(id));var source=native.Rows.SingleOrDefault(r=>Check.Id(r,DocumentSchema.Logical(table)+"id")==id)??throw new Stop();
            var payload=Check.Parse(Encoding.UTF8.GetBytes(Check.Text(source,"zk_payload")));
            // Native SDK inventory publishes the complete parsed immutable payload plus raw evidence.
            // Strip only the two explicit envelope fields on a copy before exact payload comparison.
            var actual=(JsonObject)row!.DeepClone();actual.Remove("rowVersion");actual.Remove("rawRow");Exact(actual,payload);
            Check.Require(Check.Id(row,"workspaceId")==Target.Workspace&&Check.Text(row,"eventId")==Check.Text(source,"zk_eventid")&&Check.Text(row,"rowVersion")==source["versionnumber"]!.ToJsonString());
            Check.Match(row["rawRow"],new JsonObject{[DocumentSchema.Logical(table)+"id"]=id,["zk_eventid"]=Check.Text(source,"zk_eventid"),["zk_payload"]=Check.Text(source,"zk_payload"),["@rowVersion"]=source["versionnumber"]!.ToJsonString(),["zk_workspace"]=new JsonObject{["id"]=Target.Workspace,["logicalName"]="zk_kitchenworkspace"}});
        }
    }
    static void Exact(JsonNode? actual,JsonNode expected)=>Check.Require(JsonNode.DeepEquals(Check.Canonical(actual),Check.Canonical(expected)));
}
