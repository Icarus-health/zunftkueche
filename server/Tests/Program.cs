using Newtonsoft.Json.Linq;
using Zunftkueche;
var seed = JObject.Parse(File.ReadAllText(args[0]));
seed["schemaVersion"] = 2;
seed["revision"] = 0;
seed["operationIds"] = new JArray();
seed["operationRequests"] = new JObject();
int passed = 0, failed = 0;
void Check(string name, Action action) { try { action(); Console.WriteLine("PASS " + name); passed++; } catch (Exception e) { Console.WriteLine("FAIL " + name + ": " + e.Message); failed++; } }
void Reject(string name, Action<JObject> edit) { Check(name, () => { var candidate = (JObject)seed.DeepClone(); edit(candidate); try { StatePolicy.Validate(candidate, seed); } catch (ArgumentException) { return; } throw new Exception("invalid candidate accepted"); }); }
Check("actual normalized source schema and fractional unit prices", () => { var s = (JObject)seed.DeepClone(); s["articles"]![0]!["unitPriceCents"] = 12.34; StatePolicy.Validate(s, seed); });
Reject("unsupported schema", s => s["schemaVersion"] = 1);
Reject("negative quantity", s => s["planLines"]![0]!["quantity"] = -1);
Reject("invalid cents precision", s => s["menu"]![0]!["priceCents"] = 1.23);
Reject("duplicate entity ID", s => ((JArray)s["articles"]!).Add(s["articles"]![0]!.DeepClone()));
Reject("broken supplier reference", s => s["articles"]![0]!["supplierId"] = "missing");
Reject("invalid date", s => s["event"]!["dates"]!["Freitag"] = "2026-02-30");
Reject("invalid document URL", s => s["invoices"]![0]!["documentUrl"] = "https://evil.example/a");
Reject("changed source hash", s => s["planLines"]![0]!["source"]!["hash"] = new string('0', 64));
Reject("removed source record", s => ((JArray)s["planLines"]!).RemoveAt(0));
Reject("original receipt economics", s => s["invoices"]![0]!["grossCents"] = 1);
Reject("lost event history", s => s["event"]!["id"] = "replacement");
Reject("changed referenced article unit", s => s["articles"]![0]!["unit"] = "Bags");
Reject("excessive aggregate", s => s["sourceNotice"] = new string('x', 524289));

Reject("malformed archivedEvents rejected",s=>s["archivedEvents"]=new JObject());
Reject("missing required money", s => ((JObject)s["articles"]![0]!).Remove("unitPriceCents"));
Reject("missing required quantity", s => ((JObject)s["planLines"]![0]!).Remove("quantity"));
Check("prepared snapshots and recorded prices survive archive switches", () =>
{
    var original = (JObject)seed.DeepClone();
    ((JArray)original["sales"]!).Add(new JObject { { "id", "sale-history" }, { "menuId", (string)original["menu"]![0]!["id"]! }, { "day", "Freitag" }, { "quantity", 2 }, { "priceCents", 500 } });
    var next = (JObject)original.DeepClone();
    next["sales"]![0]!["priceCents"] = 600;
    ExpectReject(() => StatePolicy.Validate(next, original));
    next = (JObject)original.DeepClone();
    next["event"]!["id"] = "new-event";
    next["sales"] = new JArray();
    next["invoices"] = new JArray();
    var archived = (JObject)original.DeepClone();
    archived.Remove("revision");
    archived.Remove("operationIds");
    archived.Remove("operationRequests");
    next["archivedEvents"] = new JArray(archived);
    StatePolicy.Validate(next, original);
    next["archivedEvents"]![0]!["sales"]![0]!["priceCents"] = 600;
    ExpectReject(() => StatePolicy.Validate(next, original));
});
Check("append-only histories cannot be reordered", () => {
    var original=(JObject)seed.DeepClone();
    original["lessons"]=new JArray(new JObject{{"id","first"},{"note","first note"}},new JObject{{"id","second"},{"note","second note"}});
    var next=(JObject)original.DeepClone(); next["lessons"]=new JArray(original["lessons"]![1]!.DeepClone(),original["lessons"]![0]!.DeepClone());
    ExpectReject(()=>StatePolicy.Validate(next,original));
});
Check("append-only movement history", () => { var original = (JObject)seed.DeepClone(); ((JArray)original["movements"]!).Add(new JObject { { "id", "movement" }, { "articleId", (string)original["articles"]![0]!["id"]! }, { "day", "Freitag" }, { "type", "Lieferung" }, { "quantity", 1 }, { "location", "Küche" } }); var next = (JObject)original.DeepClone(); next["movements"]![0]!["quantity"] = 2; ExpectReject(() => StatePolicy.Validate(next, original)); });
Check("new duplicate invoice rejected while imported duplicate labels survive", () => { var next = (JObject)seed.DeepClone(); var receipt = (JObject)next["invoices"]![0]!.DeepClone(); receipt["id"] = "duplicate"; ((JArray)next["invoices"]!).Add(receipt); ExpectReject(() => StatePolicy.Validate(next, seed)); });
Check("source missing-original corrections require true baseline and history", () =>
{
    var next = (JObject)seed.DeepClone();
    var receipt = next["invoices"]!.OfType<JObject>().First(r => (string?)r["status"] == "Original fehlt");
    var before = (JObject)receipt.DeepClone();
    receipt["grossCents"] = 999999;
    ExpectReject(() => StatePolicy.Validate(next, seed));
    receipt["sourceBaseline"] = before.DeepClone();
    receipt["corrected"] = true;
    var after=(JObject)before.DeepClone();after["grossCents"]=999999;
    receipt["corrections"] = new JArray(new JObject { { "operationId", "correction" }, { "revision", 1 }, { "before", before }, {"after",after},{"reason","Betrag abgelesen"} });
    StatePolicy.Validate(next, seed);
    var tampered = (JObject)next.DeepClone();
    tampered["invoices"]!.OfType<JObject>().First(r => (string?)r["id"] == (string?)receipt["id"])["sourceBaseline"]!["grossCents"] = 1;
    ExpectReject(() => StatePolicy.Validate(tampered, next));
});
Check("prior operation signatures cannot be removed", () => { var original = (JObject)seed.DeepClone(); ((JArray)original["operationIds"]!).Add("old"); original["operationRequests"]!["old"] = "prior-signature"; var next = (JObject)original.DeepClone(); next["operationRequests"]!["old"] = "rewritten"; ExpectReject(() => StatePolicy.Validate(next, original)); });
if (args.Length > 1)
    Check("actual TypeScript reducer operation corpus", () =>
    {
        using var reader = new Newtonsoft.Json.JsonTextReader(new StringReader(File.ReadAllText(args[1]))) { DateParseHandling = Newtonsoft.Json.DateParseHandling.None };
        var corpus = JArray.Load(reader);
        JObject? previous = null;
        foreach (var item in corpus.OfType<JObject>())
        {
            StatePolicy.Validate(item, previous ?? item);
            previous = item;
        }
        var prepared = (JObject)corpus[2]!.DeepClone();
        prepared["orders"]![0]!["totalCents"] = 123;
        ExpectReject(() => StatePolicy.Validate(prepared, (JObject)corpus[1]!));
        var changed = (JObject)corpus[3]!.DeepClone();
        changed["orders"]![0]!["createdAt"] = "2026-01-01T00:00:00Z";
        ExpectReject(() => StatePolicy.Validate(changed, (JObject)corpus[2]!));
        var archived = (JObject)corpus[8]!.DeepClone();
        archived["archivedEvents"]![0]!["orders"]![0]!["createdAt"] = "2026-01-01T00:00:00Z";
        ExpectReject(() => StatePolicy.Validate(archived, (JObject)corpus[7]!));
    });
if (args.Length > 1)
{
    using var reader = new Newtonsoft.Json.JsonTextReader(new StringReader(File.ReadAllText(args[1]))) { DateParseHandling = Newtonsoft.Json.DateParseHandling.None };
    var corpus = JArray.Load(reader);
    var original = (JObject)corpus[2]!;
    Check("legacy order context remains optional", () => {
        var legacy = (JObject)original.DeepClone();
        ((JObject)legacy["orders"]![0]!).Remove("context");
        StatePolicy.Validate(legacy, (JObject)corpus[1]!);
    });
    foreach (var field in new[] { "supplierName", "eventName", "eventYear", "deliveryDate" })
    {
        Check("snapshot context field required: " + field, () => {
            var candidate = (JObject)original.DeepClone();
            ((JObject)candidate["orders"]![0]!["context"]!).Remove(field);
            ExpectReject(() => StatePolicy.Validate(candidate, (JObject)corpus[1]!));
        });
        Check("snapshot context field bounded: " + field, () => {
            var candidate = (JObject)original.DeepClone();
            candidate["orders"]![0]!["context"]![field] = field == "eventYear" ? new JValue(2201) : new JValue(field == "deliveryDate" ? "2026-02-30" : new string('x', 201));
            ExpectReject(() => StatePolicy.Validate(candidate, (JObject)corpus[1]!));
        });
        Check("snapshot context immutable: " + field, () => {
            var candidate = (JObject)original.DeepClone();
            candidate["orders"]![0]!["context"]![field] = field == "eventYear" ? new JValue(2099) : new JValue(field == "deliveryDate" ? "2099-02-06" : "Other name");
            ExpectReject(() => StatePolicy.Validate(candidate, original));
        });
        Check("new snapshot context agrees with current facts: " + field, () => {
            var candidate = (JObject)original.DeepClone();
            candidate["orders"]![0]!["context"]![field] = field == "eventYear" ? new JValue(2099) : new JValue(field == "deliveryDate" ? "2099-02-06" : "Other name");
            ExpectReject(() => StatePolicy.Validate(candidate, (JObject)corpus[1]!));
        });
    }
    Check("snapshot context cannot be null", () => {
        var candidate = (JObject)original.DeepClone();
        candidate["orders"]![0]!["context"] = null;
        ExpectReject(() => StatePolicy.Validate(candidate, (JObject)corpus[1]!));
    });
    Check("archived snapshot context cannot be altered", () => {
        var candidate = (JObject)corpus[8]!.DeepClone();
        candidate["archivedEvents"]![0]!["orders"]![0]!["context"]!["supplierName"] = "Changed historic name";
        ExpectReject(() => StatePolicy.Validate(candidate, (JObject)corpus[7]!));
    });
}
JObject Request(JObject s, string id = "new-op") { var candidate = (JObject)s.DeepClone(); candidate["revision"] = (int)s["revision"]! + 1; ((JArray)candidate["operationIds"]!).Add(id); ((JObject)candidate["operationRequests"]!)[id] = "client-untrusted"; candidate["articles"]![0]!["unitPriceCents"] = 12.34; return new JObject { { "protocolVersion", 2 }, { "workspaceId", FakeStore.WorkspaceId.ToString() }, { "identity", new JObject{{"organizationId",Guid.Empty.ToString("D")},{"userId",Guid.Empty.ToString("D")},{"workspaceId",FakeStore.WorkspaceId.ToString("D")}} }, { "targetEventId",(string)s["event"]!["id"]! }, { "operationId", id }, { "expectedRevision", (int)s["revision"]! }, { "operation", new JObject { { "type", "article.price" }, { "payload", new JObject { { "articleId", "a-1" }, { "priceCents", 12.34 } } } } }, { "candidateState", candidate } }; }
void ExpectReject(Action action) { try { action(); } catch (ArgumentException) { return; } throw new Exception("request accepted"); }
var actor = Guid.Parse("77777777-8888-4999-aaaa-bbbbbbbbbbbb");
Check("fractional protocol version rejected", () => { var q = Request(seed); q["protocolVersion"] = 1.1; ExpectReject(() => Protocol.Commit(q.ToString(), actor, true, new FakeStore(seed))); });
Check("successful commit forwards CAS version and owns metadata", () => { var store = new FakeStore(seed); var result = Protocol.Commit(Request(seed).ToString(), actor, true, store); if ((string?)result["status"] != "saved" || store.CasVersion != "original-rowversion" || store.Receipt?.Actor != actor || (string?)store.Row.State["operationRequests"]!["new-op"] == "client-untrusted") throw new Exception("CAS/metadata incorrect"); });
Check("matching receipt checked before stale revision", () => { var store = new FakeStore(seed); var raw = Request(seed).ToString(); Protocol.Commit(raw, actor, true, store); var again = Protocol.Commit(raw, actor, true, store); if ((string?)again["status"] != "saved" || store.Writes != 1) throw new Exception("replay wrote again"); });
Check("receipt rejects changed bytes and wrong actor", () => { var store = new FakeStore(seed); var raw = Request(seed).ToString(); Protocol.Commit(raw, actor, true, store); ExpectReject(() => Protocol.Commit(raw + " ", actor, true, store)); ExpectReject(() => Protocol.Commit(raw, Guid.NewGuid(), true, store)); });
Check("stale version is conflict without write", () => { var store = new FakeStore(seed); var q = Request(seed); store.Row.Revision = 2; store.Row.State["revision"] = 2; var result = Protocol.Commit(q.ToString(), actor, true, store); if ((string?)result["status"] != "conflict" || store.Writes != 0) throw new Exception("conflict wrote"); });
Check("transaction and reader guards deny mutation", () => { var store = new FakeStore(seed); ExpectReject(() => Protocol.Commit(Request(seed).ToString(), actor, false, store)); store.Row.CanWrite = false; ExpectReject(() => Protocol.Commit(Request(seed).ToString(), actor, true, store)); if (store.Writes != 0) throw new Exception("unauthorized write"); });
Check("race failure escapes without success", () => { var store = new FakeStore(seed) { FailCas = true }; try { Protocol.Commit(Request(seed).ToString(), actor, true, store); } catch (InvalidOperationException) { return; } throw new Exception("race swallowed"); });
Check("candidate validation has an exact-hash pre-write rejection envelope", () => {
    var store=new FakeStore(seed);var q=Request(seed);q["candidateState"]!["menu"]![0]!["priceCents"]=1.23;var raw=q.ToString();
    var result=Protocol.Commit(raw,actor,true,store);
    if((string?)result["status"]!="rejected"||(string?)result["rejectionCode"]!="candidate_validation"||(string?)result["requestHash"]!=Protocol.Hash(raw)||result["appliedRevision"]!.Type!=JTokenType.Null||store.Writes!=0)throw new Exception("rejection contract invalid");
    if((string?)Protocol.Commit(Request(seed,"corrected").ToString(),actor,true,store)["status"]!="saved")throw new Exception("correction blocked");
});
Check("post-write validation-shaped storage faults must escape", () => {
    var store=new FakeStore(seed){FailAfterWrite=true};
    try {Protocol.Commit(Request(seed).ToString(),actor,true,store);}catch(ArgumentException){if(store.Writes!=1)throw new Exception("test did not cross storage boundary");return;}
    throw new Exception("storage failure became definitive rejection");
});
Check("non-owner renamed metadata cannot alter event configuration", () => {
 var store=new FakeStore(seed);var q=Request(seed);q["candidateState"]!["event"]!["name"]="Unauthorized";
 var result=Protocol.Commit(q.ToString(),actor,true,store);
 if((string?)result["status"]!="rejected"||store.Writes!=0)throw new Exception("configuration bypass accepted");
});
Check("non-owner closure and unknown configuration fail closed", () => {
 foreach(var key in new[]{"status","documentDestination"}) {var store=new FakeStore(seed);var q=Request(seed);q["candidateState"]!["event"]![key]="closed";
 if((string?)Protocol.Commit(q.ToString(),actor,true,store)["status"]!="rejected"||store.Writes!=0)throw new Exception("privileged field bypass accepted");}
});
if(args.Length>2)Check("actual TS protocol v2 candidate target signature and archive parity",()=>{
 using var reader=new Newtonsoft.Json.JsonTextReader(new StringReader(File.ReadAllText(args[2]))){DateParseHandling=Newtonsoft.Json.DateParseHandling.None};var corpus=JObject.Load(reader);
 var store=new FakeStore((JObject)corpus["initial"]!);store.Row.CanConfigure=true;store.Row.CanClose=true;
 IEnumerable<JObject> Audits(JToken value)=>value is JContainer container ? container.Descendants().OfType<JObject>().Where(o=>o["operationId"]!=null&&o["revision"]!=null) : Enumerable.Empty<JObject>();
 JObject WithoutConfirmations(JObject value){var result=(JObject)value.DeepClone();foreach(var item in Audits(result)){item.Remove("actorId");item.Remove("confirmedAt");}return result;}
 foreach(var request in (JArray)corpus["requests"]!){
  var q=(JObject)request.DeepClone();var known=Audits(store.Row.State).ToDictionary(v=>(string)v["operationId"]!);
  foreach(var entry in Audits(q["candidateState"]!))if(known.TryGetValue((string)entry["operationId"]!,out var confirmed)){entry["actorId"]=confirmed["actorId"]?.DeepClone();entry["confirmedAt"]=confirmed["confirmedAt"]?.DeepClone();}
  store.Receipt=null;var response=Protocol.Commit(q.ToString(),actor,true,store);
  if((string?)response["status"]!="saved"||!JToken.DeepEquals(Protocol.Canonical(WithoutConfirmations((JObject)response["state"]!)),Protocol.Canonical(WithoutConfirmations((JObject)q["candidateState"]!)))||(string?)response["targetEventId"]!=(string?)q["targetEventId"])throw new Exception("v2 parity failed: "+q["operationId"]);
  foreach(var entry in Audits(response["state"]!).Where(v=>(string?)v["operationId"]==(string?)q["operationId"]))if((string?)entry["actorId"]!=actor.ToString("D")||entry["confirmedAt"]==null)throw new Exception("Missing server confirmation");
 }

});
if(args.Length>3) {
 using var reader=new Newtonsoft.Json.JsonTextReader(new StringReader(File.ReadAllText(args[3]))){DateParseHandling=Newtonsoft.Json.DateParseHandling.None};
 var file=JObject.Load(reader);var stored=file["state"] as JObject ?? file;
 Check("actual local legacy schema stays rejected by Microsoft policy",()=>{try{StatePolicy.Validate(stored,stored);}catch(ArgumentException ex){if(ex.Message=="Unsupported schema.")return;throw;}throw new Exception("Legacy schema unexpectedly accepted");});
 Check("actual local corpus closed fields validate after explicit in-memory schema-only projection",()=>{var projected=(JObject)stored.DeepClone();foreach(var e in StatePolicy.Events(projected))e.Value["schemaVersion"]=2;StatePolicy.Validate(projected,projected);});
}
CorrectionTests.Run(Check,seed);
OrderStatusTests.Run(Check,seed);
EventContextTests.Run(Check,seed);
LocationTests.Run(Check,seed);
GuardTests.Run(Check);
WrapperTests.Run(Check);
RequestBindingTests.Run(Check,seed);
Console.WriteLine($"Policy tests: {passed} passed, {failed} failed");
return failed == 0 ? 0 : 1;

sealed class FakeStore : IKitchenStore
{
    public static readonly Guid WorkspaceId = Guid.Parse("11111111-2222-4333-8444-555555555555");
    public Workspace Row; public ReceiptRecord? Receipt; public int Writes; public string? CasVersion; public bool FailCas; public bool FailAfterWrite;
    public FakeStore(JObject seed)
    {
        Row = new Workspace { Id = WorkspaceId, State = (JObject)seed.DeepClone(), Revision = 0, RowVersion = "original-rowversion", CanWrite = true };
    }
    public Workspace Read(Guid id) => Row;
    public ReceiptRecord? FindReceipt(Guid id, string operation) => Receipt;
    public void Commit(Workspace prior, JObject next, string operationId, string hash, Guid actor, DateTime timestamp)
    {
        if (FailCas)
            throw new InvalidOperationException("CAS race");
        Writes++;
        if(FailAfterWrite)throw new ArgumentException("storage fault after write began");
        CasVersion = prior.RowVersion;
        Row.State = next;
        Row.Revision = (int)next["revision"]!;
        Receipt = new ReceiptRecord { Hash = hash, Actor = actor, AppliedRevision = Row.Revision };
    }
}
