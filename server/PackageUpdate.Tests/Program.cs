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
Console.WriteLine($"{passed} passed; {failed} failed");return failed==0?0:1;
sealed class Fake(string scenario):HttpMessageHandler {
 public const string ObjectId="00000000-0000-0000-0000-000000000001";
 const string Actor="00000000-0000-0000-0000-000000000002",Currency="00000000-0000-0000-0000-000000000003";
 public int Writes,FileReads,PostWriteReads;public bool SafeMutation=true;
 readonly byte[] prior=File.ReadAllBytes(Profiles.PriorPath),current=File.ReadAllBytes(Profiles.CurrentPath);
 protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken cancellationToken) {
  string path=request.RequestUri!.PathAndQuery[("/api/data/v9.2/").Length..];
  if(request.RequestUri.Host!=new Uri(Target.Url).Host)throw new Exception("bad_host");
  if(request.Method==HttpMethod.Patch){
   Writes++;var body=JsonNode.Parse(await request.Content!.ReadAsStringAsync())!.AsObject();
   SafeMutation &= path==$"pluginpackages({FixedPackageUpdater.PackageId})"&&request.Headers.IfMatch.Single().ToString()=="W/\"12345\""&&body.Count==1&&body["content"]!.GetValue<string>()==Convert.ToBase64String(current);
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
