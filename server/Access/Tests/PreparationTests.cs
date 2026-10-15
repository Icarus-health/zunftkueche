using Kitchen.Access;
using Kitchen.Deploy;
using System.Text.Json;
using System.Text.Json.Nodes;

static class PreparationTests {
 public static async Task<(int Passed,int Failed)> Run(){
  int passed=0,failed=0;
  void Check(bool b,string m="assertion"){if(!b)throw new Exception(m);}
  async Task Test(string name,Func<Task> body){try{await body();passed++;Console.WriteLine("PASS prepare: "+name);}catch(Exception e){failed++;Console.WriteLine("FAIL prepare: "+name+": "+e.Message);}}
  async Task Reject(PreparationFake f,string code,int writes=0){try{await new RolePreparation(f,PreparationFake.AadAdmin).Run();throw new Exception("did not refuse");}catch(DeploymentException e){Check(e.Message==code,"expected "+code+" got "+e.Message);}Check(f.Writes.Count==writes,"unexpected write count");}
  await Test("explicit separate mode only",()=>{Check(AccessProgram.Parse(["--prepare-existing-role"]).ToString()=="PrepareExistingRole");foreach(var a in new[]{new[]{"--prepare-existing-role","--execute"},new[]{"--prepare-existing-role","--role",PreparationFake.Role}}){try{AccessProgram.Parse(a);throw new Exception("arbitrary args accepted");}catch(DeploymentException){}}return Task.CompletedTask;});
  await Test("exact baseline replaced once with six actual table privileges",async()=>{var f=new PreparationFake();Check(await new RolePreparation(f,PreparationFake.AadAdmin).Run());Check(f.Writes.Count==1);Check(f.Writes[0].Path=="roles(660a97b9-a8c8-f111-a05c-7ced8d5f6c91)/Microsoft.Dynamics.CRM.ReplacePrivilegesRole");var a=f.Writes[0].Body!["Privileges"]!.AsArray();Check(a.Count==6);Check(a.Select(n=>n!["PrivilegeId"]!.GetValue<string>()).SequenceEqual(PreparationFake.WantedIds));Check(a.Select(n=>n!["Depth"]!.GetValue<string>()).SequenceEqual(new[]{"Basic","Basic","Basic","Global","Global","Global"}));Check(a.All(n=>n!["BusinessUnitId"]!.GetValue<string>()==PreparationFake.Bu));Check(!f.Reads.Any(p=>p.Contains("zk_state")));});
  foreach(var drift in new[]{"aad","user","bu","disabled","application"})await Test("fixed recipient "+drift+" drift stops",()=>Reject(new(){IdentityDrift=drift},"preparation_identity_drift"));
  foreach(var drift in new[]{"owner","revision"})await Test("workspace "+drift+" drift stops",()=>Reject(new(){WorkspaceDrift=drift},"preparation_workspace_drift"));
  foreach(var drift in new[]{"id","name","bu","managed","template","root","parent"})await Test("role "+drift+" drift stops",()=>Reject(new(){RoleDrift=drift},"preparation_role_identity_drift"));
  await Test("wrong organization stops",()=>Reject(new(){WrongOrg=true},"wrong_organization"));
  await Test("duplicate named role stops",()=>Reject(new(){DuplicateRole=true},"preparation_role_not_unique"));
  foreach(var use in new[]{"direct","team","effective","rights","reverse_user","reverse_team","child"})await Test("role or recipient in use "+use+" stops",()=>Reject(new(){InUse=use},"preparation_in_use"));
  foreach(var drift in new[]{"id","name","depth","bu","filter","filter_name","extra","partial","duplicate"})await Test("baseline "+drift+" drift stops",()=>Reject(new(){BaselineDrift=drift},"preparation_baseline_drift"));
  await Test("ambiguous committed replace read back without retry",async()=>{var f=new PreparationFake{ThrowWrite=true};var p=new RolePreparation(f,PreparationFake.AadAdmin);Check(await p.Run());Check(f.Writes.Count==1);var text=JsonSerializer.Serialize(p.Facts);Check(text.Contains("confirmed_after_ambiguous_write")&&!text.Contains("SECRET"));});
  foreach(var outcome in new[]{"unchanged","defaults_readded","partial","wrong_depth","wrong_bu","filtered"})await Test("nonexact postread "+outcome+" stops",()=>Reject(new(){Outcome=outcome,ThrowWrite=true},"preparation_exact_six_unconfirmed",1));
  foreach(var use in new[]{"reverse_user","reverse_team","child","direct","effective","rights"})await Test("postwrite "+use+" appears stops",()=>Reject(new(){InUseAfter=use},"preparation_in_use",1));
  await Test("postwrite owner change stops",()=>Reject(new(){WorkspaceAfter=true},"preparation_workspace_drift",1));
  await Test("single helper instance cannot dispatch again",async()=>{var f=new PreparationFake();var p=new RolePreparation(f,PreparationFake.AadAdmin);Check(await p.Run());try{await p.Run();throw new Exception("second run accepted");}catch(DeploymentException e){Check(e.Message=="preparation_session_already_used");}Check(f.Writes.Count==1);});
  await Test("already-six initial role is not rewritten",()=>Reject(new(){InitiallySix=true},"preparation_baseline_drift"));
  await Test("pre and post reverse associations child user and workspace readbacks",async()=>{var f=new PreparationFake();Check(await new RolePreparation(f,PreparationFake.AadAdmin).Run());int i=f.Events.FindIndex(x=>x.StartsWith("POST "));foreach(var range in new[]{f.Events.Take(i).ToArray(),f.Events.Skip(i+1).ToArray()})foreach(var fragment in new[]{"roles("+PreparationFake.Role+")/systemuserroles_association","roles("+PreparationFake.Role+")/teamroles_association","_parentrootroleid_value eq","RetrieveUserPrivileges","RetrievePrincipalAccess","zk_kitchenworkspaces(","RetrieveRolePrivilegesRole"})Check(range.Any(x=>x.Contains(fragment)),"missing boundary read "+fragment);});
  return(passed,failed);
 }
}

sealed class PreparationFake:IDataverseTransport {
 public const string Admin="11111111-1111-4111-8111-111111111111",AadAdmin="66666666-6666-4666-8666-666666666666",Other="55555555-5555-4555-8555-555555555555",Role="660a97b9-a8c8-f111-a05c-7ced8d5f6c91",User="4ee486b9-9fc8-f111-a05c-7ced8d5f6c91",Aad="fe2f887e-cec7-4417-863e-dfd52ed174e4",Bu="eacc1a23-86c7-f111-a05a-002248da9a3e",Workspace="45deaf94-5661-4110-8f16-3d2678c09f04";
 public static readonly string[] WantedIds=Enumerable.Range(1,6).Select(n=>$"77777777-7777-4777-8777-{n:D12}").ToArray();
 public static readonly (string Id,string Name)[] Baseline=[("fecbd29c-df64-4ede-a611-47226b402c22","prvReadSharePointData"),("94c3ac2c-eb23-41cb-a903-4e2e49e910b4","prvReadSdkMessage"),("cfdd12cf-090b-4599-8302-771962d2350a","prvWriteSharePointData"),("122e085f-8c52-47e8-8415-875dee1c961e","prvReadSdkMessageProcessingStepImage"),("db10a828-ec49-4035-8b7e-c58efaf169ec","prvReadSdkMessageProcessingStep"),("f5b50296-a212-488a-be92-cbcca8971717","prvReadPluginAssembly"),("5eb85025-363b-46ea-a77e-ce24159cd231","prvCreateSharePointData"),("9365005c-4703-473b-8d3c-d073cfd8670c","prvReadPluginType"),("d71fc8d0-99bc-430e-abd7-d95c64f11e9c","prvReadSharePointDocument")];
 public bool WrongOrg,DuplicateRole,ThrowWrite,InitiallySix,WorkspaceAfter;
 public string IdentityDrift="",WorkspaceDrift="",RoleDrift="",BaselineDrift="",InUse="",InUseAfter="",Outcome="exact";
 public List<string> Reads=[],Events=[];
 public List<(string Path,JsonNode? Body)> Writes=[];
 static JsonObject Row(params(string,object?)[] fields){var o=new JsonObject();foreach(var(k,v)in fields)o[k]=v==null?null:JsonSerializer.SerializeToNode(v);return o;}
 static JsonObject Rows(params JsonNode[] rows)=>new(){["value"]=new JsonArray(rows)};
 bool After=>Writes.Count>0;
 bool Use(string value)=>InUse==value||(After&&InUseAfter==value);
 JsonObject RoleRow()=>Row(("roleid",RoleDrift=="id"?Other:Role),("name",RoleDrift=="name"?"SECRET":"Zunftküche Bearbeiter"),("_businessunitid_value",RoleDrift=="bu"?Other:Bu),("ismanaged",RoleDrift=="managed"),("_roletemplateid_value",RoleDrift=="template"?Other:null),("_parentrootroleid_value",RoleDrift=="root"?Other:Role),("_parentroleid_value",RoleDrift=="parent"?Other:null));
 JsonArray PrivilegeRows(){
  bool six=InitiallySix||(After&&Outcome!="unchanged");var a=new JsonArray();
  if(!six||Outcome=="defaults_readded")foreach(var p in Baseline)a.Add(Row(("PrivilegeId",p.Id),("Depth","Global"),("BusinessUnitId",Bu),("RecordFilterId",Guid.Empty.ToString("D"))));
  if(six)for(int i=0;i<6;i++)a.Add(Row(("PrivilegeId",WantedIds[i]),("Depth",i<3?"Basic":"Global"),("BusinessUnitId",Bu),("RecordFilterId",Guid.Empty.ToString("D"))));
  if(!After&&!InitiallySix){switch(BaselineDrift){case "id":a[0]!["PrivilegeId"]=Other;break;case "depth":a[0]!["Depth"]="Basic";break;case "bu":a[0]!["BusinessUnitId"]=Other;break;case "filter":a[0]!["RecordFilterId"]=Other;break;case "filter_name":a[0]!["RecordFilterUniqueName"]="SECRET";break;case "extra":a.Add(a[0]!.DeepClone());break;case "partial":a.RemoveAt(0);break;case "duplicate":a[8]=a[0]!.DeepClone();break;}}
  if(After){if(Outcome=="partial")a.RemoveAt(0);if(Outcome=="wrong_depth")a[0]!["Depth"]="Global";if(Outcome=="wrong_bu")a[0]!["BusinessUnitId"]=Other;if(Outcome=="filtered")a[0]!["RecordFilterId"]=Other;}
  return a;
 }
 public Task<JsonNode?> SendAsync(HttpMethod method,string path,JsonNode? payload=null){
  Events.Add(method+" "+path);
  if(method!=HttpMethod.Get){if(method!=HttpMethod.Post||path!="roles("+Role+")/Microsoft.Dynamics.CRM.ReplacePrivilegesRole")throw new Exception("unexpected mutation");Writes.Add((path,payload?.DeepClone()));if(ThrowWrite)throw new HttpRequestException("SECRET");return Task.FromResult<JsonNode?>(null);}
  Reads.Add(path);JsonNode result;
  if(path=="WhoAmI")result=Row(("OrganizationId",WrongOrg?Other:Target.Organization),("UserId",Admin));
  else if(path.StartsWith("systemusers("+Admin+")"))result=Row(("domainname",Target.User),("isdisabled",false),("azureactivedirectoryobjectid",AadAdmin));
  else if(path.StartsWith("organizations("))result=Row(("languagecode",1031),("_basecurrencyid_value",Other));
  else if(path.StartsWith("transactioncurrencies("))result=Row(("isocurrencycode","EUR"));
  else if(path.StartsWith("systemusers?$"))result=Rows(Row(("systemuserid",IdentityDrift=="user"?Other:User),("domainname","Schreiber@Schelmenzunft.onmicrosoft.com"),("azureactivedirectoryobjectid",IdentityDrift=="aad"?Other:Aad),("_businessunitid_value",IdentityDrift=="bu"?Other:Bu),("isdisabled",IdentityDrift=="disabled"),("accessmode",0),("applicationid",IdentityDrift=="application"?Other:null)));
  else if(path.StartsWith("businessunits("))result=Row(("businessunitid",Bu),("isdisabled",false));
  else if(path.StartsWith("zk_kitchenworkspaces("))result=Row(("zk_kitchenworkspaceid",Workspace),("_ownerid_value",WorkspaceDrift=="owner"||After&&WorkspaceAfter?Other:Admin),("zk_revision",WorkspaceDrift=="revision"?3:2));
  else if(path.StartsWith("systemusers(")&&path.Contains("systemuserroles_association"))result=Use("direct")?Rows(Row(("roleid",Other))):Rows();
  else if(path.Contains("teammembership_association"))result=Rows(Row(("teamid",Other)));
  else if(path.StartsWith("teams(")&&path.Contains("teamroles_association"))result=Use("team")?Rows(Row(("roleid",Other))):Rows();
  else if(path.Contains("RetrieveUserPrivileges"))result=new JsonObject{["RolePrivileges"]=Use("effective")?new JsonArray(Row(("PrivilegeId",Other))):new JsonArray()};
  else if(path.Contains("RetrievePrincipalAccess"))result=Row(("AccessRights",Use("rights")?"ReadAccess":"None"));
  else if(path.StartsWith("roles("+Role+")/systemuserroles_association"))result=Use("reverse_user")?Rows(Row(("systemuserid",Other))):Rows();
  else if(path.StartsWith("roles("+Role+")/teamroles_association"))result=Use("reverse_team")?Rows(Row(("teamid",Other))):Rows();
  else if(path.StartsWith("roles?")&&path.Contains("_parentrootroleid_value eq"))result=Use("child")?Rows(Row(("roleid",Other))):Rows();
  else if(path.StartsWith("roles?$"))result=DuplicateRole?Rows(RoleRow(),RoleRow()):Rows(RoleRow());
  else if(path.StartsWith("roles("))result=RoleRow();
  else if(path.StartsWith("RetrieveRolePrivilegesRole("))result=new JsonObject{["RolePrivileges"]=PrivilegeRows()};
  else if(path.StartsWith("privileges?$")){var rows=Baseline.Where(p=>path.Contains(p.Id)).Select(p=>Row(("privilegeid",p.Id),("name",BaselineDrift=="name"&&p==Baseline[0]?"prvWrong":p.Name))).ToArray();result=Rows(rows);}
  else if(path.StartsWith("EntityDefinitions(")){bool w=path.Contains("zk_kitchenworkspace");var verbs=w?new[]{"Read","Write","AppendTo"}:new[]{"Read","Create","Append"};var a=new JsonArray();for(int i=0;i<3;i++)a.Add(Row(("PrivilegeId",WantedIds[(w?0:3)+i]),("PrivilegeType",verbs[i]),("Name","prv"+verbs[i]+(w?"zk_kitchenworkspace":"zk_kitchenoperation")),("CanBeBasic",w),("CanBeGlobal",true)));result=Row(("LogicalName",w?"zk_kitchenworkspace":"zk_kitchenoperation"),("OwnershipType",w?"UserOwned":"OrganizationOwned"),("TableType","Standard"));result["Privileges"]=a;}
  else if(path.StartsWith("customapis?$"))result=Rows(Row(("uniquename","zk_KitchenLoad"),("executeprivilegename","prvReadzk_kitchenworkspace")),Row(("uniquename","zk_KitchenCommit"),("executeprivilegename","prvWritezk_kitchenworkspace")));
  else throw new Exception("unexpected GET "+path);
  return Task.FromResult<JsonNode?>(result);
 }
}
