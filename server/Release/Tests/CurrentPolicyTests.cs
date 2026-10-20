using System.Text;
using System.Text.Json.Nodes;
using Kitchen.Inventory;
using Kitchen.Release;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
static class CurrentPolicyTests {
    static void Assert(bool b){if(!b)throw new Exception("current policy assertion");}
    static void Reject(Action action){try{action();}catch(Stop){return;}catch(ArgumentException){return;}catch(JsonException){return;}throw new Exception("invalid retained policy accepted");}
    static JObject State() {
        var state=new JObject{{"schemaVersion",2},{"revision",2},{"operationIds",new JArray("legacy-op","new-op")},
            {"operationRequests",new JObject{{"legacy-op","{\"payload\":{},\"type\":\"event.switch\"}"},{"new-op","{\"payload\":{},\"targetEventId\":\"synthetic\",\"type\":\"event.dates\"}"}}},
            {"event",new JObject{{"id","synthetic"},{"name","Synthetic"},{"status","Offen"},{"year",2099},{"dates",new JObject()}}},{"sourceNotice","Synthetic only"}};
        foreach(var name in new[]{"suppliers","articles","planLines","menu","invoices","sales","movements","orders","dishPlan","lessons"})state[name]=new JArray();return state;
    }
    static JsonObject[] Receipts()=>Enumerable.Range(1,2).Select(n=>new JsonObject{["zk_operationid"]=n==1?"legacy-op":"new-op",["zk_requesthash"]=new string(n==1?'a':'b',64),["zk_appliedrevision"]=n,["zk_actor"]="11111111-1111-4111-8111-111111111111",["versionnumber"]=1L,["@odata.etag"]="W/\"1\""}).ToArray();
    static byte[] Bytes(JObject state)=>Encoding.UTF8.GetBytes(state.ToString(Formatting.Indented));
    public static void Run(Action<string,Action> test){
        test("retained legacy and v2 canonical signatures are independent from full request hashes",()=>{
            var state=State();var raw=Bytes(state);var receipts=Receipts();var before=state.ToString();var receiptBytes=string.Join("",receipts.Select(r=>r.ToJsonString()));
            Assert(CompleteInventory.ValidateCurrentPolicy(raw,2,receipts)==Check.Hash(raw));
            Assert(state.ToString()==before&&string.Join("",receipts.Select(r=>r.ToJsonString()))==receiptBytes&&Encoding.UTF8.GetString(raw)==before);
            receipts[0]["zk_requesthash"]=Check.Hash("another full request; cannot reconstruct original");
            Assert(CompleteInventory.ValidateCurrentPolicy(raw,2,receipts)==Check.Hash(raw));
        });
        foreach(var defect in new[]{"missing-receipt","duplicate-receipt","foreign-op","revision-zero","revision-future","revision-duplicate","actor","hash-short","hash-uppercase","signature-is-hash","noncanonical","unknown-field","signature-missing","wrong-type","wrong-payload","empty-target","extra-signature","etag"}) {
            var d=defect;test("retained policy refuses "+d,()=>{
                var state=State();var rows=Receipts();var signatures=(JObject)state["operationRequests"]!;
                if(d=="missing-receipt")rows=rows.Take(1).ToArray();
                if(d=="duplicate-receipt")rows=[rows[0],(JsonObject)rows[0].DeepClone()];
                if(d=="foreign-op")rows[0]["zk_operationid"]="other";
                if(d.StartsWith("revision-"))rows[0]["zk_appliedrevision"]=d=="revision-zero"?0:d=="revision-future"?3:2;
                if(d=="actor")rows[0]["zk_actor"]="not-an-actor";
                if(d=="hash-short")rows[0]["zk_requesthash"]="abc";
                if(d=="hash-uppercase")rows[0]["zk_requesthash"]=new string('A',64);
                if(d=="signature-is-hash")signatures["legacy-op"]=new string('a',64);
                if(d=="noncanonical")signatures["legacy-op"]="{\"type\":\"event.switch\",\"payload\":{}}";
                if(d=="unknown-field")signatures["legacy-op"]="{\"extra\":true,\"payload\":{},\"type\":\"event.switch\"}";
                if(d=="signature-missing")signatures.Remove("legacy-op");
                if(d=="wrong-type")signatures["legacy-op"]="{\"payload\":{},\"type\":7}";
                if(d=="wrong-payload")signatures["legacy-op"]="{\"payload\":[],\"type\":\"event.switch\"}";
                if(d=="empty-target")signatures["new-op"]="{\"payload\":{},\"targetEventId\":\"\",\"type\":\"event.dates\"}";
                if(d=="extra-signature")signatures["foreign"]="{}";
                if(d=="etag")rows[0]["@odata.etag"]="W/\"2\"";
                Reject(()=>CompleteInventory.ValidateCurrentPolicy(Bytes(state),2,rows));
            });
        }
    }
}
