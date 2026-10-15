using Kitchen.Deploy;
using System.Text.Json;
using System.Text.Json.Nodes;
namespace Kitchen.Access;

public enum AccessMode { Offline, Inspect, Execute }
public static class AccessProgram {
    public static AccessMode Parse(string[] args) => args switch {
        [] => AccessMode.Offline,
        ["--inspect"] => AccessMode.Inspect,
        ["--execute"] => AccessMode.Execute,
        _ => throw new DeploymentException("unsupported_access_arguments")
    };
    public static async Task<int> Run(string[] args) {
        FixedAccess? helper=null;
        try {
            var mode=Parse(args);
            if(mode==AccessMode.Offline) {
                Console.WriteLine(JsonSerializer.Serialize(new{mode="offline_plan",providerCalls=0,writes=0,target=Target.Url,tenant=Target.Tenant,administrator=Target.User,recipient=FixedAccess.Recipient,workspace=FixedAccess.Workspace,role=FixedAccess.RoleName,workspacePrivileges=new[]{"Read:Basic","Write:Basic","AppendTo:Basic"},receiptPrivileges=new[]{"Read:Global","Create:Global","Append:Global"},platformAppOpeningRights="separate_review_no_automatic_grant",ready=false}));
                return 0;
            }
            var auth=new InteractiveAuthentication();
            await auth.SignInAsync();
            using var transport=new WebApiTransport(Target.Url,auth.TokenAsync);
            helper=new FixedAccess(transport,auth.ObjectId);
            bool ready=await helper.Run(mode==AccessMode.Execute);
            Console.WriteLine(JsonSerializer.Serialize(new{mode=mode.ToString(),facts=helper.Facts,kitchenAccessReady=ready,schreiberAppAcceptance="not_performed"}));
            return mode==AccessMode.Execute&&!ready?2:0;
        } catch(Exception e) {
            Console.WriteLine(JsonSerializer.Serialize(new{error=SafeOutput.Error(e),facts=helper?.Facts,kitchenAccessReady=false}));
            return 1;
        }
    }
}

// Single-purpose additive provisioning; no caller-supplied identities, privileges or paths.
public sealed class FixedAccess(IDataverseTransport transport,string objectId) {
    public const string Recipient="Schreiber@Schelmenzunft.onmicrosoft.com";
    public const string Workspace="45deaf94-5661-4110-8f16-3d2678c09f04";
    public const string RoleName="Zunftküche Bearbeiter";
    private const string WorkspaceTable="zk_kitchenworkspace",ReceiptTable="zk_kitchenoperation";
    private const string DesiredAccess="ReadAccess, WriteAccess, AppendToAccess";
    private readonly ResourceEngine engine=new(transport,objectId);
    private string user="",businessUnit="",aad="",admin="";
    private long revision;
    private readonly List<Privilege> wanted=[];
    private readonly HashSet<string> kitchenPrivilegeIds=[];
    private HashSet<string> originalAssignments=[];
    private string? roleId;
    public List<object> Facts {get;}=[];
    private sealed record Privilege(string Id,string Name,string Depth);
    private sealed record Inventory(HashSet<string> Assigned,HashSet<string> Rights,bool EffectiveKitchenComplete);
    private static string Text(JsonNode row,string key)=>row[key]?.GetValue<string>()??throw new DeploymentException("required_access_field_missing");
    private static string Id(JsonNode row,string key)=>ResourceEngine.Id(row,key);
    private Task<JsonObject[]> Rows(string path)=>engine.Rows(path);
    private async Task<JsonObject> Get(string path)=>await engine.Get(path)??throw new DeploymentException("access_read_missing");
    private static void Require(bool condition,string code){if(!condition)throw new DeploymentException(code);}

    public async Task<bool> Run(bool execute) {
        Require(admin=="","access_session_already_used");
        admin=(await engine.AuthenticateTargetAsync()).ToString("D");
        await Identity(true);
        await WorkspaceUnchanged(true);
        await Privileges();
        await ApiPrivileges();
        // Read all current direct/team role definitions and effective access before any mutation.
        var inventory=await InspectAccess();
        originalAssignments=inventory.Assigned;
        var role=await FindRole();
        if(role!=null){roleId=Id(role,"roleid");await ExactRole(false);}
        Facts.Add(new{resource="access_plan",roleStatus=roleId==null?"missing":"exact",roleAssignment=roleId!=null&&inventory.Assigned.Contains(roleId),workspaceAccessComplete=Complete(inventory.Rights),platformAppOpeningRights="separate_review_no_automatic_grant"});
        if(!execute)return roleId!=null&&inventory.Assigned.Contains(roleId)&&Complete(inventory.Rights)&&inventory.EffectiveKitchenComplete;
        if(roleId==null) {
            await Boundary();
            await Write("role_create","roles",new JsonObject{["name"]=RoleName,["businessunitid@odata.bind"]=$"/businessunits({businessUnit})"},async()=>{
                var created=await FindRole();
                if(created==null)return false;
                roleId=Id(created,"roleid");
                // Platform-added baseline privileges are not ignored or stripped.
                await ExactRole(true);
                await AfterStep();
                return true;
            });
            await Boundary();
            await ExactRole(true);
            var grants=new JsonArray(wanted.Select(p=>(JsonNode)new JsonObject{["PrivilegeId"]=p.Id,["Depth"]=p.Depth,["BusinessUnitId"]=businessUnit}).ToArray());
            await Write("role_privileges",$"roles({roleId})/Microsoft.Dynamics.CRM.AddPrivilegesRole",new JsonObject{["Privileges"]=grants},async()=>{
                var actual=await RolePrivileges(roleId!);
                if(actual.Count==0)return false;
                await ExactRole(false);
                await AfterStep();return true;
            });
        }
        await Boundary();await ExactRole(false);
        inventory=await InspectAccess();
        if(!inventory.Assigned.Contains(roleId!)) {
            await Write("user_role_assignment",$"systemusers({user})/systemuserroles_association/$ref",new JsonObject{["@odata.id"]=$"{Target.Url}/api/data/v9.2/roles({roleId})"},async()=>{
                await ExactRole(false);var after=await AfterStep();
                if(after.Assigned.Contains(roleId!))RequireEffective(after);
                return after.Assigned.Contains(roleId!);
            });
        }
        await Boundary();await ExactRole(false);
        inventory=await InspectAccess();
        Require(inventory.Assigned.Contains(roleId!),"role_assignment_missing");
        RequireEffective(inventory);
        if(!Complete(inventory.Rights)) {
            await Write("workspace_share","GrantAccess",new JsonObject {
                ["Target"]=new JsonObject{["@odata.type"]="Microsoft.Dynamics.CRM.zk_kitchenworkspace",["zk_kitchenworkspaceid"]=Workspace},
                ["PrincipalAccess"]=new JsonObject{["Principal"]=new JsonObject{["@odata.type"]="Microsoft.Dynamics.CRM.systemuser",["systemuserid"]=user},["AccessMask"]=DesiredAccess}
            },async()=>{await ExactRole(false);var after=await AfterStep();RequireEffective(after);return Complete(after.Rights)&&after.Assigned.Contains(roleId!);});
        }
        await ExactRole(false);inventory=await AfterStep();
        RequireEffective(inventory);
        Require(inventory.Assigned.Contains(roleId!)&&Complete(inventory.Rights),"access_final_readback_incomplete");
        Facts.Add(new{resource="access_result",status="six_privileges_assignment_and_effective_workspace_rights_verified",workspaceRevision=revision,ownerUnchanged=true});
        return true;
    }
    private async Task Identity(bool first) {
        var matches=await Rows($"systemusers?$select=systemuserid,domainname,isdisabled,accessmode,applicationid,azureactivedirectoryobjectid,_businessunitid_value&$filter=domainname eq '{Recipient}'");
        Require(matches.Length==1,"schreiber_not_unique");var row=matches[0];
        Require(string.Equals(Text(row,"domainname"),Recipient,StringComparison.OrdinalIgnoreCase)&&row["isdisabled"]?.GetValue<bool>()==false&&row["accessmode"]?.GetValue<int>()==0&&row.ContainsKey("applicationid")&&row["applicationid"]==null,"schreiber_identity_invalid");
        string id=Id(row,"systemuserid"),bu=Id(row,"_businessunitid_value"),objectId=Id(row,"azureactivedirectoryobjectid");
        Require(id!=admin,"schreiber_identity_invalid");
        if(first){user=id;businessUnit=bu;aad=objectId;}else Require(id==user&&bu==businessUnit&&objectId==aad,"schreiber_identity_drift");
        var unit=await Get($"businessunits({businessUnit})?$select=businessunitid,isdisabled");
        Require(Id(unit,"businessunitid")==businessUnit&&unit["isdisabled"]?.GetValue<bool>()==false,"business_unit_invalid");
    }
    private async Task WorkspaceUnchanged(bool first=false) {
        var row=await Get($"zk_kitchenworkspaces({Workspace})?$select=zk_kitchenworkspaceid,_ownerid_value,zk_revision");
        long value=row["zk_revision"]?.GetValue<long>()??-1;
        Require(Id(row,"zk_kitchenworkspaceid")==Workspace&&Id(row,"_ownerid_value")==admin&&value>=2,"workspace_owner_or_revision_drift");
        if(first)revision=value;else Require(value==revision,"workspace_changed_during_access");
    }
    private async Task Boundary(){await Identity(false);await WorkspaceUnchanged();}
    private async Task<Inventory> AfterStep(){await Boundary();return await InspectAccess();}
    private async Task Privileges() {
        foreach(var table in new[]{WorkspaceTable,ReceiptTable}) {
            var row=await Get($"EntityDefinitions(LogicalName='{table}')?$select=LogicalName,OwnershipType,TableType,Privileges");
            Require(Text(row,"LogicalName")==table&&Text(row,"TableType")=="Standard"&&Text(row,"OwnershipType")== (table==WorkspaceTable?"UserOwned":"OrganizationOwned"),"table_identity_drift");
            var privileges=row["Privileges"] as JsonArray??throw new DeploymentException("privilege_metadata_invalid");
            var all=new Dictionary<string,JsonNode>(StringComparer.Ordinal);
            foreach(var p in privileges){Require(p is JsonObject,"privilege_metadata_invalid");var verb=Text(p!,"PrivilegeType");Require(all.TryAdd(verb,p!),"privilege_metadata_invalid");Require(kitchenPrivilegeIds.Add(Id(p!,"PrivilegeId")),"privilege_metadata_invalid");}
            foreach(var verb in table==WorkspaceTable?new[]{"Read","Write","AppendTo"}:new[]{"Read","Create","Append"}) {
                Require(all.TryGetValue(verb,out var p),"privilege_metadata_invalid");
                string depth=table==WorkspaceTable?"Basic":"Global",name=Text(p!,"Name");
                Require(name.Length is >0 and <=100&&name.All(c=>char.IsAsciiLetterOrDigit(c)||c=='_')&&p!["CanBe"+depth]?.GetValue<bool>()==true,"privilege_metadata_invalid");
                wanted.Add(new(Id(p!,"PrivilegeId"),name,depth));
            }
        }
    }
    private async Task ApiPrivileges() {
        var rows=await Rows("customapis?$select=uniquename,executeprivilegename&$filter=uniquename eq 'zk_KitchenLoad' or uniquename eq 'zk_KitchenCommit'");
        Require(rows.Length==2,"api_execute_privilege_drift");
        foreach(var item in new[]{("zk_KitchenLoad",wanted[0].Name),("zk_KitchenCommit",wanted[1].Name)}) {
            var matches=rows.Where(r=>Text(r,"uniquename")==item.Item1).ToArray();
            Require(matches.Length==1&&Text(matches[0],"executeprivilegename")==item.Item2,"api_execute_privilege_drift");
        }
    }
    private async Task<JsonObject?> FindRole() {
        var rows=await Rows($"roles?$select=roleid,name,_businessunitid_value,ismanaged,_roletemplateid_value&$filter=name eq '{RoleName}' and _businessunitid_value eq {businessUnit}");
        Require(rows.Length<=1,"role_not_unique");
        if(rows.Length==0)return null;
        var role=rows[0];
        Require(Text(role,"name")==RoleName&&Id(role,"_businessunitid_value")==businessUnit&&role["ismanaged"]?.GetValue<bool>()==false&&role.ContainsKey("_roletemplateid_value")&&role["_roletemplateid_value"]==null,"role_identity_drift");
        if(roleId!=null)Require(Id(role,"roleid")==roleId,"role_identity_drift");
        return role;
    }
    private async Task<JsonArray> RolePrivileges(string id) {
        var row=await Get($"RetrieveRolePrivilegesRole(RoleId={id})");
        return row["RolePrivileges"] as JsonArray??throw new DeploymentException("role_privileges_unavailable");
    }
    private async Task ExactRole(bool empty) {
        Require(await FindRole()!=null,"role_missing_after_write");
        var privileges=await RolePrivileges(roleId!);
        Require(privileges.Count==(empty?0:6),"role_privileges_drift");
        var seen=new HashSet<string>();
        foreach(var p in privileges) {
            string id=Id(p!,"PrivilegeId");var expected=wanted.SingleOrDefault(w=>w.Id==id);
            Require(seen.Add(id)&&expected!=null&&Text(p!,"Depth")==expected.Depth,"role_privileges_drift");
            // These optional newer filter fields must not change the six unfiltered privileges.
            if(p!["RecordFilterId"]!=null)Require(Text(p,"RecordFilterId")==Guid.Empty.ToString("D"),"role_privileges_drift");
            if(p["RecordFilterUniqueName"]!=null)Require(Text(p,"RecordFilterUniqueName")=="","role_privileges_drift");
        }
    }
    private async Task<Inventory> InspectAccess() {
        var direct=await Rows($"systemusers({user})/systemuserroles_association?$select=roleid,_businessunitid_value");
        var assigned=direct.Select(r=>Id(r,"roleid")).ToHashSet();Require(assigned.Count==direct.Length,"duplicate_user_role");
        var teams=await Rows($"systemusers({user})/teammembership_association?$select=teamid");
        Require(teams.Length<=50,"team_inventory_too_large");
        var all=new HashSet<string>(assigned);
        foreach(var team in teams){var roles=await Rows($"teams({Id(team,"teamid")})/teamroles_association?$select=roleid");foreach(var r in roles)all.Add(Id(r,"roleid"));}
        Require(all.Count<=100,"role_inventory_too_large");
        foreach(var id in all) {
            var privileges=await RolePrivileges(id);
            Facts.Add(new{resource="existing_role",id,privilegeCount=privileges.Count});
            foreach(var p in privileges) {
                var pid=Id(p!,"PrivilegeId");if(!kitchenPrivilegeIds.Contains(pid))continue;
                var allowed=wanted.SingleOrDefault(w=>w.Id==pid);
                Require(allowed!=null&&Text(p!,"Depth")==allowed.Depth,"existing_kitchen_privileges_broader_than_plan");
            }
        }
        var effective=await Get($"systemusers({user})/Microsoft.Dynamics.CRM.RetrieveUserPrivileges()");
        var effectivePrivileges=effective["RolePrivileges"] as JsonArray??throw new DeploymentException("effective_privileges_unavailable");
        // RetrieveUserPrivileges reports team privileges at Basic, so actual team-role depths above are inspected separately.
        var effectiveIds=new HashSet<string>();
        foreach(var p in effectivePrivileges) {
            var id=Id(p!,"PrivilegeId");
            Require(!kitchenPrivilegeIds.Contains(id)||wanted.Any(w=>w.Id==id),"effective_kitchen_privileges_broader_than_plan");
            effectiveIds.Add(id);
        }
        bool effectiveKitchenComplete=wanted.All(w=>effectiveIds.Contains(w.Id));
        var target=Uri.EscapeDataString(new JsonObject{["@odata.id"]=$"zk_kitchenworkspaces({Workspace})"}.ToJsonString());
        var access=await Get($"systemusers({user})/Microsoft.Dynamics.CRM.RetrievePrincipalAccess(Target=@target)?@target={target}");
        var rights=ParseRights(Text(access,"AccessRights"));
        Require(rights.All(r=>r is "ReadAccess" or "WriteAccess" or "AppendToAccess"),"existing_workspace_access_broader_than_plan");
        Require(originalAssignments.IsSubsetOf(assigned),"existing_role_assignment_changed");
        Facts.Add(new{resource="access_inventory",userId=user,businessUnitId=businessUnit,directRoleIds=assigned.Order().ToArray(),teamCount=teams.Length,effectivePrivilegeCount=effectivePrivileges.Count,effectiveKitchenPrivilegesComplete=effectiveKitchenComplete,workspaceRights=rights.Order().ToArray(),workspaceRevision=revision});
        return new(assigned,rights,effectiveKitchenComplete);
    }
    private static void RequireEffective(Inventory inventory)=>Require(inventory.EffectiveKitchenComplete,"effective_kitchen_privileges_incomplete");
    private static HashSet<string> ParseRights(string text) {
        if(text=="None")return [];
        var parts=text.Split(',',StringSplitOptions.TrimEntries);var rights=parts.ToHashSet(StringComparer.Ordinal);
        Require(parts.Length==rights.Count&&parts.All(p=>p is "ReadAccess" or "WriteAccess" or "AppendAccess" or "AppendToAccess" or "CreateAccess" or "DeleteAccess" or "ShareAccess" or "AssignAccess"),"invalid_access_rights");return rights;
    }
    private static bool Complete(HashSet<string> rights)=>rights.SetEquals(new[]{"ReadAccess","WriteAccess","AppendToAccess"});
    private async Task Write(string step,string path,JsonObject payload,Func<Task<bool>> verify) {
        bool uncertain=false;
        try{await transport.SendAsync(HttpMethod.Post,path,payload);}catch(Exception){uncertain=true;}
        // Any provider exception is suppressed; only independent canonical readback can prove the outcome.
        bool confirmed=await verify();
        Facts.Add(new{resource=step,status=confirmed?(uncertain?"confirmed_after_ambiguous_write":"confirmed_by_readback"):"unconfirmed_stop"});
        Require(confirmed,"write_outcome_unconfirmed_stop");
    }
}
