using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
namespace Zunftkueche
{
    public sealed class Workspace
    {
        public Guid Id; public JObject State = new JObject(); public int Revision; public string RowVersion = ""; public bool CanWrite; public bool CanConfigure; public bool CanClose; public Guid OrganizationId; public Guid UserId;
    }
    public sealed class ReceiptRecord
    {
        public string Hash = ""; public Guid Actor; public int AppliedRevision;
    }
    public interface IKitchenStore
    {
        Workspace Read(Guid id); ReceiptRecord? FindReceipt(Guid workspaceId, string operationId); void Commit(Workspace prior, JObject next, string operationId, string hash, Guid actor, DateTime timestamp);
    }
    public static class Protocol
    {
        public static readonly HashSet<string> Operations = new HashSet<string> { "movement.correct", "sales.correctPrice", "invoice.correct", "order.mark", "supplier.save", "article.save", "menu.save", "dish.quantity", "dish.fillMissing", "event.create", "event.settings", "event.dates", "purchase.apply", "invoice.save", "invoice.update", "plan.quantity", "plan.schedule", "plan.add", "menu.price", "article.price", "order.prepare", "stock.opening", "delivery.record", "stock.count", "stock.waste", "stock.return", "stock.consume", "sales.quantity", "sales.price", "recipe.save", "invoice.link" };
        public static JObject Parse(string raw)
        {
            StatePolicy.Require(raw != null && Encoding.UTF8.GetByteCount(raw) <= 655360, "Request too large.");
            using (var reader = new JsonTextReader(new StringReader(raw!)) { MaxDepth = 32, DateParseHandling = DateParseHandling.None, FloatParseHandling = FloatParseHandling.Decimal })
            {
                var result = JObject.Load(reader, new JsonLoadSettings { DuplicatePropertyNameHandling = DuplicatePropertyNameHandling.Error });
                StatePolicy.Require(!reader.Read(), "Trailing JSON.");
                return result;
            }
        }
        public static string Hash(string raw)
        {
            using (var sha = SHA256.Create())
                return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(raw))).Replace("-", "").ToLowerInvariant();
        }
        public static JToken Canonical(JToken t)
        {
            if (t is JObject o)
                return new JObject(o.Properties().OrderBy(p => p.Name, StringComparer.Ordinal).Select(p => new JProperty(p.Name, Canonical(p.Value))));
            if (t is JArray a)
                return new JArray(a.Select(Canonical));
            return t.DeepClone();
        }
        public static Guid WorkspaceId(JObject request)
        {
            StatePolicy.Require(StatePolicy.Number(request["protocolVersion"], 2) == 2, "Bitte neu laden: Küchenprotokoll 2 erforderlich. Alte offene Änderungen müssen zuerst geklärt werden.");
            Guid id;
            StatePolicy.Require(Guid.TryParseExact(StatePolicy.Str(request["workspaceId"], 36), "D", out id) && id != Guid.Empty, "Invalid workspace ID.");
            return id;
        }
        public static JObject Load(string raw, IKitchenStore store)
        {
            var q = Parse(raw);
            StatePolicy.Require(q.Properties().All(p => new[] { "protocolVersion", "workspaceId" }.Contains(p.Name)), "Unknown load field.");
            var row = store.Read(WorkspaceId(q));
            StatePolicy.Validate(row.State, row.State);
            StatePolicy.Require((int)row.State["revision"]! == row.Revision, "Stored revision mismatch.");
            return new JObject { { "protocolVersion", 2 }, { "workspaceId", row.Id.ToString("D") }, { "canWrite", row.CanWrite }, { "canEdit", row.CanWrite }, { "canConfigure", row.CanConfigure }, { "canClose", row.CanClose }, { "identity", Identity(row) }, { "state", row.State.DeepClone() } };
        }
        static JObject Identity(Workspace row) => new JObject {{"organizationId",row.OrganizationId.ToString("D")},{"userId",row.UserId.ToString("D")},{"workspaceId",row.Id.ToString("D")}};
        static JObject Response(Workspace row, string targetEventId, string operationId, string status, int? appliedRevision) => new JObject { { "protocolVersion", 2 }, { "workspaceId", row.Id.ToString("D") }, { "targetEventId", targetEventId }, { "canEdit",row.CanWrite }, { "canConfigure",row.CanConfigure }, { "canClose",row.CanClose }, { "identity",Identity(row) }, { "operationId", operationId }, { "status", status }, { "appliedRevision", appliedRevision.HasValue ? new JValue(appliedRevision.Value) : JValue.CreateNull() }, { "state", row.State.DeepClone() } };
        static JObject PrepareCandidate(JToken? proposed, Workspace row, string operationId, string signature, string targetEventId, string operationType, Guid actor, DateTime timestamp)
        {
            var candidate = (JObject)StatePolicy.Obj(proposed).DeepClone();
            StatePolicy.Validate(candidate, row.State);
            StatePolicy.ValidateScope(candidate, row, targetEventId, operationType);
            var ids = (JArray)row.State["operationIds"]!.DeepClone();
            ids.Add(operationId);
            var signatures = (JObject)(row.State["operationRequests"]?.DeepClone() ?? new JObject());
            signatures[operationId] = signature;
            candidate["revision"] = checked(row.Revision + 1);
            candidate["operationIds"] = ids;
            candidate["operationRequests"] = signatures;
            StatePolicy.StampEconomicHistory(candidate,row.State,operationId,row.Revision+1,actor,timestamp);
            StatePolicy.Validate(candidate, row.State);
            StatePolicy.ValidateScope(candidate, row, targetEventId, operationType);
            return candidate;
        }
        public static JObject Commit(string raw, Guid actor, bool inTransaction, IKitchenStore store)
        {
            StatePolicy.Require(actor != Guid.Empty, "Authenticated caller required.");
            var q = Parse(raw);
            StatePolicy.Require(q.Properties().All(p => new[] { "protocolVersion", "workspaceId", "operationId", "expectedRevision", "operation", "candidateState", "targetEventId", "identity" }.Contains(p.Name)), "Unknown commit field.");
            var id = WorkspaceId(q);
            var operationId = StatePolicy.Str(q["operationId"], 100);
            var expected = (int)StatePolicy.Number(q["expectedRevision"], int.MaxValue - 1);
            var operation = StatePolicy.Obj(q["operation"]);
            StatePolicy.Require(operation.Count == 2 && Operations.Contains(StatePolicy.Str(operation["type"], 100)) && operation["payload"] is JObject, "Unsupported operation metadata.");
            var targetEventId = StatePolicy.Str(q["targetEventId"],500);
            var signedOperation=(JObject)operation.DeepClone(); signedOperation["targetEventId"]=targetEventId;
            var signature = Canonical(signedOperation).ToString(Formatting.None);
            StatePolicy.Require(signature.Length <= 50000, "Operation too large.");
            var hash = Hash(raw);
            var row = store.Read(id);
            StatePolicy.Require(JToken.DeepEquals(Identity(row),q["identity"]), "Caller/environment changed; reload required.");
            StatePolicy.Require(row.Id == id && row.CanWrite, "Workspace write permission required.");
            StatePolicy.Require((int?)row.State["revision"] == row.Revision, "Stored revision mismatch.");
            StatePolicy.Validate(row.State, row.State);
            var receipt = store.FindReceipt(id, operationId);
            if (receipt != null)
            {
                StatePolicy.Require(receipt.Actor == actor && receipt.Hash == hash, "Operation receipt caller/content mismatch.");
                StatePolicy.Require(receipt.AppliedRevision > 0 && receipt.AppliedRevision <= row.Revision && StatePolicy.Arr(row.State["operationIds"]).Any(v => (string?)v == operationId), "Invalid receipt metadata.");
                return Response(row, targetEventId, operationId, "saved", receipt.AppliedRevision);
            }
            StatePolicy.Require(StatePolicy.Events(row.State).ContainsKey(targetEventId), "Unknown target event; reload required.");
            if (expected != row.Revision)
                return Response(row, targetEventId, operationId, "conflict", null);
            StatePolicy.Require(!StatePolicy.Arr(row.State["operationIds"]).Any(v => (string?)v == operationId), "Operation ID already exists without matching receipt.");
            JObject candidate;
            var timestamp=DateTime.UtcNow;
            try
            {
                // No storage calls in this validation-only boundary. Receipts and caller checks above
                // MUST remain outside it: their failure cannot prove an earlier attempt did not commit.
                candidate = PrepareCandidate(q["candidateState"], row, operationId, signature, targetEventId, (string)operation["type"]!,actor,timestamp);
            }
            catch (ArgumentException)
            {
                var rejected = Response(row, targetEventId, operationId, "rejected", null);
                rejected["rejectionCode"] = "candidate_validation";
                rejected["requestHash"] = hash;
                return rejected;
            }
            StatePolicy.Require(inTransaction, "Synchronous Dataverse transaction required.");
            StatePolicy.Require(!string.IsNullOrWhiteSpace(row.RowVersion), "RowVersion required.");
            store.Commit(row, candidate, operationId, hash, actor, timestamp);
            var saved = new Workspace { Id = id, State = candidate, Revision = row.Revision + 1, CanWrite = row.CanWrite, CanConfigure = row.CanConfigure, CanClose = row.CanClose, OrganizationId=row.OrganizationId, UserId=row.UserId };
            return Response(saved, targetEventId, operationId, "saved", (int)candidate["revision"]!);
        }
    }
}
