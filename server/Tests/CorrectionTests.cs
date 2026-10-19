using Newtonsoft.Json.Linq;
using Zunftkueche;
static class CorrectionTests
{
    internal static readonly Guid Actor = Guid.Parse("77777777-8888-4999-aaaa-bbbbbbbbbbbb");
    internal static JObject Request(JObject s, JObject c, string type = "article.price", string id = "correction-test") => new JObject { { "protocolVersion", 2 }, { "workspaceId", FakeStore.WorkspaceId.ToString("D") }, { "identity", new JObject { { "organizationId", Guid.Empty.ToString("D") }, { "userId", Guid.Empty.ToString("D") }, { "workspaceId", FakeStore.WorkspaceId.ToString("D") } } }, { "targetEventId", s["event"]!["id"]!.DeepClone() }, { "operationId", id }, { "expectedRevision", s["revision"]!.DeepClone() }, { "operation", new JObject { { "type", type }, { "payload", new JObject() } } }, { "candidateState", c } };
    internal static void Assert(bool v)
    {
        if (!v)
            throw new Exception("correction assertion failed");
    }
    internal static JObject Manual(JObject seed)
    {
        var s = (JObject)seed.DeepClone();
        var r = (JObject)s["invoices"]![0]!.DeepClone();
        r.Remove("source");
        r.Remove("localPath");
        r["id"] = "manual";
        r["number"] = "TEST-MANUAL";
        r["status"] = "Erfasst";
        ((JArray)s["invoices"]!).Add(r);
        return s;
    }
    static JObject Snapshot(JObject r)
    {
        var x = (JObject)r.DeepClone();
        foreach (var key in new[] { "sourceBaseline", "corrections", "corrected" })
            x.Remove(key);
        return x;
    }
    static JObject CorrectReceipt(JObject s, string id = "fix")
    {
        var c = (JObject)s.DeepClone();
        var r = (JObject)c["invoices"]!.Last!;
        var before = Snapshot(r);
        r["grossCents"] = 9999999;
        r["sourceBaseline"] ??= before.DeepClone();
        r["corrected"] = true;
        r["corrections"] = new JArray(new JObject { { "operationId", id }, { "revision", 1 }, { "before", before }, { "after", Snapshot(r) }, { "reason", "Abgelesen" }, { "actorId", Guid.NewGuid().ToString("D") }, { "confirmedAt", "2000-01-01T00:00:00Z" } });
        return c;
    }
    public static void Run(Action<string, Action> check, JObject seed)
    {
        check("manual baseline migration stamps actor time and retries exactly once", () =>
        {
            var s = Manual(seed);
            var c = CorrectReceipt(s);
            var store = new FakeStore(s);
            var q = Request(s, c, "invoice.correct");
            var raw = q.ToString();
            var start = DateTimeOffset.UtcNow;
            var response = Protocol.Commit(raw, Actor, true, store);
            Assert((string?)response["status"] == "saved");
            var r = (JObject)store.Row.State["invoices"]!.Last!;
            var entry = r["corrections"]![0]!;
            Assert((string?)entry["actorId"] == Actor.ToString("D") && DateTimeOffset.Parse((string)entry["confirmedAt"]!) >= start && (string?)entry["operationId"] == "correction-test" && (int?)entry["revision"] == 1);
            Assert(r["source"] == null && r["sourceBaseline"]!["source"] == null && JToken.DeepEquals(r["sourceBaseline"], Snapshot((JObject)s["invoices"]!.Last!)));
            Assert((string?)Protocol.Commit(raw, Actor, true, store)["status"] == "saved" && store.Writes == 1);
            foreach (var attack in new[] { "trim", "before", "after", "baseline", "source", "actor", "time", "value" })
            {
                var changed = (JObject)store.Row.State.DeepClone();
                var invoice = changed["invoices"]!.Last!;
                switch (attack)
                {
                    case "trim":
                        invoice["corrections"] = new JArray();
                        break;
                    case "before":
                    case "after":
                        invoice["corrections"]![0]![attack]!["grossCents"] = 1;
                        break;
                    case "baseline":
                        invoice["sourceBaseline"]!["grossCents"] = 1;
                        break;
                    case "source":
                        invoice["source"] = s["invoices"]![0]!["source"]!.DeepClone();
                        break;
                    case "actor":
                        invoice["corrections"]![0]!["actorId"] = Guid.NewGuid().ToString("D");
                        break;
                    case "time":
                        invoice["corrections"]![0]!["confirmedAt"] = "2000-01-01T00:00:00Z";
                        break;
                    default:
                        invoice["grossCents"] = 8888888;
                        break;
                }
                var st = new FakeStore(store.Row.State) { Row = { Revision = 1 } };
                Assert((string?)Protocol.Commit(Request(st.Row.State, changed, id: "attack").ToString(), Actor, true, st)["status"] == "rejected" && st.Writes == 0);
            }
        });
        check("imported provenance cannot be removed swapped or history fabricated", () => { foreach (var attack in new[] { "remove", "swap", "empty-reason", "wrong-after" }) { var s = (JObject)seed.DeepClone(); var c = CorrectReceipt(s); var r = (JObject)c["invoices"]!.Last!; if (attack == "remove") r.Remove("source"); if (attack == "swap") r["source"]!["hash"] = new string('a', 64); if (attack == "empty-reason") r["corrections"]![0]!["reason"] = " "; if (attack == "wrong-after") r["corrections"]![0]!["after"]!["grossCents"] = 2; var st = new FakeStore(s); Assert((string?)Protocol.Commit(Request(s, c, "invoice.correct").ToString(), Actor, true, st)["status"] == "rejected"); } });
        check("movement sale corrections preserve originals bind effective before and protect prior events", () =>
        {
            foreach (var kind in new[] { "movement", "sale" })
            {
                var s = (JObject)seed.DeepClone();
                bool movement = kind == "movement";
                var collection = movement ? "movements" : "sales";
                var field = movement ? "movementCorrections" : "salePriceCorrections";
                ((JArray)s[collection]!).Add(movement ? new JObject { { "id", "target" }, { "articleId", "a-1" }, { "day", "Freitag" }, { "type", "Lieferung" }, { "quantity", 100 }, { "location", "Küche" } } : new JObject { { "id", "target" }, { "menuId", "m-1" }, { "day", "Freitag" }, { "quantity", 2 }, { "priceCents", 50 } });
                var c = (JObject)s.DeepClone();
                c[field] = new JArray(new JObject { { "operationId", "proposed" }, { "revision", 999 }, { "targetId", "target" }, { "before", movement ? 100 : 50 }, { "after", movement ? 10 : 500 }, { "reason", "Zahlendreher" } });
                var st = new FakeStore(s);
                var q = Request(s, c, movement ? "movement.correct" : "sales.correctPrice");
                Assert((string?)Protocol.Commit(q.ToString(), Actor, true, st)["status"] == "saved");
                Assert(JToken.DeepEquals(st.Row.State[collection], s[collection]));
                Assert((string?)st.Row.State[field]![0]!["actorId"] == Actor.ToString("D"));
                foreach (var attack in new[] { "negative", "wrong-before", "unknown", "remove-history", "rewrite-original" })
                {
                    var target = (JObject)st.Row.State.DeepClone();
                    var row = target[field]![0]!;
                    if (attack == "negative")
                        row["after"] = -1;
                    if (attack == "wrong-before")
                        row["before"] = 2;
                    if (attack == "unknown")
                        row["targetId"] = "none";
                    if (attack == "remove-history")
                        target[field] = new JArray();
                    if (attack == "rewrite-original")
                        target[collection]![0]![movement ? "quantity" : "priceCents"] = 2;
                    try
                    {
                        StatePolicy.Validate(target, st.Row.State);
                        throw new Exception("tampering accepted");
                    }
                    catch (ArgumentException) { }
                }
            }
        });
        check("new event cannot fabricate posted correction history", () => { var c = (JObject)seed.DeepClone(); c["event"]!["id"] = "new-event"; c["invoices"] = new JArray(); var old = (JObject)seed.DeepClone(); foreach (var key in new[] { "revision", "operationIds", "operationRequests" }) old.Remove(key); c["archivedEvents"] = new JArray(old); ((JArray)c["movements"]!).Add(new JObject { { "id", "invented" }, { "articleId", "a-1" }, { "day", "Freitag" }, { "type", "Lieferung" }, { "quantity", 100 }, { "location", "Küche" } }); c["movementCorrections"] = new JArray(new JObject { { "operationId", "invented-correction" }, { "revision", 0 }, { "targetId", "invented" }, { "before", 100 }, { "after", 10 }, { "reason", "Invented history" } }); var st = new FakeStore(seed); st.Row.CanConfigure = true; Assert((string?)Protocol.Commit(Request(seed, c, "event.create").ToString(), Actor, true, st)["status"] == "rejected"); });
        check("manual source-less invoice cannot bypass correction history", () => { var s = Manual(seed); var c = (JObject)s.DeepClone(); c["invoices"]!.Last!["grossCents"] = 9999999; var st = new FakeStore(s); Assert((string?)Protocol.Commit(Request(s, c).ToString(), Actor, true, st)["status"] == "rejected" && st.Writes == 0); });
        check("source-less invoice cannot invent or swap provenance", () => { var s = Manual(seed); var c = (JObject)s.DeepClone(); c["invoices"]!.Last!["source"] = s["invoices"]![0]!["source"]!.DeepClone(); var st = new FakeStore(s); Assert((string?)Protocol.Commit(Request(s, c).ToString(), Actor, true, st)["status"] == "rejected"); });
    }
}
