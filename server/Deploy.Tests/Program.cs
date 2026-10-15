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
await Test("package create reports only fixed lexical facts and validated numeric details",async()=>{
var body=Parse("""{"error":{"code":"0x80040265","message":"Invalid NuGet package: unique name must contain publisher prefix; manifest version mismatch. Bearer private-token https://private.example/password=secret","innererror":{"message":"Assembly not supported; dependency references missing. Newtonsoft SDK unsigned signature"},"@Microsoft.PowerApps.CDS.ErrorDetails.OperationStatus":"1","@Microsoft.PowerApps.CDS.ErrorDetails.SubErrorCode":-2147220891,"@Microsoft.PowerApps.CDS.TraceText":"private-trace"}}""");
var result=await PackageError(body.ToJsonString());Assert(result.Error=="http_400_dataverse_0x80040265"&&result.Facts.Count==1);
var fact=result.Facts[0]!;var flags=fact["Flags"]!.AsArray().Select(f=>f!.GetValue<string>()).ToArray();
foreach(var word in new[]{"invalid","nuget","package","unique","name","must","publisher","prefix","manifest","version","mismatch","assembly","not_supported","dependency","references","missing","newtonsoft","sdk","unsigned","signature"})Assert(flags.Contains(word));
Assert(fact["OperationStatus"]!.GetValue<int>()==1&&fact["SubErrorCode"]!.GetValue<int>()==-2147220891);
var output=result.Facts.ToJsonString();foreach(var secret in new[]{"private-token","private.example","password","secret","private-trace","Bearer"})Assert(!output.Contains(secret));
});
await Test("package diagnostic is restricted to exact POST pluginpackages",async()=>{
var body="""{"error":{"code":"0x80040265","message":"Invalid NuGet package name"}}""";
foreach(var request in new[]{(HttpMethod.Get,"pluginpackages"),(HttpMethod.Post,"pluginpackages?x=1"),(HttpMethod.Post,"pluginpackages/"),(HttpMethod.Post,"PluginPackages"),(HttpMethod.Post,"pluginassemblies")}){
var result=await PackageError(body,request.Item1,request.Item2);Assert(result.Facts.Count==0&&result.Error=="http_400_dataverse_0x80040265");
}
});
await Test("package diagnostics reject unsafe int32 fields and ignore other remote fields",async()=>{
foreach(var bad in new[]{"\"2147483648\"","-2147483649","1.5","\"1 password=secret\"","true","{}","null","\" 1\"","\"+1\""}){
var body=Parse("""{"error":{"code":"0x80040265","message":"unclassified remote-private-marker","innererror":{"message":42},"name":"invalid assembly","@Microsoft.PowerApps.CDS.TraceText":"invalid nuget","@Microsoft.PowerApps.CDS.InnerError.Message":"invalid zip"}}""");
body["error"]!["@Microsoft.PowerApps.CDS.ErrorDetails.OperationStatus"]=JsonNode.Parse(bad);body["error"]!["@Microsoft.PowerApps.CDS.ErrorDetails.SubErrorCode"]=JsonNode.Parse(bad);
var result=await PackageError(body.ToJsonString());var fact=result.Facts.Single()!;
Assert(fact["OperationStatus"]==null&&fact["SubErrorCode"]==null&&fact["Flags"]!.AsArray().Count==0&&!result.Facts.ToJsonString().Contains("remote-private-marker"));
}
});
await Test("package numeric diagnostics accept only canonical int32 bounds",async()=>{
foreach(var number in new[]{int.MinValue,0,int.MaxValue}){
var body=Parse("""{"error":{"code":"0x80040265"}}""");
body["error"]!["@Microsoft.PowerApps.CDS.ErrorDetails.OperationStatus"]=number;body["error"]!["@Microsoft.PowerApps.CDS.ErrorDetails.SubErrorCode"]=number.ToString(System.Globalization.CultureInfo.InvariantCulture);
var result=await PackageError(body.ToJsonString());Assert(result.Facts[0]!["OperationStatus"]!.GetValue<int>()==number&&result.Facts[0]!["SubErrorCode"]!.GetValue<int>()==number);
}
});
await Test("package malformed oversized and excessive depth bodies stay unknown and bounded",async()=>{
foreach(var body in new[]{"{bad","[]","{}","{\"error\":{\"code\":\"0x80040265\",\"message\":\"invalid nuget "+new string('x',9000)+"\"}}","{\"error\":{\"code\":\"0x80040265\",\"message\":\"invalid nuget\",\"deep\":"+new string('[',20)+"0"+new string(']',20)+"}}"}){
var result=await PackageError(body);Assert(result.Error=="http_400"&&result.Facts.Count==1&&result.Facts[0]!["Flags"]!.AsArray().Count==0&&result.Facts[0]!["OperationStatus"]==null&&result.Facts[0]!["SubErrorCode"]==null);
}
using var stream=new CountingErrorStream(System.Text.Encoding.UTF8.GetBytes(new string('x',20000)));
using var handler=new ResponseHandler(()=>new HttpResponseMessage(System.Net.HttpStatusCode.BadRequest){Content=new StreamContent(stream)});
using var transport=new WebApiTransport(Target.Url,()=>Task.FromResult("synthetic-token"),handler);
await Reject(()=>transport.SendAsync(HttpMethod.Post,"pluginpackages",new JsonObject()));Assert(stream.ReadBytes<=8193);
});
await Test("package file GET uses exact authenticated route and returns reviewed bytes",async()=>{
var bytes=File.ReadAllBytes("server/artifacts/guard-wrapper-v2/Zunftkueche.Dataverse.1.0.0.nupkg");int calls=0;
using var t=new WebApiTransport(Target.Url,()=>Task.FromResult("synthetic-token"),new ResponseHandler(()=>new(System.Net.HttpStatusCode.OK){Content=new ByteArrayContent(bytes)},r=>{calls++;Assert(r.Method==HttpMethod.Get&&r.RequestUri!.AbsoluteUri==Target.Url+"/api/data/v9.2/pluginpackages(00000000-0000-0000-0000-000000000030)/package/$value"&&r.Headers.Authorization?.Parameter=="synthetic-token"&&r.Content==null);}));
Assert((await ((IDataverseTransport)t).ReadPackageFileAsync("00000000-0000-0000-0000-000000000030")).SequenceEqual(bytes)&&calls==1);
});
await Test("package file rejects invalid IDs before token acquisition",async()=>{
int tokens=0;using var t=new WebApiTransport(Target.Url,()=>{tokens++;return Task.FromResult("secret");});
foreach(var id in new[]{"","00000000-0000-0000-0000-000000000000","bad","../other","00000000000000000000000000000030","00000000-0000-0000-0000-000000000030)/fileid/$value"})await Reject(()=>((IDataverseTransport)t).ReadPackageFileAsync(id));Assert(tokens==0);
});
await Test("package file reads are bounded and reject short oversized partial and refusal responses",async()=>{
foreach(var length in new[]{0,PackageFileDownload.ExpectedLength-1,PackageFileDownload.ExpectedLength,PackageFileDownload.ExpectedLength+1,400000}){
using var stream=new CountingErrorStream(new byte[length]);int calls=0;
using var t=new WebApiTransport(Target.Url,()=>Task.FromResult("secret"),new ResponseHandler(()=>new(System.Net.HttpStatusCode.OK){Content=new StreamContent(stream)},_=>calls++));
if(length==PackageFileDownload.ExpectedLength)Assert((await ((IDataverseTransport)t).ReadPackageFileAsync("00000000-0000-0000-0000-000000000030")).Length==length);
else await Reject(()=>((IDataverseTransport)t).ReadPackageFileAsync("00000000-0000-0000-0000-000000000030"));Assert(calls==1&&stream.ReadBytes<=PackageFileDownload.ExpectedLength+1);
}
foreach(var status in new[]{206,204,302,400,404,500}){
using var t=new WebApiTransport(Target.Url,()=>Task.FromResult("secret"),new ResponseHandler(()=>new((System.Net.HttpStatusCode)status){Content=new StringContent("{\"error\":{\"code\":\"0x80040265\",\"message\":\"private-token https://private.example\"}}") }));
try{await ((IDataverseTransport)t).ReadPackageFileAsync("00000000-0000-0000-0000-000000000030");throw new Exception("Expected refusal");}catch(DeploymentException error){Assert(!SafeOutput.Error(error).Contains("private")&&!SafeOutput.Error(error).Contains("secret"));}
}
});
await Test("package file read errors and cancellation emit only fixed failures",async()=>{
foreach(var failure in new Exception[]{new HttpRequestException("private-token"),new IOException("private-path"),new TaskCanceledException("private-url")}){
int calls=0;using var t=new WebApiTransport(Target.Url,()=>Task.FromResult("secret"),new ResponseHandler(()=>{calls++;throw failure;}));
try{await ((IDataverseTransport)t).ReadPackageFileAsync("00000000-0000-0000-0000-000000000030");throw new Exception("Expected refusal");}catch(DeploymentException error){Assert(SafeOutput.Error(error)=="package_file_read_failed"&&calls==1&&t.PackageCreateDiagnostics.Count==0);}
}
});
async Task<(string Error,JsonArray Facts)> PackageError(string body,HttpMethod? method=null,string path="pluginpackages") {
int requests=0;
using var handler=new ResponseHandler(()=>new HttpResponseMessage(System.Net.HttpStatusCode.BadRequest){Content=new StringContent(body)},request=>{
requests++;
bool packageCreate=(method??HttpMethod.Post)==HttpMethod.Post&&path=="pluginpackages";
Assert(request.Headers.Contains("Prefer")==packageCreate);
if(packageCreate)Assert(request.Headers.GetValues("Prefer").Single()=="odata.include-annotations=\"Microsoft.PowerApps.CDS.ErrorDetails.OperationStatus,Microsoft.PowerApps.CDS.ErrorDetails.SubErrorCode\"");
});
using var transport=new WebApiTransport(Target.Url,()=>Task.FromResult("synthetic-token"),handler);
try{await transport.SendAsync(method??HttpMethod.Post,path,new JsonObject());throw new Exception("Expected refusal");}
catch(DeploymentException error){Assert(requests==1);return (SafeOutput.Error(error),System.Text.Json.JsonSerializer.SerializeToNode(transport)?["PackageCreateDiagnostics"]?.AsArray()??new JsonArray());}
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
await Test("reviewed internal primary names reuse exact observed capacity without mutation",async()=>{
var contract=Provisioner.LoadContract("server/deployment/registration.json");
foreach(var table in contract["tables"]!.AsArray()) {
var spec=table!["attributes"]![0]!;var expected=Metadata.AttributeExpected(spec,true);
var observed=Parse("{\"SchemaName\":\"zk_name\",\"RequiredLevel\":{\"Value\":\"None\",\"CanBeChanged\":true},\"IsPrimaryName\":true,\"MaxLength\":850,\"FormatName\":{\"Value\":\"Text\"}}");
var f=Fixture(new JsonObject{["value"]=new JsonArray(observed)});var engine=new ResourceEngine(f);await engine.AuthenticateTargetAsync();
await engine.EnsureAsync("primary-name","attributes","attributes",Metadata.Attribute(spec,true),expected,true);
Assert(Metadata.Table(table)["Attributes"]![0]!["MaxLength"]!.GetValue<int>()==850&&f.Writes==0);
}
});
await Test("internal primary capacity remains exact and all business limits remain unchanged",async()=>{
var contract=Provisioner.LoadContract("server/deployment/registration.json");
foreach(var table in contract["tables"]!.AsArray())foreach(var length in new[]{200,849,851}) {
var expected=Metadata.AttributeExpected(table!["attributes"]![0]!,true);
var observed=Parse("{\"SchemaName\":\"zk_name\",\"RequiredLevel\":{\"Value\":\"None\"},\"IsPrimaryName\":true,\"MaxLength\":850,\"FormatName\":{\"Value\":\"Text\"}}");observed["MaxLength"]=length;
await Reject(()=>{ResourceEngine.RequireMatch(observed,expected);return Task.CompletedTask;});
}
Assert(contract["tables"]![0]!["attributes"]![1]!["maxLength"]!.GetValue<int>()==1048576);
var receipt=contract["tables"]![1]!["attributes"]!.AsArray();
Assert(receipt.Single(a=>a!["name"]!.GetValue<string>()=="zk_operationid")!["maxLength"]!.GetValue<int>()==100);
Assert(receipt.Single(a=>a!["name"]!.GetValue<string>()=="zk_requesthash")!["maxLength"]!.GetValue<int>()==64);
Assert(receipt.Single(a=>a!["name"]!.GetValue<string>()=="zk_actor")!["maxLength"]!.GetValue<int>()==36);
});
await Test("relationship deep insert omits existing lookup reference and reuses verified result",()=>CheckRelationship("zk_workspace",true));
await Test("relationship readback still rejects missing or wrong referencing attribute",async()=>{
await CheckRelationship(null,false);await CheckRelationship("zk_other",false);
});
await Test("receipt key accepts reversed exact column set without writes",()=>CheckRelationship("zk_workspace",false,
Parse("""{"SchemaName":"zk_workspace_operation","KeyAttributes":["zk_operationid","zk_workspace"],"EntityKeyIndexStatus":"Active"}""")));
await Test("receipt key rejects duplicate missing extra wrong and nonstring columns",async()=>{
foreach(var columns in new[]{"[]","[\"zk_workspace\"]","[\"zk_workspace\",\"zk_workspace\"]","[\"zk_operationid\",\"zk_operationid\"]","[\"zk_workspace\",\"zk_other\"]","[\"zk_workspace\",\"zk_operationid\",\"zk_other\"]","[\"zk_workspace\",null]","[\"zk_workspace\",42]","[\"zk_workspace\",{}]","null","\"zk_workspace\""}){
var key=Parse("""{"SchemaName":"zk_workspace_operation","EntityKeyIndexStatus":"Active"}""");key["KeyAttributes"]=JsonNode.Parse(columns);
await CheckRelationship("zk_workspace",false,key,true);
}
await CheckRelationship("zk_workspace",false,Parse("""{"SchemaName":"zk_workspace_operation","EntityKeyIndexStatus":"Active"}"""),true);
});
await Test("receipt key retains exact schema and active gating with reversed columns",async()=>{
await CheckRelationship("zk_workspace",false,Parse("""{"SchemaName":"zk_other","KeyAttributes":["zk_operationid","zk_workspace"],"EntityKeyIndexStatus":"Active"}"""),true);
foreach(var status in new[]{"Pending","InProgress","Failed","active"}){
var key=Parse("""{"SchemaName":"zk_workspace_operation","KeyAttributes":["zk_operationid","zk_workspace"]}""");key["EntityKeyIndexStatus"]=status;
await CheckRelationship("zk_workspace",false,key,false,true);
}
});
await Test("generic metadata arrays remain ordered",()=>Reject(()=>{
ResourceEngine.RequireMatch(Parse("""{"KeyAttributes":["zk_operationid","zk_workspace"]}"""),Parse("""{"KeyAttributes":["zk_workspace","zk_operationid"]}"""));return Task.CompletedTask;
}));
await Test("backend creates prefixed package name and verifies canonical readback before reuse",async()=>{await CheckPackage(null,false);await CheckPackage("zk_Zunftkueche.Dataverse",false);});
await Test("backend rejects existing unprefixed different or missing package names without writes",async()=>{
foreach(var name in new[]{"Zunftkueche.Dataverse","zk_Other",""})await CheckPackage(name,true);
});
await Test("backend rejects missing malformed or different package files before further actions",async()=>{
foreach(var defect in new[]{"missing","malformed","short","oversize","different","error"})await CheckPackage("zk_Zunftkueche.Dataverse",true,defect);
});
async Task CheckPackage(string? existingName,bool reject,string? fileDefect=null) {
byte[] bytes=File.ReadAllBytes("server/artifacts/guard-wrapper-v2/Zunftkueche.Dataverse.1.0.0.nupkg");string content=Convert.ToBase64String(bytes);int reads=0,assemblyReads=0,fileReads=0;
JsonObject? stored=existingName==null?null:Package(existingName);
JsonObject Package(string name){var row=new JsonObject{["pluginpackageid"]="00000000-0000-0000-0000-000000000030",["uniquename"]="zk_Zunftkueche.Dataverse",["version"]="1.0.0",["content"]=null,["package"]=fileDefect=="missing"?null:fileDefect=="malformed"?"unsafe-id":"00000000-0000-0000-0000-000000000031",["statecode"]=0};if(name!="")row["name"]=name;return row;}
await CheckRelationship("zk_workspace",false,afterTables:async(p,f,e)=>{
f.PackageFile=id=>{fileReads++;Assert(id=="00000000-0000-0000-0000-000000000030");if(fileDefect=="error")throw new DeploymentException("http_404");var result=bytes.ToArray();if(fileDefect=="short")result=result[..^1];if(fileDefect=="oversize")result=[..result,0];if(fileDefect=="different")result[0]^=1;return Task.FromResult(result);};
if(reject){await Reject(()=>p.Backend(bytes,true));Assert(f.Writes==0&&reads==1&&assemblyReads==0);Assert(fileReads==(fileDefect is "short" or "oversize" or "different" or "error"?1:0));}
else{await p.Backend(bytes,true);Assert(f.Writes==(existingName==null?1:0)&&reads==(existingName==null?2:1)&&assemblyReads==1&&fileReads==1&&stored?["name"]?.GetValue<string>()=="zk_Zunftkueche.Dataverse");}
},backendTransport:(method,path,body)=>{
if(path.StartsWith("zk_kitchenworkspaces?"))return new JsonObject{["value"]=new JsonArray(new JsonObject{["zk_kitchenworkspaceid"]=Seed.WorkspaceId,["zk_revision"]=0})};
if(method==HttpMethod.Post){Assert(path=="pluginpackages");var expected=new JsonObject{["uniquename"]="zk_Zunftkueche.Dataverse",["name"]="zk_Zunftkueche.Dataverse",["version"]="1.0.0",["content"]=content};Assert(JsonNode.DeepEquals(body,expected));stored=Package("zk_Zunftkueche.Dataverse");return null;}
if(path=="pluginpackages?$filter=uniquename eq 'zk_Zunftkueche.Dataverse'"){reads++;return new JsonObject{["value"]=stored==null?new JsonArray():new JsonArray(stored.DeepClone())};}
if(path.StartsWith("pluginassemblies?")){assemblyReads++;return new JsonObject{["value"]=new JsonArray()};}
throw new Exception("Unexpected backend test request");
});
}
await Test("both APIs deep insert required descriptions and managed properties then reuse exact readback",()=>CheckApis(true));
await Test("both APIs reject each missing or drifted required field without writes",async()=>{
foreach(var api in new[]{"zk_KitchenLoad","zk_KitchenCommit"})foreach(var row in new[]{0,1,2})foreach(var field in new[]{"description","iscustomizable"})foreach(var missing in new[]{false,true})await CheckApis(false,api,row,field,missing);
});
async Task CheckApis(bool create,string? driftApi=null,int driftRow=0,string driftField="",bool missing=false) {
const string typeId="00000000-0000-0000-0000-000000000040";int posts=0,apiReads=0;
var bytes=File.ReadAllBytes("server/artifacts/guard-wrapper-v2/Zunftkueche.Dataverse.1.0.0.nupkg");
JsonObject Api(string name)=>new(){["customapiid"]="00000000-0000-0000-0000-000000000041",["uniquename"]=name,["name"]=name,["displayname"]=name,["description"]=name=="zk_KitchenLoad"?"Lädt den gemeinsamen Küchenbestand.":"Speichert eine geprüfte Änderung am Küchenbestand.",["iscustomizable"]=new JsonObject{["Value"]=false},["bindingtype"]=0,["isfunction"]=false,["isprivate"]=false,["allowedcustomprocessingsteptype"]=0,["workflowsdkstepenabled"]=false,["executeprivilegename"]=name=="zk_KitchenLoad"?"prvReadzk_kitchenworkspace":"prvWritezk_kitchenworkspace",["_plugintypeid_value"]=typeId,["boundentitylogicalname"]=null,["CustomAPIRequestParameters"]=new JsonArray(new JsonObject{["uniquename"]="RequestJson",["name"]=name+".RequestJson",["displayname"]="RequestJson",["type"]=10,["isoptional"]=false,["logicalentityname"]=null,["description"]="JSON-Anfrage für den Küchenbestand.",["iscustomizable"]=new JsonObject{["Value"]=false}}),["CustomAPIResponseProperties"]=new JsonArray(new JsonObject{["uniquename"]="ResultJson",["name"]=name+".ResultJson",["displayname"]="ResultJson",["type"]=10,["logicalentityname"]=null,["description"]="JSON-Ergebnis des Küchenvorgangs.",["iscustomizable"]=new JsonObject{["Value"]=false}})};
var stored=new Dictionary<string,JsonObject>();
if(!create)foreach(var name in new[]{"zk_KitchenLoad","zk_KitchenCommit"})stored[name]=Api(name);
if(driftApi!=null){var api=stored[driftApi];var row=driftRow==0?api:api[driftRow==1?"CustomAPIRequestParameters":"CustomAPIResponseProperties"]![0]!.AsObject();if(missing)row.Remove(driftField);else if(driftField=="description")row[driftField]="Ungeprüfte Beschreibung";else row[driftField]!["Value"]=true;}
JsonObject Rows(JsonObject? row)=>new(){["value"]=row==null?new JsonArray():new JsonArray(row.DeepClone())};
await CheckRelationship("zk_workspace",false,afterTables:async(p,f,e)=>{
f.PackageFile=_=>Task.FromResult(bytes);
async Task ThroughApis(){try{await p.Backend(bytes,true);throw new Exception("Expected boundary");}catch(DeploymentException error){Assert(error.Message=="test_after_apis");}}
if(driftApi!=null){try{await p.Backend(bytes,true);throw new Exception("Expected drift");}catch(DeploymentException error){Assert(error.Message is "resource_definition_drift" or "resource_definition_missing_field");}Assert(f.Writes==0&&posts==0&&apiReads==(driftApi=="zk_KitchenLoad"?1:2));}
else{await ThroughApis();await ThroughApis();Assert(posts==2&&f.Writes==2&&apiReads==6&&stored.Count==2);}
},backendTransport:(method,path,body)=>{
if(path.StartsWith("zk_kitchenworkspaces?"))return Rows(new JsonObject{["zk_kitchenworkspaceid"]=Seed.WorkspaceId,["zk_revision"]=0});
if(path.StartsWith("pluginpackages?"))return Rows(new JsonObject{["pluginpackageid"]="00000000-0000-0000-0000-000000000030",["uniquename"]="zk_Zunftkueche.Dataverse",["name"]="zk_Zunftkueche.Dataverse",["version"]="1.0.0",["statecode"]=0,["content"]=null,["package"]="00000000-0000-0000-0000-000000000031"});
if(path.StartsWith("pluginassemblies?"))return Rows(new JsonObject{["pluginassemblyid"]="00000000-0000-0000-0000-000000000032",["name"]="Kitchen.Dataverse",["isolationmode"]=2});
if(path.StartsWith("plugintypes?"))return Rows(new JsonObject{["plugintypeid"]=typeId});
if(path=="EntityDefinitions(LogicalName='zk_kitchenworkspace')?$select=Privileges")return new JsonObject{["Privileges"]=new JsonArray(new JsonObject{["PrivilegeType"]="Read",["Name"]="prvReadzk_kitchenworkspace"},new JsonObject{["PrivilegeType"]="Write",["Name"]="prvWritezk_kitchenworkspace"})};
if(path.StartsWith("customapis")){
if(method==HttpMethod.Post){Assert(path=="customapis");var name=body!["uniquename"]!.GetValue<string>();var expected=Api(name);expected.Remove("customapiid");expected.Remove("_plugintypeid_value");expected["PluginTypeId@odata.bind"]="/plugintypes("+typeId+")";Assert(JsonNode.DeepEquals(body,expected));posts++;stored[name]=Api(name);return null;}
var selected=path.Contains("'zk_KitchenLoad'")?"zk_KitchenLoad":"zk_KitchenCommit";Assert(path=="customapis?$filter=uniquename eq '"+selected+"'&$expand=CustomAPIRequestParameters,CustomAPIResponseProperties");apiReads++;return Rows(stored.GetValueOrDefault(selected));
}
if(path.StartsWith("sdkmessages?"))throw new DeploymentException("test_after_apis");
throw new Exception("Unexpected API fixture route");
});
}
async Task CheckRelationship(string? referencingAttribute,bool create,JsonObject? keyOverride=null,bool rejectKey=false,bool inactiveKey=false,Func<Provisioner,Fake,ResourceEngine,Task>? afterTables=null,Func<HttpMethod,string,JsonNode?,JsonNode?>? backendTransport=null) {
var contract=Provisioner.LoadContract("server/deployment/registration.json");
var relationship=Parse("""
{"SchemaName":"zk_kitchenworkspace_operations","ReferencedEntity":"zk_kitchenworkspace","ReferencedAttribute":"zk_kitchenworkspaceid","ReferencingEntity":"zk_kitchenoperation","ReferencingEntityNavigationPropertyName":"zk_workspace","CascadeConfiguration":{"Assign":"NoCascade","Delete":"Restrict","Merge":"NoCascade","Reparent":"NoCascade","Share":"NoCascade","Unshare":"NoCascade"}}
""");
if(referencingAttribute!=null)relationship["ReferencingAttribute"]=referencingAttribute;
bool exists=!create;int lookupReads=0,keyReads=0;
JsonNode Rows(JsonObject? row)=>new JsonObject{["value"]=row==null?new JsonArray():new JsonArray(row.DeepClone())};
var f=Fixture(null,(method,path,body)=>{
if(backendTransport!=null&&(path.StartsWith("plugin")||path.StartsWith("zk_kitchenworkspaces?")||path.StartsWith("customapis")||path.StartsWith("sdkmessages?")||path=="EntityDefinitions(LogicalName='zk_kitchenworkspace')?$select=Privileges"))return Task.FromResult(backendTransport(method,path,body));
if(method==HttpMethod.Post){
var payload=body!.AsObject();
Assert(path=="RelationshipDefinitions"&&!payload.ContainsKey("ReferencingAttribute"));
Assert(payload["Lookup"]!["SchemaName"]!.GetValue<string>()=="zk_workspace"&&payload["Lookup"]!["@odata.type"]!.GetValue<string>()=="Microsoft.Dynamics.CRM.LookupAttributeMetadata");
Assert(payload["Lookup"]!["RequiredLevel"]!["Value"]!.GetValue<string>()=="ApplicationRequired");
var endpoints=relationship.DeepClone().AsObject();endpoints.Remove("ReferencingAttribute");
ResourceEngine.RequireMatch(payload,endpoints);
exists=true;return Task.FromResult<JsonNode?>(null);
}
JsonObject row;
if(path.StartsWith("publishers?"))row=Parse("""{"publisherid":"00000000-0000-0000-0000-000000000020","uniquename":"zk_Zunftkueche","customizationprefix":"zk","customizationoptionvalueprefix":72700}""");
else if(path.StartsWith("solutions?"))row=new JsonObject{["solutionid"]="00000000-0000-0000-0000-000000000021",["uniquename"]=Target.Solution,["version"]="1.0.0.0",["ismanaged"]=false,["_publisherid_value"]="00000000-0000-0000-0000-000000000020"};
else if(path.StartsWith("solutioncomponents?"))row=new JsonObject();
else if(path.StartsWith("RelationshipDefinitions/"))return Task.FromResult<JsonNode?>(Rows(exists?relationship:null));
else {
var table=contract["tables"]!.AsArray().Single(t=>path.Contains("'"+t!["logicalName"]!.GetValue<string>()+"'"))!;
var name=table["logicalName"]!.GetValue<string>();
if(path.StartsWith("EntityDefinitions?$filter="))row=new JsonObject{["MetadataId"]="00000000-0000-0000-0000-000000000022",["SchemaName"]=name,["LogicalName"]=name,["OwnershipType"]=table["ownershipType"]!.DeepClone(),["IsActivity"]=false,["IsOptimisticConcurrencyEnabled"]=true,["TableType"]="Standard",["PrimaryNameAttribute"]="zk_name",["PrimaryIdAttribute"]=name+"id",["EntitySetName"]=name+"s"};
else if(path.Contains("/Keys?")){keyReads++;row=keyOverride?.DeepClone().AsObject()??Parse("""{"SchemaName":"zk_workspace_operation","KeyAttributes":["zk_workspace","zk_operationid"],"EntityKeyIndexStatus":"Active"}""");}
else {
var attr=table["attributes"]!.AsArray().Single(a=>path.EndsWith("'"+a!["name"]!.GetValue<string>()+"'"))!;
if(attr["type"]!.GetValue<string>()=="Lookup")lookupReads++;
row=Metadata.AttributeExpected(attr,attr["name"]!.GetValue<string>()=="zk_name");
}
}
return Task.FromResult<JsonNode?>(Rows(row));
});
var engine=new ResourceEngine(f);await engine.AuthenticateTargetAsync();var provisioner=new Provisioner(engine,f,contract);
if(afterTables!=null){await provisioner.Tables(true);Assert(f.Writes==0&&provisioner.Gaps.Count==0);await afterTables(provisioner,f,engine);}
else if(keyOverride!=null){
if(rejectKey)await Reject(()=>provisioner.Tables(true));
else {await provisioner.Tables(true);Assert(inactiveKey?provisioner.Gaps.SequenceEqual(new[]{"alternate_key_not_active"}):provisioner.Gaps.Count==0);}
Assert(f.Writes==0&&lookupReads==1&&keyReads==1);
}
else if(create){await provisioner.Tables(true);await provisioner.Tables(true);Assert(provisioner.Gaps.Count==0&&f.Writes==1&&lookupReads==2&&keyReads==2);}
else {await Reject(()=>provisioner.Tables(true));Assert(f.Writes==0&&lookupReads==0&&keyReads==0);
Assert(System.Text.Json.JsonSerializer.Serialize(engine.Resources).Contains("$.ReferencingAttribute"));}
}
Console.WriteLine($"{passed} passed; {failed} failed");return failed==0?0:1;
Fake Fixture(JsonObject? data, Func<HttpMethod,string,JsonNode?,Task<JsonNode?>>? other=null)=>new((m,p,b)=>{
 if(p=="WhoAmI")return Task.FromResult<JsonNode?>(Parse($"{{\"OrganizationId\":\"{Target.Organization}\",\"UserId\":\"00000000-0000-0000-0000-000000000002\"}}"));
 if(p.StartsWith("systemusers("))return Task.FromResult<JsonNode?>(Parse($"{{\"domainname\":\"{Target.User}\",\"isdisabled\":false,\"azureactivedirectoryobjectid\":\"00000000-0000-0000-0000-000000000003\"}}"));
 if(p.StartsWith("organizations("))return Task.FromResult<JsonNode?>(Parse("{\"languagecode\":1031,\"_basecurrencyid_value\":\"00000000-0000-0000-0000-000000000004\"}"));
 if(p.StartsWith("transactioncurrencies("))return Task.FromResult<JsonNode?>(Parse("{\"isocurrencycode\":\"EUR\"}"));
 if(p.StartsWith("EntityDefinitions?$select=TableType&"))return Task.FromResult<JsonNode?>(Parse("{\"value\":[{\"TableType\":\"Standard\"}]}"));
 if(p.StartsWith("sdkmessageprocessingsteps?$select="))return Task.FromResult<JsonNode?>(Parse("{\"value\":[]}"));
 return other!=null?other(m,p,b):Task.FromResult<JsonNode?>(data!.DeepClone());});
sealed class Fake(Func<HttpMethod,string,JsonNode?,Task<JsonNode?>> handle):IDataverseTransport {public int Writes; public Func<string,Task<byte[]>>? PackageFile; public Task<byte[]> ReadPackageFileAsync(string id)=>PackageFile?.Invoke(id)??throw new DeploymentException("package_file_download_unavailable"); public Task<JsonNode?> SendAsync(HttpMethod m,string p,JsonNode? b=null){if(m!=HttpMethod.Get)Writes++;return handle(m,p,b);}}

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

sealed class ResponseHandler(Func<HttpResponseMessage> response,Action<HttpRequestMessage>? inspect=null):HttpMessageHandler {
 protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken cancellationToken){inspect?.Invoke(request);return Task.FromResult(response());}
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
