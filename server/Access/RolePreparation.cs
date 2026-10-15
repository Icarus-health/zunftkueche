using Kitchen.Deploy;
using System.Text.Json.Nodes;
namespace Kitchen.Access;

// Explicit one-shot preparation of the observed unassigned role. Never assigns or shares.
public sealed class RolePreparation(IDataverseTransport transport,string objectId) {
    public const string RoleId="660a97b9-a8c8-f111-a05c-7ced8d5f6c91";
    private const string UserId="4ee486b9-9fc8-f111-a05c-7ced8d5f6c91",AadId="fe2f887e-cec7-4417-863e-dfd52ed174e4",BusinessUnit="eacc1a23-86c7-f111-a05a-002248da9a3e";
    private sealed record Privilege(string Id,string Name,string Depth);
    private static readonly Privilege[] Baseline=[
        new("fecbd29c-df64-4ede-a611-47226b402c22","prvReadSharePointData","Global"),
        new("94c3ac2c-eb23-41cb-a903-4e2e49e910b4","prvReadSdkMessage","Global"),
        new("cfdd12cf-090b-4599-8302-771962d2350a","prvWriteSharePointData","Global"),
        new("122e085f-8c52-47e8-8415-875dee1c961e","prvReadSdkMessageProcessingStepImage","Global"),
        new("db10a828-ec49-4035-8b7e-c58efaf169ec","prvReadSdkMessageProcessingStep","Global"),
        new("f5b50296-a212-488a-be92-cbcca8971717","prvReadPluginAssembly","Global"),
        new("5eb85025-363b-46ea-a77e-ce24159cd231","prvCreateSharePointData","Global"),
        new("9365005c-4703-473b-8d3c-d073cfd8670c","prvReadPluginType","Global"),
        new("d71fc8d0-99bc-430e-abd7-d95c64f11e9c","prvReadSharePointDocument","Global")
    ];
    private readonly ResourceEngine engine=new(transport,objectId);
    private bool started;
    private string admin="";
    public List<object> Facts{get;}=[];
    private static void Require(bool ok,string code){if(!ok)throw new DeploymentException(code);}
    private static string Text(JsonNode row,string key)=>row[key]?.GetValue<string>()??throw new DeploymentException("preparation_missing_field");
    private static string Id(JsonNode row,string key)=>ResourceEngine.Id(row,key);
    private async Task<JsonObject> Get(string path)=>await engine.Get(path)??throw new DeploymentException("preparation_empty_read");
    private async Task<JsonArray> RolePrivileges(){var row=await Get($"RetrieveRolePrivilegesRole(RoleId={RoleId})");return row["RolePrivileges"] as JsonArray??throw new DeploymentException("preparation_privileges_unavailable");}

    public async Task<bool> Run(){
        Require(!started,"preparation_session_already_used");started=true;
        admin=(await engine.AuthenticateTargetAsync()).ToString("D");
        var desired=await ResolveKitchenPrivileges();
        await VerifyUnassignedBoundary();
        var initial=await RolePrivileges();
        await RequirePrivilegeSet(initial,Baseline,"preparation_baseline_drift",verifyNames:true);
        Facts.Add(new{resource="role_preparation",status="exact_nine_unassigned_verified",roleId=RoleId,workspaceRevision=2});
        var payload=new JsonObject{["Privileges"]=new JsonArray(desired.Select(p=>(JsonNode)new JsonObject{["PrivilegeId"]=p.Id,["PrivilegeName"]=p.Name,["Depth"]=p.Depth,["BusinessUnitId"]=BusinessUnit}).ToArray())};
        bool ambiguous=false;
        try{await transport.SendAsync(HttpMethod.Post,$"roles({RoleId})/Microsoft.Dynamics.CRM.ReplacePrivilegesRole",payload);}catch(Exception){ambiguous=true;}
        // Exactly one dispatch. The response, including an exception, never substitutes for readback.
        var after=await RolePrivileges();
        await VerifyUnassignedBoundary();
        try{await RequirePrivilegeSet(after,desired,"preparation_exact_six_unconfirmed",verifyNames:false);}
        catch(DeploymentException){Facts.Add(new{resource="role_preparation",status="canonical_readback_not_exact_six_stop",roleId=RoleId,privilegeCount=after.Count});throw;}
        Facts.Add(new{resource="role_preparation",status=ambiguous?"confirmed_after_ambiguous_write":"confirmed_by_readback",roleId=RoleId,privilegeCount=6,assignedPrincipals=0,childRoles=0,workspaceRevision=2,kitchenAccessReady=false});
        return true;
    }
    private async Task VerifyUnassignedBoundary(){
        var users=await engine.Rows($"systemusers?$select=systemuserid,domainname,azureactivedirectoryobjectid,_businessunitid_value,isdisabled,accessmode,applicationid&$filter=domainname eq '{FixedAccess.Recipient}'");
        Require(users.Length==1,"preparation_identity_drift");var user=users[0];
        Require(Id(user,"systemuserid")==UserId&&Id(user,"azureactivedirectoryobjectid")==AadId&&Id(user,"_businessunitid_value")==BusinessUnit&&Text(user,"domainname").Equals(FixedAccess.Recipient,StringComparison.OrdinalIgnoreCase)&&user["isdisabled"]?.GetValue<bool>()==false&&user["accessmode"]?.GetValue<int>()==0&&user.ContainsKey("applicationid")&&user["applicationid"]==null,"preparation_identity_drift");
        var bu=await Get($"businessunits({BusinessUnit})?$select=businessunitid,isdisabled");
        Require(Id(bu,"businessunitid")==BusinessUnit&&bu["isdisabled"]?.GetValue<bool>()==false,"preparation_identity_drift");
        var workspace=await Get($"zk_kitchenworkspaces({FixedAccess.Workspace})?$select=zk_kitchenworkspaceid,_ownerid_value,zk_revision");
        Require(Id(workspace,"zk_kitchenworkspaceid")==FixedAccess.Workspace&&Id(workspace,"_ownerid_value")==admin&&workspace["zk_revision"]?.GetValue<long>()==2,"preparation_workspace_drift");
        Require((await engine.Rows($"systemusers({UserId})/systemuserroles_association?$select=roleid")).Length==0,"preparation_in_use");
        var teams=await engine.Rows($"systemusers({UserId})/teammembership_association?$select=teamid");
        Require(teams.Length<=50,"preparation_team_limit");
        foreach(var team in teams)Require((await engine.Rows($"teams({Id(team,"teamid")})/teamroles_association?$select=roleid")).Length==0,"preparation_in_use");
        var effective=await Get($"systemusers({UserId})/Microsoft.Dynamics.CRM.RetrieveUserPrivileges()");
        Require(effective["RolePrivileges"] is JsonArray privileges&&privileges.Count==0,"preparation_in_use");
        var target=Uri.EscapeDataString(new JsonObject{["@odata.id"]=$"zk_kitchenworkspaces({FixedAccess.Workspace})"}.ToJsonString());
        var access=await Get($"systemusers({UserId})/Microsoft.Dynamics.CRM.RetrievePrincipalAccess(Target=@target)?@target={target}");
        Require(Text(access,"AccessRights")=="None","preparation_in_use");
        var roles=await engine.Rows($"roles?$select=roleid,name,_businessunitid_value,ismanaged,_roletemplateid_value,_parentrootroleid_value,_parentroleid_value&$filter=name eq '{FixedAccess.RoleName}' and _businessunitid_value eq {BusinessUnit}");
        Require(roles.Length==1,"preparation_role_not_unique");var role=roles[0];
        Require(Id(role,"roleid")==RoleId&&Text(role,"name")==FixedAccess.RoleName&&Id(role,"_businessunitid_value")==BusinessUnit&&role["ismanaged"]?.GetValue<bool>()==false&&role.ContainsKey("_roletemplateid_value")&&role["_roletemplateid_value"]==null&&Id(role,"_parentrootroleid_value")==RoleId&&role.ContainsKey("_parentroleid_value")&&role["_parentroleid_value"]==null,"preparation_role_identity_drift");
        Require((await engine.Rows($"roles({RoleId})/systemuserroles_association?$select=systemuserid")).Length==0,"preparation_in_use");
        Require((await engine.Rows($"roles({RoleId})/teamroles_association?$select=teamid")).Length==0,"preparation_in_use");
        Require((await engine.Rows($"roles?$select=roleid&$filter=roleid ne {RoleId} and (_parentrootroleid_value eq {RoleId} or _parentroleid_value eq {RoleId})")).Length==0,"preparation_in_use");
    }
    private async Task<Privilege[]> ResolveKitchenPrivileges(){
        var wanted=new List<Privilege>();var seen=new HashSet<string>();
        foreach(var table in new[]{"zk_kitchenworkspace","zk_kitchenoperation"}){
            bool workspace=table=="zk_kitchenworkspace";
            var metadata=await Get($"EntityDefinitions(LogicalName='{table}')?$select=LogicalName,OwnershipType,TableType,Privileges");
            Require(Text(metadata,"LogicalName")==table&&Text(metadata,"OwnershipType")== (workspace?"UserOwned":"OrganizationOwned")&&Text(metadata,"TableType")=="Standard","preparation_table_drift");
            var available=metadata["Privileges"] as JsonArray??throw new DeploymentException("preparation_privilege_metadata_invalid");
            foreach(string verb in workspace?new[]{"Read","Write","AppendTo"}:new[]{"Read","Create","Append"}){
                var matches=available.Where(p=>p?["PrivilegeType"]?.GetValue<string>()==verb).ToArray();Require(matches.Length==1,"preparation_privilege_metadata_invalid");var p=matches[0]!;
                string id=Id(p,"PrivilegeId"),name=Text(p,"Name"),depth=workspace?"Basic":"Global";
                Require(seen.Add(id)&&!Baseline.Any(b=>b.Id==id)&&p["CanBe"+depth]?.GetValue<bool>()==true&&name.Length is >0 and <=100&&name.All(c=>char.IsAsciiLetterOrDigit(c)||c=='_'),"preparation_privilege_metadata_invalid");
                wanted.Add(new(id,name,depth));
            }
        }
        var apis=await engine.Rows("customapis?$select=uniquename,executeprivilegename&$filter=uniquename eq 'zk_KitchenLoad' or uniquename eq 'zk_KitchenCommit'");
        Require(apis.Length==2,"preparation_api_drift");
        foreach(var pair in new[]{("zk_KitchenLoad",wanted[0].Name),("zk_KitchenCommit",wanted[1].Name)}){
            var rows=apis.Where(r=>Text(r,"uniquename")==pair.Item1).ToArray();Require(rows.Length==1&&Text(rows[0],"executeprivilegename")==pair.Item2,"preparation_api_drift");
        }
        return wanted.ToArray();
    }
    private async Task RequirePrivilegeSet(JsonArray actual,Privilege[] expected,string code,bool verifyNames){
        Require(actual.Count==expected.Length,code);var seen=new HashSet<string>();
        foreach(var p in actual){
            var row=p as JsonObject??throw new DeploymentException(code);var id=Id(row,"PrivilegeId");var wanted=expected.SingleOrDefault(e=>e.Id==id);
            Require(seen.Add(id)&&wanted!=null&&Text(row,"Depth")==wanted.Depth&&Id(row,"BusinessUnitId")==BusinessUnit&&row.ContainsKey("RecordFilterId")&&Text(row,"RecordFilterId")==Guid.Empty.ToString("D"),code);
            Require(row["RecordFilterUniqueName"]==null||Text(row,"RecordFilterUniqueName")=="",code);
            if(row["PrivilegeName"]!=null)Require(Text(row,"PrivilegeName")==wanted!.Name,code);
        }
        if(verifyNames){
            var rows=await engine.Rows("privileges?$select=privilegeid,name&$filter="+string.Join(" or ",expected.Select(p=>"privilegeid eq "+p.Id)));
            Require(rows.Length==expected.Length,code);var ids=new HashSet<string>();
            foreach(var row in rows){string id=Id(row,"privilegeid");Require(ids.Add(id)&&expected.Any(p=>p.Id==id&&p.Name==Text(row,"name")),code);}
        }
    }
}
