using System.Text.Json.Nodes;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Kitchen.Deploy;
using Zunftkueche;
namespace Kitchen.Acceptance;
public sealed record Check(string Name,bool Passed,int? Status=null,string? NumericCode=null,int? Revision=null,int? Count=null,string? Hash=null,bool? GuardDenied=null,FailureKind? FailureKind=null,int? GuardMask=null,int? ParentKind=null,int? WrapperMask=null,int? SourceMask=null,int? SourceKind=null,int? GuardVersion=null,int? BindingReason=null,int? TargetMask=null,int? TargetCount=null,int? TargetIdPresence=null,DecorationFacts? Decoration=null);
public sealed record Availability(string Table,string Message,string Status,bool Executed,bool GuardExecutionProved);
public sealed class Evidence {
 public List<Availability> Availability {get;}=[];
 public bool SupportedDenialsComplete {get;internal set;}
 public List<Check> Checks {get;}=[];
 public bool RootReleaseAllowed {get;internal set;}
 public bool Stopped {get;internal set;}
 public void Pass(string name,int? status=null,int? revision=null,int? count=null,string? hash=null)=>Checks.Add(new(name,true,status,null,revision,count,hash));
 public void Fail(string name,Outcome? outcome=null){Checks.Add(new(name,false,outcome?.Status,outcome?.NumericCode));Stopped=true;throw new AcceptanceFault("acceptance_check_failed_stop");}
}
public sealed record Fingerprint(string Hash,int OperationCount,int Revision);
public static class Checks {
 public static string Hash(JsonNode value)=>Protocol.Hash(Protocol.Canonical(JToken.Parse(value.ToJsonString())).ToString(Formatting.None));
 public static bool Same(JsonNode? a,JsonNode? b)=>a!=null&&b!=null&&JToken.DeepEquals(Protocol.Canonical(JToken.Parse(a.ToJsonString())),Protocol.Canonical(JToken.Parse(b.ToJsonString())));
 public static async Task Denial(IAcceptanceTransport transport,Probe probe,Func<Task<Fingerprint>> snapshot,Evidence evidence,Fingerprint? requiredBefore=null) {
  var before=await snapshot(); if(requiredBefore!=null&&before!=requiredBefore)evidence.Fail(probe.Check+"_checkpoint_drift_stop"); evidence.Pass(probe.Check+"_before",revision:before.Revision,count:before.OperationCount,hash:before.Hash); Outcome outcome;
  try{outcome=await transport.ProbeAsync(probe);}catch(Exception){
   // Even an ambiguous write gets an independent readback. It can never pass or be retried.
   try{var after=await snapshot();evidence.Pass(probe.Check+"_ambiguous_readback",count:after.OperationCount,revision:after.Revision,hash:after.Hash);}catch(Exception){}
   evidence.Fail(probe.Check+"_ambiguous_stop");throw;
  }
  var afterSnapshot=await snapshot();
  bool unchanged=before==afterSnapshot;
  evidence.Checks.Add(new(probe.Check+"_unchanged",unchanged,Revision:afterSnapshot.Revision,Count:afterSnapshot.OperationCount,Hash:afterSnapshot.Hash));
  if(!unchanged||outcome.Success||!(probe.Unsupported?outcome.Unsupported&&!outcome.GuardDenied:outcome.GuardDenied))evidence.Fail(probe.Check,outcome);
  evidence.Pass(probe.Check,outcome.Status);
 }
 public static void GuardSet(JsonObject[] rows,string handler) {
  if(rows.Length!=6)throw new AcceptanceFault("exact_six_guards_required");
  var pairs=new HashSet<string>();var ids=new HashSet<string>();
  foreach(var row in rows){
   string table=row["sdkmessagefilterid"]?["primaryobjecttypecode"]?.GetValue<string>()??"";
   string message=row["sdkmessageid"]?["name"]?.GetValue<string>()??"";
   if(!new[]{Scope.Workspace,Scope.Operation}.Contains(table)||!new[]{"Create","Update","Delete"}.Contains(message)||!pairs.Add(table+":"+message)||!ids.Add(ResourceEngine.Id(row,"sdkmessageprocessingstepid")))throw new AcceptanceFault("guard_set_drift");
   Readiness.RequireGuard(row,handler,ResourceEngine.Id(row,"_sdkmessagefilterid_value"),ResourceEngine.Id(row,"_sdkmessageid_value"));
  }
 }
 public static Probe CommitRequest(JObject state,string operationId,int expectedRevision,JObject identity) {
  var raw=new JObject{{"protocolVersion",2},{"workspaceId",Seed.WorkspaceId},{"identity",identity.DeepClone()},{"targetEventId",(string)state["event"]!["id"]!},{"operationId",operationId},{"expectedRevision",expectedRevision},
   {"operation",new JObject{{"type","event.dates"},{"payload",new JObject{{"dates",state["event"]!["dates"]!.DeepClone()}}}}},
   {"candidateState",state.DeepClone()}}.ToString(Formatting.None);
  return new(operationId==Scope.CommitOperation?"legitimate_commit":"conflict_commit",HttpMethod.Post,"zk_KitchenCommit",new JsonObject{["RequestJson"]=raw}.ToJsonString());
 }
 public static JObject Result(Outcome outcome) {
  if(!outcome.Success||outcome.Value?["ResultJson"] is not JsonValue value||!value.TryGetValue<string>(out var raw))throw new AcceptanceFault("api_result_missing");
  return Protocol.Parse(raw);
 }
 public static JObject ExpectedState(JObject before,string operationId) {
  var expected=(JObject)before.DeepClone();
  expected["revision"]=(int)before["revision"]!+1;
  ((JArray)expected["operationIds"]!).Add(operationId);
  expected["operationRequests"]![operationId]=Protocol.Canonical(new JObject{{"type","event.switch"},{"payload",new JObject{{"id",(string)before["event"]!["id"]!}}}}).ToString(Formatting.None);
  return expected;
 }
 public static JObject ExpectedStateV2(JObject before,string operationId) {
  var expected=ExpectedState(before,operationId);
  expected["operationRequests"]![operationId]=Protocol.Canonical(new JObject{{"targetEventId",(string)before["event"]!["id"]!},{"type","event.dates"},{"payload",new JObject{{"dates",before["event"]!["dates"]!.DeepClone()}}}}).ToString(Formatting.None);
  return expected;
 }
 public static void CommitResult(JObject result,string operationId,string status,JObject state,int? appliedRevision) {
  if((int?)result["protocolVersion"]!=2||(string?)result["targetEventId"]!=(string?)state["event"]!["id"]||(string?)result["workspaceId"]!=Seed.WorkspaceId||(string?)result["operationId"]!=operationId||(string?)result["status"]!=status||
   (int?)result["appliedRevision"]!=appliedRevision||!JToken.DeepEquals(Protocol.Canonical(result["state"]!),Protocol.Canonical(state)))throw new AcceptanceFault("commit_result_mismatch");
 }
 public static void Receipt(JsonObject row,string rawHash,Guid actor,int revision) {
  ResourceEngine.Id(row,Scope.Operation+"id");
  ResourceEngine.RequireMatch(row,new JsonObject{["_zk_workspace_value"]=Seed.WorkspaceId,["zk_operationid"]=Scope.CommitOperation,["zk_actor"]=actor.ToString("D"),["zk_requesthash"]=rawHash,["zk_appliedrevision"]=revision});
  if(!DateTimeOffset.TryParse(row["zk_recordedat"]?.GetValue<string>(),out _))throw new AcceptanceFault("receipt_timestamp_missing");
 }
}
