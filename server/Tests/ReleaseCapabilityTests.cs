using Newtonsoft.Json.Linq;
using Zunftkueche;
static class ReleaseCapabilityTests {
    static void Assert(bool v){if(!v)throw new Exception("capability assertion failed");}
    static void Reject(Action f){try{f();}catch(ArgumentException){return;}throw new Exception("disabled action accepted");}
    sealed class Unreadable:IKitchenStore {
        public int Reads;
        public Workspace Read(Guid id){Reads++;throw new Exception("must not read");}
        public ReceiptRecord? FindReceipt(Guid id,string op)=>throw new Exception("must not read receipt");
        public void Commit(Workspace p,JObject next,string op,string hash,Guid actor,DateTime time)=>throw new Exception("must not write");
    }
    sealed class CoreStore:IKitchenStore,IKitchenDocumentStore {
        public readonly FakeStore Inner;public int DocumentReads;
        public CoreStore(JObject state){Inner=new FakeStore(state);Inner.Row.OrganizationId=Guid.Parse("aaaaaaaa-1111-4111-8111-111111111111");Inner.Row.UserId=Guid.Parse("bbbbbbbb-1111-4111-8111-111111111111");}
        public Workspace Read(Guid id)=>Inner.Read(id);
        public ReceiptRecord? FindReceipt(Guid id,string op)=>Inner.FindReceipt(id,op);
        public void Commit(Workspace p,JObject next,string op,string hash,Guid actor,DateTime time)=>Inner.Commit(p,next,op,hash,actor,time);
        public JArray ReadDocumentRows(Guid id,bool draft){DocumentReads++;throw new Exception("core must not read documents");}
        public JObject? FindDocumentRow(Guid id,Guid row,bool draft){DocumentReads++;throw new Exception("core must not read documents");}
        public JObject SaveDocumentRow(Guid id,Guid row,bool draft,JObject value,string? version){DocumentReads++;throw new Exception("core must not write documents");}
    }
    public static void Run(Action<string,Action> check,JObject seed){
        check("production core disables document routes and financial accept before store reads",()=>{
            var s=new Unreadable();var q=new JObject{{"protocolVersion",2},{"workspaceId",FakeStore.WorkspaceId.ToString("D")},{"view","documents"}};
            Reject(()=>Protocol.Load(q.ToString(),s));Reject(()=>Protocol.Commit(q.ToString(),Guid.NewGuid(),true,s));
            q.Remove("view");q["operation"]=new JObject{{"type","receipt.draft.accept"},{"payload",new JObject()}};
            Reject(()=>Protocol.Commit(q.ToString(),Guid.NewGuid(),true,s));Assert(s.Reads==0);
        });
        check("ordinary manual invoice save and exact replay never touch document stores",()=>{
            var store=new CoreStore((JObject)seed.DeepClone());var row=store.Inner.Row;var next=(JObject)row.State.DeepClone();
            var invoice=new JObject{{"id","synthetic-manual"},{"supplierId",next["suppliers"]![0]!["id"]!.DeepClone()},{"number","SYNTHETIC-MANUAL"},
                {"date","2099-10-20"},{"grossCents",100},{"netCents",null},{"scope","Küche"},{"status","Erfasst"},{"lines",new JArray()}};
            invoice["sourceBaseline"]=invoice.DeepClone();((JArray)next["invoices"]!).Add(invoice);
            var q=new JObject{{"protocolVersion",2},{"workspaceId",row.Id.ToString("D")},{"identity",new JObject{{"organizationId",row.OrganizationId.ToString("D")},{"userId",row.UserId.ToString("D")},{"workspaceId",row.Id.ToString("D")}}},
                {"targetEventId",next["event"]!["id"]!.DeepClone()},{"operationId","synthetic-manual-save"},{"expectedRevision",0},
                {"operation",new JObject{{"type","invoice.save"},{"payload",invoice.DeepClone()}}},{"candidateState",next}};
            var raw=q.ToString();var saved=Protocol.Commit(raw,row.UserId,true,store);var replay=Protocol.Commit(raw,row.UserId,true,store);
            Assert((string?)saved["status"]=="saved"&&(string?)replay["status"]=="saved"&&store.Inner.Writes==1&&store.DocumentReads==0);
            Assert((bool?)saved["features"]?["documents"]==false&&(bool?)saved["features"]?["receiptIntake"]==false);
        });
        check("normal core load publishes both server flags false",()=>{
            var s=new FakeStore((JObject)seed.DeepClone());var result=Protocol.Load(new JObject{{"protocolVersion",2},{"workspaceId",FakeStore.WorkspaceId.ToString("D")}}.ToString(),s);
            Assert((bool?)result["features"]?["documents"]==false&&(bool?)result["features"]?["receiptIntake"]==false);
        });
    }
}
