using Newtonsoft.Json.Linq;
using Zunftkueche;
static class ReceivingCloseTests {
 public static void Run(Action<string,Action> check,JObject seed) {
  void Reject(Action a){try{a();}catch(ArgumentException){return;}throw new Exception("closed mutation accepted");}
  check("restored immutable receipt preserves exact request replay without a second write",()=>{var source=new FakeStore(seed);var candidate=(JObject)seed.DeepClone();candidate["articles"]![0]!["unitPriceCents"]=42;var raw=CorrectionTests.Request(seed,candidate,"article.price","restored-operation").ToString();var actor=CorrectionTests.Actor;var first=Protocol.Commit(raw,actor,true,source);CorrectionTests.Assert((string?)first["status"]=="saved");var restored=new FakeStore((JObject)source.Row.State.DeepClone());restored.Row.Revision=source.Row.Revision;restored.Receipt=new ReceiptRecord{Hash=source.Receipt!.Hash,Actor=source.Receipt.Actor,AppliedRevision=source.Receipt.AppliedRevision};var replay=Protocol.Commit(raw,actor,true,restored);CorrectionTests.Assert((string?)replay["status"]=="saved"&&restored.Writes==0&&JToken.DeepEquals(restored.Row.State,source.Row.State));Reject(()=>Protocol.Commit(raw+" ",actor,true,restored));});
  check("closed state semantically denies writes even under innocent operation names",()=>{var s=(JObject)seed.DeepClone();s["event"]!["status"]="Abgeschlossen";var c=(JObject)s.DeepClone();c["articles"]![0]!["unitPriceCents"]=123;Reject(()=>StatePolicy.ValidateScope(c,new Workspace{State=s,CanWrite=true,CanClose=true,CanConfigure=true},(string)s["event"]!["id"]!,"article.price"));});
  check("owner cannot change status without a closure history transition",()=>{var c=(JObject)seed.DeepClone();c["event"]!["status"]="Abgeschlossen";Reject(()=>StatePolicy.ValidateScope(c,new Workspace{State=seed,CanWrite=true,CanClose=true,CanConfigure=true},(string)seed["event"]!["id"]!,"article.price"));});
 }
}
