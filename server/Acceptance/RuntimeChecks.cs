using System.Text.Json.Nodes;
using Newtonsoft.Json.Linq;
using Kitchen.Deploy;
using Zunftkueche;
namespace Kitchen.Acceptance;
public static class RuntimeChecks {
 public static async Task Run(IAcceptanceTransport transport,Guid actor,Func<Task<JsonObject?>> workspace,Func<Task<JsonObject[]>> receiptsRead,Func<Task<Fingerprint>> snapshot,Evidence evidence) {
  var row=await workspace()??throw new AcceptanceFault("app_workspace_missing");
  if(ResourceEngine.Id(row,"_ownerid_value")!=actor.ToString("D"))throw new AcceptanceFault("workspace_owner_mismatch");
  var before=Protocol.Parse(row["zk_state"]!.GetValue<string>());int revision=row["zk_revision"]!.GetValue<int>();
  if((int?)before["revision"]!=revision)throw new AcceptanceFault("workspace_revision_mismatch");
  var load=Checks.Result(await transport.ProbeAsync(new("actual_load",HttpMethod.Post,"zk_KitchenLoad",new JsonObject{["RequestJson"]=new JsonObject{["protocolVersion"]=1,["workspaceId"]=Seed.WorkspaceId}.ToJsonString()}.ToJsonString())));
  if((int?)load["protocolVersion"]!=1||(string?)load["workspaceId"]!=Seed.WorkspaceId||(bool?)load["canWrite"]!=true||!JToken.DeepEquals(Protocol.Canonical(load["state"]!),Protocol.Canonical(before)))throw new AcceptanceFault("load_persisted_state_mismatch");
  evidence.Pass("actual_load_owner_write_matches_persistence",revision:revision);
  var receiptsBefore=await receiptsRead();
  if(receiptsBefore.Any(r=>new[]{Scope.CommitOperation,Scope.ConflictOperation}.Contains(r["zk_operationid"]?.GetValue<string>())))throw new AcceptanceFault("acceptance_operation_already_present_manual_resolution");
  var frozen=Checks.CommitRequest(before,Scope.CommitOperation,revision);
  string raw=JsonNode.Parse(frozen.Body!)!["RequestJson"]!.GetValue<string>();string hash=Protocol.Hash(raw);
  var expected=Checks.ExpectedState(before,Scope.CommitOperation);
  var initial=await snapshot();evidence.Pass("commit_before",revision:initial.Revision,count:initial.OperationCount,hash:initial.Hash);
  async Task VerifySaved() {
   var persisted=await workspace()??throw new AcceptanceFault("app_workspace_missing");
   if(persisted["zk_revision"]!.GetValue<int>()!=revision+1||!JToken.DeepEquals(Protocol.Canonical(Protocol.Parse(persisted["zk_state"]!.GetValue<string>())),Protocol.Canonical(expected)))throw new AcceptanceFault("saved_state_business_or_history_mismatch");
   var receipts=await receiptsRead();var receipt=receipts.SingleOrDefault(r=>r["zk_operationid"]?.GetValue<string>()==Scope.CommitOperation);
   if(receipts.Length!=receiptsBefore.Length+1||receipt==null)throw new AcceptanceFault("receipt_count_mismatch");
   Checks.Receipt(receipt,hash,actor,revision+1);
   foreach(var old in receiptsBefore)if(!receipts.Any(r=>Checks.Same(r,old)))throw new AcceptanceFault("existing_receipt_changed");
  }
  async Task<JObject> PostOnce(Probe request,Fingerprint prior) {
   try {
    var outcome=await transport.ProbeAsync(request);
    if(!outcome.Success)evidence.Checks.Add(new("commit_http_refused",false,outcome.Status,Diagnosis.ValidatedCode(outcome.NumericCode),
     GuardDenied:outcome.GuardDenied,FailureKind:Enum.IsDefined(outcome.FailureKind)?outcome.FailureKind:FailureKind.unknown,
     GuardMask:Diagnosis.HasSafeGuardFacts(outcome)?outcome.GuardMask:null,ParentKind:Diagnosis.HasSafeGuardFacts(outcome)?outcome.ParentKind:null,
     WrapperMask:Diagnosis.HasSafeChainFacts(outcome)?outcome.WrapperMask:null,SourceMask:Diagnosis.HasSafeChainFacts(outcome)?outcome.SourceMask:null,SourceKind:Diagnosis.HasSafeChainFacts(outcome)?outcome.SourceKind:null,
     GuardVersion:Diagnosis.HasSafeGuardFacts(outcome)?outcome.GuardVersion:null,BindingReason:Diagnosis.HasSafeBindingFacts(outcome)?outcome.BindingReason:null,
     TargetMask:Diagnosis.HasSafeTargetFacts(outcome)?outcome.TargetMask:null,TargetCount:Diagnosis.HasSafeTargetFacts(outcome)?outcome.TargetCount:null,TargetIdPresence:Diagnosis.HasSafeTargetFacts(outcome)?outcome.TargetIdPresence:null));
    return Checks.Result(outcome);
   } catch(Exception) {
    try {
     var after=await snapshot();evidence.Pass("commit_failure_independent_readback",revision:after.Revision,count:after.OperationCount,hash:after.Hash);
     evidence.Checks.Add(new("commit_failure_persistence_unchanged",prior==after));
    } catch(Exception) {}
    evidence.Fail("commit_fault_or_ambiguous_stop");throw;
   }
  }
  var saved=await PostOnce(frozen,initial);await VerifySaved();Checks.CommitResult(saved,Scope.CommitOperation,"saved",expected,revision+1);
  evidence.Pass("legitimate_no_business_change_saved",revision:revision+1,hash:hash);
  var confirmed=await snapshot();evidence.Pass("commit_confirmed_persistence",revision:confirmed.Revision,count:confirmed.OperationCount,hash:confirmed.Hash);
  // Reuse the same immutable outer body string: the RequestJson bytes cannot be regenerated.
  var repeated=await PostOnce(frozen,confirmed);await VerifySaved();Checks.CommitResult(repeated,Scope.CommitOperation,"saved",expected,revision+1);
  if(confirmed!=await snapshot())throw new AcceptanceFault("idempotent_repeat_changed_persistence");evidence.Pass("exact_bytes_idempotent_repeat",revision:revision+1);
  var conflict=Checks.CommitRequest(before,Scope.ConflictOperation,revision);
  var rejected=await PostOnce(conflict,confirmed);var afterConflict=await snapshot();Checks.CommitResult(rejected,Scope.ConflictOperation,"conflict",expected,null);
  if(confirmed!=afterConflict)throw new AcceptanceFault("conflict_changed_persistence");await VerifySaved();
  evidence.Pass("stale_revision_conflict_unchanged",revision:revision+1);
 }
}
