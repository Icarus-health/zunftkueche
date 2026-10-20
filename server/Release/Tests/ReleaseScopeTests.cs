using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Kitchen.Inventory;
using Kitchen.Release;
using PackageActivationPreparation;
using Zunftkueche;
static class ReleaseScopeTests {
    const string Caller="11111111-1111-4111-8111-111111111111";
    static readonly string H=new('a',64);
    internal static BackupScopeBinding Binding(BackupScope scope=BackupScope.Core,BackupHistory? history=null)=>new(scope,history??(scope==BackupScope.Core?BackupHistory.CoreOnly:BackupHistory.Documents),Guid.Parse(Target.Organization),Guid.Parse(Target.Workspace),Guid.Parse("22222222-2222-4222-8222-222222222222"),H,new string('b',64));
    static void Assert(bool b){if(!b)throw new Exception("scope assertion");}
    static async Task Reject(Func<Task> action){try{await action();}catch(Stop){return;}catch(ArgumentException){return;}throw new Exception("expected scope refusal");}
    static Task Sync(Action action){action();return Task.CompletedTask;}
    static Backup Capture()=>new("/private/tmp/kitchen-scope-"+Guid.NewGuid());
    static Reader Reader(HttpMessageHandler handler,Backup backup){var reader=new Reader(()=>Task.FromResult("synthetic"),backup.Write,handler);reader.Verified(Caller);reader.ReleaseQueries(ReleaseQueries.All);return reader;}
    static ReleaseInspector Inspector(Reader reader,Backup backup,BackupScopeBinding? scope)=>new(reader,backup,Caller,new RunStatus{Backup=backup},scope);
    public static async Task Run(Func<string,Func<Task>,Task> test) {
        await test("null inspection scope cannot infer Core from missing tables",async()=>{
            var handler=new StoresHandler();var backup=Capture();using var reader=Reader(handler,backup);
            await Reject(()=>Inspector(reader,backup,null).ReadNewStores("synthetic-"));Assert(handler.Paths.Count==0);
        });
        await test("reviewed Core retains complete absent schemas without document rows or extension ACL/global calls",async()=>{
            var handler=new StoresHandler();var backup=Capture();using var reader=Reader(handler,backup);var inspector=Inspector(reader,backup,Binding());
            var before=await inspector.ReadNewStores("before-");var after=await inspector.ReadNewStores("after-");
            Assert(Check.Fingerprint(before)==Check.Fingerprint(after)&&handler.Paths.Count==4&&handler.Paths.All(p=>p.StartsWith("EntityDefinitions?")));
            Assert((string?)before["scope"]=="Core"&&(string?)before["zk_kitchendocument"]?["status"]=="NotInstalledByNativeEvidence"&&before["roles"]==null&&before["all-new-and-global-steps"]==null&&!Backup.IsComplete(backup.DirectoryPath));
            Assert(File.Exists(Path.Combine(backup.DirectoryPath,"before-zk_kitchendraft-inventory.json")));
        });
        foreach(var defect in new[]{"unreadable","missing-count","truncated","collision","duplicate","partial","installed"})await test("Core native stores refuse "+defect+" before rows or extension calls",async()=>{
            var handler=new StoresHandler(defect);var backup=Capture();using var reader=Reader(handler,backup);
            await Reject(()=>Inspector(reader,backup,Binding()).ReadNewStores("defect-"));Assert(!handler.Paths.Any(p=>p.StartsWith("zk_kitchen")||p==ReleaseQueries.Roles||p==ReleaseQueries.Users||p==ReleaseQueries.Steps));
        });
        foreach(var history in new[]{BackupHistory.Unknown,BackupHistory.Documents})await test("current absence cannot override "+history+" history",async()=>{
            var h=new StoresHandler();var b=Capture();using var r=Reader(h,b);await Reject(()=>Inspector(r,b,Binding(history:history)).ReadNewStores("history-"));Assert(h.Paths.Count==0);
        });
        await test("Documents scope with UI disabled still reads both installed stores and extension evidence",async()=>{
            var h=new StoresHandler("installed");var b=Capture();using var r=Reader(h,b);var stores=await Inspector(r,b,Binding(BackupScope.Documents)).ReadNewStores("docs-");
            Assert((string?)stores["scope"]=="Documents"&&h.Paths.Count(p=>p==ReleaseQueries.Rows(TableKind.Document))==1&&h.Paths.Count(p=>p==ReleaseQueries.Rows(TableKind.Draft))==1&&h.Paths.Contains(ReleaseQueries.Roles)&&h.Paths.Contains(ReleaseQueries.Users)&&h.Paths.Contains(ReleaseQueries.Steps));
        });
        foreach(var defect in new[]{"absent","partial","unreadable"})await test("Documents cannot downgrade "+defect,async()=>{var h=new StoresHandler(defect=="absent"?"":defect);var b=Capture();using var r=Reader(h,b);await Reject(()=>Inspector(r,b,Binding(BackupScope.Documents)).ReadNewStores("docs-"));});
        foreach(var drift in new[]{"scope","metadata","access","privileges"})await test("connected observation rejects before after "+drift+" drift",async()=>{
            var b=Capture();var w=Workspace();b.Json("workspace.json",w);b.Json("receipts-all-fields.json",new JsonArray());b.Write("zk_state.exact.utf8.json",Encoding.UTF8.GetBytes(Check.Text(w,"zk_state")));var retained=CoreCaptureFacts.Retained(b,w,[]);int n=0;
            await Reject(()=>CaptureConsistency.Run(retained,()=>Task.FromResult((w,Array.Empty<JsonObject>())),()=>Task.FromResult(new JsonObject{["scope"]="Core",[drift]=++n}),(_,_,_)=>Task.FromResult(true)));Assert(n==2&&!Backup.IsComplete(b.DirectoryPath));
        });
        foreach(var location in new[]{"current","archive","baseline","signature"})await test("reviewed Core refuses retained intake in "+location,async()=>{
            var state=State();
            if(location=="signature") {state["operationIds"]=new JsonArray("op");state["operationRequests"]=new JsonObject{["op"]="{\"payload\":{},\"targetEventId\":\"synthetic\",\"type\":\"receipt.draft.accept\"}"};state["revision"]=1;}
            else {
                state["suppliers"]=new JsonArray(new JsonObject{["id"]="supplier",["name"]="Synthetic supplier"});
                var invoice=new JsonObject{["id"]="ffffffff-1111-4111-8111-111111111111",["supplierId"]="supplier",["number"]="SYNTHETIC-INTAKE",["date"]="2099-10-20",["grossCents"]=100,["netCents"]=null,["scope"]="Küche",["status"]="Erfasst",["lines"]=new JsonArray(),["intake"]=new JsonObject{["draftId"]="ffffffff-1111-4111-8111-111111111111",["operationId"]="ffffffff-2222-4222-8222-222222222222"}};
                invoice["sourceBaseline"]=invoice.DeepClone();if(location=="baseline")invoice.Remove("intake");
                if(location=="archive") {var archive=State();archive.Remove("revision");archive.Remove("operationIds");archive.Remove("operationRequests");archive["event"]!["id"]="synthetic-archive";archive["suppliers"]=state["suppliers"]!.DeepClone();archive["invoices"]=new JsonArray(invoice);state["archivedEvents"]=new JsonArray(archive);}else state["invoices"]=new JsonArray(invoice);
            }
            var valid=Protocol.Parse(state.ToJsonString());StatePolicy.Validate(valid,valid); // The refusal must be Core history, never a malformed state fixture.
            await Reject(()=>Sync(()=>ReleaseScope.ValidateState(Binding(),Encoding.UTF8.GetBytes(state.ToJsonString()),location=="signature"?1:0,location=="signature"?[Receipt()]:[])));
        });
        await test("historical review hash does not freeze later valid Core state",()=>Sync(()=>{var state=State();state["event"]!["name"]="later core edit";ReleaseScope.ValidateState(Binding(),Encoding.UTF8.GetBytes(state.ToJsonString()),0,[]);}));
        await test("real Core activation has its own reviewed scope and no document route boundary",async()=>{
            var phase=CorePhase();Assert(!PhaseRoutePrerequisites.Required(phase));var boundary=new NoRoutes();await PhaseRoutePrerequisites.Validate(phase,"/unused",boundary,_=>throw new Exception("diagnostic"),default);Assert(boundary.Reads==0);
        });
        foreach(var defect in new[]{"null","unbound-production","wrong-kind","wrong-scope","different-binding","preparation"})await test("Core phase refuses "+defect+" before route or auth boundary",async()=>{
            var phase=CorePhase();if(defect=="null")phase=phase with{ExpectedScope=null};if(defect=="wrong-kind")phase=phase with{Transition=phase.Transition! with{Kind=TransitionKind.V5ToRefusalDiagnostic}};if(defect=="wrong-scope")phase=phase with{ExpectedScope=Binding(BackupScope.Documents)};if(defect=="different-binding")phase=phase with{Transition=phase.Transition! with{ExpectedScope=new BackupScopeBinding(BackupScope.Core,BackupHistory.CoreOnly,Guid.Parse(Target.Organization),Guid.Parse(Target.Workspace),Guid.NewGuid(),H,H)}};if(defect=="preparation")phase=phase with{Preparation=new(Pin(),Pin(),Pin(),Pin())};
            await Reject(()=>Sync(()=>{if(defect=="unbound-production")ReleaseScope.RequireProduction(phase.ExpectedScope);else _=PhaseRoutePrerequisites.Required(phase);}));
        });
        await test("only explicit preparation preserves null-scope schema/refusal boundaries",()=>Sync(()=>{var prep=new Round1Tests.PreparationFixture(ReleaseMode.ActivatePackage);Assert(ReleaseScope.Phase(prep.Phase)==null&&PhaseRoutePrerequisites.Required(prep.Phase));var schema=new ReviewedPhase(ReleaseMode.ProvisionDocumentSchema,Pin(),Pin(),Pin(),Schema:new(TableKind.Document,SchemaAction.Table));Assert(ReleaseScope.Phase(schema)==null&&!PhaseRoutePrerequisites.Required(schema));}));
        await test("native Core checkpoint accepts absent stores and brackets actual metadata access privileges",async()=>{
            var f=await NativeFixture.Create();var result=await f.Checkpoint.RemeasureAndVerifyRetainedEvidence(default);
            Assert(result==f.Input.Accepted&&f.Handler.Count(Queries.Solution)==2&&f.Handler.Count(Queries.Access(Caller))==2&&f.Handler.Count(Queries.Privileges(Caller))==2&&f.Handler.Count(ReleaseQueries.Entities(TableKind.Document))==2&&f.Handler.Count(ReleaseQueries.Entities(TableKind.Draft))==2);
            Assert(f.Handler.Count(ReleaseQueries.Roles)==0&&f.Handler.Count(ReleaseQueries.Users)==0&&f.Handler.Count(ReleaseQueries.Steps)==0&&!f.Handler.Paths.Any(p=>p.StartsWith("zk_kitchendocuments")||p.StartsWith("zk_kitchendrafts")));
        });
        foreach(var drift in new[]{"metadata","access","privileges","schema","workspace","receipts","accepted-checkpoint","incomplete-backup"})await test("native Core checkpoint refuses actual "+drift+" drift",async()=>{
            var f=await NativeFixture.Create();f.Handler.Defect=drift;
            if(drift=="accepted-checkpoint")f.Input=f.Input with{Accepted=f.Input.Accepted with{Revision=99}};
            if(drift=="incomplete-backup") {
                var incomplete=new Backup(f.Root);incomplete.Finish(new{synthetic=true},false);var pin=f.SaveExisting(Path.Combine(incomplete.DirectoryPath,"manifest.json"));
                f.Input=f.Input with{BackupManifest=pin,Accepted=f.Input.Accepted with{BackupManifestSha256=pin.Sha256}};
            }
            var checkpoint=new NativeCheckpoint(f.Reader,f.Capture,f.Root,f.Input,Binding());await Reject(()=>checkpoint.RemeasureAndVerifyRetainedEvidence(default));
        });
        await test("null checkpoint scope cannot reach native reads without explicit preparation",async()=>{
            var f=await NativeFixture.Create();await Reject(()=>Sync(()=>{_=new NativeCheckpoint(f.Reader,f.Capture,f.Root,f.Input,null);}));Assert(f.Handler.Paths.Count==0);
        });
        await test("final observed Core matches native bytes revision identity receipts and exact null contract",()=>Sync(()=>{var f=new ServerFixture();ReadOnlyReleaseVerification.ValidateServerSnapshot(Binding(),f.Result,f.Native,Caller,f.Workspace,f.Receipts);}));
        foreach(var defect in new[]{"contract","contract-extra","documents-empty","drafts-missing","features","identity","raw","hash","rowversion","owner","revision","state","receipt-hash","receipt-version","receipt-actor","receipt-time","receipt-raw","receipt-extra","native-revision","native-raw","native-receipts","provenance"})await test("final server observation refuses "+defect,async()=>{
            var f=new ServerFixture();f.Defect(defect);await Reject(()=>Sync(()=>ReadOnlyReleaseVerification.ValidateServerSnapshot(defect=="provenance"?Binding(history:BackupHistory.Unknown):Binding(),f.Result,f.Native,Caller,f.Workspace,f.Receipts)));
        });
        await test("document final contract cannot accept empty arrays without native inventories",async()=>{
            var f=new ServerFixture();f.Result["snapshot"]!["sourceContract"]=new JsonObject{["id"]="kitchen-documents-v1",["documents"]="required",["drafts"]="required",["manifestVersion"]=1};f.Result["snapshot"]!["documents"]=new JsonArray();f.Result["snapshot"]!["drafts"]=new JsonArray();
            await Reject(()=>Sync(()=>ReadOnlyReleaseVerification.ValidateServerSnapshot(Binding(BackupScope.Documents),f.Result,f.Native,Caller,f.Workspace,f.Receipts)));
        });
        await test("final package read brackets actual bytes and native package metadata",async()=>{var h=new PackageHandler();var b=Capture();using var r=Reader(h,b);_=await ReadOnlyReleaseVerification.ReadPackage(r,new("package",3,Check.Hash(new byte[]{1,2,3})));Assert(h.Paths.Count==3);});
        foreach(var defect in new[]{"bytes","metadata"})await test("final package refuses "+defect+" drift",async()=>{var h=new PackageHandler(defect);var b=Capture();using var r=Reader(h,b);await Reject(()=>ReadOnlyReleaseVerification.ReadPackage(r,new("package",3,Check.Hash(new byte[]{1,2,3}))));});
        await test("final external package scope checkpoint pairing verifies before any native reader",async()=>{
            var f=await NativeFixture.Create();_=FinalPair(f).Verify(f.Root);Assert(f.Handler.Paths.Count==0);
        });
        foreach(var defect in new[]{"package","scope","review","checkpoint","checkpoint-invalid"})await test("final external pairing refuses "+defect+" before native reads",async()=>{
            var f=await NativeFixture.Create();if(defect=="checkpoint-invalid")f.Input=f.Input with{Accepted=f.Input.Accepted with{Organization=Caller}};
            var pair=FinalPair(f);if(defect=="package")File.WriteAllBytes(Path.Combine(f.Root,pair.Package.RelativePath),new byte[]{9});if(defect=="scope")pair=pair with{ExpectedScope=Binding(BackupScope.Documents)};if(defect=="review")File.WriteAllText(Path.Combine(f.Root,pair.IndependentReview.RelativePath),"{}");if(defect=="checkpoint")File.WriteAllText(Path.Combine(f.Root,pair.Checkpoint.RelativePath),"{}");
            await Reject(()=>Sync(()=>{_=pair.Verify(f.Root);}));Assert(f.Handler.Paths.Count==0);
        });
        await test("native checkpoint refuses fields outside reviewed core metadata",async()=>{var f=await NativeFixture.Create();f.Handler.Workspace["unreviewed"]=1;await Reject(()=>f.Checkpoint.RemeasureAndVerifyRetainedEvidence(default));});
        await test("final receipt raw timestamp must match native timestamp",async()=>{var f=new ServerFixture();f.Result["snapshot"]!["operationReceipts"]![0]!["rawRow"]!["zk_recordedat"]="2099-01-02T00:00:00Z";await Reject(()=>Sync(()=>ReadOnlyReleaseVerification.ValidateServerSnapshot(Binding(),f.Result,f.Native,Caller,f.Workspace,f.Receipts)));});
        await test("document final retains exact payload and installed empty second store with features false",()=>Sync(()=>{var f=new ServerFixture();var (docs,drafts)=DocumentSnapshot(f);ReadOnlyReleaseVerification.ValidateServerSnapshot(Binding(BackupScope.Documents),f.Result,f.Native,Caller,f.Workspace,f.Receipts,docs,drafts);}));
        foreach(var defect in new[]{"payload","raw-payload","rowversion","missing-row","native-hash","schema"})await test("document final refuses "+defect+" drift with features false",async()=>{
            var f=new ServerFixture();var (docs,drafts)=DocumentSnapshot(f);var row=f.Result["snapshot"]!["documents"]![0]!;
            if(defect=="payload")row["history"]=new JsonArray(new JsonObject{["changed"]=true});if(defect=="raw-payload")row["rawRow"]!["zk_payload"]="{}";if(defect=="rowversion")row["rowVersion"]="9";if(defect=="missing-row")f.Result["snapshot"]!["documents"]=new JsonArray();if(defect=="native-hash")f.Native=f.Native with{DocumentCollectionSha256=H};if(defect=="schema")docs=docs with{Progress=DocumentSchemaProgress.NotInstalled};
            await Reject(()=>Sync(()=>ReadOnlyReleaseVerification.ValidateServerSnapshot(Binding(BackupScope.Documents),f.Result,f.Native,Caller,f.Workspace,f.Receipts,docs,drafts)));
        });
        await test("final pairing and all execution catalogs remain unavailable",()=>Reject(()=>Sync(()=>{Assert(ReviewedRelease.InspectionScope==null&&ReviewedRelease.FinalVerification==null&&ReviewedBackupScope.Binding==null&&ReviewedRelease.Transitions.Length==0&&ReviewedRelease.Bindings.Length==0&&ReviewedRelease.Phases.Length==0);ReleaseScope.Require(null); })));
    }
    static FinalVerificationBinding FinalPair(NativeFixture f){
        var package=f.Save("package.bin",new byte[]{4,5,6});var checkpoint=f.Save("checkpoint.json",JsonSerializer.SerializeToUtf8Bytes(f.Input));
        var review=f.Save("final-review.json",JsonSerializer.SerializeToUtf8Bytes(new JsonObject{["schema"]="kitchen-final-scope-review-v1",["packageSha256"]=package.Sha256,["packageBytes"]=package.Length,["scopeFingerprint"]=ReleaseScope.Fingerprint(Binding()),["checkpointSha256"]=checkpoint.Sha256,["independentlyReviewed"]=true}));
        return new(package,Binding(),review,checkpoint);
    }
    static (CurrentStore Docs,CurrentStore Drafts) DocumentSnapshot(ServerFixture f){
        var id="44444444-4444-4444-8444-444444444444";var payload=new JsonObject{["id"]=id,["workspaceId"]=Target.Workspace,["eventId"]="synthetic",["history"]=new JsonArray()};var text=payload.ToJsonString();
        var native=new JsonObject{["zk_kitchendocumentid"]=id,["_zk_workspace_value"]=Target.Workspace,["zk_eventid"]="synthetic",["zk_payload"]=text,["versionnumber"]=7L,["@odata.etag"]="W/\"7\""};
        var row=(JsonObject)payload.DeepClone();row["rowVersion"]="7";row["rawRow"]=new JsonObject{["zk_kitchendocumentid"]=id,["zk_eventid"]="synthetic",["zk_payload"]=text,["@rowVersion"]="7",["zk_workspace"]=new JsonObject{["id"]=Target.Workspace,["logicalName"]="zk_kitchenworkspace"}};
        var docs=new CurrentStore(DocumentSchemaProgress.Exact,PhaseTests.Schema(),[native],Check.Hash("synthetic-documents-native-schema-bound-collection"),H);var drafts=new CurrentStore(DocumentSchemaProgress.Exact,PhaseTests.Schema(TableKind.Draft),[],Check.Hash("synthetic-drafts-native-schema-bound-collection"),H);
        f.Result["snapshot"]!["documents"]=new JsonArray(row);f.Result["snapshot"]!["drafts"]=new JsonArray();f.Result["snapshot"]!["sourceContract"]=new JsonObject{["id"]="kitchen-documents-v1",["documents"]="required",["drafts"]="required",["manifestVersion"]=1};f.Native=f.Native with{DocumentCount=1,DocumentCollectionSha256=docs.Hash,DraftCollectionSha256=drafts.Hash};return(docs,drafts);
    }
    static EvidenceFile Pin()=>new("synthetic",1,H);
    static ReviewedPhase CorePhase(){var scope=Binding();var transition=new ReviewedTransition(TransitionKind.V5ToCore,FixedTarget.PriorSha256,FixedTarget.PriorLength,Pin(),Pin(),Pin(),WriteMode.StrictETagCas,Pin(),scope);return new(ReleaseMode.ActivatePackage,Pin(),Pin(),Pin(),Transition:transition,ExpectedScope:scope);}
    static JsonObject State(){var state=new JsonObject{["schemaVersion"]=2,["sourceNotice"]="Synthetic only",["revision"]=0,["operationIds"]=new JsonArray(),["operationRequests"]=new JsonObject(),["event"]=new JsonObject{["id"]="synthetic",["name"]="Synthetic",["status"]="Offen",["year"]=2099,["dates"]=new JsonObject()}};foreach(var name in new[]{"suppliers","articles","planLines","menu","invoices","sales","movements","orders","dishPlan","lessons"})state[name]=new JsonArray();return state;}
    static JsonObject Workspace()=>new(){["zk_kitchenworkspaceid"]=Target.Workspace,["zk_state"]=State().ToJsonString(),["zk_revision"]=0,["_ownerid_value"]=Caller,["_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname"]="systemuser",["versionnumber"]=42L,["@odata.etag"]="W/\"42\""};
    static JsonObject Receipt()=>new(){["zk_kitchenoperationid"]="33333333-3333-4333-8333-333333333333",["_zk_workspace_value"]=Target.Workspace,["zk_operationid"]="op",["zk_requesthash"]=H,["zk_actor"]=Caller,["zk_appliedrevision"]=1,["zk_recordedat"]="2099-01-01T00:00:00Z",["versionnumber"]=43L,["@odata.etag"]="W/\"43\""};
    sealed class NativeFixture {
        public string Root="/private/tmp/kitchen-native-scope-"+Guid.NewGuid();public Backup Capture=ReleaseScopeTests.Capture();public CoreHandler Handler=new();public Reader Reader=null!;public CheckpointInput Input=null!;
        public NativeCheckpoint Checkpoint=>new(Reader,Capture,Root,Input,Binding());
        public EvidenceFile SaveExisting(string path){var bytes=File.ReadAllBytes(path);return new(Path.GetRelativePath(Root,path),bytes.Length,Check.Hash(bytes));}
        public EvidenceFile Save(string name,byte[] bytes){var path=Path.Combine(Root,name);File.WriteAllBytes(path,bytes);return SaveExisting(path);}
        public static async Task<NativeFixture> Create(){
            var f=new NativeFixture();Directory.CreateDirectory(f.Root);f.Reader=ReleaseScopeTests.Reader(f.Handler,f.Capture);
            var retained=new Backup(f.Root);retained.Finish(new{synthetic=true},true);var backup=f.SaveExisting(Path.Combine(retained.DirectoryPath,"manifest.json"));var evidence=f.Save("review.json","{}"u8.ToArray());var client=f.Save("client.json","{\"synthetic\":true}"u8.ToArray());
            var core=await NativeCheckpoint.ReadCoreClosure(f.Reader,f.Capture,"fixture-baseline-",Caller,default);
            var schema=new CanonicalSchema(true,[],[],[],[],[],[]);var schemaHash=Check.Fingerprint(JsonSerializer.SerializeToNode(schema)!);
            string StoreHash(string table)=>Check.Fingerprint(new JsonObject{["schema"]="kitchen-native-inventory-v1",["table"]=table,["state"]="NotInstalledByNativeEvidence"});
            var closure=new JsonObject{["schema"]="kitchen-scoped-checkpoint-closure-v1",["scope"]="Core",["scopeFingerprint"]=ReleaseScope.Fingerprint(Binding()),["coreMetadataAccess"]=core,["documentSchema"]=schemaHash,["draftSchema"]=schemaHash,["clientManifest"]=client.Sha256};
            var raw=Encoding.UTF8.GetBytes(Check.Text(f.Handler.Workspace,"zk_state"));var originals=OriginalRequirements.ValidateLocal(f.Root,raw,[],[],[]);
            var accepted=new Checkpoint(FixedTarget.Tenant,FixedTarget.Environment,FixedTarget.Organization,FixedTarget.Origin,FixedTarget.App,FixedTarget.Workspace,Caller,"systemuser",0,"42",Check.Hash(raw),0,CompleteInventory.Collection("receipts",[],"zk_kitchenoperationid"),0,StoreHash("zk_kitchendocument"),0,StoreHash("zk_kitchendraft"),0,originals,backup.Sha256,evidence.Sha256,evidence.Sha256);
            f.Input=new(accepted,backup,evidence,evidence,evidence,client,Check.Fingerprint(closure),Caller,[],[]);f.Handler.Paths.Clear();return f;
        }
    }
    // Fully synthetic fixed-target HTTP metadata. Core's existing Metadata reader remains real.
    sealed class CoreHandler:HttpMessageHandler {
        public List<string> Paths=[];public string Defect="";public JsonObject Workspace=ReleaseScopeTests.Workspace();readonly Dictionary<string,JsonNode> replies=[];
        public int Count(string p)=>Paths.Count(x=>x==Uri.UnescapeDataString(p));
        static string Id(int n)=>$"abcdefab-cdef-4abc-8abc-{n:D12}";
        static JsonObject Rows(IEnumerable<JsonObject> rows)=>new(){["value"]=new JsonArray(rows.Select(r=>r.DeepClone()).ToArray()),["@odata.count"]=rows.Count()};
        void Collection(string path,IEnumerable<JsonObject> rows)=>replies[Uri.UnescapeDataString(path)]=Rows(rows);
        public CoreHandler(){
            replies["WhoAmI"]=new JsonObject{["OrganizationId"]=Target.Organization,["UserId"]=Caller};replies[Uri.UnescapeDataString(Queries.Access(Caller))]=new JsonObject{["AccessRights"]="ReadAccess, WriteAccess"};replies[Queries.Privileges(Caller)]=new JsonObject{["RolePrivileges"]=new JsonArray()};
            Collection(Queries.Solution,[new JsonObject{["solutionid"]=Target.Solution,["uniquename"]="zk_Zunftkueche",["ismanaged"]=false,["_publisherid_value"]="567e35a2-67c8-f111-a05c-7ced8d5f6e0d"}]);
            Collection(Queries.Publishers,[new JsonObject{["publisherid"]="567e35a2-67c8-f111-a05c-7ced8d5f6e0d",["uniquename"]="zk_Zunftkueche",["customizationprefix"]="zk",["customizationoptionvalueprefix"]=72700}]);Collection(Queries.Bypass,[]);
            var components=new List<string>{Target.Package,Id(1),Id(2),Target.LoadApi,Target.CommitApi};
            foreach(var table in new[]{"zk_kitchenworkspace","zk_kitchenoperation"}) {
                var workspace=table=="zk_kitchenworkspace";replies[Queries.Table(table)]=new JsonObject{["MetadataId"]=Id(workspace?1:2),["LogicalName"]=table,["TableType"]="Standard",["OwnershipType"]=workspace?"UserOwned":"OrganizationOwned",["IsOptimisticConcurrencyEnabled"]=true,["PrimaryIdAttribute"]=table+"id",["Privileges"]=new JsonArray()};
                var fields=(workspace?new[]{"zk_name","zk_state","zk_revision","zk_kitchenworkspaceid","versionnumber","ownerid"}:new[]{"zk_name","zk_workspace","zk_operationid","zk_requesthash","zk_actor","zk_appliedrevision","zk_recordedat","zk_kitchenoperationid","versionnumber"}).Select((name,n)=>new JsonObject{["MetadataId"]=Id((workspace?100:200)+n),["LogicalName"]=name,["IsSecured"]=false});Collection(Queries.Table(table)+"/Attributes",fields);
                Collection(Queries.Table(table)+"/Keys",workspace?[]:[new JsonObject{["MetadataId"]=Id(300),["LogicalName"]="zk_workspace_operation",["EntityKeyIndexStatus"]="Active",["KeyAttributes"]=new JsonArray("zk_workspace","zk_operationid")}]);Collection(Queries.Table(table)+"/ManyToOneRelationships",[]);Collection(Queries.Table(table)+"/OneToManyRelationships",[]);
            }
            var types=new[]{"KitchenLoadPlugin","KitchenCommitPlugin","KitchenWriteGuardPlugin"}.Select((name,n)=>new JsonObject{["plugintypeid"]=Id(10+n),["typename"]="Zunftkueche."+name,["_pluginassemblyid_value"]=Id(20),["pluginassemblyid"]=new JsonObject{["pluginassemblyid"]=Id(20),["_packageid_value"]=Target.Package,["isolationmode"]=2}}).ToArray();Collection(Queries.Types,types);
            var apis=new[]{Target.LoadApi,Target.CommitApi}.Select((id,n)=>new JsonObject{["customapiid"]=id,["uniquename"]=n==0?"zk_KitchenLoad":"zk_KitchenCommit",["bindingtype"]=0,["isfunction"]=false,["isprivate"]=false,["allowedcustomprocessingsteptype"]=0,["workflowsdkstepenabled"]=false,["boundentitylogicalname"]=null,["_plugintypeid_value"]=Id(10+n),["executeprivilegename"]=n==0?"prvReadzk_kitchenworkspace":"prvWritezk_kitchenworkspace"}).ToArray();Collection(Queries.Apis,apis);
            foreach(var id in new[]{Target.LoadApi,Target.CommitApi}) {Collection(Queries.ApiRequestParameters(id),[new JsonObject{["customapirequestparameterid"]=Id(id==Target.LoadApi?31:32),["_customapiid_value"]=id,["uniquename"]="RequestJson",["type"]=10,["logicalentityname"]=null,["isoptional"]=false}]);Collection(Queries.ApiResponseProperties(id),[new JsonObject{["customapiresponsepropertyid"]=Id(id==Target.LoadApi?33:34),["_customapiid_value"]=id,["uniquename"]="ResultJson",["type"]=10,["logicalentityname"]=null}]);}
            using var stream=typeof(Metadata).Assembly.GetManifestResourceStream("Inventory.contracts.platform-intrinsics.json")!;using var buffer=new MemoryStream();stream.CopyTo(buffer);var baseline=Check.Parse(buffer.ToArray());Collection(Queries.Platform,[(JsonObject)baseline["handler"]!]);
            var ids=new[]{"0a1d7725-76c8-f111-a05c-7ced8d5f6e0d","0d1d7725-76c8-f111-a05c-7ced8d5f6e0d","b0b0da28-76c8-f111-a05c-7ced8d5f6c91","b3b0da28-76c8-f111-a05c-7ced8d5f6c91","101d7725-76c8-f111-a05c-7ced8d5f6e0d","131d7725-76c8-f111-a05c-7ced8d5f6e0d"};var filters=new[]{"1a0bc779-6919-4edf-8f59-d237a50c2d27","65c0cea9-d3be-45a6-8ff2-ffd8e4071e22","de7afa3d-bd34-47f2-94dc-ecfb41eb3204","a7963969-3d98-42d9-8f1a-e5785e4f7b10","0762bb07-341f-4759-a07e-a1ef34d005d1","8b51d657-9bd6-4be6-8721-81d4f24eb696"};
            var filterRows=new List<JsonObject>();var steps=baseline["steps"]!.AsArray().Select(s=>(JsonObject)s!).ToList();int k=0;foreach(var table in new[]{"zk_kitchenworkspace","zk_kitchenoperation"})foreach(var action in new[]{"Create","Update","Delete"}) {
                filterRows.Add(new JsonObject{["sdkmessagefilterid"]=filters[k],["primaryobjecttypecode"]=table,["iscustomprocessingstepallowed"]=true,["_sdkmessageid_value"]=Id(400+k),["sdkmessageid"]=new JsonObject{["name"]=action,["sdkmessageid"]=Id(400+k)}});
                steps.Add(new JsonObject{["sdkmessageprocessingstepid"]=ids[k],["stage"]=20,["mode"]=0,["rank"]=1,["statecode"]=0,["supporteddeployment"]=0,["filteringattributes"]=null,["_impersonatinguserid_value"]=null,["_eventhandler_value"]=Id(12),["_sdkmessagefilterid_value"]=filters[k],["_sdkmessageid_value"]=Id(400+k)});components.Add(ids[k++]);
            }
            Collection(Queries.Filters,filterRows);Collection(Queries.Guards(Id(12)),steps);Collection(Queries.Components,components.Select((id,n)=>new JsonObject{["solutioncomponentid"]=Id(500+n),["objectid"]=id}));
        }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken c){
            var p=Uri.UnescapeDataString(request.RequestUri!.AbsoluteUri[Target.Api.Length..]);Paths.Add(p);JsonNode response;
            if(p==Queries.Workspace){response=Workspace.DeepClone();if(Defect=="workspace"&&Count(p)>1)response["zk_state"]=Check.Text(Workspace,"zk_state").Replace("Synthetic","Changed");}
            else if(p==Queries.Receipts)response=Rows(Defect=="receipts"&&Count(p)>1?[Receipt()]:[]);
            else if(p==ReleaseQueries.Entities(TableKind.Document)||p==ReleaseQueries.Entities(TableKind.Draft)){response=Rows([]);if(Defect=="schema"&&Count(p)>1)response["@odata.count"]=1;}
            else if(replies.TryGetValue(p,out var known))response=known.DeepClone();else throw new Exception("unexpected core request "+p);
            if(Defect=="metadata"&&p==Queries.Bypass&&Count(p)>1)response=Rows([new JsonObject{["privilegeid"]=Id(900),["name"]="SyntheticDrift"}]);
            if(Defect=="access"&&p==Uri.UnescapeDataString(Queries.Access(Caller))&&Count(p)>1)response["AccessRights"]="ReadAccess";
            if(Defect=="privileges"&&p==Queries.Privileges(Caller)&&Count(p)>1)response["RolePrivileges"]=new JsonArray(new JsonObject{["Depth"]=1});
            return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK){Content=new StringContent(response.ToJsonString())});
        }
    }
    sealed class NoRoutes:IDocumentGuardBoundary {public int Reads;public Task<RouteInventory> ReadCanonicalInventory(CancellationToken t){Reads++;throw new Exception("document routes requested");}public Task<TargetObservation> ReadExactGuard(ReviewedBinding b,CancellationToken t)=>throw new Exception();public Task CreateFixedGuardOnce(ReviewedBinding b,CancellationToken t)=>throw new Exception();}
    sealed class ServerFixture {
        public JsonObject Workspace=ReleaseScopeTests.Workspace(),Result;public JsonObject[] Receipts=[Receipt()];public Checkpoint Native;
        public ServerFixture(){var state=State();state["revision"]=1;state["operationIds"]=new JsonArray("op");state["operationRequests"]=new JsonObject{["op"]="{\"payload\":{},\"type\":\"event.switch\"}"};Workspace["zk_state"]=state.ToJsonString();Workspace["zk_revision"]=1;var raw=Check.Text(Workspace,"zk_state");
            Native=new(FixedTarget.Tenant,FixedTarget.Environment,FixedTarget.Organization,FixedTarget.Origin,FixedTarget.App,FixedTarget.Workspace,Caller,"systemuser",1,"42",Check.Hash(raw),1,CompleteInventory.Collection("receipts",Receipts,"zk_kitchenoperationid"),0,H,0,H,0,H,H,H,H);
            var op=new JsonObject{["id"]=Check.Id(Receipts[0],"zk_kitchenoperationid"),["workspaceId"]=Target.Workspace,["operationId"]="op",["requestHash"]=H,["actorId"]=Caller,["appliedRevision"]=1,["recordedAt"]="2099-01-01T00:00:00.0000000Z",["rowVersion"]="43",["rawRow"]=new JsonObject{["zk_kitchenoperationid"]=Check.Id(Receipts[0],"zk_kitchenoperationid"),["zk_operationid"]="op",["zk_requesthash"]=H,["zk_actor"]=Caller,["zk_appliedrevision"]=1,["zk_recordedat"]="2099-01-01T00:00:00.0000000Z",["@rowVersion"]="43",["_zk_workspace_value"]=Target.Workspace,["zk_workspace"]=new JsonObject{["id"]=Target.Workspace,["logicalName"]="zk_kitchenworkspace"}}};
            Result=new(){["protocolVersion"]=2,["workspaceId"]=Target.Workspace,["view"]="backup",["canEdit"]=true,["canConfigure"]=true,["canClose"]=true,["features"]=new JsonObject{["documents"]=false,["receiptIntake"]=false},["identity"]=new JsonObject{["organizationId"]=Target.Organization,["workspaceId"]=Target.Workspace,["userId"]=Caller},["snapshot"]=new JsonObject{["environment"]=Target.Organization,["workspaceId"]=Target.Workspace,["state"]=state,["workspaceEvidence"]=new JsonObject{["rawState"]=raw,["rawStateSha256"]=Check.Hash(raw),["rowVersion"]="42",["ownerId"]=Caller,["ownerType"]="systemuser",["protocolVersion"]=2,["rawRow"]=new JsonObject{["zk_kitchenworkspaceid"]=Target.Workspace,["zk_state"]=raw,["zk_revision"]=1,["@rowVersion"]="42",["ownerid"]=new JsonObject{["id"]=Caller,["logicalName"]="systemuser"}}},["schemaValidation"]=new JsonObject{["policy"]=BackupProtocol.PolicyVersion,["rawStateSha256"]=Check.Hash(raw)},["operationReceipts"]=new JsonArray(op),["sourceContract"]=new JsonObject{["id"]="kitchen-core-v1",["documents"]="not_in_contract",["drafts"]="not_in_contract"},["documents"]=null,["drafts"]=null}};
        }
        public void Defect(string d){var s=Result["snapshot"]!;var e=s["workspaceEvidence"]!;var op=s["operationReceipts"]![0]!;
            switch(d){case "contract":s["sourceContract"]!["id"]="kitchen-documents-v1";break;case "contract-extra":s["sourceContract"]!["hidden"]=true;break;case "documents-empty":s["documents"]=new JsonArray();break;case "drafts-missing":s.AsObject().Remove("drafts");break;case "features":Result["features"]!["documents"]=true;break;case "identity":Result["identity"]!["userId"]=Target.Organization;break;case "raw":e["rawState"]="{}";break;case "hash":e["rawStateSha256"]=H;break;case "rowversion":e["rowVersion"]="44";break;case "owner":e["ownerId"]=Target.Organization;break;case "revision":Workspace["zk_revision"]=2;break;case "state":s["state"]!["revision"]=2;break;case "receipt-hash":op["requestHash"]=new string('f',64);break;case "receipt-version":op["rowVersion"]="99";break;case "receipt-actor":op["actorId"]=Target.Organization;break;case "receipt-time":op["recordedAt"]="2099-01-02T00:00:00Z";break;case "receipt-raw":op["rawRow"]!["zk_operationid"]="changed";break;case "receipt-extra":s["operationReceipts"]!.AsArray().Add(op.DeepClone());break;case "native-revision":Native=Native with{Revision=2};break;case "native-raw":Native=Native with{RawStateSha256=H};break;case "native-receipts":Native=Native with{ReceiptCollectionSha256=H};break;}
        }
    }
    sealed class PackageHandler(string defect=""):HttpMessageHandler {public List<string> Paths=[];protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken c){var p=Uri.UnescapeDataString(request.RequestUri!.AbsoluteUri[Target.Api.Length..]);Paths.Add(p);if(p==Queries.PackageBytes)return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK){Content=new ByteArrayContent(defect=="bytes"?new byte[]{9}:new byte[]{1,2,3})});var v=defect=="metadata"&&Paths.Count>1?43:42;return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK){Content=new StringContent(new JsonObject{["pluginpackageid"]=Target.Package,["name"]="zk_Zunftkueche.Dataverse",["uniquename"]="zk_Zunftkueche.Dataverse",["version"]="1.0.0",["statecode"]=0,["package"]=Caller,["versionnumber"]=(long)v,["@odata.etag"]=$"W/\"{v}\""}.ToJsonString())});}}
    sealed class StoresHandler(string defect=""):HttpMessageHandler {
        public List<string> Paths=[];
        CanonicalSchema Schema(TableKind table){var schema=defect=="partial"?PhaseTests.PrimaryOnly(table):PhaseTests.Schema(table);var entity=schema.Entities[0];var relation=schema.ManyToOne.FirstOrDefault();var components=schema.Components.Concat(new[]{new JsonObject{["solutioncomponentid"]="eeeeeeee-eeee-4eee-8eee-000000000001",["objectid"]=entity["MetadataId"]!.DeepClone(),["componenttype"]=1,["_solutionid_value"]=Target.Solution}});if(relation!=null)components=components.Append(new JsonObject{["solutioncomponentid"]="eeeeeeee-eeee-4eee-8eee-000000000002",["objectid"]=relation["MetadataId"]!.DeepClone(),["componenttype"]=10,["_solutionid_value"]=Target.Solution});return schema with{Components=components.ToArray()};}
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken cancellation){
            var path=Uri.UnescapeDataString(request.RequestUri!.AbsoluteUri[Target.Api.Length..]);Paths.Add(path);if(defect=="unreadable")return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.Forbidden){Content=new StringContent("{}")});
            var table=path.Contains("zk_kitchendraft")||path.Contains("zk_KitchenDraft")?TableKind.Draft:TableKind.Document;var schema=Schema(table);JsonObject Rows(IEnumerable<JsonObject> rows){var values=rows.Select(r=>r.DeepClone()).ToArray();var o=new JsonObject{["@odata.count"]=values.Length,["value"]=new JsonArray(values)};return o;}
            JsonNode response;
            if(path.StartsWith("EntityDefinitions?")){
                response=Rows(defect is "installed" or "partial"?schema.Entities:[]);
                if(defect=="missing-count")response.AsObject().Remove("@odata.count");if(defect=="truncated")response["@odata.count"]=1;
                if(defect=="collision")response=Rows([new JsonObject{["MetadataId"]=Caller,["LogicalName"]="unrelated",["SchemaName"]=DocumentSchema.Schema(table)}]);
                if(defect=="duplicate")response=Rows([schema.Entities[0],schema.Entities[0]]);
            }
            else if(path==Queries.Table(DocumentSchema.Logical(table)))response=schema.Entities[0];
            else if(path.EndsWith("/Attributes"))response=Rows(schema.Attributes);
            else if(path.Contains("/Attributes/Microsoft.Dynamics.CRM.")){var type=path[(path.LastIndexOf('/')+1)..];response=Rows(schema.Attributes.Where(a=>(string?)a["@odata.type"]==type));}
            else if(path.EndsWith("/Keys"))response=Rows(schema.Keys);
            else if(path.EndsWith("/ManyToOneRelationships"))response=Rows(schema.ManyToOne);
            else if(path.EndsWith("/OneToManyRelationships"))response=Rows(schema.OneToMany);
            else if(path==Queries.Components)response=Rows(schema.Components);
            else if(path==ReleaseQueries.Roles||path==ReleaseQueries.Users||path==ReleaseQueries.Steps||Enum.GetValues<TableKind>().Any(t=>path==ReleaseQueries.Rows(t)||path==ReleaseQueries.Filters(t)))response=Rows([]);
            else throw new Exception("unexpected native request "+path);
            return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK){Content=new StringContent(response.ToJsonString())});
        }
    }
}
