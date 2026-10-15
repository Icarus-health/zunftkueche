using System.Text.Json.Nodes;
using System.Xml.Linq;
using Newtonsoft.Json.Linq;
using Zunftkueche;
namespace Kitchen.Deploy;
public sealed class Provisioner(ResourceEngine engine, IDataverseTransport transport, JsonObject contract) {
    private string? solutionId;
    private readonly Dictionary<string, JsonObject> tables = [];
    public List<string> Gaps { get; } = [];
    public static JsonObject LoadContract(string path) {
        var bytes = File.ReadAllBytes(path);
        if (Seed.Hash(bytes) != "7ed502d575c4efa245c28942dabb8de846bae3cf7b374a3d84eec6bd609ab1ea") throw new DeploymentException("registration_contract_changed_requires_review");
        return JsonNode.Parse(bytes)!.AsObject();
    }
    private static string S(JsonNode n, string field) => Metadata.Text(n, field);
    private void Gap(string name) { if (!Gaps.Contains(name)) Gaps.Add(name); }
    private async Task<JsonObject?> Ensure(string name, string query, string collection, JsonObject payload, JsonObject expected, bool create) {
        var value = await engine.EnsureAsync(name, query, collection, payload, expected, create);
        if (value == null) Gap("missing:" + name);
        return value;
    }
    private async Task Component(string id) {
        if (solutionId == null) { Gap("solution_missing"); return; }
        var rows = await engine.Rows($"solutioncomponents?$select=solutioncomponentid&$filter=_solutionid_value eq {solutionId} and objectid eq {id}");
        if (rows.Length == 0) Gap("missing_solution_membership:" + id);
    }
    public async Task Inventory() {
        // Independent readbacks still run when the dedicated publisher/solution is absent.
        var queries = new Dictionary<string,string> {
            ["kitchen_tables"] = "EntityDefinitions?$select=MetadataId,LogicalName,OwnershipType,TableType,IsOptimisticConcurrencyEnabled&$filter=LogicalName eq 'zk_kitchenworkspace' or LogicalName eq 'zk_kitchenoperation'",
            ["kitchen_packages"] = "pluginpackages?$select=pluginpackageid,uniquename,version&$filter=uniquename eq 'zk_Zunftkueche.Dataverse'",
            ["kitchen_types"] = "plugintypes?$select=plugintypeid,typename&$filter=startswith(typename,'Zunftkueche.')",
            ["kitchen_actions"] = "customapis?$select=customapiid,uniquename&$filter=uniquename eq 'zk_KitchenLoad' or uniquename eq 'zk_KitchenCommit'",
            ["kitchen_guards"] = "sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,statecode&$filter=startswith(name,'zk_KitchenGuard_')",
            ["workspace_message_filters"] = "sdkmessagefilters?$select=sdkmessagefilterid,iscustomprocessingstepallowed,_sdkmessageid_value&$filter=primaryobjecttypecode eq 'zk_kitchenworkspace'",
            ["receipt_message_filters"] = "sdkmessagefilters?$select=sdkmessagefilterid,iscustomprocessingstepallowed,_sdkmessageid_value&$filter=primaryobjecttypecode eq 'zk_kitchenoperation'"
        };
        foreach (var query in queries) {
            var rows = await engine.Rows(query.Value);
            engine.Resources.Add(new { resource=query.Key, status="inventory", count=rows.Length });
        }
    }
    public async Task Tables(bool create) {
        var publisher = await Ensure("publisher", "publishers?$filter=uniquename eq 'zk_Zunftkueche'", "publishers",
            new JsonObject { ["uniquename"] = "zk_Zunftkueche", ["friendlyname"] = "Zunftküche", ["customizationprefix"] = "zk", ["customizationoptionvalueprefix"] = 72700 },
            new JsonObject { ["uniquename"] = "zk_Zunftkueche", ["customizationprefix"] = "zk", ["customizationoptionvalueprefix"] = 72700 }, create);
        if (publisher == null) return;
        var publisherId = ResourceEngine.Id(publisher,"publisherid");
        var solution = await Ensure("solution", $"solutions?$filter=uniquename eq '{Target.Solution}'", "solutions",
            new JsonObject { ["uniquename"] = Target.Solution, ["friendlyname"] = "Zunftküche", ["version"] = "1.0.0.0", ["publisherid@odata.bind"] = $"/publishers({publisherId})" },
            new JsonObject { ["uniquename"] = Target.Solution, ["version"] = "1.0.0.0", ["ismanaged"] = false, ["_publisherid_value"] = publisherId }, create);
        if (solution == null) return;
        solutionId = ResourceEngine.Id(solution,"solutionid");
        foreach (var spec in contract["tables"]!.AsArray()) {
            var name = S(spec!, "logicalName");
            var table = await Ensure(name, $"EntityDefinitions?$filter=LogicalName eq '{name}'", "EntityDefinitions", Metadata.Table(spec!),
                new JsonObject { ["SchemaName"] = name, ["LogicalName"] = name, ["OwnershipType"] = S(spec!,"ownershipType"), ["IsActivity"] = false,
                    ["IsOptimisticConcurrencyEnabled"] = true, ["TableType"] = "Standard", ["PrimaryNameAttribute"] = "zk_name", ["PrimaryIdAttribute"] = name + "id" }, create);
            if (table == null) continue;
            tables[name] = table;
            await Component(ResourceEngine.Id(table,"MetadataId"));
            foreach (var attr in spec!["attributes"]!.AsArray().Where(a => S(a!,"type") != "Lookup")) {
                var attrName = S(attr!,"name"); var type = S(attr!,"type");
                string collection = $"EntityDefinitions(LogicalName='{name}')/Attributes";
                await Ensure(name + "." + attrName, $"{collection}/Microsoft.Dynamics.CRM.{type}AttributeMetadata?$filter=LogicalName eq '{attrName}'", collection,
                    Metadata.Attribute(attr!,attrName=="zk_name"), Metadata.AttributeExpected(attr!,attrName=="zk_name"), create);
            }
        }
        if (tables.Count != 2) return;
        var relationship = Metadata.Relationship();
        var expected = relationship.DeepClone().AsObject();
        expected.Remove("@odata.type"); expected.Remove("Lookup"); expected.Remove("AssociatedMenuConfiguration");
        await Ensure("receipt_relationship", "RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata?$filter=SchemaName eq 'zk_kitchenworkspace_operations'", "RelationshipDefinitions", relationship, expected, create);
        var lookupSpec = contract["tables"]![1]!["attributes"]![1]!;
        await Ensure("receipt_lookup", "EntityDefinitions(LogicalName='zk_kitchenoperation')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$filter=LogicalName eq 'zk_workspace'", "", new JsonObject(), Metadata.AttributeExpected(lookupSpec), false);
        string keys = "EntityDefinitions(LogicalName='zk_kitchenoperation')/Keys";
        var keyExpected = new JsonObject { ["SchemaName"] = "zk_workspace_operation", ["KeyAttributes"] = new JsonArray("zk_workspace", "zk_operationid") };
        var keyPayload = keyExpected.DeepClone().AsObject(); keyPayload["DisplayName"] = Metadata.Label("Workspace und Vorgangs-ID");
        var key = await Ensure("receipt_key", keys + "?$filter=SchemaName eq 'zk_workspace_operation'", keys, keyPayload, keyExpected, create);
        if (key != null) {
            try { Readiness.RequireActiveKey(key); }
            catch (DeploymentException) { Gap("alternate_key_not_active"); }
        }
    }
    public async Task SeedWorkspace(JsonObject state, Guid owner, bool create) {
        if (tables.Count != 2 || Gaps.Count != 0) throw new DeploymentException("tables_not_ready_for_seed");
        string set = S(tables["zk_kitchenworkspace"],"EntitySetName");
        var payload = new JsonObject { ["zk_kitchenworkspaceid"] = Seed.WorkspaceId, ["zk_name"] = "Zunftküche", ["zk_state"] = state.ToJsonString(), ["zk_revision"] = 0, ["ownerid@odata.bind"] = $"/systemusers({owner:D})" };
        var expected = payload.DeepClone().AsObject(); expected.Remove("ownerid@odata.bind"); expected["_ownerid_value"] = owner.ToString("D");
        var existing = await engine.Find($"{set}?$filter=zk_kitchenworkspaceid eq {Seed.WorkspaceId}");
        if (existing == null && create) {
            // Seeding must happen before any guard is registered. An existing exact seed may be reused.
            var guards = await engine.Rows("sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid&$filter=startswith(name,'zk_KitchenGuard_')");
            if (guards.Length != 0) throw new DeploymentException("seed_after_guard_registration_forbidden");
        }
        await Ensure("workspace_seed", $"{set}?$filter=zk_kitchenworkspaceid eq {Seed.WorkspaceId}", set, payload, expected, create);
    }
    public async Task VerifyWorkspace(JsonObject reviewedSeed, Guid owner) {
        var table = await engine.Find("EntityDefinitions?$select=EntitySetName&$filter=LogicalName eq 'zk_kitchenworkspace'");
        if (table == null) { Gap("workspace_table_missing"); return; }
        var set = S(table, "EntitySetName");
        var row = await engine.Find($"{set}?$select=zk_kitchenworkspaceid,_ownerid_value,zk_state,zk_revision&$filter=zk_kitchenworkspaceid eq {Seed.WorkspaceId}");
        if (row == null) { Gap("workspace_missing"); return; }
        if (owner == Guid.Empty || ResourceEngine.Id(row, "_ownerid_value") != owner.ToString("D"))
            throw new DeploymentException("workspace_owner_mismatch");
        if (ResourceEngine.Id(row, "zk_kitchenworkspaceid") != Seed.WorkspaceId)
            throw new DeploymentException("workspace_identity_mismatch");
        try {
            if (row["zk_revision"] is not JsonValue revisionValue || !revisionValue.TryGetValue<int>(out int revision) || revision < 0 ||
                row["zk_state"] is not JsonValue stateValue || !stateValue.TryGetValue<string>(out var rawState))
                throw new DeploymentException("workspace_required_state_or_revision_missing");
            // Parse with the server's size/depth/duplicate-property bounds; do not trust persisted JSON.
            var state = Protocol.Parse(rawState);
            var baseline = JObject.Parse(reviewedSeed.ToJsonString());
            StatePolicy.Validate(state, baseline);
            if ((int)state["revision"]! != revision) throw new DeploymentException("workspace_revision_mismatch");
            // Revision zero must be the exact reviewed seed (object order/formatting are immaterial).
            // Later revisions may contain valid edits, while the policy protects original provenance,
            // receipt economics and baseline history. Intermediate transaction history is a live-test gate.
            if (revision == 0 && !JToken.DeepEquals(Protocol.Canonical(state), Protocol.Canonical(baseline)))
                throw new DeploymentException("workspace_initial_seed_mismatch");
            engine.Resources.Add(new { resource = "workspace_state", status = "verified", id = Seed.WorkspaceId, revision });
        } catch (Exception error) when (error is ArgumentException or Newtonsoft.Json.JsonException or InvalidOperationException or OverflowException) {
            throw new DeploymentException("workspace_persisted_state_invalid");
        }
    }
    public async Task Backend(byte[] packageBytes, bool create) {
        if (tables.Count != 2 || Gaps.Count != 0) { if (create) throw new DeploymentException("tables_not_ready_for_backend"); return; }
        // Do not activate guards over a missing or altered initial workspace.
        var workspace = await engine.Find($"{S(tables["zk_kitchenworkspace"],"EntitySetName")}?$select=zk_kitchenworkspaceid,zk_revision&$filter=zk_kitchenworkspaceid eq {Seed.WorkspaceId}");
        if (workspace == null) { Gap("workspace_missing"); if (create) throw new DeploymentException("seed_required_before_backend"); }
        string content = Convert.ToBase64String(packageBytes);
        var package = await Ensure("plugin_package", "pluginpackages?$filter=uniquename eq 'zk_Zunftkueche.Dataverse'", "pluginpackages",
            new JsonObject { ["uniquename"] = "zk_Zunftkueche.Dataverse", ["name"] = "Zunftkueche.Dataverse", ["version"] = "1.0.0", ["content"] = content },
            new JsonObject { ["uniquename"] = "zk_Zunftkueche.Dataverse", ["version"] = "1.0.0", ["statecode"] = 0, ["content"] = content }, create);
        if (package == null) return;
        var packageId = ResourceEngine.Id(package,"pluginpackageid"); await Component(packageId);
        var assemblies = await engine.Rows($"pluginassemblies?$select=pluginassemblyid,name,isolationmode,_packageid_value&$filter=_packageid_value eq {packageId}");
        var assembly = assemblies.SingleOrDefault(a=>a["name"]?.GetValue<string>()=="Kitchen.Dataverse");
        if (assembly == null) { Gap("package_assembly_missing"); return; }
        ResourceEngine.RequireMatch(assembly, new JsonObject { ["isolationmode"] = 2 });
        var assemblyId=ResourceEngine.Id(assembly,"pluginassemblyid");
        var types=new Dictionary<string,string>();
        foreach(var name in new[]{"Zunftkueche.KitchenLoadPlugin","Zunftkueche.KitchenCommitPlugin","Zunftkueche.KitchenWriteGuardPlugin"}) {
            var type=await engine.Find($"plugintypes?$select=plugintypeid,typename,_pluginassemblyid_value&$filter=typename eq '{name}' and _pluginassemblyid_value eq {assemblyId}");
            if(type==null) {Gap("missing_plugin_type:"+name);continue;} types[name]=ResourceEngine.Id(type,"plugintypeid");
        }
        if(types.Count!=3)return;
        await Apis(types,create);
        await Guards(types["Zunftkueche.KitchenWriteGuardPlugin"],create);
        await ApiMetadata();
    }
    private async Task Apis(Dictionary<string,string> types, bool create) {
        var entity=await engine.Get("EntityDefinitions(LogicalName='zk_kitchenworkspace')?$select=Privileges") ?? throw new DeploymentException("privileges_unavailable");
        foreach(var api in contract["customApis"]!.AsArray()) {
            var name=S(api!,"uniqueName");var verb=name.EndsWith("Load",StringComparison.Ordinal)?"Read":"Write";
            var privilege=entity["Privileges"]!.AsArray().SingleOrDefault(p=>p?["PrivilegeType"]?.GetValue<string>()==verb);
            if(privilege==null)throw new DeploymentException("required_execute_privilege_missing");
            string privilegeName=S(privilege,"Name");
            var type=types[S(api!,"pluginType")];
            var expected=new JsonObject { ["uniquename"]=name,["bindingtype"]=0,["isfunction"]=false,["isprivate"]=false,["allowedcustomprocessingsteptype"]=0,["workflowsdkstepenabled"]=false,["executeprivilegename"]=privilegeName,["_plugintypeid_value"]=type,["boundentitylogicalname"]=null };
            var input=new JsonObject{["uniquename"]="RequestJson",["type"]=10,["isoptional"]=false,["logicalentityname"]=null};
            var output=new JsonObject{["uniquename"]="ResultJson",["type"]=10,["logicalentityname"]=null};
            expected["CustomAPIRequestParameters"]=new JsonArray(input.DeepClone()); expected["CustomAPIResponseProperties"]=new JsonArray(output.DeepClone());
            var payload=expected.DeepClone().AsObject();payload.Remove("_plugintypeid_value");payload["PluginTypeId@odata.bind"]=$"/plugintypes({type})";payload["name"]=name;payload["displayname"]=name;
            foreach(var nav in new[]{"CustomAPIRequestParameters","CustomAPIResponseProperties"})foreach(var item in payload[nav]!.AsArray()) {item!["name"]=name+"."+S(item,"uniquename");item["displayname"]=S(item,"uniquename");}
            var row=await Ensure(name,$"customapis?$filter=uniquename eq '{name}'&$expand=CustomAPIRequestParameters,CustomAPIResponseProperties","customapis",payload,expected,create);
            if(row!=null)await Component(ResourceEngine.Id(row,"customapiid"));
        }
    }
    public async Task Guards(string guardType, bool create) {
        foreach(var spec in contract["guardSteps"]!.AsArray()) {
            string table=S(spec!,"primaryEntity"),message=S(spec!,"message");
            var msg=await engine.Find($"sdkmessages?$select=sdkmessageid,name&$filter=name eq '{message}'");
            if(msg==null) {Gap("unavailable_message_requires_runtime_confirmation:"+table+":"+message);continue;}
            string messageId=ResourceEngine.Id(msg,"sdkmessageid");
            var filters=await engine.Rows($"sdkmessagefilters?$select=sdkmessagefilterid,iscustomprocessingstepallowed,primaryobjecttypecode&$filter=_sdkmessageid_value eq {messageId} and primaryobjecttypecode eq '{table}'");
            if(filters.Length==0) {Gap("unavailable_filter_requires_runtime_confirmation:"+table+":"+message);continue;}
            foreach(var filter in filters) {
                if(filter["iscustomprocessingstepallowed"]?.GetValue<bool>()!=true) {Gap("supported_but_unguardable:"+table+":"+message);continue;}
                string filterId=ResourceEngine.Id(filter,"sdkmessagefilterid"),name=$"zk_KitchenGuard_{table}_{message}_{filterId}";
                var payload=new JsonObject{["name"]=name,["stage"]=20,["mode"]=0,["rank"]=1,["supporteddeployment"]=0,["filteringattributes"]=null,["eventhandler_plugintype@odata.bind"]=$"/plugintypes({guardType})",["sdkmessageid@odata.bind"]=$"/sdkmessages({messageId})",["sdkmessagefilterid@odata.bind"]=$"/sdkmessagefilters({filterId})"};
                // Query by actual filter AND handler, never just the friendly name; duplicate registrations stop.
                var row=await Ensure(name,$"sdkmessageprocessingsteps?$filter=_sdkmessagefilterid_value eq {filterId} and _eventhandler_value eq {guardType}","sdkmessageprocessingsteps",payload,new JsonObject(),create);
                if(row!=null) {Readiness.RequireGuard(row,guardType,filterId,messageId);await Component(ResourceEngine.Id(row,"sdkmessageprocessingstepid"));}
            }
        }
    }
    private async Task ApiMetadata() {
        var text=(await transport.SendAsync(HttpMethod.Get,"$metadata"))?.GetValue<string>();
        if(text==null) {Gap("api_metadata_missing");return;}
        var xml=XDocument.Parse(text);XNamespace edm="http://docs.oasis-open.org/odata/ns/edm";
        foreach(var name in new[]{"zk_KitchenLoad","zk_KitchenCommit"}) {
            var action=xml.Descendants(edm+"Action").SingleOrDefault(e=>(string?)e.Attribute("Name")==name);
            var input=action?.Elements(edm+"Parameter").ToArray();
            var returnName=(string?)action?.Element(edm+"ReturnType")?.Attribute("Type");
            var output=xml.Descendants(edm+"ComplexType").SingleOrDefault(e=>(string?)e.Attribute("Name")==returnName?.Split('.').Last())?.Elements(edm+"Property").SingleOrDefault(e=>(string?)e.Attribute("Name")=="ResultJson");
            if(action==null||(string?)action.Attribute("IsBound")=="true"||input?.Length!=1||(string?)input[0].Attribute("Name")!="RequestJson"||(string?)input[0].Attribute("Type")!="Edm.String"||(string?)output?.Attribute("Type")!="Edm.String")Gap("api_metadata_contract_missing:"+name);
        }
    }
}
