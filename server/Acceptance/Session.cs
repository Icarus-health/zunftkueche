using System.Text.Json.Nodes;
using Newtonsoft.Json.Linq;
using Kitchen.Deploy;
using Zunftkueche;
namespace Kitchen.Acceptance;
public sealed class Session(IAcceptanceTransport transport,string objectId,JsonObject contract,JsonObject seed,byte[] package) {
 readonly ResourceEngine engine=new(transport,objectId);
 readonly Dictionary<string,string> sets=[];
 Guid actor;
 public Evidence Evidence {get;}=new();
 public async Task RunAsync(string phase) {
  if(phase is not ("inspect" or "prepare-canaries" or "runtime" or "denials-only"))throw new AcceptanceFault("invalid_phase");
  actor=await engine.AuthenticateTargetAsync();Evidence.Pass("target_identity_german_eur");
  var p=new Provisioner(engine,transport,contract);
  await p.Tables(false);
  if(p.Gaps.Count!=0)throw new AcceptanceFault("tables_not_ready");
  foreach(var table in new[]{Scope.Workspace,Scope.Operation}) {
   var metadata=await engine.Get($"EntityDefinitions(LogicalName='{table}')?$select=LogicalName,EntitySetName,TableType,OwnershipType,IsOptimisticConcurrencyEnabled")??throw new AcceptanceFault("table_missing");
   ResourceEngine.RequireMatch(metadata,new JsonObject{["LogicalName"]=table,["TableType"]="Standard",["OwnershipType"]=table==Scope.Workspace?"UserOwned":"OrganizationOwned",["IsOptimisticConcurrencyEnabled"]=true});
   sets[table]=Scope.ValidateSet(table,metadata["EntitySetName"]!.GetValue<string>());
  }
  Evidence.Pass("standard_tables_key_prerequisites");
  if(phase=="inspect"){await VerifyCanaries(false);return;}
  if(phase=="prepare-canaries") {
   var preparationInventory=await VerifiedInventory();
   if(preparationInventory.CustomSteps.Length!=0)throw new AcceptanceFault("preparation_guards_present");
   var types=await engine.Rows("plugintypes?$select=plugintypeid&$filter=typename eq 'Zunftkueche.KitchenWriteGuardPlugin'");
   foreach(var type in types)if((await engine.Rows($"sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid&$filter=_eventhandler_value eq {ResourceEngine.Id(type,"plugintypeid")}")).Length!=0)throw new AcceptanceFault("preparation_guards_present");
   Evidence.Pass("all_guard_steps_absent");await VerifyCanaries(true);return;
  }
  await p.VerifyWorkspace(seed,actor);
  await p.Backend(package,false);
  var expected=contract["guardCoverage"]!.AsArray().Select(c=>"root_runtime_check_required:"+c!["primaryEntity"]!.GetValue<string>()+":"+c["message"]!.GetValue<string>()).Order().ToArray();
  if(expected.Length!=10||!p.Gaps.Order().SequenceEqual(expected))throw new AcceptanceFault("backend_prerequisites_or_runtime_gaps_unexpected");
  var handler=await engine.Find("plugintypes?$select=plugintypeid&$filter=typename eq 'Zunftkueche.KitchenWriteGuardPlugin'")??throw new AcceptanceFault("guard_handler_missing");
  string typeId=ResourceEngine.Id(handler,"plugintypeid");
  var inventory=await VerifiedInventory(typeId);
  Checks.GuardSet(inventory.CustomSteps,typeId);Evidence.Pass("exact_six_active_guards");
  // Directly assigned built-in System Administrator template. Team/ordinary-user grants are outside this helper.
  var roles=await engine.Rows($"systemusers({actor:D})/systemuserroles_association?$select=roleid,_roletemplateid_value");
  if(!roles.Any(r=>string.Equals(r["_roletemplateid_value"]?.GetValue<string>(),"627090ff-40a3-4053-8790-584edc5be201",StringComparison.OrdinalIgnoreCase)))throw new AcceptanceFault("direct_system_administrator_role_required");
  Evidence.Pass("permitted_administrator");
  await VerifyCanaries(false);
  if(phase=="denials-only") {
   await DenialContinuation.Run(transport,actor,seed,()=>Row(Scope.Workspace,Seed.WorkspaceId),Receipts,Snapshot,sets,Evidence);return;
  }
  await RuntimeCommit();
  foreach(var table in new[]{Scope.Workspace,Scope.Operation}) {
   var probes=Scope.SupportedProbes(table,sets[table],actor,sets[Scope.Workspace]);
   Evidence.Availability.Add(new(table,"DeleteMultiple","documented_unsupported_standard_table",false,false));
   foreach(var probe in probes)await Checks.Denial(transport,probe,Snapshot,Evidence);
  }
  Evidence.SupportedDenialsComplete=true;
  Evidence.RootReleaseAllowed=true;
 }
 async Task<PlatformInventory> VerifiedInventory(string? kitchenGuardHandler=null) {
  var handler=await engine.Find(PlatformSteps.TypeQuery)??throw new AcceptanceFault("platform_internal_handler_missing");
  var inventory=PlatformSteps.ValidateAndExclude(handler,await engine.Rows(PlatformSteps.Query(kitchenGuardHandler)));
  Evidence.Pass("verified_platform_main_operation_steps",count:inventory.InternalCount,hash:inventory.DefinitionHash);
  return inventory;
 }
 string Columns(string table)=>table==Scope.Workspace?"zk_kitchenworkspaceid,zk_name,zk_state,zk_revision,_ownerid_value,versionnumber":"zk_kitchenoperationid,zk_name,_zk_workspace_value,zk_operationid,zk_requesthash,zk_actor,zk_appliedrevision,zk_recordedat,versionnumber";
 async Task<JsonObject?> Row(string table,string id) {
  // Canonical fixed-ID read; 404 is absence, never a successful denial proof.
  var outcome=await transport.ProbeAsync(new("fixed_row_read",HttpMethod.Get,$"{sets[table]}({id})?$select={Columns(table)}",null));
  if(outcome.Status==404)return null;
  if(!outcome.Success||outcome.Value is not JsonObject row)throw new AcceptanceFault("fixed_row_read_failed");return row;
 }
 async Task VerifyCanaries(bool create) {
  if(actor==Guid.Empty||sets.Count!=2)throw new AcceptanceFault("target_not_verified");
  foreach(var table in new[]{Scope.Workspace,Scope.Operation})for(int i=0;i<2;i++) {
   var payload=Scope.Row(table,i,actor,sets[Scope.Workspace]);string id=Scope.Existing(table)[i];
   var expected=payload.DeepClone().AsObject();
   if(table==Scope.Workspace){expected.Remove("ownerid@odata.bind");expected["_ownerid_value"]=actor.ToString("D");}
   else{expected.Remove("zk_workspace@odata.bind");expected["_zk_workspace_value"]=Scope.WorkspaceCanaries[0];expected.Remove("zk_recordedat");}
   var row=await Row(table,id);
   if(row==null&&create) {
    bool ambiguous=false;Outcome? outcome=null;
    try{outcome=await transport.ProbeAsync(new("prepare_canary",HttpMethod.Post,sets[table],payload.ToJsonString()));ambiguous=!outcome.Success;}catch(Exception){ambiguous=true;}
    row=await Row(table,id);
    if(row!=null)VerifyCanary(row,expected,table);
    if(ambiguous)Evidence.Fail("canary_creation_ambiguous_stop",outcome);
   }
   if(row==null)throw new AcceptanceFault("canary_missing");VerifyCanary(row,expected,table);
   Evidence.Pass(table+"_canary_"+i);
  }
  foreach(var table in new[]{Scope.Workspace,Scope.Operation})foreach(var id in Scope.Missing(table))if(await Row(table,id)!=null)throw new AcceptanceFault("fixed_absent_probe_row_exists");
  Evidence.Pass("fixed_absent_probe_ids_verified");
 }
 static void VerifyCanary(JsonObject row,JsonObject expected,string table) {
  ResourceEngine.RequireMatch(row,expected);
  if(table==Scope.Operation&&(!DateTimeOffset.TryParse(row["zk_recordedat"]?.GetValue<string>(),out var time)||time!=DateTimeOffset.Parse(Scope.RecordedAt)))throw new AcceptanceFault("canary_timestamp_drift");
 }
 public async Task<Fingerprint> Snapshot() {
  var data=new JsonArray();int revision=-1;
  foreach(var table in new[]{Scope.Workspace,Scope.Operation})foreach(var id in Scope.Existing(table).Concat(Scope.Missing(table)).Concat(table==Scope.Workspace?[Seed.WorkspaceId]:Array.Empty<string>())) {
   var row=await Row(table,id);data.Add(row?.DeepClone());if(table==Scope.Workspace&&id==Seed.WorkspaceId)revision=row?["zk_revision"]?.GetValue<int>()??-1;
  }
  var receipts=await Receipts();foreach(var row in receipts.OrderBy(r=>ResourceEngine.Id(r,Scope.Operation+"id")))data.Add(row.DeepClone());
  return new(Checks.Hash(data),receipts.Length,revision);
 }
 async Task<JsonObject[]> Receipts()=>await engine.Rows($"{sets[Scope.Operation]}?$select={Columns(Scope.Operation)}&$filter=_zk_workspace_value eq {Seed.WorkspaceId} or _zk_workspace_value eq {Scope.WorkspaceCanaries[0]} or _zk_workspace_value eq {Scope.WorkspaceCanaries[1]}");
 async Task RuntimeCommit()=>await RuntimeChecks.Run(transport,actor,()=>Row(Scope.Workspace,Seed.WorkspaceId),Receipts,Snapshot,Evidence);
}
