using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using Kitchen.Inventory;
using Kitchen.Release;
static class PhaseTests
{
    const string EntityId="11111111-1111-4111-8111-111111111111", StepId="22222222-2222-4222-8222-222222222222", FilterId="33333333-3333-4333-8333-333333333333",TypeId="44444444-4444-4444-8444-444444444444",MessageId="55555555-5555-4555-8555-555555555555";
    static readonly ReviewedBinding Binding=new(TableKind.Document,"Create",FilterId,MessageId,TypeId,new string('a',64));
    static void Assert(bool value){if(!value)throw new Exception("assertion");}
    static async Task Reject(Func<Task> action){try{await action();}catch(Stop){return;}throw new Exception("expected refusal");}
    public static async Task Run(Func<string,Func<Task>,Task> test) {
        foreach(var action in Enum.GetValues<SchemaAction>()) {
            var step=new SchemaStep(TableKind.Document,action,ColumnKind.Payload,FixedComponent.Payload);
            await test("distinct exact and collection reads create one "+action,async()=>{var b=new Boundary(step);var j=new Journal();var r=await SchemaPhase.Run(step,b,_=>Task.FromResult(true),j);Assert(r==AdditiveResult.CreatedObservedExact&&b.Writes==1&&b.ExactReads==2&&b.CollectionReads>=2&&j.AttemptPersisted);});
            await test("exact and collection IDs disagree before "+action,async()=>{var b=new Boundary(step){Present=true,MutateExact=row=>row[action==SchemaAction.SolutionMembership?"solutioncomponentid":"MetadataId"]=StepId};var r=await SchemaPhase.Run(step,b,_=>Task.FromResult(true),new Journal());Assert(r==AdditiveResult.DriftStop&&b.Writes==0);});
            await test("collection omits exact existing "+action,async()=>{var b=new Boundary(step){Present=true,OmitCollection=true};var r=await SchemaPhase.Run(step,b,_=>Task.FromResult(true),new Journal());Assert(r==AdditiveResult.StoppedBeforeAttempt&&b.Writes==0);});
            await test("unknown exact still reads collection for "+action,async()=>{var b=new Boundary(step){ThrowExact=true};var r=await SchemaPhase.Run(step,b,_=>Task.FromResult(true),new Journal());Assert(r==AdditiveResult.StoppedBeforeAttempt&&b.Writes==0&&b.CollectionReads==1);});
        }
        await test("schema checkpoint drift prevents typed mutation",async()=>{var b=new Boundary(new(TableKind.Document,SchemaAction.Table));var r=await SchemaPhase.Run(b.Step,b,_=>Task.FromResult(false),new Journal());Assert(r==AdditiveResult.StoppedBeforeAttempt&&b.Writes==0);});
        await test("column dispatch requires independently existing parent table",async()=>{var b=new Boundary(new(TableKind.Document,SchemaAction.ScalarColumn,ColumnKind.Payload)){ParentMissing=true};var r=await SchemaPhase.Run(b.Step,b,_=>Task.FromResult(true),new Journal());Assert(r==AdditiveResult.StoppedBeforeAttempt&&b.Writes==0);});
        await test("relationship dispatch cannot turn unknown eligibility into allowed",async()=>{var b=new Boundary(new(TableKind.Document,SchemaAction.Relationship)){Eligible=false};var r=await SchemaPhase.Run(b.Step,b,_=>Task.FromResult(true),new Journal());Assert(r==AdditiveResult.StoppedBeforeAttempt&&b.Writes==0);});
        await test("solution component identity derives only from fixed canonical metadata",()=>{var s=Schema();var id=SchemaPhase.Component(s,TableKind.Document,FixedComponent.Table);Assert(id.Type==1&&id.Id==EntityId);return Task.CompletedTask;});
        await test("orphan workspace lookup prevents relationship deep insert",()=>{var s=Schema() with{ManyToOne=[]};Assert(SchemaPhase.Observe(new(TableKind.Document,SchemaAction.Relationship),s)==Presence.DriftOrDuplicate);return Task.CompletedTask;});
        await test("unknown enclosing collection cannot confirm an exact object",async()=>{var b=new Boundary(new(TableKind.Document,SchemaAction.Table)){Present=true,UnknownCollection=true};var result=await SchemaPhase.Run(b.Step,b,_=>Task.FromResult(true),new Journal());Assert(result==AdditiveResult.StoppedBeforeAttempt&&b.Writes==0&&b.ExactReads==1);});
        await test("postattempt exact collection mismatch never grants success or retry",async()=>{var b=new Boundary(new(TableKind.Document,SchemaAction.Table)){MutateExact=r=>r["MetadataId"]=StepId};var r=await SchemaPhase.Run(b.Step,b,_=>Task.FromResult(true),new Journal());Assert(r==AdditiveResult.DriftStop&&b.Writes==1);});
        await test("unknown source field mismatch refuses without changing either raw object",async()=>{var a=new JsonObject{["MetadataId"]=EntityId,["@odata.context"]="exact",["unreviewed"]=1};var b=(JsonObject)a.DeepClone();b["@odata.context"]="collection";b["unreviewed"]=2;var beforeA=a.ToJsonString();var beforeB=b.ToJsonString();var r=await AdditiveAttempt.ReadTargets(_=>Task.FromResult(new TargetObservation(Presence.ExistingExact,a)),_=>Task.FromResult(new TargetObservation(Presence.ExistingExact,b)),default);Assert(r.Object==Presence.DriftOrDuplicate&&a.ToJsonString()==beforeA&&b.ToJsonString()==beforeB);});
        await test("omitted provider field is not normalized away",async()=>{var a=new JsonObject{["MetadataId"]=EntityId,["newProviderField"]=null};var b=new JsonObject{["MetadataId"]=EntityId};var r=await AdditiveAttempt.ReadTargets(_=>Task.FromResult(new TargetObservation(Presence.ExistingExact,a)),_=>Task.FromResult(new TargetObservation(Presence.ExistingExact,b)),default);Assert(r.Object==Presence.DriftOrDuplicate);});
        await test("primary or lookup companion disagreement refuses",async()=>{var row=new JsonObject{["MetadataId"]=EntityId};var a=new JsonObject{["MetadataId"]=FilterId};var b=new JsonObject{["MetadataId"]=TypeId};var r=await AdditiveAttempt.ReadTargets(_=>Task.FromResult(new TargetObservation(Presence.ExistingExact,row,a)),_=>Task.FromResult(new TargetObservation(Presence.ExistingExact,row,b)),default);Assert(r.Object==Presence.DriftOrDuplicate);});
        await test("object context and type prefix comparison preserves raw values",()=>{var a=new JsonObject{["@odata.context"]="one",["@odata.type"]="#Microsoft.Dynamics.CRM.EntityMetadata",["MetadataId"]=EntityId};var b=new JsonObject{["@odata.context"]="two",["@odata.type"]="Microsoft.Dynamics.CRM.EntityMetadata",["MetadataId"]=EntityId};Assert(AdditiveAttempt.SameRow(a,b)&&((string)a["@odata.type"]!).StartsWith('#'));return Task.CompletedTask;});

        foreach(var action in Enum.GetValues<SchemaAction>())await test("fixed adapter issues distinct exact GET for "+action,async()=>{var h=new Handler();using var reader=Reader(h);using var boundary=new FixedDocumentSchemaBoundary(reader,()=>Task.FromResult("synthetic"),new Journal());var step=new SchemaStep(TableKind.Document,action,ColumnKind.Payload,FixedComponent.Payload);var actual=await boundary.ReadExactTarget(step,default);Assert(actual.State==Presence.ExistingExact);var expected=action==SchemaAction.SolutionMembership?"solutioncomponents("+ComponentId(ColumnKind.Payload)+")":SchemaPhase.ExactPath(step);Assert(h.Paths.Contains(expected)&&h.Methods.All(m=>m=="GET"));});
        foreach(var column in new[]{ColumnKind.Actor,ColumnKind.RecordedAt})await test("fixed exact column retains typed cast "+column,async()=>{var h=new Handler();using var reader=Reader(h);var step=new SchemaStep(TableKind.Draft,SchemaAction.ScalarColumn,column);var row=await reader.ExactMetadata(step,default);Assert(row!=null&&h.Paths.Single()==SchemaPhase.ExactPath(step));});
        foreach(var code in new[]{HttpStatusCode.NotFound,HttpStatusCode.Forbidden,HttpStatusCode.TooManyRequests,HttpStatusCode.InternalServerError})await test("exact metadata HTTP "+(int)code+" preserves unknown versus missing",async()=>{var h=new Handler{ExactStatus=code};var captures=new Dictionary<string,byte[]>();using var reader=Reader(h,captures);using var boundary=new FixedDocumentSchemaBoundary(reader,()=>Task.FromResult("synthetic"),new Journal());var row=await boundary.ReadExactTarget(new(TableKind.Document,SchemaAction.ScalarColumn,ColumnKind.Payload),default);Assert(row.State==(code==HttpStatusCode.NotFound?Presence.Missing:Presence.Unknown));if(code==HttpStatusCode.NotFound)Assert(captures.Any(e=>e.Key.StartsWith("request-")&&System.Text.Encoding.UTF8.GetString(e.Value).Contains("404")));});
        await test("membership locator and GUID object mismatch refuses",async()=>{var h=new Handler{DifferentExactComponent=true};using var reader=Reader(h);using var boundary=new FixedDocumentSchemaBoundary(reader,()=>Task.FromResult("synthetic"),new Journal());Assert((await boundary.ReadExactTarget(new(TableKind.Document,SchemaAction.SolutionMembership,Component:FixedComponent.Payload),default)).State==Presence.Unknown);});
        await test("guard exact lookup follows observed GUID and compares full row",async()=>{var h=new Handler();using var reader=Reader(h);using var boundary=new FixedDocumentGuardBoundary(reader,()=>Task.FromResult("synthetic"),new Journal());var exact=await boundary.ReadExactGuard(Binding,default);Assert(exact.State==Presence.ExistingExact&&h.Paths.Count==2&&h.Paths.Last().StartsWith("sdkmessageprocessingsteps("+StepId+")"));});
        await test("guard locator and GUID object mismatch refuses",async()=>{var h=new Handler{DifferentExactGuard=true};using var reader=Reader(h);using var boundary=new FixedDocumentGuardBoundary(reader,()=>Task.FromResult("synthetic"),new Journal());Assert((await boundary.ReadExactGuard(Binding,default)).State==Presence.Unknown);});
        await test("guard exact and enclosing inventory mismatch refuses before write",async()=>{var b=new GuardBoundary{Present=true,ExactMismatch=true};var result=await GuardPhase.Run(Binding,b,_=>Task.FromResult(true),new Journal());Assert(result==AdditiveResult.DriftStop&&b.Writes==0&&b.ExactReads==1&&b.Reads==1);});
        await test("guard unknown exact still reads enclosing inventory",async()=>{var b=new GuardBoundary{ThrowExact=true};var result=await GuardPhase.Run(Binding,b,_=>Task.FromResult(true),new Journal());Assert(result==AdditiveResult.StoppedBeforeAttempt&&b.Writes==0&&b.Reads==1);});
        await test("guard independently absent then exact creation uses one write",async()=>{var b=new GuardBoundary();var result=await GuardPhase.Run(Binding,b,_=>Task.FromResult(true),new Journal());Assert(result==AdditiveResult.CreatedObservedExact&&b.Writes==1&&b.ExactReads==2&&b.Reads==2);});

        foreach(var defect in new[]{"missing-route","duplicate-route","extra-evidence","invalid-table","unknown-inventory","extra-filter","extra-global","unsafe-bulk","missing-proof","wrong-proof-hash","binding-unavailable"})await test("phase route prerequisite refuses "+defect+" before guard write",async()=>{
            var (root,pin)=Review(defect);var b=new GuardBoundary();if(defect=="unknown-inventory")b.Complete=false;if(defect=="extra-filter")b.ExtraFilter=true;if(defect=="extra-global")b.ExtraGlobal=true;
            var result=await GuardPhase.Run(Binding,b,async t=>{await PhaseRoutePrerequisites.Validate(ReleaseMode.RegisterDocumentGuards,pin,root,b,Binding,t);return true;},new Journal());Assert(result==AdditiveResult.StoppedBeforeAttempt&&b.Writes==0);
        });
        await test("complete route review is required again directly before guard write",async()=>{var(root,pin)=Review();var b=new GuardBoundary();var result=await GuardPhase.Run(Binding,b,async t=>{await PhaseRoutePrerequisites.Validate(ReleaseMode.RegisterDocumentGuards,pin,root,b,Binding,t);return true;},new Journal());Assert(result==AdditiveResult.CreatedObservedExact&&b.Writes==1&&b.Reads==3);});
        await test("package phase fails closed for missing or extra native routes",async()=>{var(root,pin)=Review();var b=new GuardBoundary{ExtraGlobal=true};await Reject(()=>PhaseRoutePrerequisites.Validate(ReleaseMode.ActivatePackage,pin,root,b,null,default));await Reject(()=>PhaseRoutePrerequisites.Validate(ReleaseMode.ActivatePackage,null,root,b,null,default));Assert(b.Writes==0);});
        await test("pre-schema phase does not require future route witnesses",async()=>{var b=new GuardBoundary{Complete=false};await PhaseRoutePrerequisites.Validate(ReleaseMode.ProvisionDocumentSchema,null,"/unused",b,null,default);Assert(b.Reads==0&&b.Writes==0);});
        await test("no executable permit catalog is populated by route tests",()=>{Assert(ReviewedRelease.Phases.Length==0&&ReviewedRelease.Bindings.Length==0&&ReviewedRelease.Transitions.Length==0);return Task.CompletedTask;});
        await test("primary-only table empty current checkpoint permits next reviewed column",async()=>{
            var h=new Handler();using var reader=Reader(h);var partial=PrimaryOnly();var b=new Boundary(new(TableKind.Document,SchemaAction.ScalarColumn,ColumnKind.Payload)){PrimaryOnly=true};
            var result=await SchemaPhase.Run(b.Step,b,async t=>{var capture=await CurrentDocumentStore.Read(TableKind.Document,partial,reader,false,t);return capture.Progress==DocumentSchemaProgress.Partial&&capture.Rows.Length==0;},new Journal());
            Assert(result==AdditiveResult.CreatedObservedExact&&b.Writes==1&&h.Paths.Single()==ReleaseQueries.AllRows(TableKind.Document)&&!h.Paths.Single().Contains("workspace"));
        });
        foreach(var defect in new[]{"nonempty","unknown","wrong-primary","secured","extra-custom","unreviewed-custom","partial-for-final"})await test("partial current store refuses "+defect,async()=>{
            var h=new Handler{NonemptyPartial=defect=="nonempty"};using var reader=Reader(h);var partial=PrimaryOnly();
            if(defect=="unknown")partial=partial with{Complete=false};if(defect=="wrong-primary")partial.Attributes[0]["MaxLength"]=99;if(defect=="secured")partial.Attributes[0]["IsSecured"]=true;
            if(defect is "extra-custom" or "unreviewed-custom"){var extra=Attribute(ColumnKind.Actor);extra["LogicalName"]=defect=="extra-custom"?"zk_unknown":"other_custom";partial=partial with{Attributes=[partial.Attributes[0],extra]};}
            await Reject(async()=>{_=await CurrentDocumentStore.Read(TableKind.Document,partial,reader,defect=="partial-for-final",default);});
            Assert(defect=="nonempty"?h.Paths.Single()==ReleaseQueries.AllRows(TableKind.Document):h.Paths.Count==0);
        });
    }
    static string AttrId(ColumnKind c)=>"66666666-6666-4666-8666-"+((int)c+1).ToString("D12");
    static string ComponentId(ColumnKind c)=>"77777777-7777-4777-8777-"+((int)c+1).ToString("D12");
    static JsonObject Attribute(ColumnKind c){var a=DocumentSchema.Column(c);a["LogicalName"]=DocumentSchema.Field(c);a["MetadataId"]=AttrId(c);a["IsValidForCreate"]=true;a["IsValidForRead"]=true;a["IsValidForUpdate"]=true;a["IsSecured"]=false;a["IsCustomAttribute"]=true;if(c==ColumnKind.Workspace)a["Targets"]=new JsonArray("zk_kitchenworkspace");return a;}
    static CanonicalSchema PrimaryOnly()=>Schema() with{Attributes=[Attribute(ColumnKind.Event)],ManyToOne=[],Components=[]};
    static CanonicalSchema Schema(){var e=DocumentSchema.Table(TableKind.Document);e.Remove("Attributes");e["LogicalName"]="zk_kitchendocument";e["PrimaryIdAttribute"]="zk_kitchendocumentid";e["PrimaryNameAttribute"]="zk_eventid";e["IsManaged"]=false;e["MetadataId"]=EntityId;var attrs=Enum.GetValues<ColumnKind>().Select(Attribute).ToArray();var relation=DocumentSchema.Relationship(TableKind.Document);relation.Remove("Lookup");relation["MetadataId"]="88888888-8888-4888-8888-888888888888";var components=Enum.GetValues<ColumnKind>().Select(c=>new JsonObject{["solutioncomponentid"]=ComponentId(c),["objectid"]=AttrId(c),["componenttype"]=2,["_solutionid_value"]=Target.Solution}).ToArray();return new(true,[e],attrs,[],[relation],[],components);}
    sealed class Journal:IAttemptJournal{public bool AttemptPersisted{get;private set;}public void Begin(string s){Assert(!AttemptPersisted);AttemptPersisted=true;}public void Observe(string s){}}
    sealed class Boundary(SchemaStep step):IDocumentSchemaBoundary {
        public readonly SchemaStep Step=step;public int CollectionReads,ExactReads,Writes;public bool Present,ParentMissing,OmitCollection,ThrowExact,UnknownCollection,PrimaryOnly,Eligible=true;public Action<JsonObject>? MutateExact;
        CanonicalSchema Snapshot(bool present){var s=PrimaryOnly?PhaseTests.PrimaryOnly():Schema();if(PrimaryOnly&&present)s=s with{Attributes=[..s.Attributes,Attribute(Step.Column)]};if(ParentMissing||Step.Action==SchemaAction.Table&&!present)return new(true,[],[],[],[],[],[]);return Step.Action switch{SchemaAction.ScalarColumn when !present=>s with{Attributes=s.Attributes.Where(a=>(string?)a["LogicalName"]!=DocumentSchema.Field(Step.Column)).ToArray()},SchemaAction.Relationship when !present=>s with{ManyToOne=[],Attributes=s.Attributes.Where(a=>(string?)a["LogicalName"]!="zk_workspace").ToArray()},SchemaAction.SolutionMembership when !present=>s with{Components=[]},_=>s};}
        public Task<TargetObservation> ReadExactTarget(SchemaStep s,CancellationToken c){ExactReads++;if(ThrowExact)throw new IOException();var value=SchemaPhase.FromCollection(s,Snapshot(Present));if(value.Row!=null)MutateExact?.Invoke(value.Row);return Task.FromResult(value);}
        public Task<CanonicalSchema> ReadCanonicalSchema(TableKind t,CancellationToken c){CollectionReads++;var value=Snapshot(Present&&!OmitCollection);return Task.FromResult(UnknownCollection?value with{Complete=false}:value);}
        public Task<RelationshipEligibility> CheckFixedRelationshipEligibility(TableKind t,CancellationToken c)=>Task.FromResult(new RelationshipEligibility(Eligible,Eligible,Eligible,Eligible,Eligible,Eligible));
        Task Write(){Writes++;Present=true;return Task.CompletedTask;}
        public Task CreateFixedTableOnce(TableKind t,CancellationToken c)=>Write();
        public Task CreateFixedColumnOnce(TableKind t,ColumnKind k,CancellationToken c)=>Write();
        public Task CreateFixedRelationshipOnce(TableKind t,CancellationToken c)=>Write();
        public Task AddFixedSolutionMembershipOnce(TableKind t,FixedComponent f,CancellationToken c)=>Write();
    }
    static JsonObject Filter()=>new(){["sdkmessagefilterid"]=FilterId,["primaryobjecttypecode"]="zk_kitchendocument",["isvisible"]=true,["iscustomprocessingstepallowed"]=true,["sdkmessageid"]=new JsonObject{["sdkmessageid"]=MessageId,["name"]="Create",["isprivate"]=false}};
    static JsonObject Guard()=>new(){["sdkmessageprocessingstepid"]=StepId,["stage"]=20,["mode"]=0,["rank"]=1,["statecode"]=0,["supporteddeployment"]=0,["filteringattributes"]=null,["configuration"]=null,["_impersonatinguserid_value"]=null,["_sdkmessageid_value"]=MessageId,["_sdkmessagefilterid_value"]=FilterId,["_eventhandler_value"]=TypeId,["sdkmessageid"]=new JsonObject{["name"]="Create"}};
    sealed class GuardBoundary:IDocumentGuardBoundary {
        public bool Present,ExactMismatch,ThrowExact,ExtraFilter,ExtraGlobal,Complete=true;public int Reads,ExactReads,Writes;
        public Task<TargetObservation> ReadExactGuard(ReviewedBinding b,CancellationToken t){ExactReads++;if(ThrowExact)throw new IOException();var row=Guard();if(ExactMismatch)row["sdkmessageprocessingstepid"]=EntityId;return Task.FromResult(Present?new TargetObservation(Presence.ExistingExact,row):new(Presence.Missing));}
        public Task<RouteInventory> ReadCanonicalInventory(CancellationToken t){Reads++;return Task.FromResult(new RouteInventory(Complete,ExtraFilter?[Filter(),new JsonObject{["primaryobjecttypecode"]="zk_kitchendraft",["sdkmessageid"]=new JsonObject{["name"]="UnreviewedMutation"}}]:[Filter()],Present?[Guard()]:[],ExtraGlobal?[new JsonObject{["sdkmessageid"]=new JsonObject{["name"]="UnreviewedGlobal"}}]:[]));}
        public Task CreateFixedGuardOnce(ReviewedBinding b,CancellationToken t){Writes++;Present=true;return Task.CompletedTask;}
    }
    static (string Root,EvidenceFile Pin) Review(string defect="") {
        var root=Path.Combine("/private/tmp","kitchen-route-test-"+Guid.NewGuid());Directory.CreateDirectory(root);
        EvidenceFile Save(string name,byte[] bytes){File.WriteAllBytes(Path.Combine(root,name),bytes);return new(name,bytes.Length,Check.Hash(bytes));}
        var a=Save("authoritative.json","{}"u8.ToArray());var n=Save("witness.json","[]"u8.ToArray());
        var evidence=Enum.GetValues<TableKind>().SelectMany(t=>DocumentGuards.RequiredMessages.Concat(DocumentGuards.DiscoveryMessages).Select(m=>new PinnedRouteEvidence(new(t,m,m is "Upsert" or "CreateMultiple" or "UpdateMultiple" or "UpsertMultiple"?RouteDisposition.Traversal:DocumentGuards.IndividualMessage(m)?RouteDisposition.RegisterDenialOrOwnCud:RouteDisposition.Unavailable,a.Sha256,n.Sha256),a,n))).ToList();
        if(defect=="missing-route")evidence.RemoveAt(0);if(defect=="duplicate-route")evidence.Add(evidence[0]);if(defect=="extra-evidence")evidence.Add(evidence[0] with{Route=evidence[0].Route with{Message="Unobserved"}});if(defect=="invalid-table")evidence[0]=evidence[0] with{Route=evidence[0].Route with{Table=(TableKind)99}};
        if(defect=="unsafe-bulk"){var i=evidence.FindIndex(e=>e.Route.Message=="CreateMultiple");evidence[i]=evidence[i] with{Route=evidence[i].Route with{Disposition=RouteDisposition.RegisterDenialOrOwnCud}};}
        if(defect=="binding-unavailable")evidence[0]=evidence[0] with{Route=evidence[0].Route with{Disposition=RouteDisposition.Unavailable}};
        if(defect=="wrong-proof-hash")evidence[0]=evidence[0] with{Route=evidence[0].Route with{NativeWitnessHash=new string('f',64)}};
        var pin=Save("review.json",JsonSerializer.SerializeToUtf8Bytes(new RouteReview("kitchen-document-route-review-v1",Target.Organization,Target.Solution,evidence.ToArray())));
        if(defect=="missing-proof")File.Delete(Path.Combine(root,n.RelativePath));return(root,pin);
    }
    static Reader Reader(Handler handler,Dictionary<string,byte[]>? captures=null){var reader=new Reader(()=>Task.FromResult("synthetic"),(name,bytes)=>{if(captures!=null)captures.Add(name,bytes);},handler);reader.Verified(EntityId);return reader;}
    sealed class Handler:HttpMessageHandler {
        public readonly List<string> Paths=[],Methods=[];public HttpStatusCode ExactStatus=HttpStatusCode.OK;public bool DifferentExactComponent,DifferentExactGuard,NonemptyPartial;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken cancellation) {
            var path=Uri.UnescapeDataString(request.RequestUri!.AbsoluteUri[Target.Api.Length..]);Paths.Add(path);Methods.Add(request.Method.Method);var s=Schema();JsonNode response;var status=HttpStatusCode.OK;
            JsonObject Rows(IEnumerable<JsonObject> rows){var all=rows.Select(r=>(JsonNode)r.DeepClone()).ToArray();return new(){["value"]=new JsonArray(all),["@odata.count"]=all.Length};}
            if(path==ReleaseQueries.AllRows(TableKind.Document))response=Rows(NonemptyPartial?[new JsonObject{["zk_kitchendocumentid"]=EntityId,["unknown_payload"]="unreviewed"}]:[]);
            else if(path.StartsWith("solutioncomponents(")){response=s.Components.Single(c=>(string?)c["solutioncomponentid"]==ComponentId(ColumnKind.Payload));if(DifferentExactComponent)response["objectid"]=EntityId;}
            else if(path.StartsWith("solutioncomponents?"))response=Rows(path.Contains("objectid eq")?s.Components.Where(c=>(string?)c["objectid"]==AttrId(ColumnKind.Payload)):s.Components);
            else if(path.StartsWith("sdkmessageprocessingsteps(")){response=Guard();if(DifferentExactGuard)response["configuration"]="changed";}
            else if(path.StartsWith("sdkmessageprocessingsteps?"))response=Rows([Guard()]);
            else if(path.StartsWith("EntityDefinitions?"))response=Rows(s.Entities);
            else if(path.Contains("/Attributes(LogicalName=")){var c=Enum.GetValues<ColumnKind>().Single(c=>path.Contains("'"+DocumentSchema.Field(c)+"'"));response=Attribute(c);status=ExactStatus;}
            else if(path.StartsWith("RelationshipDefinitions("))response=s.ManyToOne[0];
            else if(path.EndsWith("/Keys"))response=Rows([]);
            else if(path.EndsWith("/ManyToOneRelationships"))response=Rows(s.ManyToOne);
            else if(path.EndsWith("/OneToManyRelationships"))response=Rows([]);
            else if(path.Contains("/Attributes/Microsoft.Dynamics.CRM.")){var type=path[(path.LastIndexOf('/')+1)..];response=Rows(s.Attributes.Where(a=>(string?)a["@odata.type"]==type));}
            else if(path.EndsWith("/Attributes"))response=Rows(s.Attributes);
            else if(path==Queries.Table("zk_kitchendocument"))response=s.Entities[0];
            else throw new Exception("unexpected fixed test request");
            return Task.FromResult(new HttpResponseMessage(status){Content=new StringContent(status==HttpStatusCode.OK?response.ToJsonString():"{\"error\":{\"code\":\"synthetic\",\"message\":\"fixture\"}}")});
        }
    }
}
