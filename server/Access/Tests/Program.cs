using Kitchen.Access;
using Kitchen.Deploy;
using System.Text.Json.Nodes;
using System.Text.Json;
int passed=0,failed=0;
async Task Test(string name,Func<Task> body){try{await body();Console.WriteLine("PASS "+name);passed++;}catch(Exception e){Console.WriteLine("FAIL "+name+": "+e.Message);failed++;}}
void Check(bool value,string message="assertion"){if(!value)throw new Exception(message);}
async Task Refuses(Fake f,string code,int writes=0){var sut=new FixedAccess(f,Fake.ObjectId);try{await sut.Run(true);throw new Exception("did not refuse");}catch(DeploymentException e){Check(e.Message==code,"expected "+code+" got "+e.Message);}Check(f.Writes.Count==writes,"unexpected write count");}
await Test("offline default and exact explicit modes",()=>{Check(AccessProgram.Parse([])==AccessMode.Offline);Check(AccessProgram.Parse(["--inspect"])==AccessMode.Inspect);Check(AccessProgram.Parse(["--execute"])==AccessMode.Execute);foreach(var a in new[]{new[]{"--execute","--inspect"},new[]{"--user","other"},new[]{"--execute","--execute"}}){try{AccessProgram.Parse(a);throw new Exception("accepted arbitrary args");}catch(DeploymentException){}}return Task.CompletedTask;});
await Test("inspect performs only reads and exposes inventory",async()=>{var f=new Fake();var s=new FixedAccess(f,Fake.ObjectId);Check(!await s.Run(false));Check(f.Writes.Count==0);Check(JsonSerializer.Serialize(s.Facts).Contains("access_inventory"));Check(f.Reads.Any(p=>p.Contains("RetrievePrincipalAccess")));});
await Test("create exact six rights then assignment then exact share",async()=>{var f=new Fake();Check(await new FixedAccess(f,Fake.ObjectId).Run(true));Check(f.Writes.Count==4);Check(f.Writes[0].Path=="roles");Check(f.Writes[0].Body!["businessunitid@odata.bind"]!.GetValue<string>()=="/businessunits("+Fake.Bu+")");var grants=f.Writes[1].Body!["Privileges"]!.AsArray();Check(grants.Count==6);Check(grants.Select(x=>x!["Depth"]!.GetValue<string>()).SequenceEqual(new[]{"Basic","Basic","Basic","Global","Global","Global"}));Check(grants.Select(x=>x!["PrivilegeId"]!.GetValue<string>()).SequenceEqual(Fake.PrivilegeIds.Take(6)));Check(f.Writes[2].Path=="systemusers("+Fake.User+")/systemuserroles_association/$ref");Check(f.Writes[3].Path=="GrantAccess");Check(f.Writes[3].Body!["PrincipalAccess"]!["AccessMask"]!.GetValue<string>()=="ReadAccess, WriteAccess, AppendToAccess");Check(f.Writes[3].Body!["Target"]!["zk_kitchenworkspaceid"]!.GetValue<string>()==Fake.Workspace);});
await Test("exact existing role assignment and access reused without writes",async()=>{var f=new Fake{RoleExists=true,ExactPrivileges=true,Assigned=true,Shared=true};Check(await new FixedAccess(f,Fake.ObjectId).Run(true));Check(f.Writes.Count==0);});
await Test("existing exact role requires only missing assignment and share",async()=>{var f=new Fake{RoleExists=true,ExactPrivileges=true};Check(await new FixedAccess(f,Fake.ObjectId).Run(true));Check(f.Writes.Count==2);Check(f.Writes.All(x=>x.Path!="roles"&&!x.Path.Contains("AddPrivileges")));});
await Test("wrong org rejects before writes",()=>Refuses(new Fake{WrongOrg=true},"wrong_organization"));
await Test("wrong authenticated object rejects before writes",async()=>{var f=new Fake();try{await new FixedAccess(f,Fake.Other).Run(true);throw new Exception("accepted wrong auth");}catch(DeploymentException e){Check(e.Message=="identity_object_id_mismatch");}Check(f.Writes.Count==0);});
await Test("missing exact Schreiber rejected",()=>Refuses(new Fake{MissingUser=true},"schreiber_not_unique"));
await Test("duplicate exact Schreiber rejected",()=>Refuses(new Fake{DuplicateUser=true},"schreiber_not_unique"));
await Test("disabled Schreiber rejected",()=>Refuses(new Fake{Disabled=true},"schreiber_identity_invalid"));
await Test("application identity rejected",()=>Refuses(new Fake{ApplicationUser=true},"schreiber_identity_invalid"));
await Test("owner drift rejects",()=>Refuses(new Fake{OwnerDrift=true},"workspace_owner_or_revision_drift"));
await Test("revision below two rejects",()=>Refuses(new Fake{Revision=1},"workspace_owner_or_revision_drift"));
await Test("duplicate role rejects",()=>Refuses(new Fake{RoleExists=true,ExactPrivileges=true,DuplicateRole=true},"role_not_unique"));
await Test("existing empty role never repaired",()=>Refuses(new Fake{RoleExists=true},"role_privileges_drift"));
await Test("existing overbroad role rejects",()=>Refuses(new Fake{RoleExists=true,ExactPrivileges=true,ExtraPrivilege=true},"role_privileges_drift"));
await Test("existing wrong depth rejects",()=>Refuses(new Fake{RoleExists=true,ExactPrivileges=true,WrongDepth=true},"role_privileges_drift"));
await Test("platform automatic baseline stops before any extra grants",()=>Refuses(new Fake{AutomaticBaseline=true},"role_privileges_drift",1));
await Test("metadata privilege mismatch rejects before writes",()=>Refuses(new Fake{DuplicatePrivilege=true},"privilege_metadata_invalid"));
await Test("API execute privilege mismatch rejects before writes",()=>Refuses(new Fake{ApiDrift=true},"api_execute_privilege_drift"));
await Test("paged user inventory refuses",()=>Refuses(new Fake{PagedUsers=true},"unexpected_or_paginated_query_refine_filter"));
foreach(int step in new[]{1,2,3,4}){
 await Test("ambiguous step "+step+" confirms readback without retry",async()=>{var f=new Fake{ThrowStep=step};Check(await new FixedAccess(f,Fake.ObjectId).Run(true));Check(f.Writes.Count==4);});
 await Test("uncommitted ambiguous step "+step+" stops no retry",()=>Refuses(new Fake{ThrowStep=step,DropStep=step},"write_outcome_unconfirmed_stop",step));
}
await Test("workspace revision changes after write stop next mutation",()=>Refuses(new Fake{ChangeAfterStep=1},"workspace_changed_during_access",1));
await Test("membership not independently visible stops before sharing",()=>Refuses(new Fake{DropStep=3},"write_outcome_unconfirmed_stop",3));
await Test("safe facts do not echo role names state or provider errors",async()=>{var f=new Fake{ThrowStep=2};var s=new FixedAccess(f,Fake.ObjectId);Check(await s.Run(true));var json=JsonSerializer.Serialize(s.Facts);Check(!json.Contains("SECRET"));Check(!f.Reads.Any(p=>p.Contains("zk_state")));});
await Test("all inventory precedes first write and each successful step is independently read back",async()=>{var f=new Fake();await new FixedAccess(f,Fake.ObjectId).Run(true);var writeIndexes=f.Events.Select((v,i)=>(v,i)).Where(x=>x.v.StartsWith("POST ")).Select(x=>x.i).ToArray();var before=f.Events.Take(writeIndexes[0]).ToArray();Check(before.Any(x=>x.Contains("teammembership_association"))&&before.Any(x=>x.Contains("RetrieveUserPrivileges"))&&before.Any(x=>x.Contains("RetrievePrincipalAccess")));for(int n=0;n<writeIndexes.Length;n++){var after=f.Events.Skip(writeIndexes[n]+1).Take((n+1<writeIndexes.Length?writeIndexes[n+1]:f.Events.Count)-writeIndexes[n]-1).ToArray();Check(after.Any(x=>x.Contains("RetrieveRolePrivilegesRole")));Check(after.Any(x=>x.Contains("systemuserroles_association")));Check(after.Any(x=>x.Contains("RetrievePrincipalAccess")));Check(after.Any(x=>x.Contains("zk_kitchenworkspaces(")));}});
await Test("team role breadth is inspected at actual role depth",()=>Refuses(new Fake{TeamRole=true,ExtraPrivilege=true},"existing_kitchen_privileges_broader_than_plan"));
await Test("existing extra workspace rights never overwritten",()=>Refuses(new Fake{BroadAccess=true},"existing_workspace_access_broader_than_plan"));
await Test("unknown access enum refuses without writes",()=>Refuses(new Fake{UnknownAccess=true},"invalid_access_rights"));
await Test("role wrong businessunit readback refuses",()=>Refuses(new Fake{RoleExists=true,ExactPrivileges=true,RoleBuDrift=true},"role_identity_drift"));
await Test("role duplicate privilege cannot substitute missing sixth",()=>Refuses(new Fake{RoleExists=true,ExactPrivileges=true,DuplicateRolePrivilege=true},"role_privileges_drift"));
await Test("businessunit drifts during step stops remaining writes",()=>Refuses(new Fake{UserBuAfterStep=1},"schreiber_identity_drift",1));
await Test("assignment binding contains only fixed exact role",async()=>{var f=new Fake{RoleExists=true,ExactPrivileges=true};await new FixedAccess(f,Fake.ObjectId).Run(true);Check(f.Writes[0].Body!.AsObject().Count==1);Check(f.Writes[0].Body!["@odata.id"]!.GetValue<string>()=="https://org1d76e28a.crm17.dynamics.com/api/data/v9.2/roles("+Fake.Role+")");Check(f.Writes[1].Body!["PrincipalAccess"]!["Principal"]!["systemuserid"]!.GetValue<string>()==Fake.User);});
await Test("malformed create readback stops without assignment",()=>Refuses(new Fake{MalformedAfterCreate=true},"role_identity_drift",1));
await Test("existing unrelated role removal during assignment stops sharing",()=>Refuses(new Fake{OriginalRole=true,DropOriginalRoleAfter=3},"existing_role_assignment_changed",3));
foreach(int step in new[]{0,1,2,3,4})
 await Test("forbidden effective kitchen privilege stops at inventory step "+step,()=>Refuses(new Fake{EffectiveForbiddenFromStep=step},"effective_kitchen_privileges_broader_than_plan",step));
await Test("inspect cannot report ready with missing effective receipt Append",async()=>{var f=new Fake{RoleExists=true,ExactPrivileges=true,Assigned=true,Shared=true,EffectiveMissingFromStep=0};Check(!await new FixedAccess(f,Fake.ObjectId).Run(false));Check(f.Writes.Count==0);});
await Test("existing assignment with missing effective receipt Append stops before share",()=>Refuses(new Fake{RoleExists=true,ExactPrivileges=true,Assigned=true,EffectiveMissingFromStep=0},"effective_kitchen_privileges_incomplete"));
await Test("missing effective privilege after new assignment stops further grant",()=>Refuses(new Fake{EffectiveMissingFromStep=3},"effective_kitchen_privileges_incomplete",3));
await Test("effective privilege disappears after share cannot claim final ready",()=>Refuses(new Fake{EffectiveMissingFromStep=4},"effective_kitchen_privileges_incomplete",4));
await Test("normalized effective team depths do not replace actual role depths",async()=>{var f=new Fake{RoleExists=true,ExactPrivileges=true,Assigned=true,Shared=true,TeamRole=true,NormalizeEffectiveDepth=true};Check(await new FixedAccess(f,Fake.ObjectId).Run(true));Check(f.Writes.Count==0);});
await Test("unrelated effective platform privilege is preserved",async()=>{var f=new Fake{RoleExists=true,ExactPrivileges=true,Assigned=true,Shared=true,OtherEffectivePrivilege=true};Check(await new FixedAccess(f,Fake.ObjectId).Run(true));Check(f.Writes.Count==0);});
var preparation=await PreparationTests.Run();passed+=preparation.Passed;failed+=preparation.Failed;
var observed=await ObservedTests.Run();passed+=observed.Passed;failed+=observed.Failed;
Console.WriteLine($"{passed} passed, {failed} failed");return failed==0?0:1;

sealed class Fake : IDataverseTransport {
 public const string Admin="11111111-1111-4111-8111-111111111111",User="22222222-2222-4222-8222-222222222222",Bu="33333333-3333-4333-8333-333333333333",Role="44444444-4444-4444-8444-444444444444",Other="55555555-5555-4555-8555-555555555555",ObjectId="66666666-6666-4666-8666-666666666666",Workspace="45deaf94-5661-4110-8f16-3d2678c09f04";
 public static readonly string[] PrivilegeIds=Enumerable.Range(1,16).Select(n=>$"77777777-7777-4777-8777-{n:D12}").ToArray();
 public bool RoleExists,ExactPrivileges,Assigned,Shared,WrongOrg,MissingUser,DuplicateUser,Disabled,ApplicationUser,OwnerDrift,DuplicateRole,ExtraPrivilege,WrongDepth,AutomaticBaseline,DuplicatePrivilege,ApiDrift,PagedUsers,TeamRole,BroadAccess,UnknownAccess,RoleBuDrift,DuplicateRolePrivilege,MalformedAfterCreate,OriginalRole,NormalizeEffectiveDepth,OtherEffectivePrivilege;
 public int Revision=2,ThrowStep,DropStep,ChangeAfterStep,UserBuAfterStep,DropOriginalRoleAfter;
 public int EffectiveForbiddenFromStep=-1,EffectiveMissingFromStep=-1;
 public List<string> Reads=[];
 public List<string> Events=[];
 public List<(string Path,JsonNode? Body)> Writes=[];
 JsonObject Row(params (string,object?)[] fields){var o=new JsonObject();foreach(var(k,v)in fields)o[k]=v==null?null:JsonSerializer.SerializeToNode(v);return o;}
 JsonObject Rows(params JsonNode[] rows)=>new(){["value"]=new JsonArray(rows)};
 JsonArray RolePrivileges(){var a=new JsonArray();if(ExactPrivileges)for(int i=0;i<6;i++)a.Add(Row(("PrivilegeId",PrivilegeIds[i]),("Depth",i<3?(WrongDepth?"Global":"Basic"):"Global"),("BusinessUnitId",Bu)));if(ExtraPrivilege)a.Add(Row(("PrivilegeId",PrivilegeIds[6]),("Depth","Global"),("BusinessUnitId",Bu)));if(DuplicateRolePrivilege&&a.Count==6)a[5]=a[0]!.DeepClone();return a;}
 public Task<JsonNode?> SendAsync(HttpMethod method,string path,JsonNode? payload=null){
  if(method!=HttpMethod.Get){if(method!=HttpMethod.Post)throw new Exception("unsafe method");Events.Add("POST "+path);Writes.Add((path,payload?.DeepClone()));int n=Writes.Count;if(n!=DropStep){if(path=="roles"){RoleExists=true;ExtraPrivilege=AutomaticBaseline;}else if(path=="roles("+Role+")/Microsoft.Dynamics.CRM.AddPrivilegesRole")ExactPrivileges=true;else if(path=="systemusers("+User+")/systemuserroles_association/$ref")Assigned=true;else if(path=="GrantAccess")Shared=true;else throw new Exception("unexpected mutation "+path);}if(ChangeAfterStep==n)Revision++;if(ThrowStep==n)throw new HttpRequestException("SECRET provider raw");return Task.FromResult<JsonNode?>(null);}
  Events.Add("GET "+path);Reads.Add(path);JsonNode? result;
  if(path=="WhoAmI")result=Row(("OrganizationId",WrongOrg?Other:Target.Organization),("UserId",Admin));
  else if(path.StartsWith("systemusers("+Admin+")"))result=Row(("domainname",Target.User),("isdisabled",false),("azureactivedirectoryobjectid",ObjectId));
  else if(path.StartsWith("organizations("))result=Row(("languagecode",1031),("_basecurrencyid_value",Other));
  else if(path.StartsWith("transactioncurrencies("))result=Row(("isocurrencycode","EUR"));
  else if(path.StartsWith("systemusers?$")){var row=Row(("systemuserid",User),("domainname","Schreiber@Schelmenzunft.onmicrosoft.com"),("isdisabled",Disabled),("accessmode",0),("applicationid",ApplicationUser?Other:null),("azureactivedirectoryobjectid",Other),("_businessunitid_value",UserBuAfterStep>0&&Writes.Count>=UserBuAfterStep?Other:Bu));result=MissingUser?Rows():DuplicateUser?Rows(row,row.DeepClone()):Rows(row);if(PagedUsers)result["@odata.nextLink"]="SECRET";}
  else if(path.StartsWith("businessunits("))result=Row(("businessunitid",Bu),("isdisabled",false));
  else if(path.StartsWith("zk_kitchenworkspaces("))result=Row(("zk_kitchenworkspaceid",Workspace),("_ownerid_value",OwnerDrift?Other:Admin),("zk_revision",Revision));
  else if(path.Contains("systemuserroles_association")){var rr=new List<JsonNode>();if(Assigned)rr.Add(Row(("roleid",Role),("_businessunitid_value",Bu)));if(OriginalRole&&(DropOriginalRoleAfter==0||Writes.Count<DropOriginalRoleAfter))rr.Add(Row(("roleid",Other),("_businessunitid_value",Bu)));result=Rows(rr.ToArray());}
  else if(path.Contains("teammembership_association"))result=TeamRole?Rows(Row(("teamid",Other))):Rows();
  else if(path.Contains("teamroles_association"))result=Rows(Row(("roleid",Role)));
  else if(path.Contains("RetrieveUserPrivileges")){
   var effective=Assigned?RolePrivileges():new JsonArray();
   if(EffectiveMissingFromStep>=0&&Writes.Count>=EffectiveMissingFromStep&&effective.Count==6)effective.RemoveAt(5);
   if(EffectiveForbiddenFromStep>=0&&Writes.Count>=EffectiveForbiddenFromStep)effective.Add(Row(("PrivilegeId",PrivilegeIds[12]),("Depth","Global")));
   if(NormalizeEffectiveDepth)foreach(var p in effective)p!["Depth"]="Basic";
   if(OtherEffectivePrivilege)effective.Add(Row(("PrivilegeId",Other),("Depth","Global")));
   result=new JsonObject{["RolePrivileges"]=effective};
  }
  else if(path.Contains("RetrievePrincipalAccess"))result=Row(("AccessRights",UnknownAccess?"SECRET":BroadAccess?"ReadAccess, WriteAccess, AppendToAccess, DeleteAccess":Shared?"ReadAccess, WriteAccess, AppendToAccess":"None"));
  else if(path.StartsWith("EntityDefinitions(")){bool w=path.Contains("zk_kitchenworkspace");var names=w?new[]{"Read","Write","AppendTo","Create","Delete","Assign","Share","Append"}:new[]{"Read","Create","Append","Write","Delete","Assign","Share","AppendTo"};var a=new JsonArray();for(int i=0;i<names.Length;i++)a.Add(Row(("PrivilegeType",names[i]),("PrivilegeId",PrivilegeIds[w?(i<3?i:i+3):(i<3?i+3:i+8)]),("Name","prv"+names[i]+(w?"zk_kitchenworkspace":"zk_kitchenoperation")),("CanBeBasic",w),("CanBeGlobal",true)));if(DuplicatePrivilege)a.Add(a[0]!.DeepClone());result=Row(("LogicalName",w?"zk_kitchenworkspace":"zk_kitchenoperation"),("OwnershipType",w?"UserOwned":"OrganizationOwned"),("TableType","Standard"));result["Privileges"]=a;}
  else if(path.StartsWith("customapis?"))result=Rows(Row(("uniquename","zk_KitchenLoad"),("executeprivilegename",ApiDrift?"SECRET":"prvReadzk_kitchenworkspace")),Row(("uniquename","zk_KitchenCommit"),("executeprivilegename","prvWritezk_kitchenworkspace")));
  else if(path.StartsWith("roles?$")){var r=Row(("roleid",Role),("name","Zunftküche Bearbeiter"),("_businessunitid_value",RoleBuDrift?Other:Bu),("ismanaged",MalformedAfterCreate&&Writes.Count>0),("_roletemplateid_value",null));result=!RoleExists?Rows():DuplicateRole?Rows(r,r.DeepClone()):Rows(r);}
  else if(path.StartsWith("RetrieveRolePrivilegesRole("))result=new JsonObject{["RolePrivileges"]=path.Contains(Other)?new JsonArray():RolePrivileges()};
  else throw new Exception("unexpected GET "+path);
  return Task.FromResult<JsonNode?>(result);
 }
}
