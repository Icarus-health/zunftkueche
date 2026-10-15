using System.Text.Json.Nodes;
using Kitchen.Deploy;
int passed=0, failed=0;
async Task Test(string name, Func<Task> run) { try { await run(); Console.WriteLine("PASS "+name); passed++; } catch(Exception e) { Console.WriteLine("FAIL "+name+": "+e.GetType().Name); failed++; } }
void Assert(bool yes) { if(!yes) throw new Exception("Assertion failed"); }
async Task Reject(Func<Task> run) { try { await run(); } catch(DeploymentException) { return; } throw new Exception("Accepted unsafe input"); }
JsonObject Parse(string value)=>(JsonObject)JsonNode.Parse(value)!;
await Test("wrong host rejected before transport",()=>Reject(()=>{Target.ValidateUrl("https://evil.example"); return Task.CompletedTask;}));
await Test("URL credentials and extra path rejected",async()=>{foreach(var url in new[]{Target.Url+"/evil",Target.Url+"?x=1","https://user@org1d76e28a.crm17.dynamics.com"}) await Reject(()=>{Target.ValidateUrl(url);return Task.CompletedTask;});});
await Test("wrong tenant and identity rejected",async()=>{await Reject(()=>{Target.ValidateAccount("wrong",Target.User);return Task.CompletedTask;});await Reject(()=>{Target.ValidateAccount(Target.Tenant,"other@example.com");return Task.CompletedTask;});Target.ValidateAccount(Target.Tenant,Target.User.ToUpperInvariant());});
await Test("wrong organization blocks all writes",async()=>{var f=new Fake((m,p,b)=>Task.FromResult<JsonNode?>(Parse("{\"OrganizationId\":\"00000000-0000-0000-0000-000000000001\",\"UserId\":\"00000000-0000-0000-0000-000000000002\"}")));await Reject(()=>new ResourceEngine(f).AuthenticateTargetAsync());Assert(f.Writes==0);});
await Test("writes without target check rejected",async()=>{var f=new Fake((m,p,b)=>Task.FromResult<JsonNode?>(Parse("{\"value\":[]}")));await Reject(()=>new ResourceEngine(f).EnsureAsync("publisher","publishers","publishers",new(),new(),true));Assert(f.Writes==0);});
await Test("canonical existing resource reused without write",async()=>{var f=Fixture(Parse("{\"value\":[{\"name\":\"expected\"}]}"));var e=new ResourceEngine(f);await e.AuthenticateTargetAsync();var row=await e.EnsureAsync("publisher","publishers","publishers",new(),Parse("{\"name\":\"expected\"}"),true);Assert(row?["name"]?.GetValue<string>()=="expected"&&f.Writes==0);});
await Test("drift and duplicate identities rejected without mutation",async()=>{foreach(var data in new[]{"{\"value\":[{\"name\":\"drift\"}]}","{\"value\":[{},{}]}"}) {var f=Fixture(Parse(data));var e=new ResourceEngine(f);await e.AuthenticateTargetAsync();await Reject(()=>e.EnsureAsync("publisher","publishers","publishers",new(),Parse("{\"name\":\"expected\"}"),true));Assert(f.Writes==0);}});
await Test("ambiguous create read back and never blindly retried",async()=>{bool exists=false;var f=Fixture(null,(m,p,b)=>{if(m==HttpMethod.Post){exists=true;throw new HttpRequestException("secret-token");}return Task.FromResult<JsonNode?>(Parse(exists?"{\"value\":[{\"name\":\"expected\"}]}":"{\"value\":[]}"));});var e=new ResourceEngine(f);await e.AuthenticateTargetAsync();var row=await e.EnsureAsync("publisher","publishers","publishers",Parse("{\"name\":\"expected\"}"),Parse("{\"name\":\"expected\"}"),true);Assert(row!=null&&f.Writes==1);});
await Test("unconfirmed create stops after one attempt",async()=>{var f=Fixture(null,(m,p,b)=>{if(m==HttpMethod.Post)throw new HttpRequestException("secret-token");return Task.FromResult<JsonNode?>(Parse("{\"value\":[]}"));});var e=new ResourceEngine(f);await e.AuthenticateTargetAsync();await Reject(()=>e.EnsureAsync("publisher","publishers","publishers",new(),new(),true));Assert(f.Writes==1);});
await Test("inactive alternate key blocks readiness",async()=>{await Reject(()=>{Readiness.RequireActiveKey(Parse("{\"EntityKeyIndexStatus\":\"Pending\"}"));return Task.CompletedTask;});Readiness.RequireActiveKey(Parse("{\"EntityKeyIndexStatus\":\"Active\"}"));});
await Test("disabled or filtered impersonating guard blocks readiness",async()=>{foreach(var step in new[]{"{\"stage\":20,\"mode\":0,\"rank\":1,\"statecode\":1}","{\"stage\":20,\"mode\":0,\"rank\":1,\"statecode\":0,\"filteringattributes\":\"zk_name\"}","{}"})await Reject(()=>{Readiness.RequireGuard(Parse(step),"type","filter","message");return Task.CompletedTask;});});
await Test("seed normalizes copied actual source and preserves economics and provenance",()=>{var bytes=File.ReadAllBytes("import/2026.json");var original=JsonNode.Parse(bytes)!.AsObject();var copy=Seed.Normalize(bytes);Assert(copy["schemaVersion"]!.GetValue<int>()==2&&original["schemaVersion"]!.GetValue<int>()==1);Assert(copy["revision"]!.GetValue<int>()==0&&copy["operationIds"]!.AsArray().Count==0);Assert(!copy.ToJsonString().Contains("localPath"));Assert(copy["invoices"]![0]!["grossCents"]!.ToJsonString()==original["invoices"]![0]!["grossCents"]!.ToJsonString());Assert(copy["planLines"]![0]!["source"]!["hash"]!.ToJsonString()==original["planLines"]![0]!["source"]!["hash"]!.ToJsonString());Assert(copy["event"]!["id"]!.ToJsonString()==original["event"]!["id"]!.ToJsonString());return Task.CompletedTask;});
await Test("modified source cannot seed local test state",()=>Reject(()=>{var bytes=System.Text.Encoding.UTF8.GetBytes("{\"schemaVersion\":1,\"event\":{\"id\":\"local-test\"}}");Seed.Normalize(bytes);return Task.CompletedTask;}));
await Test("logs omit exception credentials and payloads",()=>{Assert(!SafeOutput.Error(new HttpRequestException("Bearer secret-token password=secret receipt=private")).Contains("secret"));return Task.CompletedTask;});
await Test("metadata payload enforces required memo and concurrency",()=>{
var attr=Metadata.Attribute(Parse("{\"name\":\"zk_state\",\"type\":\"Memo\",\"maxLength\":1048576,\"required\":true}"));
Assert(attr["@odata.type"]?.GetValue<string>()=="Microsoft.Dynamics.CRM.MemoAttributeMetadata");
Assert(attr["RequiredLevel"]?["Value"]?.GetValue<string>()=="ApplicationRequired");
var table=Metadata.Table(Parse("{\"logicalName\":\"zk_kitchenworkspace\",\"ownershipType\":\"UserOwned\",\"attributes\":[{\"name\":\"zk_name\",\"type\":\"String\",\"maxLength\":200}]}"));
Assert(table["IsOptimisticConcurrencyEnabled"]?.GetValue<bool>()==true&&table["Attributes"]?[0]?["IsPrimaryName"]?.GetValue<bool>()==true);return Task.CompletedTask;});
await Test("lookup relationship prohibits cascading receipt deletion",()=>{var r=Metadata.Relationship();Assert(r["CascadeConfiguration"]?["Delete"]?.GetValue<string>()=="Restrict");Assert(r["ReferencedEntity"]?.GetValue<string>()=="zk_kitchenworkspace"&&r["ReferencingEntity"]?.GetValue<string>()=="zk_kitchenoperation");return Task.CompletedTask;});
await Test("inspect default and invalid phases cannot accidentally write",async()=>{
Assert(Options.Parse([]).Phase=="inspect");
await Reject(()=>{Options.Parse(["--phase","delete"]);return Task.CompletedTask;});
await Reject(()=>{Options.Parse(["--seed",".local-state/2026.json"]);return Task.CompletedTask;});
await Reject(()=>{Options.Parse(["--phase","tables","--phase","backend"]);return Task.CompletedTask;});});
await Test("token cannot be sent to another host or outside API",async()=>{
int tokenReads=0;using var t=new WebApiTransport(Target.Url,()=>{tokenReads++;return Task.FromResult("secret-token");});
foreach(var path in new[]{"https://evil.example/api/data/v9.2/publishers","//evil.example/publishers","../../evil"}) await Reject(()=>t.SendAsync(HttpMethod.Get,path));
await Reject(()=>t.SendAsync(HttpMethod.Delete,"publishers"));Assert(tokenReads==0);});
await Test("HTTP refusal emits only status and exact numeric Dataverse error code",async()=>{
foreach(var code in new[]{"0x80040220","0xAbCd1234"}){
var body=new JsonObject{["error"]=new JsonObject{["code"]=code,["message"]="Bearer private-token password=secret https://private.example",["innererror"]=new JsonObject{["message"]="private-source"}}}.ToJsonString();
Assert(await HttpError(body)=="http_403_dataverse_"+code);
}
});
await Test("unsafe malformed missing and oversized provider codes preserve generic HTTP status",async()=>{
foreach(var code in new[]{"80040220","0X80040220","0x8004022","0x800402200","0x8004022g","0x80040220\n","0x80040220 Bearer secret","0x８００４０２２０","https://private.example"}){
var body=new JsonObject{["error"]=new JsonObject{["code"]=code,["message"]="private-secret"}}.ToJsonString();Assert(await HttpError(body)=="http_403");
}
foreach(var body in new[]{"{invalid","[]","{}","{\"error\":null}","{\"error\":{\"code\":42,\"message\":\"secret\"}}","{\"error\":{\"code\":\"0x80040220\",\"message\":\""+new string('x',9000)+"\"}}"})Assert(await HttpError(body)=="http_403");
});
await Test("refusal body reads stop within bounded diagnostic bytes",async()=>{
using var stream=new CountingErrorStream(System.Text.Encoding.UTF8.GetBytes("{\"error\":{\"code\":\"0x80040220\",\"message\":\""+new string('x',20000)+"\"}}"));
using var handler=new ResponseHandler(()=>new HttpResponseMessage(System.Net.HttpStatusCode.Forbidden){Content=new StreamContent(stream)});
using var transport=new WebApiTransport(Target.Url,()=>Task.FromResult("synthetic-token"),handler);
try{await transport.SendAsync(HttpMethod.Get,"pluginpackages");throw new Exception("Expected refusal");}catch(DeploymentException error){Assert(SafeOutput.Error(error)=="http_403"&&stream.ReadBytes<=8193);}
});
async Task<string> HttpError(string body){
using var handler=new ResponseHandler(()=>new HttpResponseMessage(System.Net.HttpStatusCode.Forbidden){Content=new StringContent(body)});
using var transport=new WebApiTransport(Target.Url,()=>Task.FromResult("synthetic-token"),handler);
try{await transport.SendAsync(HttpMethod.Get,"pluginpackages?$select=pluginpackageid");throw new Exception("Expected refusal");}catch(DeploymentException error){return SafeOutput.Error(error);}
}
await Test("MSAL object must match actual Dataverse systemuser",async()=>{var f=Fixture(new());await Reject(()=>new ResourceEngine(f,"00000000-0000-0000-0000-000000000099").AuthenticateTargetAsync());Assert(f.Writes==0);});
await Test("supported unguardable mutation blocks readiness without writes",async()=>{
var f=Fixture(null,(m,p,b)=>Task.FromResult<JsonNode?>(Parse(p.StartsWith("sdkmessages?")?"{\"value\":[{\"sdkmessageid\":\"00000000-0000-0000-0000-000000000011\"}]}":"{\"value\":[{\"sdkmessagefilterid\":\"00000000-0000-0000-0000-000000000012\",\"iscustomprocessingstepallowed\":false,\"primaryobjecttypecode\":\"zk_kitchenworkspace\"}]}")));
var e=new ResourceEngine(f);await e.AuthenticateTargetAsync();var p=new Provisioner(e,f,Parse("{\"guardSteps\":[{\"primaryEntity\":\"zk_kitchenworkspace\",\"message\":\"Update\"}]}"));await p.Guards("00000000-0000-0000-0000-000000000010",true);Assert(p.Gaps.Count==1&&f.Writes==0);});
await Test("valid guard must bind exact filter handler message and no impersonation",()=>{
var good=Parse("{\"stage\":20,\"mode\":0,\"rank\":1,\"statecode\":0,\"supporteddeployment\":0,\"filteringattributes\":null,\"_impersonatinguserid_value\":null,\"_eventhandler_value\":\"type\",\"_sdkmessagefilterid_value\":\"filter\",\"_sdkmessageid_value\":\"message\"}");Readiness.RequireGuard(good,"type","filter","message");
return Reject(()=>{good["_impersonatinguserid_value"]="other";Readiness.RequireGuard(good,"type","filter","message");return Task.CompletedTask;});});
await Test("every original field survives seed except local paths and schema upgrade",()=>{
var original=JsonNode.Parse(File.ReadAllBytes("import/2026.json"))!;var normalized=Seed.Normalize(File.ReadAllBytes("import/2026.json"));
void Compare(JsonNode? a,JsonNode? b,string key="") {if(key=="localPath")return;if(key=="schemaVersion"){Assert(b!.GetValue<int>()==2);return;}if(a is JsonObject obj){foreach(var pair in obj)Compare(pair.Value,b![pair.Key],pair.Key);}else if(a is JsonArray arr){Assert(b!.AsArray().Count==arr.Count);for(int k=0;k<arr.Count;k++)Compare(arr[k],b[k]);}else Assert(JsonNode.DeepEquals(a,b));}
Compare(original,normalized);return Task.CompletedTask;});
await Test("supported guard registers exact bindings once and is reused",async()=>{
const string handler="00000000-0000-0000-0000-000000000010",message="00000000-0000-0000-0000-000000000011",filter="00000000-0000-0000-0000-000000000012";
JsonObject? stored=null;
var f=Fixture(null,(m,p,b)=>{
if(p.StartsWith("sdkmessages?"))return Task.FromResult<JsonNode?>(Parse("{\"value\":[{\"sdkmessageid\":\"00000000-0000-0000-0000-000000000011\"}]}"));
if(p.StartsWith("sdkmessagefilters?"))return Task.FromResult<JsonNode?>(Parse("{\"value\":[{\"sdkmessagefilterid\":\"00000000-0000-0000-0000-000000000012\",\"iscustomprocessingstepallowed\":true,\"primaryobjecttypecode\":\"zk_kitchenworkspace\"}]}"));
if(m==HttpMethod.Post&&p=="sdkmessageprocessingsteps"){
Assert(b?["stage"]?.GetValue<int>()==20&&b?["mode"]?.GetValue<int>()==0&&b?["rank"]?.GetValue<int>()==1);
Assert(b?["eventhandler_plugintype@odata.bind"]?.GetValue<string>()=="/plugintypes(00000000-0000-0000-0000-000000000010)");
Assert(b?["sdkmessagefilterid@odata.bind"]?.GetValue<string>()=="/sdkmessagefilters(00000000-0000-0000-0000-000000000012)");
Assert(b?["sdkmessageid@odata.bind"]?.GetValue<string>()=="/sdkmessages(00000000-0000-0000-0000-000000000011)");
stored=Parse("{\"sdkmessageprocessingstepid\":\"00000000-0000-0000-0000-000000000020\",\"stage\":20,\"mode\":0,\"rank\":1,\"statecode\":0,\"supporteddeployment\":0,\"filteringattributes\":null,\"_impersonatinguserid_value\":null,\"_eventhandler_value\":\"00000000-0000-0000-0000-000000000010\",\"_sdkmessagefilterid_value\":\"00000000-0000-0000-0000-000000000012\",\"_sdkmessageid_value\":\"00000000-0000-0000-0000-000000000011\"}");return Task.FromResult<JsonNode?>(null);}
Assert(p=="sdkmessageprocessingsteps?$filter=_sdkmessagefilterid_value eq "+filter+" and _eventhandler_value eq "+handler);
return Task.FromResult<JsonNode?>(new JsonObject{["value"]=stored==null?new JsonArray():new JsonArray(stored.DeepClone())});});
var e=new ResourceEngine(f);await e.AuthenticateTargetAsync();var p=new Provisioner(e,f,Parse("{\"guardSteps\":[{\"primaryEntity\":\"zk_kitchenworkspace\",\"message\":\"Update\"}]}"));
await p.Guards(handler,true);await p.Guards(handler,true);Assert(f.Writes==1&&stored!=null);Readiness.RequireGuard(stored!,handler,filter,message);});
// Regression boundary: a real contract drives real provisioning requests and coverage reports.
await Test("known bulk filters never post dedicated Multiple or Upsert steps",async()=>{
var h=new GuardHarness();await h.Run(true);
Assert(h.Posted.Count==6&&h.Posted.All(p=>new[]{"Create","Update","Delete"}.Any(m=>p["name"]!.GetValue<string>().Contains("_"+m+"_"))));
Assert(h.Posted.Select(p=>p["name"]!.GetValue<string>().Split('_')[4]).Order().SequenceEqual(new[]{"Create","Create","Delete","Delete","Update","Update"}.Order()));
Assert(h.Posted.Select(p=>string.Join("_",p["name"]!.GetValue<string>().Split('_').Skip(2).Take(3))).Order().SequenceEqual(new[]{"zk_kitchenworkspace_Create","zk_kitchenworkspace_Update","zk_kitchenworkspace_Delete","zk_kitchenoperation_Create","zk_kitchenoperation_Update","zk_kitchenoperation_Delete"}.Order()));
foreach(var step in h.Posted){Assert(step["stage"]!.GetValue<int>()==20&&step["mode"]!.GetValue<int>()==0&&step["rank"]!.GetValue<int>()==1&&step["supporteddeployment"]!.GetValue<int>()==0);Assert(step.ContainsKey("filteringattributes")&&step["filteringattributes"]==null&&!step.ContainsKey("impersonatinguserid@odata.bind"));Assert(step["eventhandler_plugintype@odata.bind"]!.GetValue<string>()=="/plugintypes(00000000-0000-0000-0000-000000000010)");}
});
await Test("standard Upsert coverage requires both exact single guards and no Upsert filter",async()=>{
var h=new GuardHarness();await h.Run(true);foreach(var table in GuardHarness.Tables){var c=h.Coverage(table,"Upsert");Assert(c["metadataCoverage"]!.GetValue<string>()=="guarded_by_standard_create_update"&&c["runtimeAcceptance"]!.GetValue<string>()=="pending_root_live_check");}
});
await Test("missing single Create or Update blocks merged and Upsert coverage",async()=>{
foreach(var missing in new[]{"Create","Update"}){var h=new GuardHarness{Missing=missing};await h.Run(true);Assert(h.Provisioner!.Gaps.Any(g=>g.Contains(missing)));Assert(h.Coverage("zk_kitchenworkspace","Upsert")["metadataCoverage"]!.GetValue<string>()=="blocked_missing_required_guard");}
});
await Test("inactive single Create or Update is rejected without covered claim",async()=>{
foreach(var inactive in new[]{"Create","Update"}){var h=new GuardHarness{Inactive=inactive};await Reject(()=>h.Run(false));Assert(h.Transport.Writes==0);}
});
await Test("UpsertMultiple remains potentially supported without own filter",async()=>{
var h=new GuardHarness();await h.Run(true);foreach(var table in GuardHarness.Tables)Assert(h.Coverage(table,"UpsertMultiple")["availability"]!.GetValue<string>()=="potentially_supported");
});
await Test("standard DeleteMultiple unsupported classification needs verified table type",async()=>{
var standard=new GuardHarness();await standard.Run(true);Assert(standard.Coverage("zk_kitchenworkspace","DeleteMultiple")["availability"]!.GetValue<string>()=="documented_unsupported_standard_table");
foreach(var type in new string?[]{null,"Elastic"}){var unknown=new GuardHarness{TableType=type};await unknown.Run(false);Assert(unknown.Coverage("zk_kitchenworkspace","DeleteMultiple")["availability"]!.GetValue<string>()=="unverified_table_type"&&unknown.Provisioner!.Gaps.Count>0&&unknown.Transport.Writes==0);}
});
await Test("bulk coverage is metadata only and keeps Root runtime gates blocking",async()=>{
var h=new GuardHarness();await h.Run(true);Assert(h.Coverages().Length==10&&h.Provisioner!.Gaps.Count(g=>g.StartsWith("root_runtime_check_required:"))==10);
Assert(h.Coverages().All(c=>c["runtimeAcceptance"]!.GetValue<string>()=="pending_root_live_check"));
});
await Test("absent bulk filters stay unconfirmed instead of declared unavailable",async()=>{
var h=new GuardHarness{BulkFilters=false};await h.Run(true);Assert(h.Coverage("zk_kitchenworkspace","CreateMultiple")["availability"]!.GetValue<string>()=="availability_unconfirmed");Assert(h.Coverage("zk_kitchenworkspace","UpsertMultiple")["availability"]!.GetValue<string>()=="availability_unconfirmed");
});
await Test("existing dedicated Multiple or unexpected named guard stops before any writes",async()=>{
foreach(var message in new[]{"CreateMultiple","UpdateMultiple","UpsertMultiple","DeleteMultiple","Upsert"}){var h=new GuardHarness{Unexpected=message};await Reject(()=>h.Run(true));Assert(h.Transport.Writes==0);}
});
await Test("drifted existing named single guard stops before registrations",async()=>{
foreach(var drift in new[]{"disabled","handler","filter"}){var h=new GuardHarness{ExistingDrift=drift};await Reject(()=>h.Run(true));Assert(h.Transport.Writes==0);}
});
await Test("missing Delete remains a required guard gap",async()=>{
var h=new GuardHarness{Missing="Delete"};await h.Run(true);Assert(h.Provisioner!.Gaps.Contains("missing_required_guard_filter:zk_kitchenworkspace:Delete")&&h.Posted.Count==4);
});
await Test("workspace readback rejects wrong owner",()=>CheckWorkspace(row=>row["_ownerid_value"]="00000000-0000-0000-0000-000000000099",true));
await Test("workspace readback rejects missing state or revision",async()=>{
await CheckWorkspace(row=>row.Remove("zk_state"),true);await CheckWorkspace(row=>row.Remove("zk_revision"),true);});
await Test("workspace readback rejects invalid persisted JSON and schema",async()=>{
await CheckWorkspace(row=>row["zk_state"]="{invalid",true);
await CheckWorkspace(row=>{var state=JsonNode.Parse(row["zk_state"]!.GetValue<string>())!;state["schemaVersion"]=1;row["zk_state"]=state.ToJsonString();},true);});
await Test("workspace readback rejects replacement at initial revision",()=>CheckWorkspace(row=>{
var state=JsonNode.Parse(row["zk_state"]!.GetValue<string>())!;state["articles"]![0]!["unitPriceCents"]=12.34;row["zk_state"]=state.ToJsonString();},true));
await Test("workspace readback accepts reviewed initial seed",()=>CheckWorkspace(_=>{},false));
await Test("workspace readback accepts valid later edit preserving source",()=>CheckWorkspace(row=>{
var state=JsonNode.Parse(row["zk_state"]!.GetValue<string>())!;state["articles"]![0]!["unitPriceCents"]=12.34;state["revision"]=1;
state["operationIds"]=new JsonArray("edit-1");state["operationRequests"]=new JsonObject{["edit-1"]="article.price"};row["zk_revision"]=1;row["zk_state"]=state.ToJsonString();},false));
await Test("workspace readback rejects row-state revision mismatch",()=>CheckWorkspace(row=>row["zk_revision"]=1,true));
await Test("later revisions cannot rewrite original receipt economics",()=>CheckWorkspace(row=>{
var state=JsonNode.Parse(row["zk_state"]!.GetValue<string>())!;state["revision"]=1;state["invoices"]![0]!["grossCents"]=1;
row["zk_revision"]=1;row["zk_state"]=state.ToJsonString();},true));
await Test("workspace readback accepts two individually valid receipt corrections",()=>CheckWorkspace(row=>row["zk_state"]=TwoCorrections(row).ToString(Newtonsoft.Json.Formatting.None),false));
await Test("multi-correction readback rejects changed provenance and baseline",async()=>{
await CheckWorkspace(row=>{var state=TwoCorrections(row);state["planLines"]![0]!["source"]!["hash"]=new string('0',64);row["zk_state"]=state.ToString(Newtonsoft.Json.Formatting.None);},true);
await CheckWorkspace(row=>{var state=TwoCorrections(row);state["invoices"]!.OfType<Newtonsoft.Json.Linq.JObject>().Single(r=>(string?)r["id"]=="r-rewe-list-1")["sourceBaseline"]!["grossCents"]=42;row["zk_state"]=state.ToString(Newtonsoft.Json.Formatting.None);},true);});
await Test("multi-correction readback rejects changed original economics",()=>CheckWorkspace(row=>{
var state=TwoCorrections(row);state["invoices"]!.OfType<Newtonsoft.Json.Linq.JObject>().First(r=>(string?)r["status"]=="Original vorhanden")["grossCents"]=1;row["zk_state"]=state.ToString(Newtonsoft.Json.Formatting.None);},true));
await Test("multi-correction readback rejects tampered intermediate provenance",()=>CheckWorkspace(row=>{
var state=TwoCorrections(row);state["invoices"]!.OfType<Newtonsoft.Json.Linq.JObject>().Single(r=>(string?)r["id"]=="r-rewe-list-1")["corrections"]![1]!["before"]!["source"]!["hash"]=new string('0',64);row["zk_state"]=state.ToString(Newtonsoft.Json.Formatting.None);},true));
await Test("snapshot verification does not grandfather new duplicate receipt IDs",()=>CheckWorkspace(row=>{
var state=TwoCorrections(row);var duplicate=(Newtonsoft.Json.Linq.JObject)state["invoices"]![0]!.DeepClone();duplicate["id"]="new-duplicate";
((Newtonsoft.Json.Linq.JArray)state["invoices"]!).Add(duplicate);row["zk_state"]=state.ToString(Newtonsoft.Json.Formatting.None);},true));
Newtonsoft.Json.Linq.JObject TwoCorrections(JsonObject row) {
var state=Zunftkueche.Protocol.Parse(row["zk_state"]!.GetValue<string>());
for(int revision=1;revision<=2;revision++) {
var next=(Newtonsoft.Json.Linq.JObject)state.DeepClone();
var receipt=next["invoices"]!.OfType<Newtonsoft.Json.Linq.JObject>().Single(r=>(string?)r["id"]=="r-rewe-list-1");
var before=(Newtonsoft.Json.Linq.JObject)receipt.DeepClone();before.Remove("sourceBaseline");before.Remove("corrected");before.Remove("corrections");
receipt["sourceBaseline"]??=before.DeepClone();receipt["corrected"]=true;receipt["corrections"]??=new Newtonsoft.Json.Linq.JArray();
((Newtonsoft.Json.Linq.JArray)receipt["corrections"]!).Add(new Newtonsoft.Json.Linq.JObject{{"operationId","receipt-edit-"+revision},{"revision",revision},{"before",before}});
receipt["grossCents"]=revision==1?2000:3000;receipt["netCents"]=1000;next["revision"]=revision;
((Newtonsoft.Json.Linq.JArray)next["operationIds"]!).Add("receipt-edit-"+revision);next["operationRequests"]!["receipt-edit-"+revision]="invoice.update";
// Each fixture step must satisfy the unmodified runtime's real single-commit contract.
Zunftkueche.StatePolicy.Validate(next,state);state=next;
}
row["zk_revision"]=2;return state;
}
async Task CheckWorkspace(Action<JsonObject> change,bool reject) {
var seed=Seed.Normalize(File.ReadAllBytes("import/2026.json"));
var owner=Guid.Parse("00000000-0000-0000-0000-000000000002");
var row=new JsonObject{["zk_kitchenworkspaceid"]=Seed.WorkspaceId,["_ownerid_value"]=owner.ToString("D"),["zk_revision"]=0,["zk_state"]=seed.ToJsonString()};change(row);
var f=Fixture(null,(m,p,b)=>{
Assert(m==HttpMethod.Get);
if(p=="EntityDefinitions?$select=EntitySetName&$filter=LogicalName eq 'zk_kitchenworkspace'")return Task.FromResult<JsonNode?>(Parse("{\"value\":[{\"EntitySetName\":\"zk_kitchenworkspaces\"}]}"));
Assert(p=="zk_kitchenworkspaces?$select=zk_kitchenworkspaceid,_ownerid_value,zk_state,zk_revision&$filter=zk_kitchenworkspaceid eq "+Seed.WorkspaceId);
return Task.FromResult<JsonNode?>(new JsonObject{["value"]=new JsonArray(row.DeepClone())});});
var e=new ResourceEngine(f);await e.AuthenticateTargetAsync();var p=new Provisioner(e,f,new());
if(reject)await Reject(()=>p.VerifyWorkspace(seed,owner));else{await p.VerifyWorkspace(seed,owner);Assert(p.Gaps.Count==0);}
Assert(f.Writes==0);
}
await Test("metadata drift diagnosis names only trusted resource and fixed field path",async()=>{
var f=Fixture(Parse("{\"value\":[{\"SchemaName\":\"zk_name\",\"MaxLength\":850,\"private-note\":\"Bearer secret-token receipt-body\"}]}"));
var engine=new ResourceEngine(f);await engine.AuthenticateTargetAsync();
await Reject(()=>engine.EnsureAsync("zk_kitchenworkspace.zk_name","attributes","attributes",new(),Parse("{\"SchemaName\":\"zk_name\",\"MaxLength\":200}"),true));
var log=System.Text.Json.JsonSerializer.Serialize(engine.Resources);
Assert(log.Contains("zk_kitchenworkspace.zk_name")&&log.Contains("$.MaxLength")&&!log.Contains("850")&&!log.Contains("secret-token")&&!log.Contains("receipt-body")&&f.Writes==0);
});
await Test("metadata drift diagnosis handles nested managed-property value safely",async()=>{
var f=Fixture(Parse("{\"value\":[{\"RequiredLevel\":{\"Value\":\"sensitive-provider-value\",\"ManagedPropertyLogicalName\":\"untrusted-note\"}}]}"));
var engine=new ResourceEngine(f);await engine.AuthenticateTargetAsync();
await Reject(()=>engine.EnsureAsync("zk_kitchenworkspace.zk_name","attributes","attributes",new(),Parse("{\"RequiredLevel\":{\"Value\":\"None\"}}"),true));
var log=System.Text.Json.JsonSerializer.Serialize(engine.Resources);Assert(log.Contains("$.RequiredLevel.Value")&&!log.Contains("sensitive-provider-value")&&!log.Contains("untrusted-note")&&f.Writes==0);
});
Console.WriteLine($"{passed} passed; {failed} failed");return failed==0?0:1;
Fake Fixture(JsonObject? data, Func<HttpMethod,string,JsonNode?,Task<JsonNode?>>? other=null)=>new((m,p,b)=>{
 if(p=="WhoAmI")return Task.FromResult<JsonNode?>(Parse($"{{\"OrganizationId\":\"{Target.Organization}\",\"UserId\":\"00000000-0000-0000-0000-000000000002\"}}"));
 if(p.StartsWith("systemusers("))return Task.FromResult<JsonNode?>(Parse($"{{\"domainname\":\"{Target.User}\",\"isdisabled\":false,\"azureactivedirectoryobjectid\":\"00000000-0000-0000-0000-000000000003\"}}"));
 if(p.StartsWith("organizations("))return Task.FromResult<JsonNode?>(Parse("{\"languagecode\":1031,\"_basecurrencyid_value\":\"00000000-0000-0000-0000-000000000004\"}"));
 if(p.StartsWith("transactioncurrencies("))return Task.FromResult<JsonNode?>(Parse("{\"isocurrencycode\":\"EUR\"}"));
 if(p.StartsWith("EntityDefinitions?$select=TableType&"))return Task.FromResult<JsonNode?>(Parse("{\"value\":[{\"TableType\":\"Standard\"}]}"));
 if(p.StartsWith("sdkmessageprocessingsteps?$select="))return Task.FromResult<JsonNode?>(Parse("{\"value\":[]}"));
 return other!=null?other(m,p,b):Task.FromResult<JsonNode?>(data!.DeepClone());});
sealed class Fake(Func<HttpMethod,string,JsonNode?,Task<JsonNode?>> handle):IDataverseTransport {public int Writes; public Task<JsonNode?> SendAsync(HttpMethod m,string p,JsonNode? b=null){if(m!=HttpMethod.Get)Writes++;return handle(m,p,b);}}

sealed class GuardHarness {
 public static readonly string[] Tables=["zk_kitchenworkspace","zk_kitchenoperation"];
 public const string Handler="00000000-0000-0000-0000-000000000010";
 static readonly string[] Messages=["Create","Update","Delete","Upsert","CreateMultiple","UpdateMultiple","UpsertMultiple","DeleteMultiple"];
 public string? Missing,Inactive,Unexpected,ExistingDrift;public string? TableType="Standard";public bool BulkFilters=true;
 public List<JsonObject> Posted=[];public Dictionary<string,JsonObject> Steps=[];public Fake Transport;public ResourceEngine Engine;public Provisioner? Provisioner;
 static string Id(int n)=>$"00000000-0000-0000-0000-{n:000000000000}";
 static JsonNode Rows(params JsonObject[] rows)=>new JsonObject{["value"]=new JsonArray(rows.Select(r=>(JsonNode)r.DeepClone()).ToArray())};
 static JsonObject Step(string table,string message)=>new(){["name"]=$"zk_KitchenGuard_{table}_{message}",["sdkmessageprocessingstepid"]=Id(90),["stage"]=20,["mode"]=0,["rank"]=1,["statecode"]=0,["supporteddeployment"]=0,["filteringattributes"]=null,["_impersonatinguserid_value"]=null,["_eventhandler_value"]=Handler,["_sdkmessageid_value"]=Id(Array.IndexOf(Messages,message)+20),["_sdkmessagefilterid_value"]=Id(40+Array.IndexOf(Tables,table)*10+Array.IndexOf(Messages,message)),["sdkmessageid"]=new JsonObject{["name"]=message},["sdkmessagefilterid"]=new JsonObject{["primaryobjecttypecode"]=table}};
 public GuardHarness(){Transport=new Fake((m,p,b)=>Task.FromResult(Handle(m,p,b)));Engine=new ResourceEngine(Transport);}
 JsonNode? Handle(HttpMethod method,string path,JsonNode? body){
 if(path=="WhoAmI")return new JsonObject{["OrganizationId"]=Target.Organization,["UserId"]=Id(2)};
 if(path.StartsWith("systemusers("))return new JsonObject{["domainname"]=Target.User,["isdisabled"]=false};
 if(path.StartsWith("organizations("))return new JsonObject{["languagecode"]=1031,["_basecurrencyid_value"]=Id(4)};
 if(path.StartsWith("transactioncurrencies("))return new JsonObject{["isocurrencycode"]="EUR"};
 if(path.StartsWith("EntityDefinitions?$select=TableType&"))return TableType==null?Rows():Rows(new JsonObject{["TableType"]=TableType});
 if(path.StartsWith("sdkmessageprocessingsteps?$select=")){
 if(Unexpected!=null)return Rows(Step(Tables[0],Unexpected));
 if(ExistingDrift!=null){var drift=Step(Tables[0],"Create");if(ExistingDrift=="disabled")drift["statecode"]=1;else if(ExistingDrift=="handler")drift["_eventhandler_value"]=Id(999);else drift["_sdkmessagefilterid_value"]=Id(999);return Rows(drift);}
 return Rows();
}
 if(path.StartsWith("sdkmessages?")){var msg=Messages.Single(m=>path.EndsWith("'"+m+"'"));return Rows(new JsonObject{["sdkmessageid"]=Id(Array.IndexOf(Messages,msg)+20),["name"]=msg});}
 if(path.StartsWith("sdkmessagefilters?")){var msg=Messages.Single(m=>path.Contains(Id(Array.IndexOf(Messages,m)+20)));var table=Tables.Single(t=>path.EndsWith("'"+t+"'"));if(msg==Missing||msg is "Upsert" or "UpsertMultiple" or "DeleteMultiple"||(!BulkFilters&&msg.EndsWith("Multiple")))return Rows();return Rows(new JsonObject{["sdkmessagefilterid"]=Id(40+Array.IndexOf(Tables,table)*10+Array.IndexOf(Messages,msg)),["iscustomprocessingstepallowed"]=true,["primaryobjecttypecode"]=table});}
 if(method==HttpMethod.Post&&path=="sdkmessageprocessingsteps"){var payload=body!.AsObject();Posted.Add(payload.DeepClone().AsObject());var msg=Messages.Single(m=>payload["sdkmessageid@odata.bind"]!.GetValue<string>().Contains(Id(Array.IndexOf(Messages,m)+20)));var table=Tables.Single(t=>payload["name"]!.GetValue<string>().Contains(t));var step=Step(table,msg);Steps[step["_sdkmessagefilterid_value"]!.GetValue<string>()]=step;return null;}
 if(path.StartsWith("sdkmessageprocessingsteps?$filter=")){var key=path.Split(" eq ")[1].Split(' ')[0];if(Steps.TryGetValue(key,out var step))return Rows(step);if(Inactive!=null&&key==Id(40+Array.IndexOf(Messages,Inactive))){var bad=Step(Tables[0],Inactive);bad["statecode"]=1;return Rows(bad);}return Rows();}
 throw new Exception("Unexpected guard test request: "+path);
 }
 public async Task Run(bool create){await Engine.AuthenticateTargetAsync();Provisioner=new Provisioner(Engine,Transport,JsonNode.Parse(File.ReadAllBytes("server/deployment/registration.json"))!.AsObject());await Provisioner.Guards(Handler,create);}
 public JsonObject[] Coverages()=>System.Text.Json.JsonSerializer.SerializeToNode(Engine.Resources)!.AsArray().Where(r=>r?["resource"]?.GetValue<string>()=="guard_coverage").Select(r=>r!.AsObject()).ToArray();
 public JsonObject Coverage(string table,string message)=>Coverages().Single(c=>c["table"]!.GetValue<string>()==table&&c["message"]!.GetValue<string>()==message);
}

sealed class ResponseHandler(Func<HttpResponseMessage> response):HttpMessageHandler {
 protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken cancellationToken)=>Task.FromResult(response());
}

sealed class CountingErrorStream(byte[] bytes):Stream {
 private readonly MemoryStream inner=new(bytes);public int ReadBytes;
 public override bool CanRead=>true;public override bool CanSeek=>false;public override bool CanWrite=>false;
 public override long Length=>throw new NotSupportedException();public override long Position{get=>throw new NotSupportedException();set=>throw new NotSupportedException();}
 public override int Read(byte[] buffer,int offset,int count){var n=inner.Read(buffer,offset,count);ReadBytes+=n;return n;}
 public override async ValueTask<int> ReadAsync(Memory<byte> buffer,CancellationToken token=default){var n=await inner.ReadAsync(buffer,token);ReadBytes+=n;return n;}
 public override void Flush()=>throw new NotSupportedException();public override long Seek(long offset,SeekOrigin origin)=>throw new NotSupportedException();public override void SetLength(long value)=>throw new NotSupportedException();public override void Write(byte[] buffer,int offset,int count)=>throw new NotSupportedException();
 protected override void Dispose(bool disposing){if(disposing)inner.Dispose();base.Dispose(disposing);}
}
