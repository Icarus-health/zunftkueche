using System.Text;
using System.Text.Json.Nodes;
using Newtonsoft.Json.Linq;
namespace Kitchen.Inventory;
public sealed class Inspector(Reader reader, Backup backup, string objectId, RunStatus? status = null)
{
    public async Task Run(bool finish = true)
    {
        status ??= new RunStatus { Backup = backup };
        status.Backup ??= backup;
        status.Stage = FailureStage.Identity;
        Check.Id(objectId);
        var who = await reader.Object("WhoAmI");
        Check.Require(Check.Id(who, "OrganizationId") == Target.Organization);
        string user = Check.Id(who, "UserId");
        reader.IdentityUser(user);
        var identity = await reader.Object(Queries.User(user));
        Check.Require(Check.Id(identity, "systemuserid") == user && Check.Text(identity, "domainname").Equals(Target.User, StringComparison.OrdinalIgnoreCase) && identity["isdisabled"]?.GetValue<bool>() == false && Check.Id(identity, "azureactivedirectoryobjectid") == objectId.ToLowerInvariant());
        var org = await reader.Object(Queries.Org);
        Check.Require(Check.Id(org, "organizationid") == Target.Organization && org["languagecode"]?.GetValue<int>() == 1031);
        string currency = Check.Id(org, "_basecurrencyid_value");
        reader.IdentityCurrency(currency);
        Check.Require(Check.Text(await reader.Object(Queries.Currency(currency)), "isocurrencycode") == "EUR");
        reader.Verified(user);
        status.Stage = FailureStage.Permissions;
        var access = await reader.Object(Queries.Access(user));
        ValidateRights(access);
        backup.Json("current-caller-access.json", access);
        var privileges = await reader.Object(Queries.Privileges(user));
        Check.Require(privileges["RolePrivileges"] is JsonArray);
        backup.Json("current-caller-privileges-team-depth-limited.json", privileges);
        status.Stage = FailureStage.Workspace;
        var before = await ReadWorkspace();
        string raw = Check.Text(before, "zk_state");
        backup.Write("zk_state.exact.utf8.json", new UTF8Encoding(false, true).GetBytes(raw));
        backup.Json("workspace.json", before);
        status.Stage = FailureStage.Receipts;
        var receiptsBefore = await ReadReceipts();
        backup.Json("receipts-all-fields.json", new JsonArray(receiptsBefore.Select(r => (JsonNode)r.DeepClone()).ToArray()));
        status.Stage = FailureStage.Metadata;
        var metadata = new Metadata(reader, backup);
        await metadata.Read();
        status.Stage = FailureStage.Package;
        var packageBefore = await reader.Object(Queries.Package);
        ValidatePackage(packageBefore);
        byte[] packageBytes = await reader.Get(Queries.PackageBytes);
        backup.Write("current-plugin-package.nupkg", packageBytes);
        // Native inspection records observed bytes; transition acceptance is separately literal-pinned.
        var packageAfter = await reader.Object(Queries.Package);
        ValidatePackage(packageAfter);
        Check.Require(Check.Fingerprint(packageBefore) == Check.Fingerprint(packageAfter));
        backup.Json("package-metadata.json", packageBefore);
        status.Stage = FailureStage.Consistency;
        var metadataAfter = new Metadata(reader, backup, "metadata-after-");
        await metadataAfter.Read();
        Check.Require(metadata.Fingerprint == metadataAfter.Fingerprint);
        Check.Require(Check.Fingerprint(access) == Check.Fingerprint(await reader.Object(Queries.Access(user))) && Check.Fingerprint(privileges) == Check.Fingerprint(await reader.Object(Queries.Privileges(user))));
        var receiptsAfter = await ReadReceipts();
        var after = await ReadWorkspace();
        Check.Require(Check.Fingerprint(before) == Check.Fingerprint(after) && ReceiptFingerprint(receiptsBefore) == ReceiptFingerprint(receiptsAfter));
        // Preserve raw decoded string before validation; never normalize the backup or drop unknown fields.

        status.Stage = FailureStage.StateValidation;
        ValidateState(raw, before["zk_revision"]!.GetValue<int>());
        metadata.ValidateRecordFields(before, receiptsBefore);
        status.Stage = FailureStage.OwnerIdentity;
        string owner = Check.Id(before, "_ownerid_value"), ownerType = Check.Text(before, "_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname");
        if (ownerType == "systemuser" && owner != user)
        {
            reader.Owner(owner);
            backup.Json("owner-user-identity.json", await reader.Object(Queries.User(owner)));
        }
        status.Stage = FailureStage.Finalization;
        if (finish) backup.Finish(new
        {
            stateSha256 = Check.Hash(raw),
            revision = before["zk_revision"]!.GetValue<int>(),
            rowVersion = Check.Text(before, "@odata.etag"),
            versionnumber = before["versionnumber"]!.ToJsonString(),
            owner,
            ownerType,
            caller = user,
            receipts = receiptsBefore.Length,
            receiptSetSha256 = ReceiptFingerprint(receiptsBefore),
            packageSha256 = Check.Hash(packageBytes),
            bracket = "workspace/receipts/metadata/package-metadata-bytes-metadata/receipts/workspace",
            permissions = "workspace_effective_access_plus_privileges_with_team_depth_limitation",
            perReceipt = receiptsBefore.Select(r => new { id = Check.Id(r, "zk_kitchenoperationid"), sha256 = Check.Fingerprint(r) }).ToArray()
        });
    }
    public async Task<JsonObject> ReadWorkspace()
    {
        var row = await reader.Object(Queries.Workspace);
        ValidateWorkspace(row);
        return row;
    }
    public async Task<JsonObject[]> ReadReceipts()
    {
        var rows = await reader.Rows(Queries.Receipts, "zk_kitchenoperationid");
        var operationIds = new HashSet<string>();
        foreach (var row in rows)
        {
            Check.Require(Check.Id(row, "_zk_workspace_value") == Target.Workspace && operationIds.Add(Check.Text(row, "zk_operationid")));
            Check.Require(Check.Text(row, "zk_requesthash").Length == 64 && Check.Text(row, "zk_requesthash").All(Uri.IsHexDigit));
            Check.Id(Check.Text(row, "zk_actor"));
            Check.Require(row["zk_appliedrevision"]?.GetValue<int>() >= 1 && DateTimeOffset.TryParse(Check.Text(row, "zk_recordedat"), out _));
            RequireVersion(row);
        }
        return rows;
    }
    public static void RequireVersion(JsonObject row)
    {
        Check.Require(row["versionnumber"]?.GetValue<long>() > 0);
        string tag = Check.Text(row, "@odata.etag");
        Check.Require(tag == "W/\"" + row["versionnumber"]!.GetValue<long>().ToString(System.Globalization.CultureInfo.InvariantCulture) + "\"");
    }
    public static void ValidateWorkspace(JsonObject row)
    {
        Check.Require(Check.Id(row, "zk_kitchenworkspaceid") == Target.Workspace && row["zk_revision"]?.GetValue<int>() >= 0);
        Check.Text(row, "zk_state");
        Check.Id(row, "_ownerid_value");
        Check.Require(Check.Text(row, "_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname") is "systemuser" or "team");
        RequireVersion(row);
    }
    public static void ValidateState(string raw, int revision)
    {
        Check.Require(Encoding.UTF8.GetByteCount(raw) <= 524288);
        var state = Zunftkueche.Protocol.Parse(raw);
        Zunftkueche.StatePolicy.Validate(state, state);
        Check.Require(state["revision"]?.Value<int>() == revision);
    }
    public static string ReceiptFingerprint(JsonObject[] rows) => Check.Fingerprint(new JsonArray(rows.OrderBy(r => Check.Id(r, "zk_kitchenoperationid"), StringComparer.Ordinal).Select(r => (JsonNode)r.DeepClone()).ToArray()));
    public static void ValidatePackage(JsonObject row)
    {
        Check.Match(row, new JsonObject { ["pluginpackageid"] = Target.Package, ["name"] = "zk_Zunftkueche.Dataverse", ["uniquename"] = "zk_Zunftkueche.Dataverse", ["version"] = "1.0.0", ["statecode"] = 0 });
        Check.Id(row, "package");
        RequireVersion(row);
    }
    public static void ValidateRights(JsonObject row)
    {
        var rights = Check.Text(row, "AccessRights").Split(',', StringSplitOptions.TrimEntries);
        Check.Require(rights.Length == rights.Distinct().Count() && rights.Contains("ReadAccess") && rights.All(v => v is "None" or "ReadAccess" or "WriteAccess" or "AppendAccess" or "AppendToAccess" or "CreateAccess" or "DeleteAccess" or "ShareAccess" or "AssignAccess"));
    }
}
