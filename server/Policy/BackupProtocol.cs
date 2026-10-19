using System;
using System.Linq;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Zunftkueche
{
    public sealed class BackupWorkspace
    {
        public Workspace Row = new Workspace();
        public string RawState = "";
        public JObject RawRow = new JObject();
        public Guid OwnerId;
        public string OwnerType = "";
    }

    /** Optional read-only extension. Ordinary stores and commit paths do not gain writes. */
    public interface IKitchenBackupStore
    {
        BackupWorkspace ReadBackupWorkspace(Guid id);
        JArray ReadAllOperationRows(Guid id);
    }

    public static class BackupProtocol
    {
        public const int MaxSnapshotBytes = 8388608;
        public const string PolicyVersion = "kitchen-schema2-net-evidence-v1";

        static void RequireOwner(Workspace row)
        {
            StatePolicy.Require(row.CanWrite && row.CanConfigure && row.CanClose, "Owner backup permission required.");
        }

        static string Fingerprint(BackupWorkspace snapshot)
        {
            var row = snapshot.Row;
            return Protocol.Hash(Protocol.Canonical(new JObject {
                { "workspaceId", row.Id.ToString("D") }, { "revision", row.Revision },
                { "rowVersion", row.RowVersion }, { "ownerId", snapshot.OwnerId.ToString("D") },
                { "ownerType", snapshot.OwnerType }, { "rawState", snapshot.RawState },
                { "rawRow", snapshot.RawRow.DeepClone() }
            }).ToString(Formatting.None));
        }

        static void ValidateWorkspace(BackupWorkspace snapshot)
        {
            RequireOwner(snapshot.Row);
            StatePolicy.Require(snapshot.OwnerType == "systemuser" && snapshot.OwnerId == snapshot.Row.UserId,
                "Backup must remain owned by the authenticated caller.");
            StatePolicy.Require(!string.IsNullOrWhiteSpace(snapshot.Row.RowVersion), "Workspace RowVersion missing.");
            StatePolicy.Validate(snapshot.Row.State, snapshot.Row.State);
            StatePolicy.Require(snapshot.Row.Revision == (int)snapshot.Row.State["revision"]!, "Stored revision mismatch.");
            StatePolicy.Require(JToken.DeepEquals(Protocol.Parse(snapshot.RawState), snapshot.Row.State), "Raw workspace state mismatch.");
        }

        public static JObject Load(JObject request, IKitchenStore store)
        {
            var id = Protocol.WorkspaceId(request);
            var authorization = store.Read(id);
            RequireOwner(authorization); // No complete raw-row or receipt read before this gate.
            var identity = StatePolicy.Obj(request["identity"]);
            StatePolicy.Require(identity.Count == 3
                && (string?)identity["organizationId"] == authorization.OrganizationId.ToString("D")
                && (string?)identity["userId"] == authorization.UserId.ToString("D")
                && (string?)identity["workspaceId"] == id.ToString("D"), "Backup identity mismatch.");
            StatePolicy.Require(store is IKitchenBackupStore, "Complete backup source is unavailable.");
            var source = (IKitchenBackupStore)store;

            var first = source.ReadBackupWorkspace(id);
            ValidateWorkspace(first);
            var operations = source.ReadAllOperationRows(id);
            var middle = source.ReadBackupWorkspace(id);
            ValidateWorkspace(middle);
            var repeatedOperations = source.ReadAllOperationRows(id);
            var last = source.ReadBackupWorkspace(id);
            ValidateWorkspace(last);
            StatePolicy.Require(Fingerprint(first) == Fingerprint(middle) && Fingerprint(first) == Fingerprint(last)
                && JToken.DeepEquals(Protocol.Canonical(operations), Protocol.Canonical(repeatedOperations)),
                "Workspace or operation rows changed during backup.");
            StatePolicy.Require(first.Row.OrganizationId == authorization.OrganizationId
                && first.Row.UserId == authorization.UserId, "Backup identity changed.");

            var rawHash = Protocol.Hash(first.RawState);
            var snapshot = new JObject {
                { "environment", first.Row.OrganizationId.ToString("D") }, { "workspaceId", id.ToString("D") },
                { "state", first.Row.State.DeepClone() }, { "settings", new JObject() },
                { "workspaceEvidence", new JObject {
                    { "rawState", first.RawState }, { "rawStateSha256", rawHash }, { "rawRow", first.RawRow.DeepClone() },
                    { "rowVersion", first.Row.RowVersion }, { "ownerId", first.OwnerId.ToString("D") },
                    { "ownerType", first.OwnerType }, { "protocolVersion", 2 }
                } },
                { "schemaValidation", new JObject { { "policy", PolicyVersion }, { "rawStateSha256", rawHash } } },
                { "operationReceipts", operations },
                { "sourceContract", new JObject { { "id", "kitchen-core-v1" }, { "documents", "not_in_contract" }, { "drafts", "not_in_contract" } } },
                // These sources are not read by this version. Do not fabricate empty tables.
                { "documents", JValue.CreateNull() }, { "drafts", JValue.CreateNull() },
                { "documentManifest", new JArray() }
            };
            StatePolicy.Require(Encoding.UTF8.GetByteCount(snapshot.ToString(Formatting.None)) <= MaxSnapshotBytes,
                "Backup exceeds bounded response size; no rows were truncated.");
            return new JObject {
                { "protocolVersion", 2 }, { "workspaceId", id.ToString("D") }, { "view", "backup" },
                { "canEdit", true }, { "canConfigure", true }, { "canClose", true },
                { "identity", identity.DeepClone() }, { "snapshot", snapshot }
            };
        }
    }
}
