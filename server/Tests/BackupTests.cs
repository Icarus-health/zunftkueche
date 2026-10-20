using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
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
            Assert(service.MetadataReads==2 && service.DocumentReads==0);
            Assert(service.Writes == 0 && service.Pages.SequenceEqual(new[] { 1, 2, 1, 2 }));
            Assert((string?)snapshot["workspaceEvidence"]!["rawState"] == service.Raw);
            Assert((string?)snapshot["workspaceEvidence"]!["rawRow"]!["zk_extra"] == "preserved workspace attribute");
            Assert((string?)snapshot["operationReceipts"]![1]!["rawRow"]!["zk_extra"] == "preserved receipt attribute");
            Assert((string?)snapshot["operationReceipts"]![1]!["rowVersion"] == "receipt-2");
            Assert((string?)snapshot["sourceContract"]!["id"] == "kitchen-core-v1" && snapshot["documents"]!.Type == JTokenType.Null && snapshot["drafts"]!.Type == JTokenType.Null);
        });
        check("backup denies nonowner and foreign identity before complete reads", () => {
            foreach (var owner in new[] { false, true }) {
                var service = new BackupService(seed) { Owner = owner };
                var request = Request();
                if (owner) request["identity"]!["userId"] = Guid.NewGuid().ToString("D");
                Reject(() => Protocol.Load(request.ToString(), service.Store()));
                Assert(service.MetadataReads==0 && service.RawReads == 0 && service.Pages.Count == 0 && service.Writes == 0);
            }
        });
        check("production core scope remains unbound without metadata or document reads",()=>{
            var service=new BackupService(seed);Reject(()=>Protocol.Load(Request().ToString(),service.Store(unbound:true)));
            Assert(service.MetadataReads==0 && service.DocumentReads==0 && service.RawReads==0);
        });
        check("document contract retains required empty inventories with UI disabled",()=>{
            var service=new BackupService(seed){Documents=true,Scope=BackupScope.Documents,History=BackupHistory.Documents};
            var response=Protocol.Load(Request().ToString(),service.Store());var snapshot=response["snapshot"]!;
            Assert((bool?)response["features"]?["documents"]==false && (string?)snapshot["sourceContract"]?["id"]=="kitchen-documents-v1"
                && snapshot["documents"] is JArray && snapshot["drafts"] is JArray && service.DocumentReads==4 && service.MetadataReads==2);
        });
        check("document source failure with UI off remains a refusal, never a core snapshot",()=>{
            var service=new BackupService(seed){Documents=true,Scope=BackupScope.Documents,History=BackupHistory.Documents,Failure="document-read"};
            Reject(()=>Protocol.Load(Request().ToString(),service.Store()));Assert(service.DocumentReads==1 && service.Writes==0);
        });
        foreach(var failure in new[]{"installed","partial","schema-collision","metadata-empty","metadata-trimmed","metadata-incomplete","metadata-error","metadata-drift","prior-documents","unknown-history","retained-intake","signature-intake","current-intake","archived-intake","baseline-intake"}) {
            var defect=failure;
            check("core backup never downgrades "+defect,()=>{
                var service=new BackupService(seed){Failure=defect};
                if(defect=="prior-documents")service.History=BackupHistory.Documents;
                if(defect=="unknown-history")service.History=BackupHistory.Unknown;
                if(defect.EndsWith("intake")) {
                    var state=JObject.Parse(service.Raw);
                    if(defect=="retained-intake" || defect=="signature-intake")
                        state["operationRequests"]=new JObject{{"operation-1",Protocol.Canonical(new JObject{{"type",defect=="signature-intake"?"invoice.save":"receipt.draft.accept"},{"payload",defect=="signature-intake"?new JObject{{"retained",new JObject{{"intake",new JObject{{"draftId","synthetic"}}}}}}:new JObject()},{"targetEventId",state["event"]!["id"]!.DeepClone()}}).ToString(Newtonsoft.Json.Formatting.None)}};
                    else {
                        var draftId="ffffffff-1111-4111-8111-111111111111";
                        var invoice=new JObject{{"id",draftId},{"supplierId",state["suppliers"]![0]!["id"]!.DeepClone()},{"number","SYNTHETIC-INTAKE"},
                            {"date","2099-10-20"},{"grossCents",100},{"netCents",null},{"scope","Küche"},{"status","Erfasst"},{"lines",new JArray()},
                            {"intake",new JObject{{"draftId",draftId},{"operationId","ffffffff-2222-4222-8222-222222222222"}}}};
                        invoice["sourceBaseline"]=invoice.DeepClone();
                        if(defect=="baseline-intake")invoice.Remove("intake");
                        if(defect=="archived-intake") {
                            var archive=new JObject{{"schemaVersion",2},{"event",new JObject{{"id","synthetic-archive"},{"name","Synthetic archive"},{"year",2099},{"status","Offen"},{"dates",new JObject()}}},{"sourceNotice","Synthetic"}};
                            foreach(var name in new[]{"suppliers","articles","planLines","menu","invoices","sales","movements","orders","dishPlan","lessons"})archive[name]=new JArray();
                            archive["suppliers"]=state["suppliers"]!.DeepClone();((JArray)archive["invoices"]!).Add(invoice);state["archivedEvents"]=new JArray(archive);
                        } else ((JArray)state["invoices"]!).Add(invoice);
                    }
                    StatePolicy.Validate(state,state); // Refusal below must be the core scope boundary, not an invalid fixture.
                    service.Raw=state.ToString();
                }
                Reject(()=>Protocol.Load(Request().ToString(),service.Store()));Assert(service.DocumentReads==0&&service.Writes==0);
            });
        }
        check("reviewed baseline is provenance: later ordinary core revision remains backupable",()=>{
            var service=new BackupService(seed);var state=JObject.Parse(service.Raw);state["revision"]=3;service.Revision=3;service.Raw=state.ToString();
            var snapshot=Protocol.Load(Request().ToString(),service.Store())["snapshot"]!;
            Assert((int?)snapshot["state"]?["revision"]==3 && service.MetadataReads==2);
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
        public int Writes, RawReads, MetadataReads, DocumentReads, Revision=2;
        public bool Documents;
        public BackupScope Scope=BackupScope.Core;
        public BackupHistory History=BackupHistory.CoreOnly;
        public List<int> Pages = new();
        int sequences;
        public BackupService(JObject state) {
            var copy = (JObject)state.DeepClone();
            copy["revision"] = 2;
            copy["operationIds"] = new JArray("operation-1", "operation-2");
            Raw = copy.ToString(Newtonsoft.Json.Formatting.Indented);
        }
        public DataverseStore Store(bool unbound=false) {
            var context=ContextProxy.Create(new() {{"OrganizationId",Organization},{"InitiatingUserId",Actor},{"UserId",Actor}});
            return unbound?new DataverseStore(this,context):new DataverseStore(this,context,
                new BackupScopeBinding(Scope,History,Organization,Id,Guid.Parse("dddddddd-1111-4111-8111-111111111111"),new string('a',64),new string('b',64)));
        }
        public Entity Retrieve(string table, Guid id, ColumnSet columns) {
            Assert(table == "zk_kitchenworkspace" && id == Id);
            if (columns.AllColumns) RawReads++;
            var raw = Raw;
            if (Failure == "schema") {
                var invalid = JObject.Parse(raw); invalid["articles"]![0]!["unitPriceCents"] = "invalid-money"; raw = invalid.ToString();
            }
            return new Entity(table, id) {
                RowVersion = Failure == "workspace-drift" && RawReads > 1 ? "changed" : "original",
                ["zk_state"] = raw, ["zk_revision"] = Revision,
                ["ownerid"] = new EntityReference("systemuser", Owner ? Actor : Guid.NewGuid()),
                ["zk_extra"] = "preserved workspace attribute"
            };
        }
        public EntityCollection RetrieveMultiple(QueryBase input) {
            var query = (QueryExpression)input;
            if(query.EntityName=="zk_kitchendocument"||query.EntityName=="zk_kitchendraft"){DocumentReads++;if(Failure=="document-read")throw new ArgumentException("synthetic document source unavailable");return new EntityCollection();}
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
            if(request is RetrieveAllEntitiesRequest metadata) {
                MetadataReads++;Assert(metadata.EntityFilters==EntityFilters.Entity && !metadata.RetrieveAsIfPublished);
                if(Failure=="metadata-error")throw new ArgumentException("synthetic unreadable metadata");
                var names=new List<(string Logical,string Schema)> {("zk_kitchenworkspace","zk_KitchenWorkspace"),("zk_kitchenoperation","zk_KitchenOperation")};
                if(Documents||Failure=="installed"||Failure=="partial"||Failure=="metadata-drift"&&MetadataReads>1)names.Add(("zk_kitchendocument","zk_KitchenDocument"));
                if(Documents||Failure=="installed")names.Add(("zk_kitchendraft","zk_KitchenDraft"));
                if(Failure=="schema-collision")names.Add(("foreign","zk_KitchenDraft"));
                if(Failure=="metadata-empty")names.Clear();
                if(Failure=="metadata-trimmed")names.RemoveAt(0);
                var rows=names.Select((n,i)=>new EntityMetadata {LogicalName=n.Logical,SchemaName=n.Schema,MetadataId=Guid.Parse($"eeeeeeee-1111-4111-8111-{i+1:000000000000}")}).ToArray();
                if(Failure=="metadata-incomplete")rows[0].SchemaName=null;
                return new RetrieveAllEntitiesResponse {Results=new ParameterCollection{{"EntityMetadata",rows}}};
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
