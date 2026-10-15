using System.Text.Json.Nodes;
using Newtonsoft.Json.Linq;
using Kitchen.Deploy;
using Zunftkueche;
namespace Kitchen.Acceptance;
// One measured checkpoint, not a general resume/journal API. No Commit request is built here.
public static class DenialContinuation {
 public const string RequestHash="8e9c02522e69ce5f05a7389b182bda4670510de85d9a9af4d3d8d44cea77ab4c";
 public static readonly Fingerprint Checkpoint=new("8050006306b60bda077c3086a809c6b7d311ec8f5f6d1cc055f16914b5e7c0c6",3,1);
 public static async Task Run(IAcceptanceTransport transport,Guid actor,JsonObject seed,Func<Task<JsonObject?>> workspace,Func<Task<JsonObject[]>> receiptsRead,Func<Task<Fingerprint>> snapshot,IReadOnlyDictionary<string,string> sets,Evidence evidence) {
  evidence.RootReleaseAllowed=false;evidence.SupportedDenialsComplete=false;
  if(await snapshot()!=Checkpoint)throw new AcceptanceFault("continuation_checkpoint_mismatch");
  var row=await workspace()??throw new AcceptanceFault("app_workspace_missing");
  if(actor==Guid.Empty||ResourceEngine.Id(row,"zk_kitchenworkspaceid")!=Seed.WorkspaceId||ResourceEngine.Id(row,"_ownerid_value")!=actor.ToString("D")||row["zk_revision"]?.GetValue<int>()!=1)throw new AcceptanceFault("continuation_workspace_mismatch");
  var state=Protocol.Parse(row["zk_state"]!.GetValue<string>());
  var baseline=JObject.Parse(seed.ToJsonString());StatePolicy.Validate(state,state);
  var expected=Checks.ExpectedState(baseline,Scope.CommitOperation);
  if(!JToken.DeepEquals(Protocol.Canonical(state),Protocol.Canonical(expected)))throw new AcceptanceFault("continuation_state_mismatch");
  var receipts=await receiptsRead();
  var app=receipts.Where(r=>r["_zk_workspace_value"]?.GetValue<string>()==Seed.WorkspaceId).ToArray();
  if(receipts.Length!=3||app.Length!=1)throw new AcceptanceFault("continuation_receipt_count_mismatch");
  Checks.Receipt(app[0],RequestHash,actor,1);
  var canaries=receipts.Where(r=>r["_zk_workspace_value"]?.GetValue<string>()!=Seed.WorkspaceId).ToArray();
  if(!canaries.Select(r=>ResourceEngine.Id(r,Scope.Operation+"id")).Order().SequenceEqual(Scope.ReceiptCanaries.Order())||canaries.Any(r=>r["_zk_workspace_value"]?.GetValue<string>()!=Scope.WorkspaceCanaries[0]))throw new AcceptanceFault("continuation_receipt_scope_mismatch");
  var load=Checks.Result(await transport.ProbeAsync(new("continuation_load",HttpMethod.Post,"zk_KitchenLoad",new JsonObject{["RequestJson"]=new JsonObject{["protocolVersion"]=1,["workspaceId"]=Seed.WorkspaceId}.ToJsonString()}.ToJsonString())));
  if((int?)load["protocolVersion"]!=1||(string?)load["workspaceId"]!=Seed.WorkspaceId||(bool?)load["canWrite"]!=true||!JToken.DeepEquals(Protocol.Canonical(load["state"]!),Protocol.Canonical(state)))throw new AcceptanceFault("continuation_load_mismatch");
  evidence.Pass("continuation_saved_checkpoint_verified",revision:1,count:3,hash:Checkpoint.Hash);
  // Standard table metadata is verified by Session before this branch. Build and validate both plans before dispatch.
  var plans=new[]{Scope.Workspace,Scope.Operation}.Select(t=>(Table:t,Probes:Scope.SupportedProbes(t,sets[t],actor,sets[Scope.Workspace]))).ToArray();
  foreach(var plan in plans)evidence.Availability.Add(new(plan.Table,"DeleteMultiple","documented_unsupported_standard_table",false,false));
  foreach(var plan in plans)foreach(var probe in plan.Probes)await Checks.Denial(transport,probe,snapshot,evidence,Checkpoint);
  evidence.SupportedDenialsComplete=true;
  // Historical save/replay/conflict stay in Root25963 evidence, not re-attested by this phase.
 }
}
