using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Microsoft.Crm.Sdk.Messages;
using Newtonsoft.Json.Linq;
using Zunftkueche;

static class BackupTests
{
    static readonly Guid Actor = CorrectionTests.Actor;
    static readonly Guid Organization = Guid.Parse("aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb");
    static readonly Guid Id = FakeStore.WorkspaceId;
    static void Assert(bool value) { if (!value) throw new Exception("backup assertion failed"); }
    static void Reject(Action action) { try { action(); } catch (ArgumentException) { return; } throw new Exception("backup should reject"); }
    static JObject Request() => new() {
        { "protocolVersion", 2 }, { "workspaceId", Id.ToString("D") }, { "view", "backup" },
        { "identity", new JObject { { "organizationId", Organization.ToString("D") }, { "userId", Actor.ToString("D") }, { "workspaceId", Id.ToString("D") } } }
    };
    public static void Run(Action<string, Action> check, JObject seed)
    {
        check("backup real store reads exact raw workspace and every receipt page without any write", () => {
            var service = new BackupService(seed);
            var response = Protocol.Load(Request().ToString(), service.Store());
            var snapshot = response["snapshot"]!;
            Assert(service.Writes == 0 && service.Pages.SequenceEqual(new[] { 1, 2, 1, 2 }));
            Assert((string?)snapshot["workspaceEvidence"]!["rawState"] == service.Raw);
            Assert((string?)snapshot["workspaceEvidence"]!["rawRow"]!["zk_extra"] == "preserved workspace attribute");
            Assert((string?)snapshot["operationReceipts"]![1]!["rawRow"]!["zk_extra"] == "preserved receipt attribute");
            Assert((string?)snapshot["operationReceipts"]![1]!["rowVersion"] == "receipt-2");
            Assert((string?)snapshot["sourceContract"]!["id"] == "kitchen-documents-v1" && snapshot["documents"] is JArray docs && docs.Count == 0);
        });
        check("backup denies nonowner and foreign identity before complete reads", () => {
            foreach (var owner in new[] { false, true }) {
                var service = new BackupService(seed) { Owner = owner };
                var request = Request();
                if (owner) request["identity"]!["userId"] = Guid.NewGuid().ToString("D");
                Reject(() => Protocol.Load(request.ToString(), service.Store()));
                Assert(service.RawReads == 0 && service.Pages.Count == 0 && service.Writes == 0);
            }
        });
        check("backup fails closed on workspace drift receipt drift pagination faults and unknown nested schema", () => {
            foreach (var failure in new[] { "workspace-drift", "receipt-drift", "cookie", "foreign", "duplicate", "oversize", "schema", "unknown-attribute", "too-many-pages" }) {
                var service = new BackupService(seed) { Failure = failure };
                Reject(() => Protocol.Load(Request().ToString(), service.Store()));
                Assert(service.Writes == 0);
            }
        });
    }
    sealed class BackupService : IOrganizationService
    {
        public string Raw;
        public bool Owner = true;
        public string Failure = "";
        public int Writes, RawReads;
        public List<int> Pages = new();
        int sequences;
        public BackupService(JObject state) {
            var copy = (JObject)state.DeepClone();
            copy["revision"] = 2;
            copy["operationIds"] = new JArray("operation-1", "operation-2");
            Raw = copy.ToString(Newtonsoft.Json.Formatting.Indented);
        }
        public DataverseStore Store() => new(this, ContextProxy.Create(new() {
            { "OrganizationId", Organization }, { "InitiatingUserId", Actor }, { "UserId", Actor }
        }));
        public Entity Retrieve(string table, Guid id, ColumnSet columns) {
            Assert(table == "zk_kitchenworkspace" && id == Id);
            if (columns.AllColumns) RawReads++;
            var raw = Raw;
            if (Failure == "schema") {
                var invalid = JObject.Parse(raw); invalid["articles"]![0]!["unitPriceCents"] = "invalid-money"; raw = invalid.ToString();
            }
            return new Entity(table, id) {
                RowVersion = Failure == "workspace-drift" && RawReads > 1 ? "changed" : "original",
                ["zk_state"] = raw, ["zk_revision"] = 2,
                ["ownerid"] = new EntityReference("systemuser", Owner ? Actor : Guid.NewGuid()),
                ["zk_extra"] = "preserved workspace attribute"
            };
        }
        public EntityCollection RetrieveMultiple(QueryBase input) {
            var query = (QueryExpression)input;
            if(query.EntityName=="zk_kitchendocument"||query.EntityName=="zk_kitchendraft")return new EntityCollection();
            Assert(query.EntityName == "zk_kitchenoperation" && query.ColumnSet.AllColumns
                && query.Criteria.Conditions.Single().AttributeName == "zk_workspace"
                && (Guid)query.Criteria.Conditions.Single().Values.Single() == Id
                && query.Orders.Single().AttributeName == "zk_kitchenoperationid"
                && query.PageInfo.Count == 500);
            int page = query.PageInfo.PageNumber;
            if (page == 1) sequences++;
            else Assert(query.PageInfo.PagingCookie == "page-" + (page - 1));
            Pages.Add(page);
            var row = new Entity("zk_kitchenoperation", Guid.Parse($"00000000-0000-4000-8000-{(Failure == "duplicate" ? 1 : page):000000000000}")) {
                RowVersion = "receipt-" + page,
                ["zk_workspace"] = new EntityReference("zk_kitchenworkspace", Failure == "foreign" ? Guid.NewGuid() : Id),
                ["zk_operationid"] = "operation-" + page, ["zk_requesthash"] = new string('a', 64),
                ["zk_actor"] = Actor.ToString("D"), ["zk_appliedrevision"] = page,
                ["zk_recordedat"] = new DateTime(2026, 10, 19, 12, 0, 0, DateTimeKind.Utc),
                ["zk_extra"] = Failure == "oversize" ? new string('x', BackupProtocol.MaxSnapshotBytes) : "preserved receipt attribute"
            };
            if (Failure == "receipt-drift" && sequences > 1) row["zk_extra"] = "changed";
            if (Failure == "unknown-attribute") row["zk_extra"] = new object();
            return new EntityCollection(new List<Entity> { row }) {
                MoreRecords = page == 1 || Failure == "too-many-pages",
                PagingCookie = Failure == "cookie" ? null : "page-" + page
            };
        }
        public OrganizationResponse Execute(OrganizationRequest request) {
            if (request is RetrievePrincipalAccessRequest access) {
                Assert(access.Principal.Id == Actor && access.Target.Id == Id);
                return new RetrievePrincipalAccessResponse { Results = new ParameterCollection { { "AccessRights", AccessRights.ReadAccess | AccessRights.WriteAccess } } };
            }
            Writes++; throw new Exception("unexpected write");
        }
        public Guid Create(Entity entity) { Writes++; throw new Exception("unexpected write"); }
        public void Update(Entity entity) { Writes++; throw new Exception("unexpected write"); }
        public void Delete(string entity, Guid id) { Writes++; throw new Exception("unexpected write"); }
        public void Associate(string entity, Guid id, Relationship relation, EntityReferenceCollection related) { Writes++; throw new Exception("unexpected write"); }
        public void Disassociate(string entity, Guid id, Relationship relation, EntityReferenceCollection related) { Writes++; throw new Exception("unexpected write"); }
    }
}
