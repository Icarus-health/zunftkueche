using System.Text.Json.Nodes;
namespace Kitchen.Inventory;
public sealed class Metadata(Reader reader, Backup backup, string prefix = "metadata-before-")
{
    readonly JsonObject evidence = new(); public string Fingerprint => Check.Fingerprint(evidence);
    readonly Dictionary<string, HashSet<string>> columns = []; readonly List<string> requiredComponents = [Target.Package];
    public async Task Read()
    {
        var solution = await reader.Rows(Queries.Solution, "solutionid", 2);
        Check.Require(solution.Length == 1);
        Check.Match(solution[0], new JsonObject { ["solutionid"] = Target.Solution, ["uniquename"] = "zk_Zunftkueche", ["ismanaged"] = false });
        var publishers = await reader.Rows(Queries.Publishers, "publisherid", 2);
        Check.Require(publishers.Length == 1 && Check.Id(publishers[0], "publisherid") == Check.Id(solution[0], "_publisherid_value"));
        Check.Match(publishers[0], new JsonObject { ["publisherid"] = "567e35a2-67c8-f111-a05c-7ced8d5f6e0d", ["uniquename"] = "zk_Zunftkueche", ["customizationprefix"] = "zk", ["customizationoptionvalueprefix"] = 72700 });
        Save("publisher", publishers);
        Save("bypass-privilege-definitions", await reader.Rows(Queries.Bypass, "privilegeid", 10));
        Save("solution", solution);
        var components = await reader.Rows(Queries.Components, "solutioncomponentid", 10000);
        Save("solution-components", components);
        foreach (string table in new[] { "zk_kitchenworkspace", "zk_kitchenoperation" })
        {
            var row = await reader.Object(Queries.Table(table));
            Check.Match(row, new JsonObject { ["LogicalName"] = table, ["TableType"] = "Standard", ["OwnershipType"] = table == "zk_kitchenworkspace" ? "UserOwned" : "OrganizationOwned", ["IsOptimisticConcurrencyEnabled"] = true, ["PrimaryIdAttribute"] = table + "id" });
            requiredComponents.Add(Check.Id(row, "MetadataId"));
            Check.Require(row["Privileges"] is JsonArray);
            evidence[table] = row.DeepClone();
            backup.Json(prefix + table + "-metadata.json", row);
            var attributes = await reader.Rows(Queries.Table(table) + "/Attributes", "MetadataId", 500);
            var known = new HashSet<string>();
            foreach (var a in attributes)
                Check.Require(known.Add(Check.Text(a, "LogicalName")));
            Check.Require(!attributes.Any(a => a["IsSecured"]?.GetValue<bool>() == true));
            columns.Add(table, known);
            string[] expected = table == "zk_kitchenworkspace" ? ["zk_name", "zk_state", "zk_revision", "zk_kitchenworkspaceid"] : ["zk_name", "zk_workspace", "zk_operationid", "zk_requesthash", "zk_actor", "zk_appliedrevision", "zk_recordedat", "zk_kitchenoperationid"];
            Check.Require(expected.All(known.Contains));
            foreach (var attr in attributes.Where(a => Check.Text(a, "LogicalName").StartsWith("zk_", StringComparison.Ordinal) && !expected.Contains(Check.Text(a, "LogicalName"))))
                Check.Require(attr["IsLogical"]?.GetValue<bool>() == true && expected.Contains(attr["AttributeOf"]?.GetValue<string>()));
            Check.Require(known.Contains("versionnumber"));
            Save(table + "-attributes", attributes);
            var keys = await reader.Rows(Queries.Table(table) + "/Keys", "MetadataId", 20);
            if (table == "zk_kitchenoperation")
            {
                Check.Require(keys.Length == 1);
                ValidateOperationKey(keys[0]);
            }
            else
                Check.Require(keys.Length == 0);
            Save(table + "-keys", keys);
            foreach (var relation in new[] { "ManyToOneRelationships", "OneToManyRelationships" })
                Save(table + "-" + relation, await reader.Rows(Queries.Table(table) + "/" + relation, "MetadataId", 500));
        }
        var types = await reader.Rows(Queries.Types, "plugintypeid", 10);
        Check.Require(types.Length is 3 or 4);
        string[] names = ["Zunftkueche.KitchenLoadPlugin", "Zunftkueche.KitchenCommitPlugin", "Zunftkueche.KitchenWriteGuardPlugin"];
        Check.Require(types.Select(t => Check.Text(t, "typename")).ToHashSet().SetEquals(types.Length==3 ? names : names.Append("Zunftkueche.KitchenDocumentWriteGuardPlugin")));
        foreach (var t in types)
        {
            var assembly = t["pluginassemblyid"] as JsonObject ?? throw new Stop();
            Check.Require(Check.Id(t, "_pluginassemblyid_value") == Check.Id(assembly, "pluginassemblyid") && Check.Id(assembly, "_packageid_value") == Target.Package && assembly["isolationmode"]?.GetValue<int>() == 2);
        }
        Check.Require(types.Select(t => Check.Id(t, "_pluginassemblyid_value")).Distinct().Count() == 1);
        Save("plugin-types-assemblies", types);
        var apis = await reader.Rows(Queries.Apis, "customapiid", 10);
        Check.Require(apis.Length == 2);
        foreach (var name in new[] { "zk_KitchenLoad", "zk_KitchenCommit" })
        {
            var api = apis.SingleOrDefault(a => a["uniquename"]?.GetValue<string>() == name) ?? throw new Stop();
            string type = Check.Id(types.Single(t => Check.Text(t, "typename") == "Zunftkueche." + (name.EndsWith("Load") ? "KitchenLoadPlugin" : "KitchenCommitPlugin")), "plugintypeid");
            Check.Match(api, new JsonObject { ["customapiid"] = name == "zk_KitchenLoad" ? Target.LoadApi : Target.CommitApi, ["bindingtype"] = 0, ["isfunction"] = false, ["isprivate"] = false, ["allowedcustomprocessingsteptype"] = 0, ["workflowsdkstepenabled"] = false, ["boundentitylogicalname"] = null, ["_plugintypeid_value"] = type, ["executeprivilegename"] = name.EndsWith("Load") ? "prvReadzk_kitchenworkspace" : "prvWritezk_kitchenworkspace" });
            // A plain root must never supply collections that could be mistaken for complete children.
            Check.Require(!api.ContainsKey("CustomAPIRequestParameters") && !api.ContainsKey("CustomAPIResponseProperties"));
        }
        Save("api-roots", apis);
        var joinedApis = new List<JsonObject>();
        foreach (var api in apis)
        {
            string id = Check.Id(api, "customapiid");
            reader.ApiChildren(id);
            var joined = (JsonObject)api.DeepClone();
            foreach (var pair in new[] { ("CustomAPIRequestParameters", "RequestJson", "customapirequestparameterid", Queries.ApiRequestParameters(id)), ("CustomAPIResponseProperties", "ResultJson", "customapiresponsepropertyid", Queries.ApiResponseProperties(id)) })
            {
                var values = await reader.Rows(pair.Item4, pair.Item3, 1);
                Check.Require(values.Length == 1 && Check.Id(values[0], "_customapiid_value") == id);
                Check.Match(values[0], new JsonObject { ["uniquename"] = pair.Item2, ["type"] = 10, ["logicalentityname"] = null });
                if (pair.Item2 == "RequestJson")
                    Check.Require(values[0]["isoptional"]?.GetValue<bool>() == false);
                joined[pair.Item1] = new JsonArray(values.Select(v => (JsonNode)v.DeepClone()).ToArray());
            }
            joinedApis.Add(joined);
        }
        Save("apis", joinedApis.ToArray());
        requiredComponents.AddRange(apis.Select(a => Check.Id(a, "customapiid")));
        string guard = Check.Id(types.Single(t => Check.Text(t, "typename") == names[2]), "plugintypeid");
        reader.Guard(guard);
        var filters = await reader.Rows(Queries.Filters, "sdkmessagefilterid", 200);
        Save("message-filters", filters);
        var platform = await reader.Rows(Queries.Platform, "plugintypeid", 2);
        Check.Require(platform.Length == 1);
        using (var stream = typeof(Metadata).Assembly.GetManifestResourceStream("Inventory.contracts.platform-intrinsics.json") ?? throw new Stop())
        {
            using var memory = new MemoryStream();
            stream.CopyTo(memory);
            Check.Match(platform[0], Check.Parse(memory.ToArray())["handler"]);
        }
        Save("platform-handler", platform);
        var steps = await reader.Rows(Queries.Guards(guard), "sdkmessageprocessingstepid", 200);
        ValidateGuards(steps, filters, guard);
        Save("guards-all-platform-and-custom", steps);
        requiredComponents.AddRange(steps.Where(s => s["_eventhandler_value"]?.GetValue<string>() == guard).Select(s => Check.Id(s, "sdkmessageprocessingstepid")));
        foreach (var id in requiredComponents)
            Check.Require(components.Count(c => c["objectid"]?.GetValue<string>() == id) == 1);
    }
    public static void ValidateOperationKey(JsonObject key)
    {
        Check.Match(key, new JsonObject { ["LogicalName"] = "zk_workspace_operation", ["EntityKeyIndexStatus"] = "Active" });
        var attributes = key["KeyAttributes"] as JsonArray ?? throw new Stop();
        Check.Require(attributes.Count == 2);
        var names = attributes.Select(a => a?.GetValue<string>() ?? throw new Stop()).ToArray();
        Check.Require(names.Distinct(StringComparer.Ordinal).Count() == 2 && names.ToHashSet(StringComparer.Ordinal).SetEquals(new[] { "zk_workspace", "zk_operationid" }));
    }
    void Save(string name, JsonObject[] rows)
    {
        var value = new JsonArray(rows.Select(r => (JsonNode)r.DeepClone()).ToArray());
        evidence[name] = value.DeepClone();
        backup.Json(prefix + name + ".json", value);
    }
    public static void ValidateGuards(JsonObject[] steps, JsonObject[] filters, string guard)
    {
        using var stream = typeof(Metadata).Assembly.GetManifestResourceStream("Inventory.contracts.platform-intrinsics.json") ?? throw new Stop();
        using var mem = new MemoryStream();
        stream.CopyTo(mem);
        var baseline = Check.Parse(mem.ToArray());
        var baselineSteps = baseline["steps"]!.AsArray().ToDictionary(s => Check.Id(s, "sdkmessageprocessingstepid"));
        var found = new HashSet<string>();
        var custom = new List<JsonObject>();
        foreach (var row in steps)
        {
            string id = Check.Id(row, "sdkmessageprocessingstepid");
            if (baselineSteps.TryGetValue(id, out var expected))
            {
                Check.Match(row, expected);
                found.Add(id);
            }
            else
                custom.Add(row);
        }
        Check.Require(found.Count == baselineSteps.Count && custom.Count == 6);
        var fixedIds = new Dictionary<string,string> {
            ["0a1d7725-76c8-f111-a05c-7ced8d5f6e0d"]="1a0bc779-6919-4edf-8f59-d237a50c2d27",
            ["0d1d7725-76c8-f111-a05c-7ced8d5f6e0d"]="65c0cea9-d3be-45a6-8ff2-ffd8e4071e22",
            ["b0b0da28-76c8-f111-a05c-7ced8d5f6c91"]="de7afa3d-bd34-47f2-94dc-ecfb41eb3204",
            ["b3b0da28-76c8-f111-a05c-7ced8d5f6c91"]="a7963969-3d98-42d9-8f1a-e5785e4f7b10",
            ["101d7725-76c8-f111-a05c-7ced8d5f6e0d"]="0762bb07-341f-4759-a07e-a1ef34d005d1",
            ["131d7725-76c8-f111-a05c-7ced8d5f6e0d"]="8b51d657-9bd6-4be6-8721-81d4f24eb696" };
        Check.Require(custom.All(s=>fixedIds.TryGetValue(Check.Id(s,"sdkmessageprocessingstepid"),out var f)&&f==Check.Id(s,"_sdkmessagefilterid_value")));

        foreach (string table in new[] { "zk_kitchenworkspace", "zk_kitchenoperation" })
            foreach (string action in new[] { "Create", "Update", "Delete" })
            {
                var matching = filters.Where(f => f["primaryobjecttypecode"]?.GetValue<string>() == table && f["sdkmessageid"]?["name"]?.GetValue<string>() == action).ToArray();
                Check.Require(matching.Length == 1 && matching[0]["iscustomprocessingstepallowed"]?.GetValue<bool>() == true);
                string filterId = Check.Id(matching[0], "sdkmessagefilterid"), messageId = Check.Id(matching[0], "_sdkmessageid_value");
                Check.Require(Check.Id(matching[0]["sdkmessageid"], "sdkmessageid") == messageId);
                var rows = custom.Where(s => s["_sdkmessagefilterid_value"]?.GetValue<string>() == filterId).ToArray();
                Check.Require(rows.Length == 1);
                Check.Match(rows[0], new JsonObject { ["stage"] = 20, ["mode"] = 0, ["rank"] = 1, ["statecode"] = 0, ["supporteddeployment"] = 0, ["filteringattributes"] = null, ["_impersonatinguserid_value"] = null, ["_eventhandler_value"] = guard, ["_sdkmessagefilterid_value"] = filterId, ["_sdkmessageid_value"] = messageId });
            }
    }
    public void ValidateRecordFields(JsonObject workspace, JsonObject[] receipts)
    {
        ValidateFields(workspace, columns["zk_kitchenworkspace"]);
        foreach (var row in receipts)
            ValidateFields(row, columns["zk_kitchenoperation"]);
    }
    internal static void ValidateFields(JsonObject row, HashSet<string> names)
    {
        foreach (var p in row)
        {
            string key = p.Key.Split('@')[0];
            if (key == "")
            {
                Check.Require(p.Key is "@odata.context" or "@odata.etag");
                continue;
            }
            if (key.StartsWith('_') && key.EndsWith("_value", StringComparison.Ordinal))
                key = key[1..^6];
            Check.Require(names.Contains(key));
            if (p.Key.Contains('@'))
                Check.Require(p.Key.EndsWith("@Microsoft.Dynamics.CRM.lookuplogicalname", StringComparison.Ordinal));
        }
    }
}
