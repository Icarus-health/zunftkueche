using System.Text.Json.Nodes;
using Kitchen.Acceptance;
using Kitchen.Deploy;
int passed=0,failed=0;
void Assert(bool value) {if(!value)throw new Exception("assertion_failed");}
async Task Test(string name,Func<Task> test) {try{await test();Console.WriteLine("PASS "+name);passed++;}catch(Exception e){Console.WriteLine("FAIL "+name+" "+e.GetType().Name);failed++;}}
await Test("both tables have bounded complete 13-route denial plans",()=>{
 foreach(var t in new[]{"zk_kitchenworkspace","zk_kitchenoperation"}) {
  var probes=Scope.Probes(t,t+"s",Guid.Parse("00000000-0000-0000-0000-000000000001"));
  Assert(probes.Count==13);
  Assert(probes.All(p=>!p.Path.Contains(Seed.WorkspaceId)&&!(p.Body??"").Contains(Seed.WorkspaceId)));
  foreach(var name in new[]{"CreateMultiple","UpdateMultiple"}) {
   var bulk=probes.Where(p=>p.Path.EndsWith("/Microsoft.Dynamics.CRM."+name)).ToArray();
   Assert(bulk.Length==2);
   Assert(bulk.Select(p=>JsonNode.Parse(p.Body!)!["Targets"]!.AsArray().Count).Order().SequenceEqual(new[]{1,2}));
   Assert(bulk.All(p=>JsonNode.Parse(p.Body!)!["Targets"]!.AsArray().All(n=>n!["@odata.type"]!.GetValue<string>()=="Microsoft.Dynamics.CRM."+t)));
  }
  Assert(probes.Single(p=>p.Check.EndsWith("delete_multiple")).Unsupported);
 }
 return Task.CompletedTask;
});
async Task Reject(Func<Task> run){try{await run();}catch(Exception e)when(e is AcceptanceFault or DeploymentException){return;}throw new Exception("unsafe_acceptance");}
await Test("offline default and all unexecuted phases cannot authenticate",async()=>{
 Assert(!AcceptanceOptions.Parse([]).Execute&&AcceptanceOptions.Parse([]).Phase=="inspect");
 foreach(var phase in new[]{"inspect","prepare-canaries","runtime"})Assert(!AcceptanceOptions.Parse(["--phase",phase]).Execute);
 await Reject(()=>{AcceptanceOptions.Parse(["--phase","runtime","--url","https://evil.example"]);return Task.CompletedTask;});
 await Reject(()=>{AcceptanceOptions.Parse(["--phase","cleanup"]);return Task.CompletedTask;});
 await Reject(()=>{AcceptanceOptions.Parse(["--phase","runtime","--phase","inspect"]);return Task.CompletedTask;});
});
await Test("wrong organization object language or currency stops before writes",async()=>{
 foreach(var defect in new[]{"organization","object","language","currency"}){
  var f=new PreflightFake{WrongOrganization=defect=="organization",WrongObject=defect=="object",WrongLanguage=defect=="language",WrongCurrency=defect=="currency"};
  await Reject(()=>f.Session().RunAsync("prepare-canaries"));Assert(f.Writes==0);
 }
});
await Test("present guards or elastic tables stop canary preparation before writes",async()=>{
 foreach(var guards in new[]{true,false}){var f=new PreflightFake{Guards=guards,Elastic=!guards};await Reject(()=>f.Session().RunAsync("prepare-canaries"));Assert(f.Writes==0);}
});
await Test("canary creation posts exactly four fixed rows readbacks and reuses exact rows",async()=>{
 var f=new PreflightFake();await f.Session().RunAsync("prepare-canaries");Assert(f.Writes==4&&f.Rows.Count==4);
 Assert(f.Calls.Where(c=>c.Method==HttpMethod.Post).All(c=>!c.Body!.Contains(Seed.WorkspaceId)));
 Assert(f.Rows.Where(p=>p.Key.StartsWith("zk_kitchenworkspaces")).All(p=>p.Value["zk_state"]!.GetValue<string>()==Scope.MarkerState));
 await f.Session().RunAsync("prepare-canaries");Assert(f.Writes==4);
});
await Test("ambiguous canary create independently reads back and stops without retry",async()=>{
 foreach(var invisible in new[]{true,false}){
  var f=new PreflightFake{AmbiguousCreate=true,CreateInvisible=invisible};var session=f.Session();await Reject(()=>session.RunAsync("prepare-canaries"));
  Assert(f.Writes==1&&f.Calls.Last().Method==HttpMethod.Get&&!session.Evidence.RootReleaseAllowed);
 }
});
await Test("successful create without independent row stops after one POST",async()=>{
 var f=new PreflightFake{CreateInvisible=true};await Reject(()=>f.Session().RunAsync("prepare-canaries"));Assert(f.Writes==1);
});
await Test("existing canary drift is never overwritten",async()=>{
 var f=new PreflightFake();await f.Session().RunAsync("prepare-canaries");f.Calls.Clear();f.Rows.Values.First()["zk_name"]="unexpected";
 await Reject(()=>f.Session().RunAsync("prepare-canaries"));Assert(f.Writes==0);
});
await Test("strict guards reject missing extra inactive impersonating or duplicate binding",async()=>{
 const string handler="00000000-0000-0000-0000-000000000010";
 JsonObject[] Steps()=>new[]{Scope.Workspace,Scope.Operation}.SelectMany((t,i)=>new[]{"Create","Update","Delete"}.Select((m,j)=>new JsonObject{
  ["sdkmessageprocessingstepid"]=new Guid(i*3+j+1,0,0,new byte[8]).ToString("D"),["_eventhandler_value"]=handler,
  ["_sdkmessagefilterid_value"]=new Guid(i*3+j+20,0,0,new byte[8]).ToString("D"),["_sdkmessageid_value"]=new Guid(j+30,0,0,new byte[8]).ToString("D"),
  ["sdkmessagefilterid"]=new JsonObject{["primaryobjecttypecode"]=t},["sdkmessageid"]=new JsonObject{["name"]=m},
  ["stage"]=20,["mode"]=0,["rank"]=1,["statecode"]=0,["supporteddeployment"]=0,["filteringattributes"]=null,["_impersonatinguserid_value"]=null})).ToArray();
 Checks.GuardSet(Steps(),handler);
 foreach(var defect in new[]{"missing","extra","inactive","impersonation","duplicate","bulk"}){
  var rows=Steps();if(defect=="missing")rows=rows[..5];if(defect=="extra")rows=rows.Append(rows[0].DeepClone().AsObject()).ToArray();
  if(defect=="inactive")rows[0]["statecode"]=1;if(defect=="impersonation")rows[0]["_impersonatinguserid_value"]=handler;
  if(defect=="duplicate")rows[1]["sdkmessageid"]!["name"]="Create";if(defect=="bulk")rows[0]["sdkmessageid"]!["name"]="CreateMultiple";
  await Reject(()=>{Checks.GuardSet(rows,handler);return Task.CompletedTask;});
 }
});
await Test("guard denial requires unchanged snapshot and known plugin rejection",async()=>{
 var probe=Scope.Probes(Scope.Workspace,"zk_kitchenworkspaces",PreflightFake.Actor).First();
 var f=new Fake(p=>Task.FromResult(new Outcome(400,null,GuardDenied:true)));var e=new Evidence();
 await Checks.Denial(f,probe,()=>Task.FromResult(new Fingerprint(new string('a',64),2,7)),e);Assert(e.Checks.All(c=>c.Passed)&&f.Calls.Count==1);
 foreach(var defect in new[]{"success","acl","unknown","changed"}){
  int reads=0;var outcome=defect=="success"?new Outcome(204,null):defect=="acl"?new Outcome(403,null):defect=="unknown"?new Outcome(500,null):new Outcome(400,null,true);
  var bad=new Fake(p=>Task.FromResult(outcome));var evidence=new Evidence();
  await Reject(()=>Checks.Denial(bad,probe,()=>Task.FromResult(new Fingerprint(defect=="changed"&&reads++>0?new string('b',64):new string('a',64),2,7)),evidence));
  Assert(bad.Calls.Count==1&&!evidence.RootReleaseAllowed&&evidence.Stopped);
 }
});
await Test("ambiguous denial performs independent readback then stops",async()=>{
 int reads=0;var fake=new Fake(p=>throw new TaskCanceledException("Bearer secret"));var e=new Evidence();
 await Reject(()=>Checks.Denial(fake,Scope.Probes(Scope.Workspace,"zk_kitchenworkspaces",PreflightFake.Actor).First(),()=>{reads++;return Task.FromResult(new Fingerprint(new string('a',64),2,0));},e));
 Assert(reads==2&&fake.Calls.Count==1&&e.Stopped);
});
await Test("standard DeleteMultiple requires explicit provider unsupported refusal",async()=>{
 var probe=Scope.Probes(Scope.Operation,"zk_kitchenoperations",PreflightFake.Actor).Last();
 var snapshot=()=>Task.FromResult(new Fingerprint(new string('a',64),2,0));
 await Checks.Denial(new Fake(p=>Task.FromResult(new Outcome(400,null,Unsupported:true))),probe,snapshot,new());
 foreach(var outcome in new[]{new Outcome(404,null),new Outcome(403,null),new Outcome(204,null),new Outcome(400,null,true)})await Reject(()=>Checks.Denial(new Fake(p=>Task.FromResult(outcome)),probe,snapshot,new()));
});
await Test("real protocol no business change save exact-byte repeat and conflict persist once",async()=>{
 var fake=new RuntimeFake();var evidence=new Evidence();await fake.Run(evidence);
 Assert(fake.WriteRequests==3&&fake.Commits==1&&fake.Receipts.Count==1&&(int)fake.State["revision"]! ==1);
 var commits=fake.Calls.Where(c=>c.Path=="zk_KitchenCommit").ToArray();Assert(commits[0].Body==commits[1].Body&&commits[1].Body!=commits[2].Body);
 var inner=JsonNode.Parse(commits[0].Body!)!["RequestJson"]!.GetValue<string>();Assert(fake.Receipts[0]["zk_requesthash"]!.GetValue<string>()==Zunftkueche.Protocol.Hash(inner));
 Assert(evidence.Checks.Any(c=>c.Name=="exact_bytes_idempotent_repeat")&&evidence.Checks.Any(c=>c.Name=="stale_revision_conflict_unchanged"));
 await Reject(()=>fake.Run(new()));Assert(fake.WriteRequests==3);
});
await Test("commit fault ambiguous response or malformed result stops without any automatic repeat",async()=>{
 foreach(var failure in new[]{"before","after","fault","body"}){
  var fake=new RuntimeFake{Failure=failure};var evidence=new Evidence();await Reject(()=>fake.Run(evidence));Assert(fake.WriteRequests==1&&!evidence.RootReleaseAllowed&&evidence.Stopped);
  Assert(fake.Commits==(failure is "after" or "body"?1:0));
 }
});
await Test("bounded provider diagnosis redacts remote messages and numeric codes",()=>{
 string Body(string code,string message)=>new JsonObject{["error"]=new JsonObject{["code"]=code,["message"]=message}}.ToJsonString();
 var refusal=Diagnosis.Refusal(400,System.Text.Encoding.UTF8.GetBytes(Body("0x80040265","Bearer secret https://private.example Direct kitchen table writes are blocked.")));
 Assert(refusal.GuardDenied&&refusal.NumericCode=="0x80040265"&&!System.Text.Json.JsonSerializer.Serialize(refusal).Contains("secret"));
 foreach(var body in new[]{Body("0x80040265 secret","secret"),"{invalid",Body("0x80040265",new string('x',9000))}){var r=Diagnosis.Refusal(400,System.Text.Encoding.UTF8.GetBytes(body));Assert(!r.GuardDenied&&r.NumericCode==null);}
 Assert(Diagnosis.SafeError(new HttpRequestException("Bearer secret https://private.example"))=="acceptance_failed_details_suppressed");
 return Task.CompletedTask;
});
await Test("documented standard DeleteMultiple provider text is recognized without ACL confusion",()=>{
 var bytes=System.Text.Encoding.UTF8.GetBytes("{\"error\":{\"code\":\"0x80004001\",\"message\":\"DeleteMultiple has not yet been implemented.\"}}");
 Assert(Diagnosis.Refusal(400,bytes).Unsupported);
 Assert(!Diagnosis.Refusal(403,bytes).Unsupported);return Task.CompletedTask;
});
await Test("actual diagnosis and denial accept known400 but reject absent routes and vague refusals unchanged",async()=>{
 var probe=Scope.Probes(Scope.Operation,"zk_kitchenoperations",PreflightFake.Actor).Last();
 var snapshot=()=>Task.FromResult(new Fingerprint(new string('a',64),2,0));
 byte[] Body(string? code,string message)=>System.Text.Encoding.UTF8.GetBytes(new JsonObject{["error"]=new JsonObject{["code"]=code,["message"]=message}}.ToJsonString());
 const string known="DeleteMultiple has not yet been implemented.";
 var accepted=new Evidence();
 await Checks.Denial(new Fake(p=>Task.FromResult(Diagnosis.Refusal(400,Body("0x80004001",known)))),probe,snapshot,accepted);
 Assert(accepted.Checks.All(c=>c.Passed)&&accepted.Checks.Any(c=>c.Name==probe.Check));
 foreach(var input in new[]{
  (404,"0x80060888","Resource not found for the segment 'Microsoft.Dynamics.CRM.DeleteMultiple'."),
  (400,"0x80004001","DeleteMultiple is not supported."),
  (400,"0x80004001","DeleteMultiple is not available."),
  (400,"0x80004001","DeleteMultiple is not a valid action."),
  (403,"0x80004001",known),(404,"0x80004001",known),(405,"0x80004001",known),
  (500,"0x80004001",known),(501,"0x80004001",known),
  (400,"invalid",known),(400,(string?)null,known),
  (400,"0x80004001","Unexpected prefix "+known),
  (400,"0x80004001",known+" Unexpected suffix")}){
  var evidence=new Evidence();
  var fake=new Fake(p=>Task.FromResult(Diagnosis.Refusal(input.Item1,Body(input.Item2,input.Item3))));
  await Reject(()=>Checks.Denial(fake,probe,snapshot,evidence));
  Assert(fake.Calls.Count==1&&evidence.Stopped&&!evidence.RootReleaseAllowed);
  Assert(evidence.Checks.Single(c=>c.Name==probe.Check+"_unchanged").Passed);
 }
 var malformed=new Fake(p=>Task.FromResult(Diagnosis.Refusal(400,System.Text.Encoding.UTF8.GetBytes("{invalid"))));
 await Reject(()=>Checks.Denial(malformed,probe,snapshot,new()));
});
await Test("transport rejects unsafe routes before token acquisition",async()=>{
 int tokens=0;using var t=new AcceptanceTransport(Target.Url,()=>{tokens++;return Task.FromResult("secret");});
 foreach(var path in new[]{"https://evil.example/api/data/v9.2/a","//evil.example/a","../../outside","a#secret"})await Reject(()=>t.ProbeAsync(new("probe",HttpMethod.Delete,path,null)));
 Assert(tokens==0);
});
await Test("transport sends correct update-only header and exact immutable bytes",async()=>{
 string body="{\"zk_name\":\"ACCEPTANCE ONLY prohibited rename\"}";int calls=0;
 using var handler=new ResponseHandler(request=>{
  calls++;Assert(request.Method==HttpMethod.Patch&&request.Headers.IfMatch.Single().Tag=="*");
  Assert(request.Content!.ReadAsStringAsync().GetAwaiter().GetResult()==body);
  Assert(request.Headers.Authorization?.Parameter=="synthetic-token");return new(System.Net.HttpStatusCode.BadRequest){Content=new StringContent("{\"error\":{\"code\":\"0x80040265\",\"message\":\"Direct kitchen table writes are blocked.\"}}")};
 });
 using var t=new AcceptanceTransport(Target.Url,()=>Task.FromResult("synthetic-token"),handler);
 var probe=new Probe("probe",HttpMethod.Patch,"zk_kitchenworkspaces("+Scope.WorkspaceCanaries[0]+")",body,true);
 Assert((await t.ProbeAsync(probe)).GuardDenied);Assert((await t.ProbeAsync(probe)).GuardDenied);Assert(calls==2);
});
await Test("transport stops error response reads at diagnostic bound and emits no raw body",async()=>{
 using var stream=new CountingStream(System.Text.Encoding.UTF8.GetBytes("{\"error\":{\"code\":\"0x80040265\",\"message\":\""+new string('x',20000)+"\"}}"));
 using var handler=new ResponseHandler(request=>new(System.Net.HttpStatusCode.BadRequest){Content=new StreamContent(stream)});
 using var t=new AcceptanceTransport(Target.Url,()=>Task.FromResult("synthetic-token"),handler);
 var result=await t.ProbeAsync(new("probe",HttpMethod.Post,"zk_kitchenworkspaces",null));
 Assert(stream.BytesRead<=8193&&!result.GuardDenied&&result.NumericCode==null&&result.Value==null);
});
Console.WriteLine($"{passed} passed; {failed} failed");return failed==0?0:1;
