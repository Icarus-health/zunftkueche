using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Kitchen.Inventory;
using Kitchen.Release;
using Newtonsoft.Json.Linq;
using PackageActivationPreparation;

static class Round1Tests
{
    const string Id="11111111-1111-4111-8111-111111111111";
    internal static void Assert(bool value){if(!value)throw new Exception("round1 assertion");}
    static async Task Reject(Func<Task> action){try{await action();}catch(Stop){return;}throw new Exception("expected refusal");}
    static string Temp(){var path=Path.Combine("/private/tmp","kitchen-round1-"+Guid.NewGuid());Directory.CreateDirectory(path);return path;}
    static byte[] Bytes(JObject value)=>Encoding.UTF8.GetBytes(value.ToString(Newtonsoft.Json.Formatting.None));
    static CanonicalSchema Exact(TableKind table) {
        var s=PhaseTests.Schema(table);return s with{Components=[..s.Components,
            new JsonObject{["solutioncomponentid"]=Id,["objectid"]=s.Entities[0]["MetadataId"]!.DeepClone(),["componenttype"]=1,["_solutionid_value"]=Target.Solution},
            new JsonObject{["solutioncomponentid"]="22222222-2222-4222-8222-222222222222",["objectid"]=s.ManyToOne[0]["MetadataId"]!.DeepClone(),["componenttype"]=10,["_solutionid_value"]=Target.Solution}]};
    }
    public static async Task Run(Func<string,Func<Task>,Task> test) {
        foreach(var table in Enum.GetValues<TableKind>()) {
            await test("native primary and full historical system shape allow partial and exact "+table,()=>{
                var partial=PhaseTests.PrimaryOnly(table);var exact=Exact(table);var before=JsonSerializer.Serialize(exact);
                Assert(CurrentDocumentStore.Classify(table,partial)==DocumentSchemaProgress.Partial&&CurrentDocumentStore.Classify(table,exact)==DocumentSchemaProgress.Exact);
                Assert(JsonSerializer.Serialize(exact)==before);return Task.CompletedTask;
            });
            foreach(var defect in new[]{"wrong-id","wrong-type","missing-primary","missing-system","wrong-owner-flags","extra-custom","extra-system"})await test("native primary/system refuses "+table+" "+defect,async()=>{
                var schema=Exact(table);var primary=schema.Attributes.Single(a=>(bool?)a["IsPrimaryId"]==true);
                if(defect=="wrong-id")primary["LogicalName"]="zk_otherid";
                if(defect=="wrong-type")primary["AttributeType"]="String";
                if(defect=="missing-primary")schema=schema with{Attributes=schema.Attributes.Where(a=>a!=primary).ToArray()};
                if(defect=="missing-system")schema=schema with{Attributes=schema.Attributes.Where(a=>(string?)a["LogicalName"]!="createdon").ToArray()};
                if(defect=="wrong-owner-flags")schema.Attributes.Single(a=>(string?)a["LogicalName"]=="ownerid")["IsValidForUpdate"]=false;
                if(defect.StartsWith("extra-")){var extra=(JsonObject)primary.DeepClone();extra["LogicalName"]=defect=="extra-custom"?"zk_unreviewed":"unreviewedsystem";extra["IsPrimaryId"]=false;schema=schema with{Attributes=[..schema.Attributes,extra]};}
                var retained=JsonSerializer.Serialize(schema);await Reject(()=>{_=CurrentDocumentStore.Classify(table,schema);return Task.CompletedTask;});Assert(JsonSerializer.Serialize(schema)==retained);
            });
        }
        foreach(var location in new[]{"aggregate","document-history","draft-history","draft-page","unknown-provider"})await test("same hash local bytes never satisfy "+location+" source in inspection or checkpoint",async()=>{
            var f=new OriginalsFixture();var raw=f.Local();var documents=new List<JObject>();var drafts=new List<JObject>();var cloud=f.Cloud();
            if(location=="aggregate")raw["history"]=new JArray(cloud);
            if(location=="document-history")documents.Add(new JObject{{"status","selected"},{"uploadId","retained"},{"sha256",f.Hash},{"history",new JArray(cloud)}});
            if(location=="draft-history")drafts.Add(new JObject{{"history",new JArray(cloud)}});
            if(location=="draft-page")drafts.Add(new JObject{{"pages",new JArray(new JObject{{"documentId",Id},{"version","version-one"},{"sha256",f.Hash}})}});
            if(location=="unknown-provider"){cloud["provider"]="unknown";documents.Add(cloud);}
            var backup=new Backup(Temp());var rawBytes=Bytes(raw);var prior=raw.ToString();
            await Reject(()=>{_=ReleaseInspector.RetainAndValidateOriginals(backup,f.Root,rawBytes,documents,drafts,f.Manifest);return Task.CompletedTask;});
            await Reject(()=>{_=NativeCheckpoint.ValidateFreshOriginals(f.Root,rawBytes,Store(documents),Store(drafts),[f.Original],[f.Hash]);return Task.CompletedTask;});
            Assert(File.ReadAllBytes(Path.Combine(backup.DirectoryPath,"original-"+f.Hash+".bin")).SequenceEqual(f.Content)&&!Backup.IsComplete(backup.DirectoryPath)&&raw.ToString()==prior);
            var requirements=File.ReadAllText(Path.Combine(backup.DirectoryPath,"original-source-requirements.json"));Assert(requirements.Contains(f.Hash));
        });
        await test("local-only raw source derives same inspection and checkpoint original fingerprint",()=>{
            var f=new OriginalsFixture();var raw=Bytes(f.Local());var backup=new Backup(Temp());
            var inspection=ReleaseInspector.RetainAndValidateOriginals(backup,f.Root,raw,[],[],f.Manifest);
            var checkpoint=NativeCheckpoint.ValidateFreshOriginals(f.Root,raw,Store([]),Store([]),[f.Original],[f.Hash]);
            Assert(DocumentGuards.Hash(inspection)&&inspection==checkpoint);return Task.CompletedTask;
        });
        await test("caller omitted required hash cannot authorize checkpoint",async()=>{var f=new OriginalsFixture();await Reject(()=>{_=NativeCheckpoint.ValidateFreshOriginals(f.Root,Bytes(f.Local()),Store([]),Store([]),[f.Original],[]);return Task.CompletedTask;});});
        await test("unresolved local path cannot be relabelled complete",async()=>{var f=new OriginalsFixture();await Reject(()=>{_=OriginalRequirements.ValidateLocal(f.Root,Bytes(new JObject{{"document",new JObject{{"localPath","historical/path.pdf"}}}}),[],[],[f.Original]);return Task.CompletedTask;});});
        await test("cloud URL alone remains a cloud requirement",async()=>{var f=new OriginalsFixture();var raw=f.Local();raw["documentUrl"]="https://example.invalid/document";await Reject(()=>{_=OriginalRequirements.ValidateLocal(f.Root,Bytes(raw),[],[],[f.Original]);return Task.CompletedTask;});});

        foreach(var drift in new[]{"workspace-gap","receipts-gap","workspace-during-originals","extended-during-originals"})await test("connected capture rejects "+drift+" and retains earlier named bytes",async()=>{
            var f=new CaptureFixture();var reads=0;var extended=0;var facts=0;var changed=(JsonObject)f.Workspace.DeepClone();changed["zk_state"]="{\"revision\":2}";
            Task<(JsonObject,JsonObject[])> Core(){reads++;return Task.FromResult((drift=="workspace-gap"||drift=="workspace-during-originals"&&reads>1?changed:f.Workspace,drift=="receipts-gap"?[new JsonObject{["zk_operationid"]="new",["zk_kitchenoperationid"]=Id}]:Array.Empty<JsonObject>()));}
            Task<JsonObject> Extended(){extended++;return Task.FromResult(new JsonObject{["rows"]=drift=="extended-during-originals"&&extended>1?1:0});}
            await Reject(async()=>{await CaptureConsistency.Run(f.Retained,Core,Extended,(_,_,_)=>{facts++;return Task.FromResult("captured");});f.Backup.Finish(new{complete=true},true);});
            Assert(!Backup.IsComplete(f.Backup.DirectoryPath)&&File.ReadAllBytes(Path.Combine(f.Backup.DirectoryPath,"zk_state.exact.utf8.json")).SequenceEqual(f.Raw));
            if(drift.EndsWith("gap"))Assert(extended==0&&facts==0);else Assert(extended==2&&facts==1);
        });
        await test("connected stable capture finishes with same named core bytes",async()=>{
            var f=new CaptureFixture();var calls=new List<string>();
            var result=await CaptureConsistency.Run(f.Retained,()=>{calls.Add("core");return Task.FromResult((f.Workspace,Array.Empty<JsonObject>()));},()=>{calls.Add("extended");return Task.FromResult(new JsonObject{["rows"]=0});},(_,_,_)=>{calls.Add("originals");return Task.FromResult("verified");});
            Assert(string.Join(",",calls)=="core,extended,originals,extended,core"&&result.Facts=="verified");f.Backup.Finish(new{core=f.Retained},true);Assert(Backup.IsComplete(f.Backup.DirectoryPath));
        });

        await test("refusal preparation guard uses complete fresh plan and explicit unproved witnesses",async()=>{
            var f=new PreparationFixture(ReleaseMode.RegisterDocumentGuards);var b=f.Boundary;var checks=0;
            var result=await GuardPhase.Run(f.Binding,b,async t=>{await PhaseRoutePrerequisites.Validate(f.Phase,f.Root,b,_=>{checks++;return Task.CompletedTask;},t);return true;},new MemoryJournal());
            Assert(result==AdditiveResult.CreatedObservedExact&&b.Writes==1&&checks==1);
            Assert(f.Review.Evidence.All(e=>e.WitnessState==NativeWitnessState.Unproved&&e.NativeWitness==null&&e.Route.NativeWitnessHash==null));
        });
        foreach(var defect in new[]{"no-preparation-contract","ordinary-use-enabled","no-writer-exclusion","wrong-checkpoint","accepting-diagnostic","wrong-package","missing-route","extra-route","native-inventory-drift","uninstalled-diagnostic","unproved-as-final","fake-witness"})await test("refusal preparation rejects "+defect+" before guard write",async()=>{
            var f=new PreparationFixture(ReleaseMode.RegisterDocumentGuards);f.Defect(defect);var b=f.Boundary;
            var result=await GuardPhase.Run(f.Binding,b,async t=>{await PhaseRoutePrerequisites.Validate(f.Phase,f.Root,b,_=>defect=="uninstalled-diagnostic"?Task.FromException(new Stop()):Task.CompletedTask,t);return true;},new MemoryJournal());
            Assert(result==AdditiveResult.StoppedBeforeAttempt&&b.Writes==0);
        });
        await test("typed preparation does not populate executable catalogs",()=>{Assert(ReviewedRelease.Phases.Length==0&&ReviewedRelease.Transitions.Length==0&&ReviewedRelease.Bindings.Length==0);return Task.CompletedTask;});
    }
    static CurrentStore Store(IEnumerable<JObject> payloads)=>new(DocumentSchemaProgress.Exact,new(true,[],[],[],[],[],[]),payloads.Select(p=>new JsonObject{["zk_payload"]=p.ToString(Newtonsoft.Json.Formatting.None)}).ToArray(),new string('a',64),new string('b',64));
    sealed class OriginalsFixture {
        public readonly string Root=Temp();public readonly byte[] Content="retained synthetic local original"u8.ToArray();public readonly string Hash;public readonly OriginalVersion Original;public readonly byte[] Manifest;
        public OriginalsFixture(){Hash=Check.Hash(Content);File.WriteAllBytes(Path.Combine(Root,"original.bin"),Content);Original=new("retained-local-import",Hash,Hash,Content.Length,null,null,null,null,null,new("original.bin",Content.Length,Hash));Manifest=JsonSerializer.SerializeToUtf8Bytes(new{originals=new[]{Original}});}
        public JObject Local()=>new(){{"source",new JObject{{"hash",Hash}}}};
        public JObject Cloud()=>new(){{"provider","sharepoint"},{"sha256",Hash},{"siteCollectionId","synthetic-site"},{"libraryId","synthetic-library"},{"itemId","synthetic-item"},{"version","synthetic-version"}};
    }
    sealed class CaptureFixture {
        public readonly Backup Backup=new(Temp());public readonly byte[] Raw="{\"revision\":1}"u8.ToArray();public readonly JsonObject Workspace;public readonly CoreCaptureFacts Retained;
        public CaptureFixture(){Workspace=new(){["zk_state"]=Encoding.UTF8.GetString(Raw),["zk_revision"]=1};Backup.Write("zk_state.exact.utf8.json",Raw);Backup.Json("workspace.json",Workspace);Backup.Json("receipts-all-fields.json",new JsonArray());Retained=CoreCaptureFacts.Retained(Backup,Workspace,[]);}
    }
    sealed class MemoryJournal:IAttemptJournal {public bool AttemptPersisted{get;private set;}public void Begin(string operation){Assert(!AttemptPersisted);AttemptPersisted=true;}public void Observe(string result){}}
    internal sealed class PreparationFixture {
        public readonly string Root=Temp();public readonly ReviewedBinding Binding=new(TableKind.Document,"Create",Id,"22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333",new string('a',64));
        public readonly PreparationBoundary Boundary;public ReviewedPhase Phase;public RouteReview Review;JsonObject refusal,exclusion;
        EvidenceFile Save(string name,byte[] bytes){File.WriteAllBytes(Path.Combine(Root,name),bytes);return new(name,bytes.Length,Check.Hash(bytes));}
        EvidenceFile SaveJson(string name,object value)=>Save(name,JsonSerializer.SerializeToUtf8Bytes(value));
        public PreparationFixture(ReleaseMode mode, bool final=false) {
            Boundary=new(Binding);
            var diagnostic=Save("diagnostic.bin",new byte[]{4,5,6});var source=Save("source-build.json","{\"synthetic\":true}"u8.ToArray());var phaseReview=Save("independent-phase-review.json","{\"test\":true}"u8.ToArray());var checkpoint=Save("checkpoint.json","{\"current\":true}"u8.ToArray());var authoritative=Save("authoritative.json","{\"syntheticMetadata\":true}"u8.ToArray());var witness=Save("native-witness.json","{\"syntheticWitness\":true}"u8.ToArray());
            var rows=Enum.GetValues<TableKind>().SelectMany(t=>DocumentGuards.RequiredMessages.Concat(DocumentGuards.DiscoveryMessages).Select(m=>new PinnedRouteEvidence(new(t,m,m is "Upsert" or "CreateMultiple" or "UpdateMultiple" or "UpsertMultiple"?RouteDisposition.Traversal:DocumentGuards.IndividualMessage(m)?RouteDisposition.RegisterDenialOrOwnCud:RouteDisposition.Unavailable,authoritative.Sha256,final?witness.Sha256:null),authoritative,final?witness:null,final?NativeWitnessState.Observed:NativeWitnessState.Unproved))).ToArray();
            Review=new("kitchen-document-route-review-v1",Target.Organization,Target.Solution,rows,final?RouteReviewKind.FinalWitnessed:RouteReviewKind.RefusalPreparation,Check.Fingerprint(JsonSerializer.SerializeToNode(Boundary.Inventory)!));
            refusal=new(){["schema"]="kitchen-refusal-diagnostic-review-v1",["organization"]=Target.Organization,["packageId"]=Target.Package,["diagnosticSha256"]=diagnostic.Sha256,["diagnosticBytes"]=diagnostic.Length,["sourceBuildSha256"]=source.Sha256,["ordinaryKitchenCommit"]="refused-before-write",["acceptingDocumentOperations"]=false,["independentlyReviewed"]=true};
            exclusion=new(){["schema"]="kitchen-preparation-exclusion-v1",["organization"]=Target.Organization,["workspace"]=Target.Workspace,["app"]=Target.App,["ordinaryUseDisabled"]=true,["sourceWritersExcluded"]=true,["packageWritersExcluded"]=true,["checkpointSha256"]=checkpoint.Sha256,["reviewSha256"]=phaseReview.Sha256};
            var prep=new PreparationContract(diagnostic,source,SaveJson("refusal.json",refusal),SaveJson("exclusion.json",exclusion));
            var scope=final?ReleaseScopeTests.Binding(Zunftkueche.BackupScope.Documents):null;
            var transition=new ReviewedTransition(final?TransitionKind.RefusalDiagnosticToFinal:TransitionKind.V5ToRefusalDiagnostic,Check.Hash(new byte[]{1,2,3}),3,diagnostic,source,phaseReview,WriteMode.StrictETagCas,prep.OrdinaryUseAndWriterExclusion,scope);
            Phase=new(mode,phaseReview,phaseReview,checkpoint,Guard:mode==ReleaseMode.RegisterDocumentGuards?Binding:null,Transition:mode==ReleaseMode.ActivatePackage?transition:null,Routes:SaveJson("routes.json",Review),Preparation:final?null:prep,ExpectedScope:scope);
        }
        public void Defect(string defect) {
            if(defect=="no-preparation-contract")Phase=Phase with{Preparation=null};
            if(defect=="ordinary-use-enabled")exclusion["ordinaryUseDisabled"]=false;
            if(defect=="no-writer-exclusion")exclusion["sourceWritersExcluded"]=false;
            if(defect=="wrong-checkpoint")exclusion["checkpointSha256"]=new string('f',64);
            if(defect=="accepting-diagnostic")refusal["acceptingDocumentOperations"]=true;
            if(defect=="wrong-package")refusal["diagnosticSha256"]=new string('f',64);
            if(Phase.Preparation!=null)Phase=Phase with{Preparation=Phase.Preparation with{IndependentRefusalReview=SaveJson("refusal.json",refusal),OrdinaryUseAndWriterExclusion=SaveJson("exclusion.json",exclusion)}};
            if(defect=="missing-route")Review=Review with{Evidence=Review.Evidence.Skip(1).ToArray()};
            if(defect=="extra-route")Review=Review with{Evidence=[..Review.Evidence,Review.Evidence[0] with{Route=Review.Evidence[0].Route with{Message="NotObserved"}}]};
            if(defect=="native-inventory-drift")Boundary.Inventory=Boundary.Inventory with{GlobalSteps=[new JsonObject{["sdkmessageid"]=new JsonObject{["name"]="NewNativeRoute"}}]};
            if(defect=="unproved-as-final")Review=Review with{Kind=RouteReviewKind.FinalWitnessed};
            if(defect=="fake-witness")Review=Review with{Evidence=Review.Evidence.Select(e=>e with{Route=e.Route with{NativeWitnessHash=new string('f',64)}}).ToArray()};
            Phase=Phase with{Routes=SaveJson("routes.json",Review)};
        }
    }
    internal sealed class PreparationBoundary(ReviewedBinding binding):IDocumentGuardBoundary {
        public int Writes;public RouteInventory Inventory=new(true,[new JsonObject{["sdkmessagefilterid"]=binding.FilterId,["primaryobjecttypecode"]=DocumentSchema.Logical(binding.Table),["isvisible"]=true,["iscustomprocessingstepallowed"]=true,["sdkmessageid"]=new JsonObject{["sdkmessageid"]=binding.MessageId,["name"]=binding.Message,["isprivate"]=false}}],[],[]);
        JsonObject Row()=>new(){["sdkmessageprocessingstepid"]="44444444-4444-4444-8444-444444444444",["stage"]=20,["mode"]=0,["rank"]=1,["statecode"]=0,["supporteddeployment"]=0,["filteringattributes"]=null,["configuration"]=null,["_impersonatinguserid_value"]=null,["_sdkmessageid_value"]=binding.MessageId,["_sdkmessagefilterid_value"]=binding.FilterId,["_eventhandler_value"]=binding.TypeId};
        public Task<TargetObservation> ReadExactGuard(ReviewedBinding b,CancellationToken token)=>Task.FromResult(Writes==0?new TargetObservation(Presence.Missing):new(Presence.ExistingExact,Row()));
        public Task<RouteInventory> ReadCanonicalInventory(CancellationToken token)=>Task.FromResult(Writes==0?Inventory:Inventory with{Steps=[Row()]});
        public Task CreateFixedGuardOnce(ReviewedBinding b,CancellationToken token){Writes++;return Task.CompletedTask;}
    }
}
