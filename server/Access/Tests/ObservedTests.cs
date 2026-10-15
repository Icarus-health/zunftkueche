using Kitchen.Access;
using Kitchen.Deploy;
using System.Text.Json;
using System.Text.Json.Nodes;

static class ObservedTests {
 public static async Task<(int Passed,int Failed)> Run(){
  int passed=0,failed=0;
  void Check(bool ok,string m="assertion"){if(!ok)throw new Exception(m);}
  async Task Test(string name,Func<Task> body){try{await body();passed++;Console.WriteLine("PASS observed: "+name);}catch(Exception e){failed++;Console.WriteLine("FAIL observed: "+name+": "+e.Message);}}
  FixedAccess Sut(ObservedFake f)=>new(f,PreparationFake.AadAdmin,AccessProfile.ObservedTen);
  async Task Refuse(ObservedFake f,int writes=0,string code="role_privileges_drift"){try{await Sut(f).Run(true);throw new Exception("not refused");}catch(DeploymentException e){Check(e.Message==code,"expected "+code+" got "+e.Message);}Check(f.Writes.Count==writes,"unexpected writes");}
  await Test("exact isolated command modes",()=>{Check(AccessProgram.Parse(["--inspect-observed-role"]).ToString()=="InspectObservedRole");Check(AccessProgram.Parse(["--execute-observed-role"]).ToString()=="ExecuteObservedRole");try{AccessProgram.Parse(["--execute-observed-role","--execute"]);throw new Exception("mixed modes");}catch(DeploymentException){}return Task.CompletedTask;});
  await Test("inspect exact ten without writes",async()=>{var f=new ObservedFake();Check(!await Sut(f).Run(false));Check(f.Writes.Count==0);foreach(var path in ObservedFake.AbsencePaths)Check(f.Events.Contains("GET "+path));});
  await Test("two exact grants only",async()=>{var f=new ObservedFake();Check(await Sut(f).Run(true));Check(f.Writes.Count==2);Check(f.Writes[0].Path==$"systemusers({PreparationFake.User})/systemuserroles_association/$ref");Check(f.Writes[0].Body!["@odata.id"]!.GetValue<string>()==$"{Target.Url}/api/data/v9.2/roles({PreparationFake.Role})");Check(f.Writes[1].Path=="GrantAccess");Check(f.Writes[1].Body!["Target"]!["zk_kitchenworkspaceid"]!.GetValue<string>()==FixedAccess.Workspace);Check(f.Writes[1].Body!["PrincipalAccess"]!["AccessMask"]!.GetValue<string>()=="ReadAccess, WriteAccess, AppendToAccess");});
  await Test("exact prior grants reuse",async()=>{var f=new ObservedFake{Assigned=true,Shared=true};Check(await Sut(f).Run(true));Check(f.Writes.Count==0);});
  await Test("legacy remains six only",async()=>{var f=new ObservedFake();try{await new FixedAccess(f,PreparationFake.AadAdmin).Run(true);throw new Exception("legacy accepted ten");}catch(DeploymentException e){Check(e.Message=="role_privileges_drift");}Check(f.Writes.Count==0);});
  foreach(var gate in new[]{0,1,2})foreach(var kind in new[]{"present","error","missing","paged","error_envelope"})await Test($"SP gate {gate} {kind} stops",()=>Refuse(new(){Gate=gate,GateKind=kind},0,kind=="present"?"sharepoint_configuration_present":"sharepoint_configuration_unavailable"));
  foreach(var gate in new[]{0,1,2})await Test($"SP gate {gate} after assignment stops share",()=>Refuse(new(){Gate=gate,GateKind="present",GateAfter=1},1,"sharepoint_configuration_present"));
  foreach(var gate in new[]{0,1,2})await Test($"SP gate {gate} after share stops readiness",()=>Refuse(new(){Gate=gate,GateKind="present",GateAfter=2},2,"sharepoint_configuration_present"));
  foreach(var kind in new[]{"six","extra","duplicate","depth","bu","filter","missing_filter","name"})await Test("role exact ten rejects "+kind,()=>Refuse(new(){RoleDrift=kind},0,kind=="name"?"observed_privilege_names_drift":"role_privileges_drift"));
  foreach(var kind in new[]{"aad","user","bu"})await Test("fixed identity "+kind,()=>Refuse(new(){IdentityDrift=kind},0,"observed_identity_drift"));
  await Test("wrong role ID",()=>Refuse(new(){WrongRole=true},0,"observed_role_identity_drift"));
  await Test("missing role no create",()=>Refuse(new(){MissingRole=true},0,"observed_role_missing"));
  foreach(int step in new[]{1,2}){
   await Test("ambiguous committed "+step,async()=>{var f=new ObservedFake{ThrowStep=step};Check(await Sut(f).Run(true));Check(f.Writes.Count==2);});
   await Test("ambiguous uncommitted "+step,()=>Refuse(new(){ThrowStep=step,DropStep=step},step,"write_outcome_unconfirmed_stop"));
  }
  await Test("missing fourth effective SP privilege stops share",()=>Refuse(new(){MissingEffective=true},1,"observed_effective_privileges_drift"));
  await Test("missing fourth effective SP privilege cannot inspect ready",async()=>{var f=new ObservedFake{Assigned=true,Shared=true,MissingEffective=true};try{await Sut(f).Run(false);throw new Exception("missing effective accepted");}catch(DeploymentException e){Check(e.Message=="observed_effective_privileges_drift");}Check(f.Writes.Count==0);});
  foreach(var kind in new[]{"direct","team","effective_before","effective_extra"})await Test("unexpected inventory "+kind,()=>Refuse(new(){InventoryDrift=kind,Assigned=kind=="effective_extra"},0,kind.StartsWith("effective")?"observed_effective_privileges_drift":"observed_role_assignments_drift"));
  await Test("absence reads immediately surround every dispatch",async()=>{var f=new ObservedFake();Check(await Sut(f).Run(true));var indices=f.Events.Select((s,i)=>(s,i)).Where(x=>x.s.StartsWith("POST ")).Select(x=>x.i).ToArray();foreach(int i in indices){Check(f.Events.Skip(i-3).Take(3).SequenceEqual(ObservedFake.AbsencePaths.Select(p=>"GET "+p)),"missing immediate prewrite absence");int next=indices.FirstOrDefault(n=>n>i,f.Events.Count);foreach(var path in ObservedFake.AbsencePaths)Check(f.Events.Skip(i+1).Take(next-i-1).Contains("GET "+path));}});
  await Test("facts report exact four retained rights and no state or raw errors",async()=>{var f=new ObservedFake{ThrowStep=1};var s=Sut(f);Check(await s.Run(true));string facts=JsonSerializer.Serialize(s.Facts);Check(facts.Contains("ten_privileges")&&facts.Contains("sharepoint_configuration_absent")&&!facts.Contains("SECRET"));Check(!f.Events.Any(p=>p.Contains("zk_state")));});
  return(passed,failed);
 }
}
sealed class ObservedFake:IDataverseTransport {
 readonly PreparationFake inner=new();
 public static readonly string[] AbsencePaths=["sharepointmanagedidentities?$select=sharepointmanagedidentityid&$top=1","sharepointsites?$select=sharepointsiteid&$top=1","sharepointdocumentlocations?$select=sharepointdocumentlocationid&$top=1"];
 public static readonly (string Id,string Name)[] SharePoint=PreparationFake.Baseline.Where(p=>p.Name.Contains("SharePoint")).ToArray();
 public bool Assigned,Shared,WrongRole,MissingRole,MissingEffective;
 public int Gate=-1,GateAfter,ThrowStep,DropStep;
 public string GateKind="",RoleDrift="",IdentityDrift="",InventoryDrift="";
 public List<string> Events=[];
 public List<(string Path,JsonNode? Body)> Writes=[];
 static JsonObject Rows(params JsonNode[] rows)=>new(){["value"]=new JsonArray(rows)};
 JsonArray Privileges(){var a=new JsonArray();for(int i=0;i<6;i++)a.Add(new JsonObject{["PrivilegeId"]=PreparationFake.WantedIds[i],["Depth"]=i<3?"Basic":"Global",["BusinessUnitId"]=PreparationFake.Bu,["RecordFilterId"]=Guid.Empty.ToString("D")});if(RoleDrift!="six")foreach(var p in SharePoint)a.Add(new JsonObject{["PrivilegeId"]=p.Id,["Depth"]="Global",["BusinessUnitId"]=PreparationFake.Bu,["RecordFilterId"]=Guid.Empty.ToString("D")});switch(RoleDrift){case "extra":a.Add(a[0]!.DeepClone());break;case "duplicate":a[9]=a[8]!.DeepClone();break;case "depth":a[9]!["Depth"]="Basic";break;case "bu":a[9]!["BusinessUnitId"]=PreparationFake.Other;break;case "filter":a[9]!["RecordFilterId"]=PreparationFake.Other;break;case "missing_filter":a[9]!.AsObject().Remove("RecordFilterId");break;}return a;}
 public async Task<JsonNode?> SendAsync(HttpMethod method,string path,JsonNode? payload=null){
  Events.Add(method+" "+path);
  if(method!=HttpMethod.Get){if(method!=HttpMethod.Post||!(path==$"systemusers({PreparationFake.User})/systemuserroles_association/$ref"||path=="GrantAccess"))throw new Exception("unexpected mutation");Writes.Add((path,payload?.DeepClone()));int n=Writes.Count;if(n!=DropStep){if(path=="GrantAccess")Shared=true;else Assigned=true;}if(n==ThrowStep)throw new HttpRequestException("SECRET");return null;}
  int gate=Array.IndexOf(AbsencePaths,path);if(gate>=0){if(gate==Gate&&Writes.Count>=GateAfter)return GateKind switch{"present"=>Rows(new JsonObject{["id"]="SECRET"}),"error"=>throw new DeploymentException("provider_error"),"missing"=>new JsonObject(),"error_envelope"=>new JsonObject{["value"]=new JsonArray(),["error"]=new JsonObject{["message"]="SECRET"}},"paged"=>new JsonObject{["value"]=new JsonArray(),["@odata.nextLink"]="SECRET"},_=>throw new Exception("bad fake")};return Rows();}
  if(path.StartsWith("RetrieveRolePrivilegesRole("))return new JsonObject{["RolePrivileges"]=Privileges()};
  if(path.StartsWith("privileges?$"))return Rows(SharePoint.Select(p=>(JsonNode)new JsonObject{["privilegeid"]=p.Id,["name"]=RoleDrift=="name"?"SECRET":p.Name}).ToArray());
  if(path.StartsWith("teams(")&&path.Contains("teamroles_association")&&InventoryDrift=="team")return Rows(new JsonObject{["roleid"]=PreparationFake.Other});
  if(path.StartsWith($"systemusers({PreparationFake.User})/systemuserroles_association")&&InventoryDrift=="direct")return Rows(new JsonObject{["roleid"]=PreparationFake.Other});
  if(path.StartsWith($"systemusers({PreparationFake.User})/systemuserroles_association"))return Assigned?Rows(new JsonObject{["roleid"]=PreparationFake.Role,["_businessunitid_value"]=PreparationFake.Bu}):Rows();
  if(path.Contains("RetrieveUserPrivileges")){var a=Assigned?Privileges():new JsonArray();if(InventoryDrift.StartsWith("effective"))a.Add(new JsonObject{["PrivilegeId"]=PreparationFake.Other});if(MissingEffective&&a.Count>0)a.RemoveAt(a.Count-1);return new JsonObject{["RolePrivileges"]=a};}
  if(path.Contains("RetrievePrincipalAccess"))return new JsonObject{["AccessRights"]=Shared?"ReadAccess, WriteAccess, AppendToAccess":"None"};
  inner.IdentityDrift=IdentityDrift;inner.RoleDrift=WrongRole?"id":"";
  if(MissingRole&&path.StartsWith("roles?$"))return Rows();
  return await inner.SendAsync(method,path,payload);
 }
}
