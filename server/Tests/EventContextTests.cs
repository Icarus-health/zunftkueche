using Newtonsoft.Json.Linq;
using Zunftkueche;
static class EventContextTests {
 public static void Run(Action<string,Action> check,JObject seed) {
  var actor=Guid.Parse("77777777-8888-4999-aaaa-bbbbbbbbbbbb");
  JObject Request(JObject s,string target) {var candidate=(JObject)s.DeepClone();candidate["revision"]=(int)s["revision"]!+1;((JArray)candidate["operationIds"]!).Add("scope-op");candidate["operationRequests"]!["scope-op"]="untrusted";return new JObject{{"protocolVersion",2},{"workspaceId",FakeStore.WorkspaceId.ToString("D")},{"identity",new JObject{{"organizationId",Guid.Empty.ToString("D")},{"userId",Guid.Empty.ToString("D")},{"workspaceId",FakeStore.WorkspaceId.ToString("D")}}},{"targetEventId",target},{"operationId","scope-op"},{"expectedRevision",(int)s["revision"]!},{"operation",new JObject{{"type","article.price"},{"payload",new JObject()}}},{"candidateState",candidate}};}
  void Assert(bool v){if(!v)throw new Exception("event scope assertion");}
  void Reject(JObject q,FakeStore store) {Assert((string?)Protocol.Commit(q.ToString(),actor,true,store)["status"]=="rejected"&&store.Writes==0);}
  check("owner configuration allowed with semantic scope and culinary edits allowed for editor",()=>{foreach(var owner in new[]{false,true}){var st=new FakeStore(seed);st.Row.CanConfigure=owner;st.Row.CanClose=owner;var q=Request(seed,(string)seed["event"]!["id"]!);q["candidateState"]!["articles"]![0]!["unitPriceCents"]=1;if(owner)q["candidateState"]!["event"]!["name"]="Configured";Assert((string?)Protocol.Commit(q.ToString(),actor,true,st)["status"]=="saved");}});
  check("unknown top event nested fields cannot become deferred privileged data",()=>{foreach(var scope in new[]{"root","event","article","supplier","recipe"}){var st=new FakeStore(seed);st.Row.CanConfigure=true;var q=Request(seed,(string)seed["event"]!["id"]!);var c=q["candidateState"]!;var obj=scope switch {"root"=>c,"event"=>c["event"]!,"article"=>c["articles"]![0]!,"supplier"=>c["suppliers"]![0]!,_=>c["menu"]![0]!};obj["documentDestination"]="unauthorized";Reject(q,st);}});
  check("explicit archived target may change but root and sibling remain unchanged",()=>{
   var s=(JObject)seed.DeepClone();var archive=(JObject)seed.DeepClone();foreach(var k in new[]{"revision","operationIds","operationRequests"})archive.Remove(k);archive["event"]!["id"]="old";s["archivedEvents"]=new JArray(archive);
   var st=new FakeStore(s);var q=Request(s,"old");q["candidateState"]!["archivedEvents"]![0]!["articles"]![0]!["unitPriceCents"]=2;Assert((string?)Protocol.Commit(q.ToString(),actor,true,st)["status"]=="saved");
   st=new FakeStore(s);q=Request(s,"old");q["candidateState"]!["articles"]![0]!["unitPriceCents"]=2;Reject(q,st);
   st=new FakeStore(s);q=Request(s,"missing");try {Protocol.Commit(q.ToString(),actor,true,st);throw new Exception("unknown target accepted");}catch(ArgumentException){Assert(st.Writes==0);}
  });
  check("version one fails with explicit reload and no writes",()=>{var st=new FakeStore(seed);var q=Request(seed,(string)seed["event"]!["id"]!);q["protocolVersion"]=1;try {Protocol.Commit(q.ToString(),actor,true,st);}catch(ArgumentException e){Assert(e.Message.Contains("neu laden")&&st.Writes==0);return;}throw new Exception("old client accepted");});
  check("identity mismatch denies before candidate and receipt writes",()=>{var st=new FakeStore(seed);var q=Request(seed,(string)seed["event"]!["id"]!);q["identity"]!["userId"]=actor.ToString("D");try{Protocol.Commit(q.ToString(),actor,true,st);}catch(ArgumentException){Assert(st.Writes==0);return;}throw new Exception("other caller accepted");});
 }
}
