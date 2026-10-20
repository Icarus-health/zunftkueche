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

    public enum BackupScope { Core, Documents }
    public enum BackupStorePresence { Unknown, NotInstalled, Installed }
    public enum BackupHistory { Unknown, CoreOnly, Documents }

    // A deployment review supplies this immutable provenance. Historical hashes describe
    // that review, not a ban on later ordinary core saves. No request can supply a binding.
    public sealed class BackupScopeBinding
    {
        public readonly BackupScope Scope;
        public readonly BackupHistory History;
        public readonly Guid OrganizationId, WorkspaceId, DeploymentId;
        public readonly string RetainedStateSha256, ReviewEvidenceSha256;
        public BackupScopeBinding(BackupScope scope, BackupHistory history, Guid organizationId, Guid workspaceId,
            Guid deploymentId, string retainedStateSha256, string reviewEvidenceSha256)
        {Scope=scope;History=history;OrganizationId=organizationId;WorkspaceId=workspaceId;DeploymentId=deploymentId;
         RetainedStateSha256=retainedStateSha256;ReviewEvidenceSha256=reviewEvidenceSha256;}
    }
    // Source-reviewed production seam shared by the native backup and release adapters.
    // Remains unbound until actual absence/history evidence and independent source review.
    public static class ReviewedBackupScope
    {
        public static readonly BackupScopeBinding? Binding = null;
    }
    public sealed class BackupScopeEvidence
    {
        public readonly BackupScopeBinding Binding;
        public readonly BackupStorePresence Documents, Drafts;
        public readonly string MetadataSha256;
        public BackupScopeEvidence(BackupScopeBinding binding, BackupStorePresence documents, BackupStorePresence drafts, string metadataSha256)
        {Binding=binding;Documents=documents;Drafts=drafts;MetadataSha256=metadataSha256;}
    }

    /** Optional read-only extension. Ordinary stores and commit paths do not gain writes. */
    public interface IKitchenBackupStore
    {
        BackupScopeEvidence ReadBackupScope(Guid id);
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

        static bool Hash(string value) => value!=null && value.Length==64 && value.All(c=>c>='0'&&c<='9'||c>='a'&&c<='f');
        static string ValidateScope(BackupScopeEvidence evidence, Workspace authorization)
        {
            StatePolicy.Require(evidence!=null && evidence.Binding!=null,"Reviewed backup scope is unavailable.");
            var binding=evidence!.Binding!;
            StatePolicy.Require(binding.OrganizationId==authorization.OrganizationId && binding.WorkspaceId==authorization.Id
                && binding.DeploymentId!=Guid.Empty && Hash(binding.RetainedStateSha256) && Hash(binding.ReviewEvidenceSha256)
                && Hash(evidence.MetadataSha256),"Backup scope identity/provenance is incomplete.");
            if(binding.Scope==BackupScope.Core)
                StatePolicy.Require(binding.History==BackupHistory.CoreOnly && evidence.Documents==BackupStorePresence.NotInstalled
                    && evidence.Drafts==BackupStorePresence.NotInstalled,"Core backup requires reviewed history and fresh authoritative absence of both stores.");
            else
                StatePolicy.Require(binding.Scope==BackupScope.Documents && binding.History==BackupHistory.Documents
                    && evidence.Documents==BackupStorePresence.Installed && evidence.Drafts==BackupStorePresence.Installed,
                    "Document backup requires both installed sources; no core fallback.");
            return Protocol.Hash(new JObject{{"scope",binding.Scope.ToString()},{"history",binding.History.ToString()},
                {"organization",binding.OrganizationId.ToString("D")},{"workspace",binding.WorkspaceId.ToString("D")},
                {"deployment",binding.DeploymentId.ToString("D")},{"retainedState",binding.RetainedStateSha256},
                {"reviewEvidence",binding.ReviewEvidenceSha256},{"metadata",evidence.MetadataSha256}}.ToString(Formatting.None));
        }
        internal static void RequireCoreHistory(JObject state)
        {
            // Walk all retained baselines, archives and histories. Core import source hashes,
            // local paths and legacy document URLs remain intact and still require originals.
            foreach(var property in state.Descendants().OfType<JProperty>())
                StatePolicy.Require(property.Name!="intake" || property.Value.Type==JTokenType.Null,
                    "Retained document intake cannot be downgraded to core.");
            foreach(var signature in (state["operationRequests"] as JObject ?? new JObject()).Properties()) {
                var operation=Protocol.Parse((string)signature.Value!);
                StatePolicy.Require((string?)operation["type"]!="receipt.draft.accept"
                    && !operation.Descendants().OfType<JProperty>().Any(p=>p.Name=="intake" && p.Value.Type!=JTokenType.Null),
                    "Retained intake operation requires document backup.");
            }
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

            var scope=source.ReadBackupScope(id);
            var scopeFingerprint=ValidateScope(scope,authorization);
            var core=scope.Binding.Scope==BackupScope.Core;
            StatePolicy.Require(core || store is IKitchenDocumentStore,"Document backup source is unavailable.");
            var first = source.ReadBackupWorkspace(id);
            ValidateWorkspace(first);
            if(core)RequireCoreHistory(first.Row.State);
            var operations = source.ReadAllOperationRows(id);
            var documentSource=core ? null : (IKitchenDocumentStore)store;
            var documents=documentSource?.ReadDocumentRows(id,false);
            var drafts=documentSource?.ReadDocumentRows(id,true);
            var middle = source.ReadBackupWorkspace(id);
            ValidateWorkspace(middle);
            var repeatedOperations = source.ReadAllOperationRows(id);
            var repeatedDocuments=documentSource?.ReadDocumentRows(id,false);
            var repeatedDrafts=documentSource?.ReadDocumentRows(id,true);
            StatePolicy.Require(JToken.DeepEquals(documents,repeatedDocuments)&&JToken.DeepEquals(drafts,repeatedDrafts),"Document/draft rows changed during backup.");
            var last = source.ReadBackupWorkspace(id);
            ValidateWorkspace(last);
            StatePolicy.Require(Fingerprint(first) == Fingerprint(middle) && Fingerprint(first) == Fingerprint(last)
                && JToken.DeepEquals(Protocol.Canonical(operations), Protocol.Canonical(repeatedOperations)),
                "Workspace or operation rows changed during backup.");
            StatePolicy.Require(scopeFingerprint==ValidateScope(source.ReadBackupScope(id),authorization),"Backup scope/metadata changed during snapshot.");
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
            if(documentSource!=null) {
                snapshot["sourceContract"]=new JObject{{"id",DocumentProtocol.Contract},{"documents","required"},{"drafts","required"},{"manifestVersion",1}};
                snapshot["documents"]=documents; snapshot["drafts"]=drafts;
            }
            StatePolicy.Require(Encoding.UTF8.GetByteCount(snapshot.ToString(Formatting.None)) <= MaxSnapshotBytes,
                "Backup exceeds bounded response size; no rows were truncated.");
            return new JObject {
                { "protocolVersion", 2 }, { "workspaceId", id.ToString("D") }, { "view", "backup" },
                { "canEdit", true }, { "canConfigure", true }, { "canClose", true },
                { "features", Protocol.CoreFeatures.Json() }, { "identity", identity.DeepClone() }, { "snapshot", snapshot }
            };
        }
    }
}
