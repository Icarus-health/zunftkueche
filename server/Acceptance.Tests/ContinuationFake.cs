using Kitchen.Acceptance;
using Kitchen.Deploy;
using Newtonsoft.Json.Linq;
using System.Text.Json.Nodes;
public sealed class ContinuationFake:IAcceptanceTransport {
 public string Defect="";public int Loads,Reads;public List<Probe> Probes=[];
 public Guid Actor=PreflightFake.Actor;
 static readonly Fingerprint Pin=new("8050006306b60bda077c3086a809c6b7d311ec8f5f6d1cc055f16914b5e7c0c6",3,1);
 public JsonObject SeedState=Seed.Normalize(File.ReadAllBytes("import/2026.json"));
 public Task<JsonNode?> SendAsync(HttpMethod m,string p,JsonNode? b=null)=>throw new Exception("unexpected API");
 JObject Expected()=>Checks.ExpectedState(JObject.Parse(SeedState.ToJsonString()),Scope.CommitOperation);
 public Task<JsonObject?> Workspace(){var state=Expected();if(Defect=="state")state["revision"]=2;return Task.FromResult<JsonObject?>(new(){["zk_kitchenworkspaceid"]=Seed.WorkspaceId,["_ownerid_value"]=(Defect=="owner"?Guid.NewGuid():Actor).ToString("D"),["zk_revision"]=Defect=="state_revision"?2:1,["zk_state"]=state.ToString()});}
 public Task<JsonObject[]> Receipts(){
 var app=new JsonObject{["zk_kitchenoperationid"]="0142f058-a3f0-4ea3-bdfe-4b40af4fb64a",["_zk_workspace_value"]=Seed.WorkspaceId,["zk_operationid"]=Scope.CommitOperation,["zk_actor"]=Actor.ToString("D"),["zk_requesthash"]="8e9c02522e69ce5f05a7389b182bda4670510de85d9a9af4d3d8d44cea77ab4c",["zk_appliedrevision"]=1,["zk_recordedat"]="2026-10-15T01:00:00Z"};
 switch(Defect){case "receipt_hash":app["zk_requesthash"]=new string('a',64);break;case "receipt_actor":app["zk_actor"]=Guid.NewGuid().ToString();break;case "receipt_workspace":app["_zk_workspace_value"]=Scope.WorkspaceCanaries[0];break;case "receipt_revision":app["zk_appliedrevision"]=2;break;case "receipt_timestamp":app["zk_recordedat"]="bad";break;case "conflict":app["zk_operationid"]=Scope.ConflictOperation;break;case "other_receipt":app["zk_operationid"]=Guid.NewGuid().ToString();break;}
 var list=new List<JsonObject>();for(int i=0;i<2;i++)list.Add(new(){["zk_kitchenoperationid"]=Scope.ReceiptCanaries[i],["_zk_workspace_value"]=Scope.WorkspaceCanaries[0],["zk_operationid"]=Scope.ReceiptOperations[i]});if(Defect!="receipt_missing")list.Add(app);if(Defect=="receipt_duplicate")list.Add(app.DeepClone().AsObject());return Task.FromResult(list.ToArray());
 }
 public Task<Fingerprint> Snapshot(){Reads++;if(Defect=="readback_failure"&&Probes.Count>0)throw new AcceptanceFault("readback_failed");if(Defect=="revision")return Task.FromResult(Pin with{Revision=2});if(Defect=="count")return Task.FromResult(Pin with{OperationCount=4});if(Defect=="fingerprint"||Defect=="changed_after"&&Probes.Count>0||Defect=="drift_before"&&Probes.Count>0&&Reads>=4)return Task.FromResult(Pin with{Hash=new string('0',64)});return Task.FromResult(Pin);}
 public Task<Outcome> ProbeAsync(Probe p){if(p.Path=="zk_KitchenLoad"){Loads++;var state=Expected();if(Defect=="load")state["revision"]=2;return Task.FromResult(new Outcome(200,new JsonObject{["ResultJson"]=new JObject{{"protocolVersion",1},{"workspaceId",Seed.WorkspaceId},{"state",state},{"canWrite",Defect!="readonly"}}.ToString()}));}Probes.Add(p);if(p.Path.Contains("KitchenCommit")||p.Path.Contains("DeleteMultiple"))throw new Exception("forbidden dispatch");if(Defect=="ambiguous")throw new HttpRequestException("private-sentinel");return Task.FromResult(Defect switch{"success"=>new Outcome(204,null),"http405"=>new Outcome(405,null,NumericCode:"0x8004023b"),"http404"=>new Outcome(404,null),"unknown"=>new Outcome(400,null),_=>new Outcome(400,null,true,NumericCode:"0x80040265",FailureKind:FailureKind.guard_context)});}
 public Task Run(Evidence e)=>DenialContinuation.Run(this,Actor,SeedState,Workspace,Receipts,Snapshot,new Dictionary<string,string>{{Scope.Workspace,Scope.Workspace+"s"},{Scope.Operation,Scope.Operation+"s"}},e);
}
