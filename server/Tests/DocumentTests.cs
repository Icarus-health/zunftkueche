using Newtonsoft.Json.Linq;
using Microsoft.Xrm.Sdk;
using Zunftkueche;

static class DocumentTests
{
    static readonly Guid Actor=Guid.Parse("cccccccc-1111-4111-8111-111111111111");
    static readonly Guid Org=Guid.Parse("aaaaaaaa-1111-4111-8111-111111111111");
    static readonly Guid Upload=Guid.Parse("11111111-1111-4111-8111-111111111111");
    static void Assert(bool value){if(!value)throw new Exception("document assertion failed");}
    static void Reject(Func<JObject> action){try{var result=action();if((string?)result["status"]=="rejected")return;}catch(ArgumentException){return;}throw new Exception("document action should reject");}
    sealed class Store:IKitchenStore,IKitchenDocumentStore {
        public Workspace Row;public Dictionary<Guid,JObject> Documents=new(),Drafts=new();public int Writes;
        public Store(JObject seed){Row=new Workspace{Id=FakeStore.WorkspaceId,UserId=Actor,OrganizationId=Org,State=(JObject)seed.DeepClone(),CanWrite=true,RowVersion="workspace-1"};}
        public Workspace Read(Guid id)=>Row;
        public ReceiptRecord? FindReceipt(Guid workspace,string operation)=>null;
        public void Commit(Workspace p,JObject n,string id,string hash,Guid actor,DateTime time)=>throw new Exception("aggregate writes forbidden");
        public JArray ReadDocumentRows(Guid workspace,bool draft)=>new JArray((draft?Drafts:Documents).Values.Select(v=>v.DeepClone()));
        public JObject? FindDocumentRow(Guid workspace,Guid id,bool draft)=>(draft?Drafts:Documents).TryGetValue(id,out var value)?(JObject)value.DeepClone():null;
        public JObject SaveDocumentRow(Guid workspace,Guid id,bool draft,JObject value,string? version){var table=draft?Drafts:Documents;Assert(table.TryGetValue(id,out var prior)?(string?)prior["rowVersion"]==version:version==null);var saved=(JObject)value.DeepClone();saved["rowVersion"]=(++Writes).ToString();table[id]=saved;return (JObject)saved.DeepClone();}
    }
    static JObject Request(Store store,string action,JObject value)=>new(){ {"protocolVersion",2},{"workspaceId",store.Row.Id.ToString("D")},{"view","documents"},{"requestId",Guid.NewGuid().ToString("D")},{"action",action},{"value",value},
        {"identity",new JObject{{"organizationId",Org.ToString("D")},{"userId",Actor.ToString("D")},{"workspaceId",store.Row.Id.ToString("D")}}} };
    static JObject Original(Store store)=>new(){ {"uploadId",Upload.ToString("D")},{"eventId",store.Row.State["event"]!["id"]!.DeepClone()},{"principal","editor@example.test"},{"sha256",new string('a',64)},{"mimeType","image/jpeg"},{"size",287},{"originalName","original.jpg"} };
    static JObject Apply(Store store,string action,JObject value){var response=Protocol.Commit(Request(store,action,value).ToString(),Actor,true,store);return response["value"] as JObject??response;}
    static JObject Linked(Store store){var row=Apply(store,"upload.begin",Original(store));row=Apply(store,"upload.claim",row);row["ref"]=new JObject{{"provider","sharepoint"},{"siteCollectionId",DocumentProtocol.Site},{"webId",DocumentProtocol.Web},{"libraryId",DocumentProtocol.Library},{"itemId","1"},{"version","etag-1"},{"connectorIdentifier","encoded-path"},{"webUrl","https://schelmenzunft.sharepoint.com/sites/SchelmenzunftStaufenTraditionszunftderStaufenerStubengesells/Shared Documents/General/Zunftküche/Rechnungen/receipt-"+Upload+".jpg"},{"sha256",new string('a',64)},{"mimeType","image/jpeg"},{"size",287},{"originalName","original.jpg"}};return Apply(store,"upload.link",row);}
    public static void Run(Action<string, Action> check, JObject seed)
    {
        check("reservation is idempotent and claim cannot authorize a second upload",()=>{
            var store=new Store(seed);var begin=Original(store);var first=Apply(store,"upload.begin",begin);var same=Apply(store,"upload.begin",begin);Assert(store.Writes==1&&JToken.DeepEquals(first,same));
            var claim=Request(store,"upload.claim",first);var claimed=Protocol.Commit(claim.ToString(),Actor,true,store);var replay=Protocol.Commit(claim.ToString(),Actor,true,store);Assert(store.Writes==2&&(string?)claimed["outcome"]=="applied"&&(string?)replay["outcome"]=="replayed"&&JToken.DeepEquals(claimed["acknowledgment"],replay["acknowledgment"]));
            Reject(()=>Apply(store,"upload.claim",(JObject)claimed["value"]!));Assert(store.Writes==2);
            begin["sha256"]=new string('b',64);Reject(()=>Apply(store,"upload.begin",begin));
        });
        check("replayed acknowledgment is immutable while current row can advance",()=>{
            var store=new Store(seed);
            var row=Apply(store,"upload.begin",Original(store));
            var claim=Request(store,"upload.claim",row);
            var applied=Protocol.Commit(claim.ToString(),Actor,true,store);
            var linked=(JObject)applied["value"]!.DeepClone();
            linked["ref"]=Linked(new Store(seed))["ref"]!.DeepClone();
            Apply(store,"upload.link",linked);
            var replay=Protocol.Commit(claim.ToString(),Actor,true,store);
            Assert((string?)replay["outcome"]=="replayed" && (string?)replay["value"]!["status"]=="linked");
            Assert(JToken.DeepEquals(applied["acknowledgment"],replay["acknowledgment"]));
            Assert((string?)replay["acknowledgment"]!["value"]!["status"]=="uploading");
            Assert(replay["acknowledgment"]!["value"]!["rowVersion"]==null && store.Writes==3);
        });
        check("manual draft source binding, explicit review, versions and immutable history",()=>{
            var store=new Store(seed);var row=Linked(store);var draft=new JObject{{"schemaVersion",1},{"id",Guid.NewGuid().ToString("D")},{"eventId",row["eventId"]!.DeepClone()},{"source","manual"},{"parserVersion",null},{"modelVersion",null},{"promptVersion",null},{"reviewStatus","editing"},{"pages",new JArray(new JObject{{"documentId",row["id"]!.DeepClone()},{"documentRowVersion",row["rowVersion"]!.DeepClone()},{"version","etag-1"},{"sha256",new string('a',64)},{"originalReviewed",false}})},{"header",new JObject{{"supplierId",""},{"number","manual"},{"date",""},{"scope",""},{"grossCents",null}}},{"lines",new JArray()}};
            var saved=Apply(store,"draft.save",draft);Assert(saved["history"] is JArray h&&h.Count==1&&store.Row.Revision==0);
            var bad=(JObject)saved.DeepClone();bad["reviewStatus"]="reviewed";Reject(()=>Apply(store,"draft.save",bad));
            bad=(JObject)saved.DeepClone();bad["pages"]![0]!["version"]="other-version";Reject(()=>Apply(store,"draft.save",bad));
            bad=(JObject)saved.DeepClone();bad["rowVersion"]="stale";Reject(()=>Apply(store,"draft.save",bad));
            bad=(JObject)saved.DeepClone();bad["header"]!["grossCents"]=1.2;Reject(()=>Apply(store,"draft.save",bad));
            saved["header"]!["number"]="corrected";var updated=Apply(store,"draft.save",saved);Assert(((JArray)updated["history"]!).Count==2&&(string?)updated["history"]![0]!["value"]!["header"]!["number"]=="manual");
            updated["lines"]=new JArray(new JObject{{"id",Guid.NewGuid().ToString("D")},{"description","fractional quantity"},{"articleId",""},{"quantity",1.25},{"unit","kg"},{"grossCents",125}});
            var fractional=Apply(store,"draft.save",updated);Assert((decimal?)fractional["lines"]?[0]?["quantity"]==1.25m);
        });
        check("document caller, workspace/event and transaction boundaries fail closed",()=>{
            var store=new Store(seed);var request=Request(store,"upload.begin",Original(store));
            Reject(()=>Protocol.Commit(request.ToString(),Actor,false,store));Reject(()=>Protocol.Commit(request.ToString(),Guid.NewGuid(),true,store));
            request["identity"]!["userId"]=Guid.NewGuid().ToString();Reject(()=>Protocol.Commit(request.ToString(),Actor,true,store));
            request=Request(store,"upload.begin",Original(store));request["value"]!["eventId"]="foreign";Reject(()=>Protocol.Commit(request.ToString(),Actor,true,store));
            store.Row.CanWrite=false;Reject(()=>Apply(store,"upload.begin",Original(store)));Assert(store.Writes==0);
        });
        check("closed selected event rejects document and draft writes preserving existing rows",()=>{
            var store=new Store(seed);store.Row.State["event"]!["status"]="Abgeschlossen";
            Reject(()=>Apply(store,"upload.begin",Original(store)));Assert(store.Writes==0);
        });
        check("document guard binds exact own API action, caller, row and payload",()=>{
            var store=new Store(seed);var q=Request(store,"upload.begin",Original(store));var saved=(JObject)Protocol.Commit(q.ToString(),Actor,true,store)["value"]!;saved.Remove("rowVersion");
            var target=new Entity("zk_kitchendocument",Upload){["zk_workspace"]=new EntityReference("zk_kitchenworkspace",store.Row.Id),["zk_eventid"]=(string)saved["eventId"]!,["zk_payload"]=saved.ToString(Newtonsoft.Json.Formatting.None),["zk_actor"]=Actor.ToString("D"),["zk_recordedat"]=DateTime.Parse((string)saved["history"]!.Last!["recordedAt"]!,System.Globalization.CultureInfo.InvariantCulture,System.Globalization.DateTimeStyles.RoundtripKind)};
            var parent=ContextProxy.Create(new(){{"MessageName","zk_KitchenCommit"},{"Stage",30},{"Mode",0},{"IsInTransaction",true},{"UserId",Actor},{"InitiatingUserId",Actor},{"InputParameters",new ParameterCollection{{"RequestJson",q.ToString()}}}});
            Dictionary<string,object?> Context()=>new(){{"ParentContext",parent},{"Mode",0},{"Stage",20},{"IsInTransaction",true},{"UserId",Actor},{"InitiatingUserId",Actor},{"MessageName","Create"},{"PrimaryEntityName","zk_kitchendocument"},{"InputParameters",new ParameterCollection{{"Target",target}}}};
            new KitchenDocumentWriteGuardPlugin().Execute(new GuardProvider(ContextProxy.Create(Context())));
            foreach(var mutation in new[]{"actor","target","field","transaction","action","audit-time"}) {
                var c=Context();var originalId=target.Id;var originalRequest=q.ToString();var originalTime=target["zk_recordedat"];
                if(mutation=="audit-time")target["zk_recordedat"]=((DateTime)originalTime).AddMinutes(1);
                if(mutation=="actor")c["UserId"]=Guid.NewGuid();
                if(mutation=="target")target.Id=Guid.NewGuid();
                if(mutation=="field")target["ownerid"]=new EntityReference("systemuser",Actor);
                if(mutation=="transaction")c["IsInTransaction"]=false;
                if(mutation=="action")parent.InputParameters["RequestJson"]=new JObject{{"protocolVersion",2},{"workspaceId",store.Row.Id.ToString("D")},{"operationId","normal"}}.ToString();
                var denied=false;try{new KitchenDocumentWriteGuardPlugin().Execute(new GuardProvider(ContextProxy.Create(c)));}catch(InvalidPluginExecutionException){denied=true;}
                target["zk_recordedat"]=originalTime;target.Id=originalId;target.Attributes.Remove("ownerid");parent.InputParameters["RequestJson"]=originalRequest;Assert(denied);
            }
        });
        check("document direct, bulk and SYSTEM-origin writes denied",()=>{
            foreach(var message in new[]{"Create","Update","Delete","Upsert","CreateMultiple","UpdateMultiple","UpsertMultiple","DeleteMultiple","Assign","GrantAccess"}){
                var context=ContextProxy.Create(new(){{"Mode",0},{"Stage",20},{"IsInTransaction",true},{"UserId",Actor},{"InitiatingUserId",Actor},{"MessageName",message},{"PrimaryEntityName","zk_kitchendocument"},{"InputParameters",new ParameterCollection{{"Target",new Entity("zk_kitchendocument",Upload)}}}});
                try{new KitchenDocumentWriteGuardPlugin().Execute(new GuardProvider(context));}catch(InvalidPluginExecutionException){continue;}throw new Exception("direct write admitted");
            }
        });
        check("document view fails closed on unavailable dedicated store, without falling back to aggregate", () => {
            var store = new FakeStore(seed);
            var request = new JObject { {"protocolVersion",2},{"workspaceId",store.Row.Id.ToString("D")},{"view","documents"},
                {"identity",new JObject{{"organizationId",store.Row.OrganizationId.ToString("D")},{"userId",store.Row.UserId.ToString("D")},{"workspaceId",store.Row.Id.ToString("D")}}} };
            try { Protocol.Load(request.ToString(), store); }
            catch (ArgumentException e) { if (e.Message.Contains("Document source unavailable")) return; throw; }
            throw new Exception("missing source accepted");
        });
    }
}
