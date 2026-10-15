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
 foreach(var phase in new[]{"inspect","prepare-canaries","runtime","denials-only"})Assert(!AcceptanceOptions.Parse(["--phase",phase]).Execute);
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
await Test("verified52 internal main-operation steps permit preparation without treating them as guards",async()=>{
 var f=new PreflightFake();var evidence=f.InternalMetadata;
 Assert(evidence["steps"]!.AsArray().Count==52);
 var session=f.Session();await session.RunAsync("prepare-canaries");
 Assert(f.Writes==4&&session.Evidence.Checks.Any(c=>c.Name=="verified_platform_main_operation_steps"&&c.Count==52));
});
await Test("missing extra modified or forged platform definitions stop preparation before writes",async()=>{
 foreach(var defect in new[]{"missing","extra","duplicate","stage","mode","inactive","rank","managed","hidden","customizable","impersonating","filter","message","expanded_handler","handler_id","handler_token","assembly_id","assembly_token","assembly_hidden","assembly_package","named_guard","own_handler","custom_bulk_handler"}){
  var f=new PreflightFake();var rows=f.InternalMetadata["steps"]!.AsArray();var row=rows[0]!;var type=f.InternalMetadata["handler"]!;
  switch(defect){
   case "missing":rows.RemoveAt(0);break;
   case "extra":{var extra=row.DeepClone();extra["sdkmessageprocessingstepid"]="00000000-0000-0000-0000-000000000099";rows.Add(extra);break;}
   case "duplicate":rows.Add(row.DeepClone());break;
   case "stage":row["stage"]=20;break;case "mode":row["mode"]=1;break;case "inactive":row["statecode"]=1;break;case "rank":row["rank"]=1;break;case "managed":row["ismanaged"]=true;break;
   case "hidden":row["ishidden"]!["Value"]=false;break;case "customizable":row["iscustomizable"]!["Value"]=false;break;
   case "impersonating":row["_impersonatinguserid_value"]=PreflightFake.Actor.ToString("D");break;
   case "filter":row["_sdkmessagefilterid_value"]="00000000-0000-0000-0000-000000000099";break;
   case "message":row["sdkmessageid"]!["name"]="Unexpected";break;
   case "expanded_handler":row["eventhandler_plugintype"]!["typename"]="Custom.InternalOperationPlugin";break;
   case "handler_id":type["plugintypeid"]="00000000-0000-0000-0000-000000000099";break;
   case "handler_token":type["publickeytoken"]="0000000000000000";break;
   case "assembly_id":type["_pluginassemblyid_value"]="00000000-0000-0000-0000-000000000099";break;
   case "assembly_token":type["pluginassemblyid"]!["publickeytoken"]="0000000000000000";break;
   case "assembly_hidden":type["pluginassemblyid"]!["ishidden"]!["Value"]=false;break;
   case "assembly_package":type["pluginassemblyid"]!["_packageid_value"]="00000000-0000-0000-0000-000000000099";break;
   case "named_guard":row["name"]="zk_KitchenGuard_forged";break;
   case "own_handler":row["_eventhandler_value"]=GuardFixture.Handler;break;
   case "custom_bulk_handler":row["stage"]=20;row["sdkmessageid"]!["name"]="CreateMultiple";row["eventhandler_plugintype"]!["typename"]="Custom.BulkPlugin";break;
  }
  await Reject(()=>f.Session().RunAsync("prepare-canaries"));Assert(f.Writes==0);
 }
});
await Test("platform baseline exclusion retains exactly six strict runtime guards and blocks all extras",async()=>{
 var metadata=PreflightFake.LoadInternalMetadata();
 JsonObject[] Intrinsics()=>metadata["steps"]!.AsArray().Select(r=>r!.DeepClone().AsObject()).ToArray();
 var combined=Intrinsics().Concat(GuardFixture.Steps()).ToArray();
 var inventory=PlatformSteps.ValidateAndExclude(metadata["handler"]!.AsObject(),combined);
 Assert(inventory.InternalCount==52&&inventory.CustomSteps.Length==6&&inventory.DefinitionHash.Length==64);
 Checks.GuardSet(inventory.CustomSteps,GuardFixture.Handler);
 var reordered=PlatformSteps.ValidateAndExclude(metadata["handler"]!.AsObject(),combined.Reverse().ToArray());
 Assert(reordered.DefinitionHash==inventory.DefinitionHash);
 foreach(var defect in new[]{"missing_guard","extra_guard","extra_intrinsic_lookalike","missing_intrinsic","drifted_intrinsic"}){
  var rows=combined.Select(r=>r.DeepClone().AsObject()).ToList();
  if(defect=="missing_guard")rows.RemoveAt(rows.Count-1);
  if(defect=="extra_guard"){var extra=GuardFixture.Steps()[0];extra["sdkmessageprocessingstepid"]="00000000-0000-0000-0000-000000000099";rows.Add(extra);}
  if(defect=="extra_intrinsic_lookalike"){var extra=rows[0].DeepClone().AsObject();extra["sdkmessageprocessingstepid"]="00000000-0000-0000-0000-000000000099";rows.Add(extra);}
  if(defect=="missing_intrinsic")rows.RemoveAt(0);
  if(defect=="drifted_intrinsic")rows[0]["sdkmessagefilterid"]!["primaryobjecttypecode"]="other_table";
  await Reject(()=>{var checkedInventory=PlatformSteps.ValidateAndExclude(metadata["handler"]!.AsObject(),rows.ToArray());Checks.GuardSet(checkedInventory.CustomSteps,GuardFixture.Handler);return Task.CompletedTask;});
 }
 Assert(PlatformSteps.Query(GuardFixture.Handler).Contains("_eventhandler_value eq "+GuardFixture.Handler));
 Assert(PlatformSteps.Query().Contains("startswith(name,'zk_KitchenGuard_')")&&PlatformSteps.Query().Contains("eventhandler_plugintype"));
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
await Test("failed commit records bounded known-guard or unknown HTTP facts and unchanged readback then stops",async()=>{
 foreach(var scenario in new[]{(400,true,"0x80040265"),(500,true,"0x80040265"),(400,false,"0x80004005"),(500,false,"malformed-secret")}){
  string message=scenario.Item2?"Direct kitchen table writes are blocked. Bearer secret https://private.example":"Unknown remote secret https://private.example";
  var body=System.Text.Encoding.UTF8.GetBytes(new JsonObject{["error"]=new JsonObject{["code"]=scenario.Item3,["message"]=message}}.ToJsonString());
  var fake=new RuntimeFake{Refusal=Diagnosis.Refusal(scenario.Item1,body)};var evidence=new Evidence();
  await Reject(()=>fake.Run(evidence));
  var refusal=evidence.Checks.Single(c=>c.Name=="commit_http_refused");
  Assert(!refusal.Passed&&refusal.Status==scenario.Item1&&refusal.NumericCode==(scenario.Item3=="malformed-secret"?null:scenario.Item3));
  Assert(System.Text.Json.JsonSerializer.Serialize(refusal).Contains("\"GuardDenied\":"+(scenario.Item2?"true":"false")));
  Assert(evidence.Checks.Single(c=>c.Name=="commit_failure_persistence_unchanged").Passed);
  Assert(fake.WriteRequests==1&&fake.Commits==0&&fake.Receipts.Count==0&&evidence.Stopped&&!evidence.RootReleaseAllowed);
  Assert(!System.Text.Json.JsonSerializer.Serialize(evidence.Checks).Contains("secret"));
  Assert(!evidence.Checks.Any(c=>c.Name is "legitimate_no_business_change_saved" or "exact_bytes_idempotent_repeat" or "stale_revision_conflict_unchanged"));
 }
});
await Test("transport exception has no fabricated HTTP facts and readback comparison never permits continuation",async()=>{
 foreach(var failure in new[]{"before","after"}){
  var fake=new RuntimeFake{Failure=failure};var evidence=new Evidence();await Reject(()=>fake.Run(evidence));
  Assert(!evidence.Checks.Any(c=>c.Name=="commit_http_refused"));
  Assert(evidence.Checks.Single(c=>c.Name=="commit_failure_persistence_unchanged").Passed==(failure=="before"));
  Assert(fake.WriteRequests==1&&evidence.Stopped&&!evidence.RootReleaseAllowed);
 }
});
await Test("bounded failure kinds distinguish only fixed source literals without exposing their contents",()=>{
 foreach(var pair in new[]{
  ("Direct kitchen table writes are blocked.","guard_context"),
  ("Kitchen history mutations and bulk/direct writes are blocked.","guard_target"),
  ("Invalid kitchen write context.","invalid_guard_marker"),
  ("Invalid kitchen execution context.","invalid_execution_context"),
  ("Kitchen validation: private validation detail","validation_prefix"),
  ("Kitchen request JSON is invalid.","invalid_json"),
  ("RequestJson is required.","request_required"),
  ("Private unknown fault detail","unknown")}){
  var bytes=System.Text.Encoding.UTF8.GetBytes(new JsonObject{["error"]=new JsonObject{["code"]="0x80040265",["message"]=pair.Item1+" Bearer secret https://private.example"}}.ToJsonString());
  var outcome=Diagnosis.Refusal(500,bytes);
  using var json=System.Text.Json.JsonDocument.Parse(System.Text.Json.JsonSerializer.Serialize(outcome));
  Assert(json.RootElement.GetProperty("FailureKind").GetString()==pair.Item2);
  Assert(outcome.GuardDenied==(pair.Item2 is "guard_context" or "guard_target"));
  Assert(!System.Text.Json.JsonSerializer.Serialize(outcome).Contains("private",StringComparison.OrdinalIgnoreCase));
 }
 return Task.CompletedTask;
});
await Test("both known guard reasons survive bounded failed-commit evidence at400and500",async()=>{
 foreach(int status in new[]{400,500})foreach(var pair in new[]{("Direct kitchen table writes are blocked.",FailureKind.guard_context),("Kitchen history mutations and bulk/direct writes are blocked.",FailureKind.guard_target)}){
  var bytes=System.Text.Encoding.UTF8.GetBytes(new JsonObject{["error"]=new JsonObject{["code"]="0x80040265",["message"]=pair.Item1}}.ToJsonString());
  var fake=new RuntimeFake{Refusal=Diagnosis.Refusal(status,bytes)};var evidence=new Evidence();await Reject(()=>fake.Run(evidence));
  var row=evidence.Checks.Single(c=>c.Name=="commit_http_refused");
  Assert(row.GuardDenied==true&&row.FailureKind==pair.Item2&&row.Status==status&&!row.Passed);
  Assert(fake.WriteRequests==1&&fake.Commits==0&&evidence.Stopped&&!evidence.RootReleaseAllowed);
 }
});
await Test("failed HTTP evidence rejects synthetic private code and undefined enum values",async()=>{
 var fake=new RuntimeFake{Refusal=new Outcome(500,null,NumericCode:"Bearer secret https://private.example",FailureKind:(FailureKind)123456)};
 var evidence=new Evidence();await Reject(()=>fake.Run(evidence));
 var row=evidence.Checks.Single(c=>c.Name=="commit_http_refused");
 Assert(row.NumericCode==null&&row.FailureKind==FailureKind.unknown&&row.Status==500&&row.GuardDenied==false);
 string json=System.Text.Json.JsonSerializer.Serialize(evidence.Checks);
 Assert(!json.Contains("secret")&&!json.Contains("123456")&&json.Contains("\"FailureKind\":\"unknown\""));
 Assert(fake.WriteRequests==1&&fake.Commits==0&&evidence.Stopped&&!evidence.RootReleaseAllowed);
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
await Test("package prerequisite download delegates to bounded byte reader",async()=>{
var bytes=File.ReadAllBytes("server/artifacts/guard-target-normalization-v5/Zunftkueche.Dataverse.1.0.0.nupkg");int calls=0;
using var handler=new ResponseHandler(request=>{calls++;Assert(request.Method==HttpMethod.Get&&request.RequestUri!.AbsoluteUri==Target.Url+"/api/data/v9.2/pluginpackages(00000000-0000-0000-0000-000000000030)/package/$value"&&request.Headers.Authorization?.Parameter=="synthetic-token");return new(System.Net.HttpStatusCode.OK){Content=new ByteArrayContent(bytes)};});
using var transport=new AcceptanceTransport(Target.Url,()=>Task.FromResult("synthetic-token"),handler);
Assert((await ((IDataverseTransport)transport).ReadPackageFileAsync("00000000-0000-0000-0000-000000000030")).SequenceEqual(bytes)&&calls==1);
});
await Test("fixed guard suffix exposes only bounded canonical numeric facts",async()=>{
 Outcome Parse(string message,int status=400,string code="0x80040265")=>Diagnosis.Refusal(status,System.Text.Encoding.UTF8.GetBytes(new JsonObject{["error"]=new JsonObject{["code"]=code,["message"]=message}}.ToJsonString()));
 const string prefix="Direct kitchen table writes are blocked. ";
 var good=Parse(prefix+"[zk_guard_v1;m=2048;p=1]");
 var json=System.Text.Json.JsonSerializer.SerializeToNode(good)!;
 Assert(json["GuardMask"]?.GetValue<int>()==2048&&json["ParentKind"]?.GetValue<int>()==1);
 foreach(var suffix in new[]{"[zk_guard_v1;m=-1;p=1]","[zk_guard_v1;m=01;p=1]","[zk_guard_v1;m=32768;p=1]","[zk_guard_v1;m=1;p=11]","[zk_guard_v3;m=1;p=1]","[zk_guard_v1;m=999999999999;p=1]","[zk_guard_v1;m=1;p=1] [zk_guard_v1;m=1;p=1]","[zk_guard_v1;m=1;p=1] secret"}){
  var r=System.Text.Json.JsonSerializer.SerializeToNode(Parse(prefix+suffix))!;Assert(r["GuardMask"]==null&&r["ParentKind"]==null);
 }
 foreach(var r in new[]{Parse(prefix+"[zk_guard_v1;m=1;p=1]",403),Parse(prefix+"[zk_guard_v1;m=1;p=1]",400,"0x80004005"),Parse(prefix+prefix+"[zk_guard_v1;m=1;p=1]")})Assert(System.Text.Json.JsonSerializer.SerializeToNode(r)!["GuardMask"]==null);
 var fake=new RuntimeFake{Refusal=good};var e=new Evidence();await Reject(()=>fake.Run(e));
 var row=System.Text.Json.JsonSerializer.SerializeToNode(e.Checks.Single(c=>c.Name=="commit_http_refused"))!;
 Assert(row["GuardMask"]?.GetValue<int>()==2048&&row["ParentKind"]?.GetValue<int>()==1&&fake.WriteRequests==1&&fake.Commits==0);
});
await Test("chain guard facts remain bounded and reach failure evidence",async()=>{
 Outcome Parse(string suffix)=>Diagnosis.Refusal(400,System.Text.Encoding.UTF8.GetBytes(new JsonObject{["error"]=new JsonObject{["code"]="0x80040265",["message"]="Direct kitchen table writes are blocked. [zk_guard_v1;m=2064;p=3] "+suffix}}.ToJsonString()));
 const string valid="[zk_guard_chain_v1;w=0;s=2048;g=1]";
 var good=Parse(valid);var json=System.Text.Json.JsonSerializer.SerializeToNode(good)!;
 Assert(json["WrapperMask"]?.GetValue<int>()==0&&json["SourceMask"]?.GetValue<int>()==2048&&json["SourceKind"]?.GetValue<int>()==1&&json["GuardMask"]?.GetValue<int>()==2064);
 foreach(var suffix in new[]{"[zk_guard_chain_v1;w=128;s=0;g=1]","[zk_guard_chain_v1;w=0;s=32768;g=1]","[zk_guard_chain_v1;w=0;s=0;g=11]","[zk_guard_chain_v1;w=00;s=0;g=1]","[zk_guard_chain_v1;w=-1;s=0;g=1]","[zk_guard_chain_v2;w=0;s=0;g=1]",valid+" "+valid,valid+" secret"}){
  var row=System.Text.Json.JsonSerializer.SerializeToNode(Parse(suffix))!;Assert(row["WrapperMask"]==null&&row["SourceMask"]==null&&row["SourceKind"]==null&&row["GuardMask"]==null);
 }
 var fake=new RuntimeFake{Refusal=good};var evidence=new Evidence();await Reject(()=>fake.Run(evidence));
 var facts=System.Text.Json.JsonSerializer.SerializeToNode(evidence.Checks.Single(c=>c.Name=="commit_http_refused"))!;
 Assert(facts["WrapperMask"]?.GetValue<int>()==0&&facts["SourceMask"]?.GetValue<int>()==2048&&facts["SourceKind"]?.GetValue<int>()==1&&fake.Commits==0);
});
await Test("v2 structural facts preserve historical v1 marker meaning and reject reserved bits",async()=>{
 Outcome Parse(string text,int status=400,string code="0x80040265")=>Diagnosis.Refusal(status,System.Text.Encoding.UTF8.GetBytes(new JsonObject{["error"]=new JsonObject{["code"]=code,["message"]="Direct kitchen table writes are blocked. "+text}}.ToJsonString()));
 const string current="[zk_guard_v2;m=16;p=3] [zk_guard_chain_v2;w=0;s=0;g=1]";
 var good=Parse(current);var facts=System.Text.Json.JsonSerializer.SerializeToNode(good)!;
 Assert(facts["GuardVersion"]?.GetValue<int>()==2&&facts["GuardMask"]?.GetValue<int>()==16&&facts["SourceMask"]?.GetValue<int>()==0);
 Assert(System.Text.Json.JsonSerializer.SerializeToNode(Parse("[zk_guard_v1;m=2048;p=1]"))!["GuardVersion"]?.GetValue<int>()==1);
 foreach(var bad in new[]{"[zk_guard_v2;m=2048;p=1]","[zk_guard_v2;m=4096;p=1]","[zk_guard_v2;m=16;p=3] [zk_guard_chain_v2;w=0;s=2048;g=1]","[zk_guard_v2;m=16;p=3] [zk_guard_chain_v1;w=0;s=0;g=1]",current+" "+current,current+" private"})Assert(System.Text.Json.JsonSerializer.SerializeToNode(Parse(bad))!["GuardVersion"]==null);
 foreach(var o in new[]{Parse(current,403),Parse(current,400,"0x80004005")})Assert(System.Text.Json.JsonSerializer.SerializeToNode(o)!["GuardVersion"]==null);
 var fake=new RuntimeFake{Refusal=good};var e=new Evidence();await Reject(()=>fake.Run(e));Assert(System.Text.Json.JsonSerializer.SerializeToNode(e.Checks.Single(x=>x.Name=="commit_http_refused"))!["GuardVersion"]?.GetValue<int>()==2);
});
await Test("binding and target refusal facts are exact bounded privacy-safe measurements",async()=>{
 Outcome Parse(string text,int status=400,string code="0x80040265")=>Diagnosis.Refusal(status,System.Text.Encoding.UTF8.GetBytes(new JsonObject{["error"]=new JsonObject{["code"]=code,["message"]=text}}.ToJsonString()));
 const string context="Direct kitchen table writes are blocked. ",target="Kitchen history mutations and bulk/direct writes are blocked. ";
 for(int reason=1;reason<=5;reason++){var o=Parse(context+"[zk_guard_binding_v1;b="+reason+"]");var row=System.Text.Json.JsonSerializer.SerializeToNode(o)!;Assert(row["BindingReason"]?.GetValue<int>()==reason&&o.GuardDenied&&o.FailureKind==FailureKind.guard_context);}
 var good=Parse(target+"[zk_guard_target_v1;m=4;n=3;i=1]");var facts=System.Text.Json.JsonSerializer.SerializeToNode(good)!;Assert(facts["TargetMask"]?.GetValue<int>()==4&&facts["TargetCount"]?.GetValue<int>()==3&&facts["TargetIdPresence"]?.GetValue<int>()==1&&good.GuardDenied&&good.FailureKind==FailureKind.guard_target);
 foreach(var bad in new[]{context+"[zk_guard_binding_v1;b=0]",context+"[zk_guard_binding_v1;b=6]",context+"[zk_guard_binding_v1;b=01]",context+"[zk_guard_binding_v1;b=-1]",context+"[zk_guard_binding_v2;b=1]",target+"[zk_guard_target_v1;m=256;n=3;i=0]",target+"[zk_guard_target_v1;m=4;n=64;i=0]",target+"[zk_guard_target_v1;m=4;n=3;i=4]",target+"[zk_guard_target_v1;m=04;n=3;i=0]",target+"[zk_guard_target_v2;m=4;n=3;i=0]",context+"[zk_guard_target_v1;m=4;n=3;i=0]",target+"[zk_guard_binding_v1;b=1]",target+"[zk_guard_target_v1;m=4;n=3;i=0] private",context+"[zk_guard_binding_v1;b=1] [zk_guard_binding_v1;b=1]"}){var row=System.Text.Json.JsonSerializer.SerializeToNode(Parse(bad))!;Assert(row["BindingReason"]==null&&row["TargetMask"]==null&&row["TargetCount"]==null&&row["TargetIdPresence"]==null);}
 foreach(var o in new[]{Parse(target+"[zk_guard_target_v1;m=4;n=3;i=1]",403),Parse(context+"[zk_guard_binding_v1;b=1]",400,"0x80004005")}){var row=System.Text.Json.JsonSerializer.SerializeToNode(o)!;Assert(row["BindingReason"]==null&&row["TargetMask"]==null);}
 foreach(var o in new[]{good,Parse(context+"[zk_guard_binding_v1;b=3]")}){var fake=new RuntimeFake{Refusal=o};var e=new Evidence();await Reject(()=>fake.Run(e));var row=System.Text.Json.JsonSerializer.SerializeToNode(e.Checks.Single(x=>x.Name=="commit_http_refused"))!;Assert(row["TargetMask"]?.GetValue<int>()==4||row["BindingReason"]?.GetValue<int>()==3);Assert(fake.Commits==0&&e.Checks.Any(x=>x.Name=="commit_failure_independent_readback"));}
});
await Test("decoration refusal facts preserve denial and independent readback",async()=>{
 const string prefix="Kitchen history mutations and bulk/direct writes are blocked. ";
 Outcome Parse(string suffix)=>Diagnosis.Refusal(400,System.Text.Encoding.UTF8.GetBytes(new JsonObject{["error"]=new JsonObject{["code"]="0x80040265",["message"]=prefix+suffix}}.ToJsonString()));
 var good=Parse("[zk_guard_target_v1;m=4;n=6;i=1] [zk_guard_decor_v1;q=1;p=15;t=7;z=8;m=15;d=2;u=0]");
 var row=System.Text.Json.JsonSerializer.SerializeToNode(good)!;Assert(row["TargetMask"]?.GetValue<int>()==4&&row["Decoration"]?["Presence"]?.GetValue<int>()==15&&row["Decoration"]?["UnknownCount"]?.GetValue<int>()==0&&!good.Success);
 var fake=new RuntimeFake{Refusal=good};var e=new Evidence();await Reject(()=>fake.Run(e));var saved=System.Text.Json.JsonSerializer.SerializeToNode(e.Checks.Single(x=>x.Name=="commit_http_refused"))!;Assert(saved["Decoration"]?["Types"]?.GetValue<int>()==7&&fake.Commits==0&&e.Checks.Any(x=>x.Name=="commit_failure_independent_readback"));
});
await Test("decoration strict grammar invariants complete accounting and privacy",()=>{
 const string prefix="Kitchen history mutations and bulk/direct writes are blocked. ";
 JsonNode Parse(string suffix,int status=400,string code="0x80040265")=>System.Text.Json.JsonSerializer.SerializeToNode(Diagnosis.Refusal(status,System.Text.Encoding.UTF8.GetBytes(new JsonObject{["error"]=new JsonObject{["code"]=code,["message"]=prefix+suffix}}.ToJsonString())))!;
 const string target="[zk_guard_target_v1;m=4;n=6;i=1] ",decor="[zk_guard_decor_v1;q=1;p=15;t=7;z=8;m=15;d=2;u=0]";
 foreach(var valid in new[]{target+decor,target+"[zk_guard_decor_v1;q=0;p=0;t=0;z=0;m=0;d=0;u=0]","[zk_guard_target_v1;m=4;n=3;i=0] [zk_guard_decor_v1;q=1;p=0;t=0;z=0;m=0;d=0;u=1]","[zk_guard_target_v1;m=4;n=63;i=1] [zk_guard_decor_v1;q=1;p=15;t=15;z=0;m=63;d=3;u=63]","[zk_guard_target_v1;m=12;n=5;i=1] "+decor})Assert(Parse(valid)["Decoration"]!=null);
 foreach(var bad in new[]{decor.Replace("q=1","q=2"),decor.Replace("q=1","q=0"),decor.Replace("p=15","p=16"),decor.Replace("p=15","p=7"),decor.Replace("t=7","t=15"),decor.Replace("t=7","t=6"),decor.Replace("z=8","z=16"),decor.Replace("m=15","m=64"),decor.Replace("m=15","m=63"),decor.Replace("d=2","d=4"),decor.Replace("d=2","d=0"),decor.Replace("u=0","u=1"),decor.Replace("u=0","u=64"),decor.Replace("u=0","u=00"),decor.Replace("u=0","u=-1"),decor.Replace("v1","v2"),decor+" "+decor,decor+" private-value-sentinel"}){var row=Parse(target+bad);Assert(row["Decoration"]==null&&row["TargetMask"]==null&&!row.ToJsonString().Contains("sentinel"));}
 foreach(var badTarget in new[]{target.Replace("n=6","n=5"),target.Replace("i=1","i=0"),target.Replace("m=4","m=36"),target.Replace("m=4","m=0")})Assert(Parse(badTarget+decor)["Decoration"]==null);
 Assert(Parse(target+decor,403)["Decoration"]==null&&Parse(target+decor,400,"0x80004005")["Decoration"]==null);
 return Task.CompletedTask;
});
await Test("duplicate diagnostic envelope keys suppress additive facts without raw text",()=>{
 const string msg="Direct kitchen table writes are blocked. [zk_guard_binding_v1;b=1]";
 var safe=System.Text.Json.JsonSerializer.Serialize(msg);
 foreach(var body in new[]{"{\"error\":{},\"error\":{\"code\":\"0x80040265\",\"message\":"+safe+"}}","{\"error\":{\"code\":\"0x80040265\",\"code\":\"0x80040265\",\"message\":"+safe+"}}","{\"error\":{\"code\":\"0x80040265\",\"message\":\"private-sentinel\",\"message\":"+safe+"}}"}){var o=Diagnosis.Refusal(400,System.Text.Encoding.UTF8.GetBytes(body));Assert(o.BindingReason==null&&o.GuardMask==null&&o.TargetMask==null&&o.Decoration==null&&o.NumericCode=="0x80040265"&&o.GuardDenied&&!System.Text.Json.JsonSerializer.Serialize(o).Contains("sentinel"));}
 return Task.CompletedTask;
});
await Test("denial continuation performs24 fixed probes and2 unexecuted availability classifications without Commit",async()=>{
 var f=new ContinuationFake();var e=new Evidence();await f.Run(e);Assert(f.Probes.Count==24&&f.Probes.Select(p=>p.Check).Distinct().Count()==24&&f.Loads==1&&f.Probes.All(p=>!p.Path.Contains("DeleteMultiple")&&!p.Path.Contains("KitchenCommit")));var facts=System.Text.Json.JsonSerializer.SerializeToNode(e)!;Assert(facts["SupportedDenialsComplete"]?.GetValue<bool>()==true&&!e.RootReleaseAllowed&&facts["Availability"]!.AsArray().Count==2);Assert(facts["Availability"]!.AsArray().All(a=>a!["Executed"]!.GetValue<bool>()==false&&a["GuardExecutionProved"]!.GetValue<bool>()==false&&a["Status"]!.GetValue<string>()=="documented_unsupported_standard_table"));
});
await Test("continuation rejects every fixed checkpoint receipt owner state and Load mismatch before denials",async()=>{
 foreach(var defect in new[]{"revision","count","fingerprint","owner","state","state_revision","receipt_missing","receipt_duplicate","receipt_hash","receipt_actor","receipt_workspace","receipt_revision","receipt_timestamp","conflict","other_receipt","load","readonly"}){var f=new ContinuationFake{Defect=defect};await Reject(()=>f.Run(new Evidence()));Assert(f.Probes.Count==0);}
});
await Test("continuation pins every before snapshot and stops after any unknown changed or ambiguous result",async()=>{
 foreach(var defect in new[]{"drift_before","changed_after","success","http405","http404","unknown","ambiguous","readback_failure"}){var f=new ContinuationFake{Defect=defect};var e=new Evidence();await Reject(()=>f.Run(e));Assert(f.Probes.Count==1);Assert(!e.RootReleaseAllowed&&System.Text.Json.JsonSerializer.SerializeToNode(e)!["SupportedDenialsComplete"]?.GetValue<bool>()!=true);if(defect is "ambiguous" or "changed_after")Assert(e.Checks.Any(c=>c.Name.Contains("readback")||c.Name.EndsWith("_unchanged")));}
});
await Test("denial-only Session retains identity Standard table and missing-backend gates",async()=>{
 foreach(var defect in new[]{"organization","object","language","currency","elastic","missing_backend"}){var f=new PreflightFake{WrongOrganization=defect=="organization",WrongObject=defect=="object",WrongLanguage=defect=="language",WrongCurrency=defect=="currency",Elastic=defect=="elastic"};try{await f.Session().RunAsync("denials-only");throw new Exception("accepted");}catch(Exception ex)when(ex is AcceptanceFault or DeploymentException){}Assert(f.Writes==0);}
});
await Test("supported plan excludes only exact DeleteMultiple and rejects plan drift",async()=>{
 foreach(var table in new[]{Scope.Workspace,Scope.Operation}){
  var set=table+"s";var plan=Scope.Probes(table,set,PreflightFake.Actor);
  Assert(Scope.ValidateSupportedPlan(table,set,plan).Count==12);
  foreach(var defect in new[]{"missing","extra","renamed","generic_unsupported","wrong_route","wrong_method","unsupported_false"}){
   var altered=plan.ToList();switch(defect){case "missing":altered.RemoveAt(0);break;case "extra":altered.Add(plan[0]);break;case "renamed":altered[0]=plan[0] with{Check="unknown"};break;case "generic_unsupported":altered[0]=plan[0] with{Unsupported=true};break;case "wrong_route":altered[12]=plan[12] with{Path=set+"/unknown"};break;case "wrong_method":altered[12]=plan[12] with{Method=HttpMethod.Get};break;case "unsupported_false":altered[12]=plan[12] with{Unsupported=false};break;}
   await Reject(()=>{Scope.ValidateSupportedPlan(table,set,altered);return Task.CompletedTask;});
  }
 }
});
Console.WriteLine($"{passed} passed; {failed} failed");return failed==0?0:1;
