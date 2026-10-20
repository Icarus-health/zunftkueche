using System.Globalization;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Microsoft.Xrm.Sdk;
using Zunftkueche;

static class IntakeTests
{
    static readonly Guid Actor=Guid.Parse("cccccccc-1111-4111-8111-111111111111"), Org=Guid.Parse("aaaaaaaa-1111-4111-8111-111111111111"), Draft=Guid.Parse("22222222-1111-4111-8111-111111111111"), Doc=Guid.Parse("11111111-1111-4111-8111-111111111111");
    static void Assert(bool value,string message="intake assertion failed"){if(!value)throw new Exception(message);}
    static void Reject(Action action){try{action();}catch(ArgumentException){return;}throw new Exception("acceptance should reject");}
    sealed class Store:IKitchenStore,IKitchenDocumentStore {
        public Workspace Row;public Dictionary<Guid,JObject> Documents=new(),Drafts=new();public Dictionary<string,ReceiptRecord> Receipts=new();public int Writes;public int FailAt;
        public Store(JObject seed){Row=new Workspace{Id=FakeStore.WorkspaceId,UserId=Actor,OrganizationId=Org,State=(JObject)seed.DeepClone(),CanWrite=true,RowVersion="workspace-1"};}
        public Workspace Read(Guid id)=>Row;
        public ReceiptRecord? FindReceipt(Guid workspace,string operation)=>Receipts.GetValueOrDefault(operation);
        void Step(){Writes++;if(FailAt==Writes)throw new InvalidOperationException("injected storage fault");}
        public void Commit(Workspace p,JObject n,string id,string hash,Guid actor,DateTime time){Row.State=(JObject)n.DeepClone();Row.Revision=(int)n["revision"]!;Step();Receipts[id]=new ReceiptRecord{Hash=hash,Actor=actor,AppliedRevision=Row.Revision};Step();}
        public JArray ReadDocumentRows(Guid workspace,bool draft)=>new JArray((draft?Drafts:Documents).Values.Select(v=>v.DeepClone()));
        public JObject? FindDocumentRow(Guid workspace,Guid id,bool draft)=>(draft?Drafts:Documents).TryGetValue(id,out var value)?(JObject)value.DeepClone():null;
        public JObject SaveDocumentRow(Guid workspace,Guid id,bool draft,JObject value,string? version){var table=draft?Drafts:Documents;Assert(table.TryGetValue(id,out var prior)?(string?)prior["rowVersion"]==version:version==null,"CAS mismatch");var saved=(JObject)value.DeepClone();saved["rowVersion"]=(Writes+1).ToString();table[id]=saved;Step();return (JObject)saved.DeepClone();}
        // Models host rollback only; actual Dataverse transaction registration remains a live gate.
        public JObject Atomic(string raw,bool transaction=true){var state=(JObject)Row.State.DeepClone();var rev=Row.Revision;var drafts=Drafts.ToDictionary(p=>p.Key,p=>(JObject)p.Value.DeepClone());var receipts=new Dictionary<string,ReceiptRecord>(Receipts);var writes=Writes;try{return Protocol.Commit(raw,Actor,transaction,this,new ReleaseFeatures(true,true));}catch{Row.State=state;Row.Revision=rev;Drafts=drafts;Receipts=receipts;Writes=writes;throw;}}
    }
    static JObject Identity(Store s)=>new(){{"organizationId",Org.ToString("D")},{"userId",Actor.ToString("D")},{"workspaceId",s.Row.Id.ToString("D")}};
    static JObject Save(Store s,string action,JObject value){var q=new JObject{{"protocolVersion",2},{"workspaceId",s.Row.Id.ToString("D")},{"identity",Identity(s)},{"view","documents"},{"requestId",Guid.NewGuid().ToString("D")},{"action",action},{"value",value}};var response=Protocol.Commit(q.ToString(),Actor,true,s,new ReleaseFeatures(true,true));Assert(response["value"] is JObject,response.ToString());return (JObject)response["value"]!;}
    static (Store,JObject) Fixture(JObject seed){
        var s=new Store(seed);var eventId=(string)s.Row.State["event"]!["id"]!;
        var d=Save(s,"upload.begin",new JObject{{"uploadId",Doc.ToString("D")},{"eventId",eventId},{"principal","editor@example.test"},{"sha256",new string('a',64)},{"mimeType","image/jpeg"},{"size",287},{"originalName","original.jpg"}});
        d["ref"]=new JObject{{"provider","sharepoint"},{"siteCollectionId",DocumentProtocol.Site},{"webId",DocumentProtocol.Web},{"libraryId",DocumentProtocol.Library},{"itemId","1"},{"version","etag-1"},{"connectorIdentifier","encoded-path"},{"webUrl","https://schelmenzunft.sharepoint.com/sites/SchelmenzunftStaufenTraditionszunftderStaufenerStubengesells/Shared Documents/General/Zunftküche/Rechnungen/receipt-"+Doc+".jpg"},{"sha256",new string('a',64)},{"mimeType","image/jpeg"},{"size",287},{"originalName","original.jpg"}};d=Save(s,"upload.link",d);
        var draft=Save(s,"draft.save",new JObject{{"schemaVersion",1},{"id",Draft.ToString("D")},{"eventId",eventId},{"source","manual"},{"parserVersion",null},{"modelVersion",null},{"promptVersion",null},{"reviewStatus","reviewed"},{"pages",new JArray(new JObject{{"documentId",Doc.ToString("D")},{"documentRowVersion",d["rowVersion"]!.DeepClone()},{"version","etag-1"},{"sha256",new string('a',64)},{"originalReviewed",true}})},{"header",new JObject{{"supplierId",seed["suppliers"]![0]!["id"]!.DeepClone()},{"number","SYNTHETIC-REVIEW-6"},{"date","2026-10-19"},{"scope","Küche"},{"grossCents",1234}}},{"lines",new JArray()}});
        var op=Guid.NewGuid().ToString("D");
        var payload=new JObject{{"eventId",eventId},{"expectedWorkspaceRevision",0},{"draftId",Draft.ToString("D")},{"draftRowVersion",draft["rowVersion"]!.DeepClone()},{"documentVersion",draft["pages"]!.DeepClone()},{"reviewedFields",new JObject{{"header",draft["header"]!.DeepClone()},{"lines",draft["lines"]!.DeepClone()},{"raw",new JObject{{"total","12,34"},{"lines",new JObject()}}}}},{"reviewDecisions",new JObject{{"receipt",true},{"prices","separate"},{"stock","separate"},{"fields",true},{"originals",true}}},{"operationId",op}};
        return(s,new JObject{{"protocolVersion",2},{"workspaceId",s.Row.Id.ToString("D")},{"identity",Identity(s)},{"targetEventId",eventId},{"operationId",op},{"expectedRevision",0},{"operation",new JObject{{"type","receipt.draft.accept"},{"payload",payload}}},{"candidateState",seed.DeepClone()}});
    }
    public static void Run(Action<string,Action> check,JObject seed){
        check("intake atomically derives saved fields with immutable baseline and exact replay",()=>{var(s,q)=Fixture(seed);var writes=s.Writes;var response=s.Atomic(q.ToString());Assert((string?)response["status"]=="saved",response.ToString());Assert(s.Writes==writes+3);var invoice=s.Row.State["invoices"]!.Last!;Assert((string?)invoice["id"]==Draft.ToString("D")&&(int?)invoice["sourceBaseline"]?["grossCents"]==1234);Assert((string?)s.Drafts[Draft]["reviewStatus"]=="accepted");Assert((string?)s.Atomic(q.ToString())["status"]=="saved"&&s.Writes==writes+3);var changed=q.ToString()+" ";Reject(()=>s.Atomic(changed));});
        foreach(var mutation in new[]{"draft-version","document-version","external-version","hash","event","payload-event","revision","operation","fields","raw","decisions","source-review","closed","caller","no-transaction","candidate-injection"})check("intake bound rejection: "+mutation,()=>{var(s,q)=Fixture(seed);var p=(JObject)q["operation"]!["payload"]!;var writes=s.Writes;
            if(mutation=="draft-version")p["draftRowVersion"]="stale";
            if(mutation=="document-version")s.Documents[Doc]["rowVersion"]="changed";
            if(mutation=="external-version")s.Documents[Doc]["ref"]!["version"]="changed";
            if(mutation=="hash")p["documentVersion"]![0]!["sha256"]=new string('b',64);
            if(mutation=="event")q["targetEventId"]="foreign";
            if(mutation=="payload-event")p["eventId"]="foreign";
            if(mutation=="revision")p["expectedWorkspaceRevision"]=1;
            if(mutation=="operation")p["operationId"]=Guid.NewGuid().ToString();
            if(mutation=="fields")p["reviewedFields"]!["header"]!["grossCents"]=9999;
            if(mutation=="raw")p["reviewedFields"]!["raw"]!["total"]="1.234,56";
            if(mutation=="decisions")p["reviewDecisions"]!["stock"]="book";
            if(mutation=="source-review")s.Drafts[Draft]["pages"]![0]!["originalReviewed"]=false;
            if(mutation=="closed")s.Row.State["event"]!["status"]="Abgeschlossen";
            if(mutation=="caller")q["identity"]!["userId"]=Guid.NewGuid().ToString();
            if(mutation=="candidate-injection"){q["candidateState"]!["articles"]![0]!["unitPriceCents"]=999999;var response=s.Atomic(q.ToString());Assert((string?)response["status"]=="saved");Assert(JToken.DeepEquals(s.Row.State["articles"],seed["articles"]));return;}
            try{var r=s.Atomic(q.ToString(),mutation!="no-transaction");Assert((string?)r["status"]=="rejected");}catch(ArgumentException){}Assert(s.Writes==writes);
        });
        check("intake guard admits only exact acceptance target and rejects direct/bulk/invalid parent",()=>{
            var(s,q)=Fixture(seed);s.Atomic(q.ToString());var payload=(JObject)s.Drafts[Draft].DeepClone();payload.Remove("rowVersion");
            var target=new Entity("zk_kitchendraft",Draft){RowVersion=(string)q["operation"]!["payload"]!["draftRowVersion"]!,["zk_workspace"]=new EntityReference("zk_kitchenworkspace",s.Row.Id),["zk_eventid"]=(string)payload["eventId"]!,["zk_payload"]=payload.ToString(Formatting.None),["zk_actor"]=Actor.ToString("D"),["zk_recordedat"]=DateTime.Parse((string)payload["history"]!.Last!["recordedAt"]!,CultureInfo.InvariantCulture,System.Globalization.DateTimeStyles.RoundtripKind)};
            var parent=ContextProxy.Create(new(){{"MessageName","zk_KitchenCommit"},{"Stage",30},{"Mode",0},{"IsInTransaction",true},{"UserId",Actor},{"InitiatingUserId",Actor},{"InputParameters",new ParameterCollection{{"RequestJson",q.ToString()}}}});
            Dictionary<string,object?> Context()=>new(){{"ParentContext",parent},{"Mode",0},{"Stage",20},{"IsInTransaction",true},{"UserId",Actor},{"InitiatingUserId",Actor},{"MessageName","Update"},{"PrimaryEntityName","zk_kitchendraft"},{"InputParameters",new ParameterCollection{{"Target",target}}}};
            new KitchenDocumentWriteGuardPlugin().Execute(new GuardProvider(ContextProxy.Create(Context())));
            foreach(var change in new[]{"direct","bulk","id","version","actor","foreign-parent","payload","extra-field"}) {
                var c=Context();var savedId=target.Id;var savedVersion=target.RowVersion;var savedPayload=target["zk_payload"];
                if(change=="direct")c["ParentContext"]=null;if(change=="bulk")c["MessageName"]="UpdateMultiple";
                if(change=="id")target.Id=Guid.NewGuid();if(change=="version")target.RowVersion="stale";
                if(change=="actor")c["UserId"]=Guid.NewGuid();if(change=="foreign-parent")c["ParentContext"]=ContextProxy.Create(new(){{"MessageName","OtherApi"}});
                if(change=="payload"){var bad=(JObject)payload.DeepClone();bad["acceptance"]!["reviewedFields"]!["header"]!["grossCents"]=9999;target["zk_payload"]=bad.ToString();}
                if(change=="extra-field")target["ownerid"]=new EntityReference("systemuser",Actor);
                var denied=false;try{new KitchenDocumentWriteGuardPlugin().Execute(new GuardProvider(ContextProxy.Create(c)));}catch(InvalidPluginExecutionException){denied=true;}
                target.Id=savedId;target.RowVersion=savedVersion;target["zk_payload"]=savedPayload;target.Attributes.Remove("ownerid");Assert(denied,change+" admitted");
            }
        });
        check("intake exact hash duplicate rejects a second draft independently of business number",()=>{
            var(s,q)=Fixture(seed);s.Atomic(q.ToString());var id=Guid.NewGuid();var d=(JObject)s.Drafts[Draft].DeepClone();d["id"]=id.ToString("D");d["reviewStatus"]="reviewed";d.Remove("acceptance");d["header"]!["number"]="DIFFERENT-BUSINESS-ID";s.Drafts[id]=d;
            var op=Guid.NewGuid().ToString("D");q["operationId"]=op;q["expectedRevision"]=1;var p=(JObject)q["operation"]!["payload"]!;p["operationId"]=op;p["draftId"]=id.ToString("D");p["draftRowVersion"]=d["rowVersion"]!.DeepClone();p["expectedWorkspaceRevision"]=1;p["reviewedFields"]!["header"]=d["header"]!.DeepClone();
            var writes=s.Writes;Assert((string?)s.Atomic(q.ToString())["status"]=="rejected"&&s.Writes==writes);
        });
        check("normal invoice metadata cannot bypass draft acceptance provenance",()=>{
            var(s,q)=Fixture(seed);s.Atomic(q.ToString());var next=(JObject)s.Row.State.DeepClone();var id=Guid.NewGuid().ToString("D");var invoice=(JObject)next["invoices"]!.Last!.DeepClone();invoice["id"]=id;invoice["number"]="BYPASS";invoice["intake"]!["draftId"]=id;invoice["sourceBaseline"]=invoice.DeepClone();((JArray)next["invoices"]!).Add(invoice);
            q["expectedRevision"]=1;q["operationId"]=Guid.NewGuid().ToString("D");q["operation"]!["type"]="invoice.save";q["candidateState"]=next;
            Assert((string?)s.Atomic(q.ToString())["status"]=="rejected");
        });
        check("intake failure after each write escapes and ambient transaction restores all rows",()=>{for(int stage=1;stage<=3;stage++){var(s,q)=Fixture(seed);var before=s.ReadDocumentRows(s.Row.Id,true).ToString();s.FailAt=s.Writes+stage;try{s.Atomic(q.ToString());throw new Exception("failure swallowed");}catch(InvalidOperationException){}Assert(s.Row.Revision==0&&s.Receipts.Count==0&&s.ReadDocumentRows(s.Row.Id,true).ToString()==before);}});
        check("two tabs cannot accept one draft twice and accepted draft cannot return to editing",()=>{var(s,q)=Fixture(seed);s.Atomic(q.ToString());var second=(JObject)q.DeepClone();var newId=Guid.NewGuid().ToString("D");second["operationId"]=newId;second["operation"]!["payload"]!["operationId"]=newId;second["expectedRevision"]=1;second["operation"]!["payload"]!["expectedWorkspaceRevision"]=1;var r=s.Atomic(second.ToString());Assert((string?)r["status"]=="rejected");var draft=(JObject)s.Drafts[Draft].DeepClone();draft["reviewStatus"]="editing";var denied=false;try{Save(s,"draft.save",draft);}catch(Exception){denied=true;}Assert(denied);});
    }
}
