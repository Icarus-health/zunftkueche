using System.Text.Json.Nodes;
namespace Kitchen.Deploy;
public static class Metadata {
    public static JsonObject Label(string text) => new() { ["LocalizedLabels"] = new JsonArray(new JsonObject { ["Label"] = text, ["LanguageCode"] = 1031 }) };
    public static string Text(JsonNode node, string field) => node[field]?.GetValue<string>() ?? throw new DeploymentException("invalid_contract");
    public static JsonObject Attribute(JsonNode spec, bool primary = false) {
        string name = Text(spec, "name"), type = Text(spec, "type");
        var result = new JsonObject {
            ["@odata.type"] = "Microsoft.Dynamics.CRM." + type + "AttributeMetadata",
            ["SchemaName"] = name, ["DisplayName"] = Label(name),
            ["RequiredLevel"] = new JsonObject { ["Value"] = spec["required"]?.GetValue<bool>() == true ? "ApplicationRequired" : "None" }
        };
        if (primary) result["IsPrimaryName"] = true;
        switch (type) {
            case "String": result["MaxLength"] = spec["maxLength"]!.DeepClone(); result["FormatName"] = new JsonObject { ["Value"] = "Text" }; break;
            case "Memo": result["MaxLength"] = spec["maxLength"]!.DeepClone(); result["Format"] = "Text"; break;
            case "Integer": result["MinValue"] = spec["minValue"]!.DeepClone(); result["MaxValue"] = spec["maxValue"]!.DeepClone(); result["Format"] = "None"; break;
            case "DateTime": result["Format"] = "DateAndTime"; result["DateTimeBehavior"] = new JsonObject { ["Value"] = "UserLocal" }; break;
            case "Lookup": break;
            default: throw new DeploymentException("unsupported_attribute_type");
        }
        return result;
    }
    public static JsonObject AttributeExpected(JsonNode spec, bool primary = false) {
        var result = Attribute(spec, primary);
        result.Remove("@odata.type"); result.Remove("DisplayName");
        if (Text(spec,"type") == "Lookup") result["Targets"] = new JsonArray("zk_kitchenworkspace");
        return result;
    }
    public static JsonObject Table(JsonNode spec) {
        var name = Text(spec, "logicalName");
        return new JsonObject {
            ["SchemaName"] = name, ["DisplayName"] = Label(name == "zk_kitchenworkspace" ? "Küchenbestand" : "Küchenvorgang"),
            ["DisplayCollectionName"] = Label(name == "zk_kitchenworkspace" ? "Küchenbestände" : "Küchenvorgänge"),
            ["OwnershipType"] = Text(spec, "ownershipType"), ["IsActivity"] = false, ["HasActivities"] = false, ["HasNotes"] = false,
            ["IsOptimisticConcurrencyEnabled"] = true,
            ["Attributes"] = new JsonArray(Attribute(spec["attributes"]![0]!, true))
        };
    }
    public static JsonObject Relationship() => new() {
        ["@odata.type"] = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
        ["SchemaName"] = "zk_kitchenworkspace_operations",
        ["ReferencedEntity"] = "zk_kitchenworkspace", ["ReferencedAttribute"] = "zk_kitchenworkspaceid",
        ["ReferencingEntity"] = "zk_kitchenoperation",
        ["ReferencingEntityNavigationPropertyName"] = "zk_workspace",
        ["AssociatedMenuConfiguration"] = new JsonObject { ["Behavior"] = "DoNotDisplay", ["Group"] = "Details", ["Order"] = 10000, ["Label"] = Label("Küchenvorgänge") },
        ["CascadeConfiguration"] = new JsonObject { ["Assign"] = "NoCascade", ["Delete"] = "Restrict", ["Merge"] = "NoCascade", ["Reparent"] = "NoCascade", ["Share"] = "NoCascade", ["Unshare"] = "NoCascade" },
        ["Lookup"] = Attribute(new JsonObject { ["name"] = "zk_workspace", ["type"] = "Lookup", ["required"] = true })
    };
}
