using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Security.Cryptography;
namespace Kitchen.Inventory;
public static class Target
{
    public const string Url = "https://org1d76e28a.crm17.dynamics.com", Api = Url + "/api/data/v9.2/", Tenant = "1dcbc0d3-e9b9-4622-bbd7-811ff1c1f7e9", Organization = "5ded2106-01c8-f111-be88-002248db2d69", User = "Vorstand@Schelmenzunft.onmicrosoft.com", Workspace = "45deaf94-5661-4110-8f16-3d2678c09f04", Package = "70a54daa-73c8-f111-a05c-7ced8d5f6e0d", Solution = "587e35a2-67c8-f111-a05c-7ced8d5f6e0d", Environment = "5684204c-3254-ec15-93f4-276ec50cc65b", App = "bfec495e-c223-4176-89a8-3e4d631337ae";
    // Exact existing API IDs observed in the parent-approved partial metadata capture.
    public const string LoadApi = "cc1c7725-76c8-f111-a05c-7ced8d5f6e0d", CommitApi = "eb1c7725-76c8-f111-a05c-7ced8d5f6e0d";
    public const string Checkpoint = "4f1fad176a66954dd97f2e613176a1e229ee05fe";
}
public enum FailureStage
{
    NotStarted, Integrity, LocalStorage, Authentication, Identity, Permissions, Workspace, Receipts, Metadata, Package, Consistency, StateValidation, OwnerIdentity, Finalization
}
public enum FailureReason
{
    ValidationRejected, PrelaunchRequired, TokenExpired, Cancelled, LocalIo, Transport, OperationFailed
}
public sealed class RunStatus
{
    public FailureStage Stage { get; set; } = FailureStage.NotStarted; public Backup? Backup
    {
        get; set;
    }
}
public sealed class Stop(FailureReason reason = FailureReason.ValidationRejected) : Exception("inventory_incomplete_stop")
{
    public FailureReason Reason { get; } = reason;
}
public static class Check
{
    public static void Require(bool ok)
    {
        if (!ok)
            throw new Stop();
    }
    public static string Text(JsonNode? row, string key) => row?[key]?.GetValue<string>() ?? throw new Stop();
    public static string Id(JsonNode? row, string key) => Id(Text(row, key));
    public static string Id(string value)
    {
        Require(Guid.TryParseExact(value, "D", out var id) && id != Guid.Empty);
        return id.ToString("D");
    }
    public static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    public static string Hash(string value) => Hash(new UTF8Encoding(false, true).GetBytes(value));
    public static JsonNode Canonical(JsonNode? n) => n switch { JsonObject o => new JsonObject(o.OrderBy(k => k.Key, StringComparer.Ordinal).Select(p => KeyValuePair.Create(p.Key, p.Value is null ? null : Canonical(p.Value)))), JsonArray a => new JsonArray(a.Select(v => v is null ? null : Canonical(v)).ToArray()), _ => n?.DeepClone() ?? null! };
    public static string Fingerprint(JsonNode n) => Hash(Canonical(n).ToJsonString());
    public static JsonObject Parse(byte[] bytes)
    {
        using var doc = JsonDocument.Parse(bytes, new()
        {
            MaxDepth = 64
        });
        Unique(doc.RootElement);
        return JsonNode.Parse(bytes) as JsonObject ?? throw new Stop();
    }
    static void Unique(JsonElement n)
    {
        if (n.ValueKind == JsonValueKind.Object)
        {
            var seen = new HashSet<string>();
            foreach (var p in n.EnumerateObject())
            {
                Require(seen.Add(p.Name));
                Unique(p.Value);
            }
        }
        else if (n.ValueKind == JsonValueKind.Array)
            foreach (var v in n.EnumerateArray())
                Unique(v);
    }
    public static void Match(JsonNode? actual, JsonNode? expected)
    {
        if (expected is JsonObject obj)
        {
            Require(actual is JsonObject);
            foreach (var p in obj)
            {
                Require(((JsonObject)actual!).ContainsKey(p.Key));
                Match(actual[p.Key], p.Value);
            }
        }
        else if (expected is JsonArray arr)
        {
            Require(actual is JsonArray a && a.Count == arr.Count);
            for (int i = 0; i < arr.Count; i++)
                Match(actual![i], arr[i]);
        }
        else
            Require(JsonNode.DeepEquals(actual, expected));
    }
    public static void NoNestedContinuation(JsonNode? n)
    {
        if (n is JsonObject o)
            foreach (var p in o)
            {
                Require(!p.Key.EndsWith("@odata.nextLink", StringComparison.Ordinal) && !p.Key.EndsWith("@odata.deltaLink", StringComparison.Ordinal));
                NoNestedContinuation(p.Value);
            }
        else if (n is JsonArray a)
            foreach (var v in a)
                NoNestedContinuation(v);
    }
}
public static class Queries
{
    public const string Workspace = $"zk_kitchenworkspaces({Target.Workspace})";
    public const string Receipts = $"zk_kitchenoperations?$filter=_zk_workspace_value eq {Target.Workspace}&$orderby=zk_kitchenoperationid asc&$count=true";
    public const string Package = $"pluginpackages({Target.Package})?$select=pluginpackageid,name,uniquename,version,statecode,package,versionnumber";
    public const string PackageBytes = $"pluginpackages({Target.Package})/package/$value";
    public const string Org = $"organizations({Target.Organization})?$select=organizationid,languagecode,_basecurrencyid_value";
    public const string Solution = "solutions?$filter=uniquename eq 'zk_Zunftkueche'";
    public const string Publishers = "publishers?$filter=uniquename eq 'zk_Zunftkueche'";
    public const string Bypass = "privileges?$filter=name eq 'prvBypassCustomPlugins' or name eq 'prvBypassCustomBusinessLogic' or name eq 'prvBypassCustomPluginExecution' or name eq 'prvBypassBusinessLogicExecution'";
    public const string Components = $"solutioncomponents?$filter=_solutionid_value eq {Target.Solution}";
    public const string Types = "plugintypes?$filter=startswith(typename,'Zunftkueche.')&$expand=pluginassemblyid";
    public const string Apis = "customapis?$filter=startswith(uniquename,'zk_Kitchen')";
    public const string Platform = "plugintypes?$filter=typename eq 'Microsoft.Crm.Extensibility.InternalOperationPlugin'&$expand=pluginassemblyid";
    public const string Filters = "sdkmessagefilters?$filter=primaryobjecttypecode eq 'zk_kitchenworkspace' or primaryobjecttypecode eq 'zk_kitchenoperation'&$expand=sdkmessageid";
    public static string ApiRequestParameters(string id) => ApiRoot(id) + "/CustomAPIRequestParameters?$count=true";
    public static string ApiResponseProperties(string id) => ApiRoot(id) + "/CustomAPIResponseProperties?$count=true";
    static string ApiRoot(string id)
    {
        Check.Require(id is Target.LoadApi or Target.CommitApi);
        return $"customapis({id})";
    }
    public static string Table(string table)
    {
        Check.Require(table is "zk_kitchenworkspace" or "zk_kitchenoperation" or "zk_kitchendocument" or "zk_kitchendraft");
        return $"EntityDefinitions(LogicalName='{table}')";
    }
    public static string User(string id) => $"systemusers({Check.Id(id)})?$select=systemuserid,domainname,isdisabled,azureactivedirectoryobjectid";
    public static string Currency(string id) => $"transactioncurrencies({Check.Id(id)})?$select=isocurrencycode";
    public static string Privileges(string id) => $"systemusers({Check.Id(id)})/Microsoft.Dynamics.CRM.RetrieveUserPrivileges()";
    public static string Access(string id) => $"systemusers({Check.Id(id)})/Microsoft.Dynamics.CRM.RetrievePrincipalAccess(Target=@target)?@target=" + Uri.EscapeDataString("{\"@odata.id\":\"" + Workspace + "\"}");
    public static string Guards(string id) => $"sdkmessageprocessingsteps?$filter=_eventhandler_value eq {Check.Id(id)} or startswith(name,'zk_KitchenGuard_') or sdkmessagefilterid/primaryobjecttypecode eq 'zk_kitchenworkspace' or sdkmessagefilterid/primaryobjecttypecode eq 'zk_kitchenoperation'&$expand=sdkmessageid,sdkmessagefilterid,eventhandler_plugintype";
}
