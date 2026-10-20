using System.Text.Json.Nodes;
using Kitchen.Inventory;
using Kitchen.Release;
using Microsoft.Identity.Client;
using PackageActivationPreparation;
var passed=0;var failed=0;
void Test(string n,Action f){try{f();passed++;Console.WriteLine("PASS "+n);}catch(Exception e){failed++;Console.WriteLine("FAIL "+n+": "+e.GetType().Name);}}
async Task Async(string n,Func<Task> f){try{await f();passed++;Console.WriteLine("PASS "+n);}catch(Exception e){failed++;Console.WriteLine("FAIL "+n+": "+e.GetType().Name);}}
void Assert(bool x){if(!x)throw new Exception("assertion");}
void Reject(Action f){try{f();}catch(Stop){return;}throw new Exception("expected refusal");}
if(args.SequenceEqual(new[]{"--current-policy-only"})) {
    CurrentPolicyTests.Run(Test);Console.WriteLine($"CURRENT_POLICY: {passed} passed, {failed} failed; synthetic only.");return failed==0?0:1;
}
if(args.SequenceEqual(new[]{"--auth-diagnostics-only"})){
    const string secret="https://login.microsoftonline.com/callback?code=SENSITIVE_TOKEN&state=SENSITIVE_USER";
    var observation=new AuthObservation();
    Test("auth boundary labels describe progress without claiming callback completion",()=>{
        Assert(observation.Boundary==AuthBoundary.NotEntered);
        foreach(var stage in new[]{AuthBoundary.Construction,AuthBoundary.Interactive,AuthBoundary.AuthorizationHandoff,AuthBoundary.AwaitingCallbackOrToken,AuthBoundary.Claims,AuthBoundary.NativePreparation,AuthBoundary.Native}){
            observation.Mark(stage);Assert(observation.Describe(new Exception(secret)).Stage==stage.ToString());
        }
    });
    Test("malicious message and arbitrary MSAL code stay out of console diagnostic",()=>{
        observation.Mark(AuthBoundary.AwaitingCallbackOrToken);
        var bad=new MsalClientException(secret,secret);
        var line=observation.Describe(bad).SafeJson();
        Assert(line.Contains("MsalClientException")&&line.Contains("Unrecognized")&&!line.Contains(secret)&&!line.Contains("SENSITIVE_"));
        Assert(!observation.Describe(new Exception(secret,new Exception(secret))).SafeJson().Contains(secret));
    });
    Test("only pinned MSAL code label survives",()=>{
        var line=observation.Describe(new MsalClientException(MsalError.LoopbackResponseUriMismatch,secret)).SafeJson();
        Assert(line.Contains("LoopbackResponseUriMismatch")&&!line.Contains(secret));
    });
    Test("private failure status stores sanitized facts only and remains incomplete",()=>{
        var backup=new Backup(Path.Combine("/private/tmp","kitchen-auth-diagnostic-test-"+Guid.NewGuid().ToString("N")));
        backup.RecordFailure(FailureStage.Authentication,FailureReason.OperationFailed,observation.Describe(new MsalClientException(secret,secret)));
        var saved=File.ReadAllText(Path.Combine(backup.DirectoryPath,"failure-status.json"));
        Assert(saved.Contains("Unrecognized")&&saved.Contains("AwaitingCallbackOrToken")&&!saved.Contains(secret)&&!saved.Contains("SENSITIVE_")&&!Backup.IsComplete(backup.DirectoryPath));
    });
    Console.WriteLine($"AUTH_DIAGNOSTICS: {passed} passed, {failed} failed; synthetic only.");return failed==0?0:1;
}
if(args.SequenceEqual(new[]{"--inventory-query-only"})){
    // Catches absent-table name resolution in the server filter, lost global/new-table
    // handlers on subsequent pages, and any relaxation of the fixed read boundary.
    foreach(var absent in new[]{true,false})await Async("SDK metadata inventory retains every page with target tables "+(absent?"absent":"present"),async()=>{
        using var reader=new Reader(()=>Task.FromResult("synthetic"),(_,_)=>{},new StepInventoryHandler(absentTargets:absent));
        reader.ReleaseQueries(ReleaseQueries.All);
        var rows=await reader.Rows(ReleaseQueries.Steps,"sdkmessageprocessingstepid",10000);
        Assert(rows.Select(r=>Check.Id(r,"sdkmessageprocessingstepid")).SequenceEqual(absent?new[]{StepInventoryHandler.Id(3),StepInventoryHandler.Id(4)}:new[]{StepInventoryHandler.Id(1),StepInventoryHandler.Id(2),StepInventoryHandler.Id(3),StepInventoryHandler.Id(4)}));
        if(!absent){Assert((string?)rows[0]["sdkmessagefilterid"]?["primaryobjecttypecode"]=="zk_kitchendocument");Assert((string?)rows[1]["sdkmessagefilterid"]?["primaryobjecttypecode"]=="zk_kitchendraft");}
        var global=rows.Single(r=>Check.Id(r,"sdkmessageprocessingstepid")==StepInventoryHandler.Id(3));
        Assert(global["_sdkmessagefilterid_value"]==null&&(string?)global["sdkmessageid"]?["name"]=="GlobalMutation");
        Assert((string?)rows.Last()["sdkmessagefilterid"]?["primaryobjecttypecode"]=="unrelated_table");
        Assert(rows.All(r=>(string?)r["eventhandler_plugintype"]?["typename"]=="Synthetic.Handler"));
    });
    foreach(var defect in new[]{"missing-count","changed-count","truncated","duplicate","changed-query","foreign-origin","overflow"}){
        var d=defect;await Async("SDK metadata inventory refuses "+d,async()=>{
            using var reader=new Reader(()=>Task.FromResult("synthetic"),(_,_)=>{},new StepInventoryHandler(d));
            reader.ReleaseQueries(ReleaseQueries.All);
            try{await reader.Rows(ReleaseQueries.Steps,"sdkmessageprocessingstepid",d=="overflow"?3:10000);}catch(Stop){return;}
            throw new Exception("incomplete metadata accepted");
        });
    }
    await Async("SDK metadata correction does not authorize arbitrary metadata queries",async()=>{
        var tokens=0;using var reader=new Reader(()=>{tokens++;return Task.FromResult("synthetic");},(_,_)=>{},new StepInventoryHandler());
        reader.ReleaseQueries(ReleaseQueries.All);
        try{await reader.Rows("sdkmessageprocessingsteps?$filter=name eq 'arbitrary'","sdkmessageprocessingstepid");}catch(Stop){Assert(tokens==0);return;}
        throw new Exception("arbitrary path accepted");
    });
    Console.WriteLine($"INVENTORY_QUERY: {passed} passed, {failed} failed; synthetic HTTP only.");return failed==0?0:1;
}
if(args.SequenceEqual(new[]{"--guard-only"})){GuardMappingTests.Run(Test);Console.WriteLine($"GUARD: {passed} passed, {failed} failed");return failed==0?0:1;}
if(args.SequenceEqual(new[]{"--round1-only"})){await Round1Tests.Run(Async);await ActivationIntegrationTests.RunPrerequisites(Async);Console.WriteLine($"ROUND1: {passed} passed, {failed} failed");return failed==0?0:1;}
if(args.SequenceEqual(new[]{"--phases-only"})){await PhaseTests.Run(Async);Console.WriteLine($"PHASES: {passed} passed, {failed} failed");return failed==0?0:1;}
var hash=Check.Hash(new byte[]{1});
Test("closed modes default offline and unknown/combined arguments",()=>{Assert(ModeParser.Parse([])==ReleaseMode.Plan);foreach(var args in new[]{new[]{"deploy"},new[]{"inspect","backup"},new[]{"--url=x"}})Reject(()=>ModeParser.Parse(args));});
Test("no unreviewed live transition/binding/phase catalog",()=>{Assert(ReviewedRelease.Transitions.Length==0&&ReviewedRelease.Bindings.Length==0);foreach(var m in Enum.GetValues<ReleaseMode>())Assert(!ReviewedRelease.CanExecute(m));});
Test("exact two table schema factories",()=>{foreach(var t in Enum.GetValues<TableKind>()){var table=DocumentSchema.Table(t);Assert((string?)table["TableType"]=="Standard"&&(string?)table["OwnershipType"]=="UserOwned"&&table["Attributes"]!.AsArray().Count==1);Assert(!table.ToJsonString().Contains("SystemRequired"));var rel=DocumentSchema.Relationship(t);Assert((string?)rel["CascadeConfiguration"]?["Delete"]=="Restrict"&&(string?)rel["CascadeConfiguration"]?["Share"]=="Cascade");}});
Test("five exact required metadata fields and subtype limits",()=>{foreach(var c in Enum.GetValues<ColumnKind>()){var a=DocumentSchema.Column(c);Assert((string?)a["RequiredLevel"]?["Value"]=="ApplicationRequired"&&(bool?)a["RequiredLevel"]?["CanBeChanged"]==true);Assert((string?)a["SchemaName"]==DocumentSchema.Field(c));}Assert((int?)DocumentSchema.Column(ColumnKind.Payload)["MaxLength"]==131072);Assert((string?)DocumentSchema.Column(ColumnKind.RecordedAt)["DateTimeBehavior"]?["Value"]=="UserLocal");});
Test("schema unknown never becomes missing",()=>{var s=new CanonicalSchema(false,[],[],[],[],[],[]);Assert(DocumentSchema.Compare(TableKind.Document,s)==Presence.Unknown);Assert(DocumentSchema.Compare(TableKind.Document,s with{Complete=true})==Presence.Missing);});
Test("schema collision rejected before missing interpretation",()=>{var e=new JsonObject{["LogicalName"]="other",["SchemaName"]="zk_KitchenDocument"};Assert(DocumentSchema.Compare(TableKind.Document,new(true,[e],[],[],[],[],[]))==Presence.DriftOrDuplicate);});
Test("relationship eligibility requires both directions and complete parents",()=>{Assert(!new RelationshipEligibility(true,true,true,false,true,true).CompleteEligible);Assert(!new RelationshipEligibility(true,true,true,true,false,true).CompleteEligible);});
Test("unknown store and security trimmed zero rows are incomplete",()=>{Reject(()=>CompleteInventory.ValidateStore(new(StoreState.Unknown,[],hash,true),false));Reject(()=>CompleteInventory.ValidateStore(new(StoreState.Installed,[],hash,false),true));Reject(()=>CompleteInventory.ValidateStore(new(StoreState.NotInstalledByNativeEvidence,[],hash,true),true));});
Test("unknown native row fields rejected",()=>Reject(()=>Metadata.ValidateFields(new JsonObject{["unreviewed"]=1},new HashSet<string>{"known"})));
Test("installed empty collection has distinct schema bound hash",()=>{Assert(CompleteInventory.Collection("documents",[],"id")!=CompleteInventory.Collection("drafts",[],"id"));});
Test("duplicate and overflow collection rejected",()=>{var a=new JsonObject{["id"]="11111111-1111-4111-8111-111111111111"};Reject(()=>CompleteInventory.Collection("x",[a,a],"id"));Reject(()=>CompleteInventory.Collection("x",Enumerable.Repeat(a,4001).ToArray(),"id"));});
Test("paging external origin and changed filters rejected",()=>{var first=new Uri(Target.Api+"x?$count=true");Reject(()=>Reader.ValidateNext(first,"https://evil.invalid/x?$count=true&$skiptoken=a"));Reject(()=>Reader.ValidateNext(first,Target.Api+"x?$count=false&$skiptoken=a"));});
Test("checkpoint drift refuses",()=>Reject(()=>CompleteInventory.SameCheckpoint(hash,new string('b',64))));
Test("missing original and invented cloud provenance refuse",()=>{Reject(()=>CompleteInventory.ValidateOriginals(".",new[]{hash},[]));});
Test("route matrix unknown discovered intrinsic cannot disappear",()=>{var evidence=Enum.GetValues<TableKind>().SelectMany(t=>DocumentGuards.RequiredMessages.Concat(DocumentGuards.DiscoveryMessages).Select(m=>new RouteEvidence(t,m,m=="DeleteMultiple"?RouteDisposition.Unavailable:m is "Upsert" or "CreateMultiple" or "UpdateMultiple" or "UpsertMultiple"?RouteDisposition.Traversal:DocumentGuards.IndividualMessage(m)?RouteDisposition.RegisterDenialOrOwnCud:RouteDisposition.Unavailable,hash,hash))).ToArray();DocumentGuards.Validate(new(true,[],[],[]),evidence);var extra=new JsonObject{["sdkmessageid"]=new JsonObject{["name"]="UnknownMutation"}};Reject(()=>DocumentGuards.Validate(new(true,[],[],[extra]),evidence));});
Test("bulk individual Target binding forbidden",()=>Assert(!DocumentGuards.IndividualMessage("CreateMultiple")&&!DocumentGuards.IndividualMessage("UpsertMultiple")));
Test("durable attempt crash restart prevents retry",()=>{var dir=Path.Combine("/private/tmp","kitchen-release-test-"+Guid.NewGuid());var j=new DurableAttemptJournal(dir,"package");j.Begin("fixed");try{new DurableAttemptJournal(dir,"package").Begin("fixed");throw new Exception();}catch(IOException){}j.Observe("PriorObservedAfterAttempt");try{new DurableAttemptJournal(dir,"package").Begin("fixed");throw new Exception();}catch(IOException){}});
await Async("independent collection read after object readback fails",async()=>{var calls=0;var r=await AdditiveAttempt.ReadBoth(_=>throw new IOException(),_=>{calls++;return Task.FromResult(Presence.ExistingExact);},CancellationToken.None);Assert(calls==1&&r.Object==Presence.Unknown&&r.EnclosingCollection==Presence.ExistingExact);});
foreach(var outcome in new[]{"observed","missing","unknown","drift","throw"})await Async("additive uncertain outcome "+outcome,async()=>{var calls=0;var reads=0;var journal=new FakeJournal();var result=await AdditiveAttempt.Run(_=>{reads++;return Task.FromResult(reads==1?new ObjectReadback(Presence.Missing,Presence.Missing):outcome switch{"observed"=>new(Presence.ExistingExact,Presence.ExistingExact),"missing"=>new(Presence.Missing,Presence.Missing),"drift"=>new(Presence.DriftOrDuplicate,Presence.ExistingExact),_=>new(Presence.ExistingExact,Presence.Unknown)});},_=>{calls++;Assert(journal.Begun);if(outcome=="throw")throw new IOException();return Task.CompletedTask;},_=>Task.FromResult(true),journal);Assert(calls==1&&reads==2&&result==(outcome switch{"observed"=>AdditiveResult.CreatedObservedExact,"missing"=>AdditiveResult.PriorAbsentAfterAttempt,"drift"=>AdditiveResult.DriftStop,_=>AdditiveResult.AmbiguousStop}));});
await Async("journal persistence failure yields zero additive writes",async()=>{var writes=0;var result=await AdditiveAttempt.Run(_=>Task.FromResult(new ObjectReadback(Presence.Missing,Presence.Missing)),_=>{writes++;return Task.CompletedTask;},_=>Task.FromResult(true),new FakeJournal{Fail=true});Assert(writes==0&&result==AdditiveResult.StoppedBeforeAttempt);});

CanonicalSchema ExactSchema() {
    var t=TableKind.Document;var entity=DocumentSchema.Table(t);entity.Remove("Attributes");entity["LogicalName"]=DocumentSchema.Logical(t);entity["PrimaryIdAttribute"]=DocumentSchema.Logical(t)+"id";entity["PrimaryNameAttribute"]="zk_eventid";entity["MetadataId"]=Guid.NewGuid().ToString();entity["IsManaged"]=false;
    var attrs=Enum.GetValues<ColumnKind>().Select(c=>{var a=DocumentSchema.Column(c);a["LogicalName"]=DocumentSchema.Field(c);a["MetadataId"]=Guid.NewGuid().ToString();a["IsValidForCreate"]=true;a["IsValidForRead"]=true;a["IsValidForUpdate"]=true;a["IsSecured"]=false;if(c==ColumnKind.Workspace)a["Targets"]=new JsonArray("zk_kitchenworkspace");return a;}).ToArray();
    var relation=DocumentSchema.Relationship(t);relation.Remove("Lookup");relation["MetadataId"]=Guid.NewGuid().ToString();
    JsonObject Component(JsonObject obj,int type)=>new(){["objectid"]=obj["MetadataId"]!.DeepClone(),["componenttype"]=type,["_solutionid_value"]=Target.Solution};
    return new(true,[entity],attrs,[],[relation],[],new[]{Component(entity,1)}.Concat(attrs.Select(a=>Component(a,2))).Append(Component(relation,10)).ToArray());
}
Test("OData type prefix canonicalization preserves original response",()=>{var a=DocumentSchema.Column(ColumnKind.Actor);a["@odata.type"]="#Microsoft.Dynamics.CRM.StringAttributeMetadata";DocumentSchema.MatchMetadata(a,DocumentSchema.Column(ColumnKind.Actor));Assert(((string?)a["@odata.type"])!.StartsWith("#"));});
Test("full exact canonical schema accepted",()=>Assert(DocumentSchema.Compare(TableKind.Document,ExactSchema())==Presence.ExistingExact));
foreach(var defect in new[]{"required","type","length","lookup","cascade","duplicate-relation","duplicate-table","membership","concurrency","keys"}) {
    var d=defect;Test("canonical metadata rejects "+d,()=>{var s=ExactSchema();switch(d){case "required":s.Attributes[0]["RequiredLevel"]!["Value"]="None";break;case "type":s.Attributes[1]["@odata.type"]="Microsoft.Dynamics.CRM.StringAttributeMetadata";break;case "length":s.Attributes[1]["MaxLength"]=1024;break;case "lookup":s.Attributes[4]["Targets"]=new JsonArray("wrong");break;case "cascade":s.ManyToOne[0]["CascadeConfiguration"]!["Delete"]="Cascade";break;case "duplicate-relation":s=s with{ManyToOne=[s.ManyToOne[0],(JsonObject)s.ManyToOne[0].DeepClone()]};break;case "duplicate-table":s=s with{Entities=[s.Entities[0],(JsonObject)s.Entities[0].DeepClone()]};break;case "membership":s=s with{Components=[]};break;case "concurrency":s.Entities[0]["IsOptimisticConcurrencyEnabled"]=false;break;case "keys":s=s with{Keys=[new JsonObject()]};break;}Assert(DocumentSchema.Compare(TableKind.Document,s)==Presence.DriftOrDuplicate);});
}
Test("original bytes bound to source hash and honest local provenance",()=>{var root="/private/tmp/kitchen-original-test-"+Guid.NewGuid();Directory.CreateDirectory(root);File.WriteAllBytes(Path.Combine(root,"original"),new byte[]{1});var original=new OriginalVersion("retained-local-import",hash,hash,1,null,null,null,null,null,new("original",1,hash));_=CompleteInventory.ValidateOriginals(root,new[]{hash},new[]{original});Reject(()=>CompleteInventory.ValidateOriginals(root,new[]{hash},new[]{original with{Version="invented-cloud"}}));File.WriteAllBytes(Path.Combine(root,"original"),new byte[]{2});Reject(()=>CompleteInventory.ValidateOriginals(root,new[]{hash},new[]{original}));});

GuardMappingTests.Run(Test);
await ActivationIntegrationTests.Run(Async);
await PhaseTests.Run(Async);
Console.WriteLine($"FOUNDATION: {passed} passed, {failed} failed; unique new cases.");
var accepted=await OfflineTests.Run();
return failed==0&&accepted==0?0:1;
sealed class FakeJournal:IAttemptJournal{public bool Begun,Fail;public bool AttemptPersisted=>Begun;public void Begin(string s){if(Fail)throw new IOException();Begun=true;}public void Observe(string s){}}

// Synthetic provider boundary: the observed 400 is triggered before OR can select
// globals whenever a missing logical name is used in primaryobjecttypecode.
sealed class StepInventoryHandler(string defect="",bool absentTargets=false):HttpMessageHandler {
    const string Root="sdkmessageprocessingsteps?$expand=sdkmessageid,sdkmessagefilterid,eventhandler_plugintype&$count=true";
    public static string Id(int n)=>$"00000000-0000-4000-8000-{n:D12}";
    static JsonObject Row(int n,string? table,string message)=>new(){
        ["sdkmessageprocessingstepid"]=Id(n),["_sdkmessagefilterid_value"]=table==null?null:Id(n+10),
        ["sdkmessagefilterid"]=table==null?null:new JsonObject{["sdkmessagefilterid"]=Id(n+10),["primaryobjecttypecode"]=table},
        ["sdkmessageid"]=new JsonObject{["sdkmessageid"]=Id(n+20),["name"]=message},
        ["eventhandler_plugintype"]=new JsonObject{["plugintypeid"]=Id(n+30),["typename"]="Synthetic.Handler"}
    };
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken cancellation){
        var path=Uri.UnescapeDataString(request.RequestUri!.AbsoluteUri[Target.Api.Length..]);
        if(path!=Root&&path!=Root+"&$skiptoken=page2")return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.BadRequest){Content=new StringContent("{\"error\":{\"code\":\"0x80041102\",\"message\":\"Synthetic missing logical entity in MetadataCache\"}}")});
        var second=path.EndsWith("&$skiptoken=page2",StringComparison.Ordinal);
        var rows=second?new JsonArray(Row(2,"zk_kitchendraft","Update"),Row(defect=="duplicate"?1:3,null,"GlobalMutation")):new JsonArray(Row(4,"unrelated_table","OtherMutation"),Row(1,"zk_kitchendocument","Create"));
        if(absentTargets)rows=second?new JsonArray(Row(3,null,"GlobalMutation")):new JsonArray(Row(4,"unrelated_table","OtherMutation"));
        var result=new JsonObject{["value"]=rows};
        if(defect!="missing-count")result["@odata.count"]=second&&defect=="changed-count"?5:absentTargets?2:4;
        if(!second&&defect!="truncated")result["@odata.nextLink"]=defect switch{
            "changed-query"=>Target.Api+Root.Replace("$count=true","$count=false")+"&$skiptoken=page2",
            "foreign-origin"=>"https://foreign.invalid/api/data/v9.2/"+Root+"&$skiptoken=page2",
            _=>Target.Api+Root+"&$skiptoken=page2"};
        return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK){Content=new StringContent(result.ToJsonString())});
    }
}
