using System.Net;
using System.Text.Json.Nodes;
using Kitchen.Deploy;
using Kitchen.PackageUpdate;
int passed=0,failed=0;
void Assert(bool value){if(!value)throw new Exception("assertion_failed");}
async Task Test(string name,Func<Task> test){try{await test();passed++;Console.WriteLine("PASS "+name);}catch{failed++;Console.WriteLine("FAIL "+name);}}
await Test("pinned local artifacts and source validated offline",()=>{Profiles.ValidateLocal();return Task.CompletedTask;});
foreach(var scenario in new[]{"old","new","ambiguous_new","refused_old","unconfirmed","missing","wrong_name","wrong_unique","wrong_version","inactive","no_file","bad_hash","bad_identity","bad_object","bad_language","bad_currency","no_concurrency","bad_etag","large","redirect","no_length_large","missing_after","repeat"}) {
 await Test("fixed package update "+scenario,async()=>{
  using var handler=new Fake(scenario);using var updater=new FixedPackageUpdater(()=>Task.FromResult("synthetic-token"),Fake.ObjectId,handler);
  string? result=null;try{result=await updater.ExecuteAsync();}catch{ }
  int expectedWrites=scenario is "old" or "ambiguous_new" or "refused_old" or "unconfirmed" or "missing_after" or "repeat"?1:0;
  Assert(handler.Writes==expectedWrites);
  Assert(result==(scenario is "old" or "ambiguous_new" or "repeat"?"updated_exact":scenario=="new"?"already_current":scenario=="refused_old"?"unchanged_prior":scenario is "unconfirmed" or "missing_after"?"unconfirmed":null));
  if(expectedWrites==1)Assert(handler.FileReads==(scenario=="missing_after"?1:2)&&handler.PostWriteReads>=1);
  if(scenario=="repeat") { try { await updater.ExecuteAsync(); throw new Exception("allowed_repeat"); } catch(Kitchen.Deploy.DeploymentException) { } Assert(handler.Writes==1); }
  Assert(handler.SafeMutation);
 });
}
await Test("updater rejects non-fixed routes and mutations without acquiring token",async()=>{
 int tokens=0;using var handler=new Fake("old");using var updater=new FixedPackageUpdater(()=>{tokens++;return Task.FromResult("synthetic-token");},Fake.ObjectId,handler);
 foreach(var path in new[]{"https://evil.invalid/", "pluginpackages", "../WhoAmI", "WhoAmI#secret", "pluginpackages(00000000-0000-0000-0000-000000000001)"}){
  try{await updater.SendAsync(HttpMethod.Get,path);throw new Exception("allowed_path");}catch(DeploymentException){ }
 }
 try{await updater.SendAsync(HttpMethod.Patch,"WhoAmI",new JsonObject());throw new Exception("allowed_mutation");}catch(DeploymentException){ }
 Assert(tokens==0&&handler.Writes==0);
});
await Test("changed source or artifact blocks before authentication or network",async()=>{
 string original=Directory.GetCurrentDirectory(),scratch=Path.Combine(Path.GetTempPath(),"kitchen-package-test-"+Guid.NewGuid().ToString("N"));
 string[] paths=new[]{Profiles.PriorPath,Profiles.CurrentPath,Profiles.SourceManifest}.Concat(File.ReadAllLines(Profiles.SourceManifest).Select(l=>l[66..])).ToArray();
 foreach(string relative in paths){var path=Path.Combine(scratch,relative);Directory.CreateDirectory(Path.GetDirectoryName(path)!);File.Copy(relative,path);}
 try {
  Directory.SetCurrentDirectory(scratch);
  foreach(string relative in new[]{Profiles.PriorPath,Profiles.CurrentPath,Profiles.SourceManifest,"server/Plugins.cs"}) {
   var originalBytes=File.ReadAllBytes(relative);var modified=originalBytes.ToArray();modified[0]^=1;File.WriteAllBytes(relative,modified);
   int tokens=0;using var handler=new Fake("old");using var updater=new FixedPackageUpdater(()=>{tokens++;return Task.FromResult("synthetic-token");},Fake.ObjectId,handler);
   bool blocked=false;try{await updater.ExecuteAsync();}catch{blocked=true;}
   Assert(blocked&&tokens==0&&handler.Writes==0);File.WriteAllBytes(relative,originalBytes);
  }
 } finally {Directory.SetCurrentDirectory(original);Directory.Delete(scratch,true);}
});
await Test("PATCH facts preserve numeric status and code without remote message text",async()=>{
 foreach(var status in new[]{400,412,500,204}) {
  using var handler=new Fake("refused_old"){PatchResponse=()=>new((HttpStatusCode)status){Content=new StringContent("{\"error\":{\"code\":\"0x80040265\",\"message\":\"private-token private-url private-etag\"}}")}};
  using var updater=new FixedPackageUpdater(()=>Task.FromResult("synthetic-token"),Fake.ObjectId,handler);
  Assert(await updater.ExecuteAsync()=="unchanged_prior");
  var diagnostic=System.Text.Json.JsonSerializer.SerializeToNode(updater)!["PatchDiagnostic"];
  Assert(diagnostic?["HttpStatus"]?.GetValue<int>()==status);
  Assert(diagnostic?["DataverseCode"]?.GetValue<string>()==(status==204?null:"0x80040265"));
  Assert(diagnostic?["TransportFailure"]==null&&!diagnostic!.ToJsonString().Contains("private"));
  Assert(handler.Writes==1&&handler.FileReads==2&&handler.SafeMutation);
 }
});
await Test("malformed bounded PATCH diagnostics never prevent independent readback",async()=>{
 foreach(var body in new[]{"{invalid", "{}", "{\"error\":{\"code\":123}}", "{\"error\":{\"code\":\"0x80040265private\"}}", "{\"error\":{\"code\":\"0x80040265\",\"code\":\"0x80040265\"}}", "{\"error\":{},\"error\":{\"code\":\"0x80040265\"}}", new string('[',20)+new string(']',20), new string('x',9000)}) {
  using var handler=new Fake("refused_old"){PatchResponse=()=>new(HttpStatusCode.BadRequest){Content=new StringContent(body)}};
  using var updater=new FixedPackageUpdater(()=>Task.FromResult("synthetic-token"),Fake.ObjectId,handler);
  Assert(await updater.ExecuteAsync()=="unchanged_prior");
  var diagnostic=System.Text.Json.JsonSerializer.SerializeToNode(updater)!["PatchDiagnostic"];
  Assert(diagnostic?["HttpStatus"]?.GetValue<int>()==400&&diagnostic?["DataverseCode"]==null&&handler.Writes==1&&handler.FileReads==2);
 }
 using var stream=new DiagnosticStream(new byte[20000]);
 using var largeHandler=new Fake("refused_old"){PatchResponse=()=>new(HttpStatusCode.BadRequest){Content=new StreamContent(stream)}};
 using var largeUpdater=new FixedPackageUpdater(()=>Task.FromResult("synthetic-token"),Fake.ObjectId,largeHandler);
 Assert(await largeUpdater.ExecuteAsync()=="unchanged_prior"&&stream.ReadBytes<=8193&&largeHandler.FileReads==2);
});
await Test("fixed transport failure labels and absent PATCH do not fabricate status",async()=>{
 foreach(var entry in new[]{(new TaskCanceledException("private-token") as Exception,"timeout"),(new HttpRequestException("private-token") as Exception,"network_error")}) {
  using var handler=new Fake("refused_old"){PatchException=entry.Item1};
  using var updater=new FixedPackageUpdater(()=>Task.FromResult("synthetic-token"),Fake.ObjectId,handler);
  Assert(await updater.ExecuteAsync()=="unchanged_prior");
  var diagnostic=System.Text.Json.JsonSerializer.SerializeToNode(updater)!["PatchDiagnostic"];
  Assert(diagnostic?["HttpStatus"]==null&&diagnostic?["DataverseCode"]==null&&diagnostic?["TransportFailure"]?.GetValue<string>()==entry.Item2&&handler.Writes==1&&handler.FileReads==2);
 }
 using var readHandler=new Fake("refused_old"){PatchResponse=()=>new(HttpStatusCode.BadRequest){Content=new StreamContent(new DiagnosticStream([],true))}};
 using var readUpdater=new FixedPackageUpdater(()=>Task.FromResult("synthetic-token"),Fake.ObjectId,readHandler);
 Assert(await readUpdater.ExecuteAsync()=="unchanged_prior");
 var failedRead=System.Text.Json.JsonSerializer.SerializeToNode(readUpdater)!["PatchDiagnostic"];
 Assert(failedRead?["HttpStatus"]?.GetValue<int>()==400&&failedRead?["TransportFailure"]?.GetValue<string>()=="response_read_failed"&&readHandler.FileReads==2);
 using var handlerNew=new Fake("new");using var updaterNew=new FixedPackageUpdater(()=>Task.FromResult("synthetic-token"),Fake.ObjectId,handlerNew);
 Assert(await updaterNew.ExecuteAsync()=="already_current"&&handlerNew.Writes==0);
 var absent=System.Text.Json.JsonSerializer.SerializeToNode(updaterNew)!["PatchDiagnostic"];
 Assert(absent!=null&&absent["HttpStatus"]==null&&absent["DataverseCode"]==null&&absent["TransportFailure"]==null);
});
async Task<JsonNode> PatchFacts(string body,int status=400) {
 using var handler=new Fake("refused_old"){PatchResponse=()=>new((HttpStatusCode)status){Content=new StringContent(body)}};
 using var updater=new FixedPackageUpdater(()=>Task.FromResult("synthetic-token"),Fake.ObjectId,handler);
 Assert(await updater.ExecuteAsync()=="unchanged_prior"&&handler.Writes==1&&handler.FileReads==2&&handler.SafeMutation);
 Assert(handler.Prefer=="odata.include-annotations=\"Microsoft.PowerApps.CDS.ErrorDetails.OperationStatus,Microsoft.PowerApps.CDS.ErrorDetails.SubErrorCode\"");
 return System.Text.Json.JsonSerializer.SerializeToNode(updater)!["PatchDiagnostic"]!;
}
await Test("package PATCH reports only reviewed lexical labels and known numeric annotations",async()=>{
 var result=await PatchFacts("""{"error":{"code":"0x80040265","message":"Invalid NuGet package unique name prefix publisher version mismatch update upgrade existing same different immutable concurrency rowversion etag precondition match support unsupported. private-token https://private.example private-etag","innererror":{"message":"ASSEMBLY not supported; dependency references missing. Newtonsoft SDK unsigned signature. not found. not allowed."},"@Microsoft.PowerApps.CDS.ErrorDetails.OperationStatus":"1","@Microsoft.PowerApps.CDS.ErrorDetails.SubErrorCode":-2147220891,"@Microsoft.PowerApps.CDS.TraceText":"private-trace zip"}}""");
 var flags=result["Flags"]!.AsArray().Select(v=>v!.GetValue<string>()).ToArray();
 foreach(var expected in new[]{"invalid","nuget","package","unique","name","prefix","publisher","version","mismatch","update","upgrade","existing","same","different","immutable","concurrency","rowversion","etag","precondition","match","support","unsupported","assembly","not_supported","dependency","references","missing","newtonsoft","sdk","unsigned","signature","not_found","not_allowed"})Assert(flags.Contains(expected));
 Assert(flags.SequenceEqual(flags.Distinct().Order(StringComparer.Ordinal))&&!flags.Contains("zip"));
 Assert(result["OperationStatus"]!.GetValue<int>()==1&&result["SubErrorCode"]!.GetValue<int>()==-2147220891);
 foreach(var secret in new[]{"private","https","Bearer","token"})Assert(!result.ToJsonString().Contains(secret));
});
await Test("numeric package annotations require canonical Int32 and other fields are not scanned",async()=>{
 foreach(var number in new[]{int.MinValue,0,int.MaxValue}){
  var body=new JsonObject{["error"]=new JsonObject{["code"]="0x80040265",["@Microsoft.PowerApps.CDS.ErrorDetails.OperationStatus"]=number,["@Microsoft.PowerApps.CDS.ErrorDetails.SubErrorCode"]=number.ToString(System.Globalization.CultureInfo.InvariantCulture)}};
  var result=await PatchFacts(body.ToJsonString());Assert(result["OperationStatus"]!.GetValue<int>()==number&&result["SubErrorCode"]!.GetValue<int>()==number);
 }
 foreach(var bad in new[]{"2147483648","-2147483649","1.5","\"+1\"","\" 1\"","\"01\"","\"1 private\"","true","{}","null"}){
  var body=JsonNode.Parse("""{"error":{"code":"0x80040265","message":123,"innererror":{"message":false,"innererror":{"message":"invalid zip"}},"@Microsoft.PowerApps.CDS.TraceText":"invalid zip","name":"invalid nuget"}}""")!;
  body["error"]!["@Microsoft.PowerApps.CDS.ErrorDetails.OperationStatus"]=JsonNode.Parse(bad);body["error"]!["@Microsoft.PowerApps.CDS.ErrorDetails.SubErrorCode"]=JsonNode.Parse(bad);
  var result=await PatchFacts(body.ToJsonString());Assert(result["Flags"]!.AsArray().Count==0&&result["OperationStatus"]==null&&result["SubErrorCode"]==null);
 }
});
await Test("duplicate relevant package paths suppress all additive facts while retaining safe code",async()=>{
 foreach(var extra in new[]{"\"message\":\"invalid\",\"message\":\"assembly\"","\"innererror\":{},\"innererror\":{\"message\":\"invalid\"}","\"innererror\":{\"message\":\"invalid\",\"message\":\"assembly\"}","\"@Microsoft.PowerApps.CDS.ErrorDetails.OperationStatus\":1,\"@Microsoft.PowerApps.CDS.ErrorDetails.OperationStatus\":2","\"@Microsoft.PowerApps.CDS.ErrorDetails.SubErrorCode\":1,\"@Microsoft.PowerApps.CDS.ErrorDetails.SubErrorCode\":2"}){
  var result=await PatchFacts("{\"error\":{\"code\":\"0x80040265\","+extra+"}}");Assert(result["DataverseCode"]!.GetValue<string>()=="0x80040265"&&result["Flags"]!.AsArray().Count==0&&result["OperationStatus"]==null&&result["SubErrorCode"]==null);
 }
 foreach(var bounded in new[]{new JsonObject{["error"]=new JsonObject{["code"]="0x80040265",["message"]="invalid nuget "+new string('x',9000)}}.ToJsonString(),"{\"error\":{\"code\":\"0x80040265\",\"message\":\"invalid nuget\",\"deep\":"+new string('[',20)+"0"+new string(']',20)+"}}"}){
  var rejected=await PatchFacts(bounded);Assert(rejected["HttpStatus"]!.GetValue<int>()==400&&rejected["DataverseCode"]==null&&rejected["Flags"]!.AsArray().Count==0&&rejected["OperationStatus"]==null&&rejected["SubErrorCode"]==null);
 }
 var success=await PatchFacts("""{"error":{"code":"0x80040265","message":"invalid zip","@Microsoft.PowerApps.CDS.ErrorDetails.OperationStatus":1}}""",204);
 Assert(success["Flags"]!.AsArray().Count==0&&success["OperationStatus"]==null);
});
Console.WriteLine($"{passed} passed; {failed} failed");return failed==0?0:1;
sealed class Fake(string scenario):HttpMessageHandler {
 public const string ObjectId="00000000-0000-0000-0000-000000000001";
 const string Actor="00000000-0000-0000-0000-000000000002",Currency="00000000-0000-0000-0000-000000000003";
 public string? Prefer;
 public Func<HttpResponseMessage>? PatchResponse;public Exception? PatchException;
 public int Writes,FileReads,PostWriteReads;public bool SafeMutation=true;
 readonly byte[] prior=File.ReadAllBytes(Profiles.PriorPath),current=File.ReadAllBytes(Profiles.CurrentPath);
 protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken cancellationToken) {
  string path=request.RequestUri!.PathAndQuery[("/api/data/v9.2/").Length..];
  if(request.RequestUri.Host!=new Uri(Target.Url).Host)throw new Exception("bad_host");
  if(request.Method==HttpMethod.Patch){
   Writes++;Prefer=request.Headers.TryGetValues("Prefer",out var preferences)?string.Join("",preferences):null;var body=JsonNode.Parse(await request.Content!.ReadAsStringAsync())!.AsObject();
   SafeMutation &= path==$"pluginpackages({FixedPackageUpdater.PackageId})"&&request.Headers.IfMatch.Single().ToString()=="W/\"12345\""&&body.Count==1&&body["content"]!.GetValue<string>()==Convert.ToBase64String(current);
   if(PatchException!=null)throw PatchException;
   if(PatchResponse!=null)return PatchResponse();
   if(scenario=="ambiguous_new")throw new TaskCanceledException("private-token");
   return new(scenario=="refused_old"?HttpStatusCode.BadRequest:HttpStatusCode.NoContent);
  }
  if(request.Method!=HttpMethod.Get)throw new Exception("unexpected_write");
  if(Writes>0)PostWriteReads++;
  if(path=="WhoAmI")return Json(new JsonObject{["OrganizationId"]=scenario=="bad_identity"?Actor:Target.Organization,["UserId"]=Actor});
  if(path.StartsWith("systemusers("))return Json(new JsonObject{["domainname"]=Target.User,["isdisabled"]=false,["azureactivedirectoryobjectid"]=scenario=="bad_object"?Actor:ObjectId});
  if(path.StartsWith("organizations("))return Json(new JsonObject{["languagecode"]=scenario=="bad_language"?1033:1031,["_basecurrencyid_value"]=Currency});
  if(path.StartsWith("transactioncurrencies("))return Json(new JsonObject{["isocurrencycode"]=scenario=="bad_currency"?"USD":"EUR"});
  if(path.StartsWith("EntityDefinitions("))return Json(new JsonObject{["IsOptimisticConcurrencyEnabled"]=scenario!="no_concurrency"});
  if(path==$"pluginpackages({FixedPackageUpdater.PackageId})/package/$value"){
   FileReads++;byte[] bytes=scenario=="new"||(Writes>0&&scenario!="refused_old")?current:prior;
   if(scenario=="bad_hash"||(scenario=="unconfirmed"&&Writes>0)){bytes=bytes.ToArray();bytes[0]^=1;}
   if(scenario is "large" or "no_length_large")bytes=new byte[500000];
   if(scenario=="no_length_large")return new(HttpStatusCode.OK){Content=new StreamContent(new UnboundedStream(bytes))};
   return new(scenario=="redirect"?HttpStatusCode.Redirect:HttpStatusCode.OK){Content=new ByteArrayContent(bytes)};
  }
  if(path.StartsWith($"pluginpackages({FixedPackageUpdater.PackageId})")){
   if(scenario=="missing"||(scenario=="missing_after"&&Writes>0))return new(HttpStatusCode.NotFound);
   return Json(new JsonObject{["pluginpackageid"]=FixedPackageUpdater.PackageId,["name"]=scenario=="wrong_name"?"wrong":"zk_Zunftkueche.Dataverse",["uniquename"]=scenario=="wrong_unique"?"wrong":"zk_Zunftkueche.Dataverse",["version"]=scenario=="wrong_version"?"2.0.0":"1.0.0",["statecode"]=scenario=="inactive"?1:0,["package"]=scenario=="no_file"?null:Currency,["@odata.etag"]=scenario=="bad_etag"?"private-etag":"W/\"12345\""});
  }
  throw new Exception("unexpected_path");
 }
 static HttpResponseMessage Json(JsonObject value)=>new(HttpStatusCode.OK){Content=new StringContent(value.ToJsonString())};
}

sealed class UnboundedStream(byte[] bytes):MemoryStream(bytes) { public override bool CanSeek=>false; }

sealed class DiagnosticStream(byte[] bytes,bool fail=false):MemoryStream(bytes) {
 public int ReadBytes;public override bool CanSeek=>false;
 public override ValueTask<int> ReadAsync(Memory<byte> buffer,CancellationToken cancellationToken=default) {
  if(fail)throw new IOException("private-token");
  int count=base.Read(buffer.Span);ReadBytes+=count;return ValueTask.FromResult(count);
 }
}
