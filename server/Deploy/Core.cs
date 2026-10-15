using System.Text.Json.Nodes;
namespace Kitchen.Deploy;

public interface IDataverseTransport {
    Task<JsonNode?> SendAsync(HttpMethod method, string relativePath, JsonNode? payload = null);
}
public sealed class DeploymentException(string code) : Exception(code);
public static class Target {
    public const string Url = "https://org1d76e28a.crm17.dynamics.com";
    public const string Tenant = "1dcbc0d3-e9b9-4622-bbd7-811ff1c1f7e9";
    public const string Organization = "5ded2106-01c8-f111-be88-002248db2d69";
    public const string User = "Vorstand@Schelmenzunft.onmicrosoft.com";
    public const string Solution = "zk_Zunftkueche";
    public static void ValidateUrl(string url) {
        if (!string.Equals(url.TrimEnd('/'), Url, StringComparison.OrdinalIgnoreCase)) throw new DeploymentException("wrong_target_url");
    }
    public static void ValidateAccount(string tenant, string user) {
        if (!string.Equals(tenant, Tenant, StringComparison.OrdinalIgnoreCase) || !string.Equals(user, User, StringComparison.OrdinalIgnoreCase))
            throw new DeploymentException("wrong_tenant_or_account");
    }
}
public static class SafeOutput {
    // Never surface MSAL/HTTP/JSON/validation exception messages or payloads.
    public static string Error(Exception exception) => exception is DeploymentException ? exception.Message : "operation_failed_details_suppressed";
}
public sealed class ResourceEngine(IDataverseTransport transport, string? authenticatedObjectId = null) {
    private Guid verifiedUser;
    public List<object> Resources { get; } = [];
    public async Task<Guid> AuthenticateTargetAsync() {
        verifiedUser = Guid.Empty;
        var who = await Get("WhoAmI");
        if (who?["OrganizationId"]?.GetValue<string>()?.ToLowerInvariant() != Target.Organization) throw new DeploymentException("wrong_organization");
        var userId = Id(who!, "UserId");
        var user = await Get($"systemusers({userId})?$select=domainname,isdisabled,azureactivedirectoryobjectid");
        if (!string.Equals(user?["domainname"]?.GetValue<string>(), Target.User, StringComparison.OrdinalIgnoreCase) || user?["isdisabled"]?.GetValue<bool>() != false)
            throw new DeploymentException("wrong_or_disabled_systemuser");
        if (authenticatedObjectId != null && !string.Equals(user?["azureactivedirectoryobjectid"]?.GetValue<string>(), authenticatedObjectId, StringComparison.OrdinalIgnoreCase))
            throw new DeploymentException("identity_object_id_mismatch");
        var org = await Get($"organizations({Target.Organization})?$select=languagecode,_basecurrencyid_value");
        if (org?["languagecode"]?.GetValue<int>() != 1031) throw new DeploymentException("organization_language_mismatch");
        var currencyId = Id(org!, "_basecurrencyid_value");
        var currency = await Get($"transactioncurrencies({currencyId})?$select=isocurrencycode");
        if (currency?["isocurrencycode"]?.GetValue<string>() != "EUR") throw new DeploymentException("organization_currency_mismatch");
        verifiedUser = Guid.Parse(userId);
        Resources.Add(new { resource = "target", status = "verified", organization = Target.Organization, userId });
        return verifiedUser;
    }
    public static string Id(JsonNode row, string field) {
        if (!Guid.TryParse(row[field]?.GetValue<string>(), out var id) || id == Guid.Empty) throw new DeploymentException("invalid_resource_id");
        return id.ToString("D");
    }
    public async Task<JsonObject?> Get(string path) => (await transport.SendAsync(HttpMethod.Get, path))?.AsObject();
    public async Task<JsonObject[]> Rows(string query) {
        var response = await Get(query) ?? throw new DeploymentException("empty_read_response");
        if (response["value"] is not JsonArray values || response["@odata.nextLink"] != null) throw new DeploymentException("unexpected_or_paginated_query_refine_filter");
        return values.Select(v => v?.AsObject() ?? throw new DeploymentException("invalid_row")).ToArray();
    }
    public async Task<JsonObject?> Find(string query) {
        var rows = await Rows(query);
        if (rows.Length > 1) throw new DeploymentException("duplicate_resource_identity");
        return rows.SingleOrDefault();
    }
    public async Task<JsonObject?> EnsureAsync(string name, string query, string collection, JsonObject payload, JsonObject expected, bool create) {
        if (create && verifiedUser == Guid.Empty) throw new DeploymentException("target_not_verified");
        var row = await Find(query);
        string status = "reused";
        if (row == null && create) {
            // A failure may mean the server committed. Always requery; never retry the POST.
            bool ambiguous = false;
            try { await transport.SendAsync(HttpMethod.Post, collection, payload); }
            catch (Exception e) when (e is HttpRequestException or TaskCanceledException or DeploymentException) {
                ambiguous = true;
                Resources.Add(new { resource = name, status = "write_response_unconfirmed_readback_required", error = SafeOutput.Error(e) });
            }
            row = await Find(query);
            if (row == null) throw new DeploymentException(ambiguous ? "write_outcome_unconfirmed_stop" : "created_resource_not_visible_stop");
            status = ambiguous ? "confirmed_after_ambiguous_write" : "created_and_read_back";
        }
        if (row == null) { Resources.Add(new { resource = name, status = "missing" }); return null; }
        RequireMatch(row, expected);
        var idField = new[] { "MetadataId", "publisherid", "solutionid", "pluginpackageid", "customapiid", "sdkmessageprocessingstepid", "zk_kitchenworkspaceid" }.FirstOrDefault(row.ContainsKey);
        string? id = idField == null ? null : Id(row, idField);
        Resources.Add(new { resource = name, status, id });
        return row;
    }
    public static void RequireMatch(JsonNode? actual, JsonNode? expected) {
        if (expected is JsonObject obj) {
            if (actual is not JsonObject read) throw new DeploymentException("resource_definition_drift");
            foreach (var p in obj) {
                if (!read.ContainsKey(p.Key)) throw new DeploymentException("resource_definition_missing_field");
                RequireMatch(read[p.Key], p.Value);
            }
        } else if (expected is JsonArray arr) {
            if (actual is not JsonArray read || read.Count != arr.Count) throw new DeploymentException("resource_definition_drift");
            // Arrays here represent exact ordered keys/targets, or a single API parameter.
            for (int i = 0; i < arr.Count; i++) RequireMatch(read[i], arr[i]);
        } else if (!JsonNode.DeepEquals(actual, expected)) throw new DeploymentException("resource_definition_drift");
    }
}
public static class Readiness {
    public static void RequireActiveKey(JsonObject key) {
        if (key["EntityKeyIndexStatus"]?.GetValue<string>() != "Active") throw new DeploymentException("alternate_key_not_active_rerun_readonly_verify");
    }
    public static void RequireGuard(JsonObject step, string type, string filter, string message) {
        ResourceEngine.RequireMatch(step, new JsonObject {
            ["stage"] = 20, ["mode"] = 0, ["rank"] = 1, ["statecode"] = 0, ["supporteddeployment"] = 0,
            ["filteringattributes"] = null, ["_impersonatinguserid_value"] = null,
            ["_eventhandler_value"] = type, ["_sdkmessagefilterid_value"] = filter, ["_sdkmessageid_value"] = message
        });
    }
}
