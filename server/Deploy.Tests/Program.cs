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
await Test("MSAL object must match actual Dataverse systemuser",async()=>{var f=Fixture(new());await Reject(()=>new ResourceEngine(f,"00000000-0000-0000-0000-000000000099").AuthenticateTargetAsync());Assert(f.Writes==0);});
await Test("missing bulk support is reported and cannot become ready",async()=>{
var f=Fixture(Parse("{\"value\":[]}"));var e=new ResourceEngine(f);await e.AuthenticateTargetAsync();
var contract=Parse("{\"guardSteps\":[{\"primaryEntity\":\"zk_kitchenworkspace\",\"message\":\"CreateMultiple\"}]}");
var p=new Provisioner(e,f,contract);await p.Guards("00000000-0000-0000-0000-000000000010",false);Assert(p.Gaps.Count==1&&f.Writes==0);});
await Test("supported unguardable mutation blocks readiness without writes",async()=>{
var f=Fixture(null,(m,p,b)=>Task.FromResult<JsonNode?>(Parse(p.StartsWith("sdkmessages?")?"{\"value\":[{\"sdkmessageid\":\"00000000-0000-0000-0000-000000000011\"}]}":"{\"value\":[{\"sdkmessagefilterid\":\"00000000-0000-0000-0000-000000000012\",\"iscustomprocessingstepallowed\":false}]}")));
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
if(p.StartsWith("sdkmessagefilters?"))return Task.FromResult<JsonNode?>(Parse("{\"value\":[{\"sdkmessagefilterid\":\"00000000-0000-0000-0000-000000000012\",\"iscustomprocessingstepallowed\":true}]}"));
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
Console.WriteLine($"{passed} passed; {failed} failed");return failed==0?0:1;
Fake Fixture(JsonObject? data, Func<HttpMethod,string,JsonNode?,Task<JsonNode?>>? other=null)=>new((m,p,b)=>{
 if(p=="WhoAmI")return Task.FromResult<JsonNode?>(Parse($"{{\"OrganizationId\":\"{Target.Organization}\",\"UserId\":\"00000000-0000-0000-0000-000000000002\"}}"));
 if(p.StartsWith("systemusers("))return Task.FromResult<JsonNode?>(Parse($"{{\"domainname\":\"{Target.User}\",\"isdisabled\":false,\"azureactivedirectoryobjectid\":\"00000000-0000-0000-0000-000000000003\"}}"));
 if(p.StartsWith("organizations("))return Task.FromResult<JsonNode?>(Parse("{\"languagecode\":1031,\"_basecurrencyid_value\":\"00000000-0000-0000-0000-000000000004\"}"));
 if(p.StartsWith("transactioncurrencies("))return Task.FromResult<JsonNode?>(Parse("{\"isocurrencycode\":\"EUR\"}"));
 return other!=null?other(m,p,b):Task.FromResult<JsonNode?>(data!.DeepClone());});
sealed class Fake(Func<HttpMethod,string,JsonNode?,Task<JsonNode?>> handle):IDataverseTransport {public int Writes; public Task<JsonNode?> SendAsync(HttpMethod m,string p,JsonNode? b=null){if(m!=HttpMethod.Get)Writes++;return handle(m,p,b);}}
