using Newtonsoft.Json.Linq;
using Zunftkueche;
static class OrderStatusTests
{
    static JObject Prepared(JObject seed)
    {
        var s = (JObject)seed.DeepClone();
        var first = s["planLines"]![0]!;
        var lines = new JArray(s["planLines"]!.Where(l => (string?)l["supplierId"] == (string?)first["supplierId"] && (string?)l["day"] == (string?)first["day"]).Select(l => l.DeepClone()));
        var groups = new JArray(lines.GroupBy(l => (string?)l["time"]).Select(g => new JObject { { "time", g.Key == null ? JValue.CreateNull() : new JValue(g.Key) }, { "lines", new JArray(g.Select(l => l.DeepClone())) } }));
        ((JArray)s["orders"]!).Add(new JObject { { "id", "order" }, { "supplierId", first["supplierId"]!.DeepClone() }, { "day", first["day"]!.DeepClone() }, { "status", "Vorbereitet" }, { "createdAt", "2026-10-19T10:00:00Z" }, { "lines", lines }, { "groups", groups }, { "totalCents", JValue.CreateNull() } });
        return s;
    }
    public static void Run(Action<string, Action> check, JObject seed)
    {
        check("order marked manually then confirmed with immutable contents and server audit", () =>
        {
            var s = Prepared(seed);
            var original = s["orders"]![0]!.DeepClone();
            foreach (var status in new[] { "bestellt", "bestaetigt" })
            {
                var c = (JObject)s.DeepClone();
                var order = c["orders"]![0]!;
                order["status"] = status;
                order["statusHistory"] ??= new JArray();
                ((JArray)order["statusHistory"]!).Add(new JObject { { "operationId", "client" }, { "revision", 99 }, { "status", status }, { "note", "Telefonisch" } });
                var st = new FakeStore(s);
                st.Row.Revision = (int)s["revision"]!;
                var q = CorrectionTests.Request(s, c, "order.mark", status);
                CorrectionTests.Assert((string?)Protocol.Commit(q.ToString(), CorrectionTests.Actor, true, st)["status"] == "saved");
                s = st.Row.State;
                CorrectionTests.Assert(JToken.DeepEquals(s["orders"]![0]!["lines"], original["lines"]) && (string?)s["orders"]![0]!["statusHistory"]!.Last!["actorId"] == CorrectionTests.Actor.ToString("D"));
            }
            foreach (var attack in new[] { "remove", "contents", "status", "history" })
            {
                var c = (JObject)s.DeepClone();
                if (attack == "remove")
                    c["orders"] = new JArray();
                if (attack == "contents")
                    c["orders"]![0]!["createdAt"] = "2000-01-01T00:00:00Z";
                if (attack == "status")
                    c["orders"]![0]!["status"] = "Vorbereitet";
                if (attack == "history")
                    c["orders"]![0]!["statusHistory"]![0]!["note"] = "changed";
                try
                {
                    StatePolicy.Validate(c, s);
                    throw new Exception("order history changed");
                }
                catch (ArgumentException) { }
            }
        });
        check("confirmation cannot skip ordered status or invent history on a new order", () => { var s = Prepared(seed); var c = (JObject)s.DeepClone(); c["orders"]![0]!["status"] = "bestaetigt"; c["orders"]![0]!["statusHistory"] = new JArray(new JObject { { "operationId", "x" }, { "revision", 1 }, { "status", "bestaetigt" }, { "note", "" } }); var st = new FakeStore(s); CorrectionTests.Assert((string?)Protocol.Commit(CorrectionTests.Request(s, c, "order.mark").ToString(), CorrectionTests.Actor, true, st)["status"] == "rejected"); });
    }
}
