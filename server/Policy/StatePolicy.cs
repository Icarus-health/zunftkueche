using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
namespace Zunftkueche
{
    public static class StatePolicy
    {
        public const int StateBytes = 524288;
        static readonly string[] Collections = { "suppliers", "articles", "planLines", "menu", "invoices", "sales", "movements", "orders", "dishPlan", "lessons" };
        static readonly HashSet<string> Days = new HashSet<string> { "Mittwoch", "Freitag", "Samstag", "Sonntag", "Allgemein" };
        public static void Require(bool condition, string message)
        {
            if (!condition)
                throw new ArgumentException(message);
        }
        public static JObject Obj(JToken? token)
        {
            Require(token is JObject, "Object required.");
            return (JObject)token!;
        }
        public static JArray Arr(JToken? token)
        {
            Require(token is JArray, "Array required.");
            return (JArray)token!;
        }
        public static string Str(JToken? token, int max = 200, bool empty = false)
        {
            Require(token?.Type == JTokenType.String, "String required.");
            var s = (string)token!;
            Require(s.Length <= max && (empty || !string.IsNullOrWhiteSpace(s)), "Invalid string.");
            return s;
        }
        static bool Null(JToken? t) => t == null || t.Type == JTokenType.Null;
        public static decimal Number(JToken? t, decimal max, int precision = 0, bool nullable = false)
        {
            if (nullable && Null(t))
                return 0;
            Require(t?.Type == JTokenType.Integer || t?.Type == JTokenType.Float, "Number required.");
            decimal n;
            try
            {
                n = t!.Value<decimal>();
            }
            catch { throw new ArgumentException("Nonfinite number."); }
            Require(n >= 0 && n <= max && decimal.Round(n, precision) == n, "Invalid number or precision.");
            return n;
        }
        static void Money(JToken? t, bool precise = false)
        {
            Require(t != null, "Required money field missing.");
            Number(t, 100000000, precise ? 2 : 0, true);
        }
        static void Quantity(JToken? t, bool nullable = true)
        {
            Require(t != null, "Required quantity field missing.");
            Number(t, 10000000, 4, nullable);
        }
        static void OptionalString(JObject o, string name, int max = 200)
        {
            if (!Null(o[name]))
                Str(o[name], max, true);
        }
        static void Day(JToken? t)
        {
            Require(Days.Contains(Str(t, 50)), "Invalid day.");
        }
        static void Date(JToken? t)
        {
            if (Null(t))
                return;
            DateTime d;
            Require(DateTime.TryParseExact(Str(t, 10), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out d), "Invalid date.");
        }
        static void Source(JToken? t)
        {
            if (Null(t))
                return;
            var s = Obj(t);
            Fields(s,"file hash sheet cells page");
            Str(s["file"], 2048);
            Require(Regex.IsMatch(Str(s["hash"], 64), "^[0-9a-fA-F]{64}$"), "Invalid source hash.");
            OptionalString(s, "sheet");
            OptionalString(s, "cells");
            if (!Null(s["page"]))
                Require(Number(s["page"], 100000) > 0, "Invalid source page.");
        }
        static void Bounds(JToken t, int depth = 0)
        {
            Require(depth <= 32, "JSON too deep.");
            if (t is JObject o)
            {
                Require(o.Count <= 10000, "Too many properties.");
                foreach (var p in o.Properties())
                {
                    Require(p.Name.Length <= 200, "Property name too long.");
                    Bounds(p.Value, depth + 1);
                }
            }
            else if (t is JArray a)
            {
                Require(a.Count <= 10000, "Collection too large.");
                foreach (var v in a)
                    Bounds(v, depth + 1);
            }
            else if (t.Type == JTokenType.String)
                Require(((string)t!).Length <= 50000, "Text too large.");
            else if (t.Type == JTokenType.Float)
            {
                double v = t.Value<double>();
                Require(!double.IsNaN(v) && !double.IsInfinity(v), "Nonfinite number.");
            }
        }
        static Dictionary<string, JObject> Index(JToken? t)
        {
            var rows = Arr(t);
            var result = new Dictionary<string, JObject>(StringComparer.Ordinal);
            foreach (var v in rows)
            {
                var o = Obj(v);
                var id = Str(o["id"], 500);
                Require(!result.ContainsKey(id), "Duplicate entity ID.");
                result.Add(id, o);
                Source(o["source"]);
            }
            return result;
        }
        static string Ref(JObject o, string field, Dictionary<string, JObject> rows)
        {
            var id = Str(o[field], 500);
            Require(rows.ContainsKey(id), "Broken reference: " + field);
            return id;
        }
        static void Same(JToken? a, JToken? b, string message) => Require(JToken.DeepEquals(a, b), message);
        static JObject Snapshot(JObject receipt)
        {
            var clone = (JObject)receipt.DeepClone();
            clone.Remove("sourceBaseline");
            clone.Remove("corrected");
            clone.Remove("corrections");
            return clone;
        }
        static JArray Economics(JObject r) => new JArray(new[] { "supplierId", "number", "date", "grossCents", "netCents", "lines" }.Select(k => r[k]?.DeepClone() ?? JValue.CreateNull()));
        static string InvoiceKey(JObject r) => Str(r["supplierId"], 500) + "\n" + Str(r["number"], 100).Trim().ToUpperInvariant();
        static void Receipt(JObject r, Dictionary<string, JObject> suppliers, Dictionary<string, JObject> articles, bool snapshot = false)
        {
            Fields(r,"id supplierId number date grossCents netCents scope status documentUrl localPath source lines" + (snapshot ? "" : " sourceBaseline corrected corrections"));
            Ref(r, "supplierId", suppliers);
            Str(r["number"], 100);
            Str(r["scope"], 100);
            Str(r["status"], 100);
            Money(r["grossCents"]);
            Money(r["netCents"]);
            Date(r["date"]);
            Source(r["source"]);
            OptionalString(r, "localPath", 2048);
            if (!Null(r["grossCents"]) && !Null(r["netCents"]))
                Require(r["netCents"]!.Value<decimal>() <= r["grossCents"]!.Value<decimal>(), "Net exceeds gross.");
            if (!Null(r["documentUrl"]))
            {
                Uri? u;
                Require(Uri.TryCreate(Str(r["documentUrl"], 2048), UriKind.Absolute, out u) && u != null && u.Scheme == "https" && u.Host.EndsWith(".sharepoint.com", StringComparison.OrdinalIgnoreCase) && u.UserInfo.Length == 0, "Invalid document URL.");
            }
            var lines = Arr(r["lines"]);
            Require(lines.Count <= 200, "Too many receipt lines.");
            foreach (var v in lines)
            {
                var l = Obj(v);
                Fields(l,"articleId name quantity unit netCents");
                Str(l["name"]);
                Str(l["unit"], 50);
                Quantity(l["quantity"]);
                Money(l["netCents"]);
                if (!Null(l["articleId"]))
                {
                    var a = articles[Ref(l, "articleId", articles)];
                    Same(a["supplierId"], r["supplierId"], "Receipt article supplier mismatch.");
                }
            }
        }
        static void Plan(JObject p, Dictionary<string, JObject> suppliers, Dictionary<string, JObject> articles)
        {
            Fields(p,"id articleId supplierId name quantity unit day time unitPriceCents note lesson category location source purchaseGenerated purchaseForWeekend");
            var article = articles[Ref(p, "articleId", articles)];
            Ref(p, "supplierId", suppliers);
            Same(article["supplierId"], p["supplierId"], "Plan supplier mismatch.");
            Str(p["name"]);
            Str(p["unit"], 50);
            Quantity(p["quantity"]);
            Money(p["unitPriceCents"], true);
            Day(p["day"]);
            if (!Null(p["time"]))
                Require(Regex.IsMatch(Str(p["time"], 5), "^([01][0-9]|2[0-3]):[0-5][0-9]$"), "Invalid time.");
            OptionalString(p, "note", 1000);
            OptionalString(p, "lesson", 1000);
            OptionalString(p, "location", 100);
            OptionalString(p, "category", 100);
            foreach (var b in new[] { "purchaseGenerated", "purchaseForWeekend" })
                if (p[b] != null)
                    Require(p[b]!.Type == JTokenType.Boolean, "Invalid purchase flag.");
        }
        static void Event(JObject e, JObject? previous)
        {
            Require(Number(e["schemaVersion"], 2) == 2, "Unsupported schema.");
            Fields(e,"schemaVersion event suppliers articles planLines menu invoices sales movements orders dishPlan lessons sourceNotice revision operationIds operationRequests archivedEvents");
            var ev = Obj(e["event"]);
            Fields(ev,"id name year status dates deliveryAddress contact locations purchasingLocation");
            OptionalString(ev,"deliveryAddress",1000);OptionalString(ev,"contact",200);OptionalString(ev,"purchasingLocation",100);
            if(ev["locations"]!=null) {
                var names=new HashSet<string>();var aliases=new HashSet<string>();
                var historical=new HashSet<string>(Arr(e["planLines"]).Concat(Arr(e["movements"])).Select(v=>(string?)v["location"]??"").Concat(Arr(e["invoices"]).Select(v=>(string?)v["scope"]??"")));
                Require(Arr(ev["locations"]).Count<=100,"Too many locations.");
                foreach(var item in Arr(ev["locations"])) {var location=Obj(item);Fields(location,"name historicalNames");Require(names.Add(Str(location["name"],100)),"Duplicate location.");foreach(var alias in Arr(location["historicalNames"]))Require(historical.Contains(Str(alias,100))&&aliases.Add(Str(alias,100)),"Invalid historical location mapping.");}
            }
            if(ev["locations"] is JArray configured) {
                var active=new HashSet<string>(configured.Select(l=>Str(l["name"],100)));
                foreach(var l in configured)foreach(var alias in Arr(l["historicalNames"]))Require((string?)alias==(string?)l["name"]||!active.Contains(Str(alias,100)),"Alias conflicts with another active place.");
                if(!Null(ev["purchasingLocation"]))Require(active.Contains(Str(ev["purchasingLocation"],100)),"Purchasing location must be active.");
            } else if(!Null(ev["purchasingLocation"])) Require(new[]{"Küche","Bar","Zunftscheuer","Brunnen","Mitwirkende / Aufbau / Probe"}.Contains(Str(ev["purchasingLocation"],100)),"Purchasing location must be active.");
            Str(ev["id"], 500);
            Str(ev["name"]);
            Str(ev["status"], 100);
            Require(Number(ev["year"], 2200) >= 1900, "Invalid year.");
            foreach (var date in Obj(ev["dates"]).Properties())
            {
                Day(new JValue(date.Name));
                Date(date.Value);
            }
            Str(e["sourceNotice"], 4000, true);
            var maps = Collections.ToDictionary(k => k, k => Index(e[k]));
            var suppliers = maps["suppliers"];
            var articles = maps["articles"];
            var menu = maps["menu"];
            foreach (var s in suppliers.Values)
            {
                Fields(s,"id name email");
                Str(s["name"]);
                if (!Null(s["email"]))
                    Require(Regex.IsMatch(Str(s["email"], 254), @"^[^\s@]+@[^\s@]+\.[^\s@]+$"), "Invalid email.");
            }
            foreach (var a in articles.Values)
            {
                Fields(a,"id name supplierId unit category unitPriceCents packSize previousUnitPriceCents priceReferenceYear");
                Ref(a, "supplierId", suppliers);
                Str(a["name"]);
                Str(a["unit"], 50);
                Str(a["category"], 100);
                Money(a["unitPriceCents"], true);
                if (a["previousUnitPriceCents"] != null)
                    Money(a["previousUnitPriceCents"], true);
                if (!Null(a["packSize"]))
                    Require(Number(a["packSize"], 10000000, 4) > 0, "Invalid pack size.");
                if (!Null(a["priceReferenceYear"]))
                    Require(Number(a["priceReferenceYear"], 2200) >= 1900, "Invalid price year.");
            }
            foreach (var p in maps["planLines"].Values)
                Plan(p, suppliers, articles);
            foreach (var m in menu.Values)
            {
                Fields(m,"id name priceCents category recipe recipeStatus source");
                Str(m["name"]);
                Str(m["category"], 100);
                Str(m["recipeStatus"], 100);
                Money(m["priceCents"]);
                var recipe = Arr(m["recipe"]);
                Require(recipe.Count <= 30, "Recipe too large.");
                var refs = new HashSet<string>();
                foreach (var v in recipe)
                {
                    var l = Obj(v);
                    Fields(l,"articleId quantity");
                    Require(refs.Add(Ref(l, "articleId", articles)), "Duplicate recipe article.");
                    Quantity(l["quantity"]);
                }
                if ((string?)m["recipeStatus"] == "Bestätigt")
                    Require(recipe.Count > 0 && recipe.All(l => !Null(l["quantity"]) && l["quantity"]!.Value<decimal>() > 0), "Confirmed recipe incomplete.");
            }
            foreach (var r in maps["invoices"].Values)
            {
                Receipt(r, suppliers, articles);
                if (r["corrected"] != null)
                    Require(r["corrected"]!.Type == JTokenType.Boolean, "Invalid correction flag.");
                if (r["sourceBaseline"] != null)
                {
                    Receipt(Obj(r["sourceBaseline"]), suppliers, articles, true);
                    Require(!Null(r["source"]), "Baseline without source.");
                }
                if (r["corrections"] != null)
                    foreach (var v in Arr(r["corrections"]))
                    {
                        var c = Obj(v);
                        Fields(c,"operationId revision before");
                        Str(c["operationId"], 100);
                        Number(c["revision"], int.MaxValue);
                        Receipt(Obj(c["before"]), suppliers, articles, true);
                    }
            }
            foreach (var group in maps["invoices"].Values.GroupBy(InvoiceKey).Where(g => g.Count() > 1))
            {
                // Imported Rewe list entries already share a label. Only their unchanged identities are grandfathered.
                Require(previous != null, "Duplicate supplier invoice number.");
                var old = Index(previous!["invoices"]);
                foreach (var r in group)
                    Require(old.TryGetValue((string)r["id"]!, out var prior) && InvoiceKey(prior) == group.Key, "Duplicate supplier invoice number.");
            }
            var saleKeys = new HashSet<string>();
            foreach (var s in maps["sales"].Values)
            {
                Fields(s,"id menuId day quantity priceCents");
                Ref(s, "menuId", menu);
                Day(s["day"]);
                Number(s["quantity"], 10000000, 0, true);
                Money(s["priceCents"]);
                Require(saleKeys.Add((string)s["menuId"]! + "\n" + (string)s["day"]!), "Duplicate sale.");
            }
            var dishKeys = new HashSet<string>();
            foreach (var d in maps["dishPlan"].Values)
            {
                Fields(d,"id menuId day quantity");
                Ref(d, "menuId", menu);
                Require((string?)d["day"] == "Freitag" || (string?)d["day"] == "Samstag", "Invalid dish day.");
                Number(d["quantity"], 10000000, 0, true);
                Require(dishKeys.Add((string)d["menuId"]! + "\n" + (string)d["day"]!), "Duplicate dish plan.");
            }
            foreach (var m in maps["movements"].Values)
            {
                Fields(m,"id articleId day type quantity location note");
                Ref(m, "articleId", articles);
                Day(m["day"]);
                Quantity(m["quantity"], false);
                Str(m["location"], 100);
                OptionalString(m, "note", 1000);
                Require(new[] { "Anfangsbestand", "Lieferung", "Zählung", "Verbrauch", "Abfall", "Rückgabe" }.Contains(Str(m["type"], 50)), "Invalid movement type.");
            }
            var previousOrders = previous == null ? null : Index(previous["orders"]);
            foreach (var o in maps["orders"].Values)
            {
                Fields(o,"id supplierId day status createdAt lines groups totalCents context");
                Ref(o, "supplierId", suppliers);
                Day(o["day"]);
                // Absent context is a legacy snapshot; never reconstruct its history.
                if (o["context"] != null)
                {
                    var context = Obj(o["context"]);
                    Fields(context,"supplierName eventName eventYear deliveryDate deliveryAddress contact");
                    OptionalString(context,"deliveryAddress",1000);OptionalString(context,"contact",200);
                    Str(context["supplierName"]);
                    Str(context["eventName"]);
                    Require(Number(context["eventYear"], 2200) >= 1900, "Invalid order event year.");
                    Require(context["deliveryDate"] != null, "Order delivery date must be explicit, including null.");
                    Date(context["deliveryDate"]);
                    if (previousOrders != null && !previousOrders.ContainsKey((string)o["id"]!))
                    {
                        if(context["deliveryAddress"]!=null || ev["deliveryAddress"]!=null)Same(context["deliveryAddress"],ev["deliveryAddress"]??new JValue(""),"Order address mismatch.");
                        if(context["contact"]!=null || ev["contact"]!=null)Same(context["contact"],ev["contact"]??new JValue(""),"Order contact mismatch.");
                        var supplier = suppliers[(string)o["supplierId"]!];
                        Same(context["supplierName"], supplier["name"], "New order supplier context mismatch.");
                        Same(context["eventName"], ev["name"], "New order event context mismatch.");
                        Same(context["eventYear"], ev["year"], "New order year context mismatch.");
                        Same(context["deliveryDate"], ev["dates"]![(string)o["day"]!] ?? JValue.CreateNull(), "New order date context mismatch.");
                    }
                }
                Require((string?)o["status"] == "Vorbereitet", "Invalid order status.");
                DateTimeOffset dt;
                Require(DateTimeOffset.TryParse(Str(o["createdAt"], 50), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out dt), "Invalid snapshot timestamp.");
                var lines = Arr(o["lines"]);
                Require(lines.Count > 0, "Empty order.");
                foreach (var l in lines)
                {
                    var p = Obj(l);
                    Plan(p, suppliers, articles);
                    Require(!Null(p["quantity"]), "Order quantity missing.");
                    Same(p["supplierId"], o["supplierId"], "Order supplier mismatch.");
                    Same(p["day"], o["day"], "Order day mismatch.");
                }
                var lineIds = lines.Select(l => Str(l["id"], 500)).ToList();
                Require(lineIds.Distinct().Count() == lineIds.Count, "Duplicate order line.");
                var groups = Arr(o["groups"]);
                var grouped = new List<JToken>();
                foreach (var g in groups)
                {
                    var group = Obj(g);
                    Fields(group,"time lines");
                    foreach (var l in Arr(group["lines"]))
                    {
                        Same(l["time"], group["time"], "Snapshot grouping time mismatch.");
                        grouped.Add(l);
                    }
                }
                Require(grouped.Count == lines.Count && lines.All(l => grouped.Count(g => JToken.DeepEquals(l, g)) == 1), "Snapshot grouping mismatch.");
                Money(o["totalCents"]);
                bool complete = lines.All(l => !Null(l["unitPriceCents"]));
                if (complete)
                {
                    var total = decimal.Round(lines.Sum(l => l["quantity"]!.Value<decimal>() * l["unitPriceCents"]!.Value<decimal>()), 0, MidpointRounding.AwayFromZero);
                    Require(!Null(o["totalCents"]) && o["totalCents"]!.Value<decimal>() == total, "Order snapshot total mismatch.");
                }
                else
                    Require(Null(o["totalCents"]), "Incomplete order prices require null total.");
            }
            if(previous != null && ev["locations"] is JArray activeConfiguration) {
                var active=new HashSet<string>(activeConfiguration.Select(l=>Str(l["name"],100)));
                var historical=new HashSet<string>(Arr(previous["planLines"]).Concat(Arr(previous["movements"])).Select(l=>(string?)l["location"]??"Küche").Concat(Arr(previous["invoices"]).Select(l=>(string?)l["scope"]??"")));
                foreach(var kind in new[]{"movements","planLines","invoices"}) {
                    var prior=Index(previous[kind]);var field=kind=="invoices"?"scope":"location";
                    foreach(var row in maps[kind]) {
                        var location=(string?)row.Value[field]??"Küche";
                        if(!prior.TryGetValue(row.Key,out var oldRow))Require(active.Contains(location),"New entry location must be active.");
                        else if(!JToken.DeepEquals(oldRow[field],row.Value[field]))Require(active.Contains(location)||(kind=="invoices"&&historical.Contains(location)),"Changed entry location must be active or an existing receipt correction location.");
                    }
                }
            }
            foreach(var lesson in maps["lessons"].Values) {Fields(lesson,"id note");Str(lesson["note"],4000,true);}
            if (previous == null)
                return;
            foreach (var k in Collections)
            {
                var old = Index(previous[k]);
                var now = maps[k];
                if (k == "orders" || k == "movements" || k == "lessons")
                {
                    var before = Arr(previous[k]);
                    var after = Arr(e[k]);
                    Require(after.Count >= before.Count, "Append-only history removed.");
                    for (int i = 0; i < before.Count; i++)
                        Same(before[i], after[i], "Append-only history changed or reordered.");
                }
                foreach (var pair in old)
                {
                    var p = pair.Value;
                    if (!Null(p["source"]))
                    {
                        Require(now.ContainsKey(pair.Key), "Source record removed.");
                        Same(p["source"], now[pair.Key]["source"], "Source provenance changed.");
                        Same(p["localPath"], now[pair.Key]["localPath"], "Source path changed.");
                    }
                    if (k == "orders" || k == "movements" || k == "lessons")
                    {
                        Require(now.ContainsKey(pair.Key), "Append-only history removed.");
                        Same(p, now[pair.Key], "Append-only history changed.");
                    }
                }
            }
            foreach (var p in Index(previous["sales"]))
            {
                Require(maps["sales"].ContainsKey(p.Key), "Sale history removed.");
                var n = maps["sales"][p.Key];
                Same(p.Value["menuId"], n["menuId"], "Sale identity changed.");
                Same(p.Value["day"], n["day"], "Sale day changed.");
                if (!Null(p.Value["priceCents"]))
                    Same(p.Value["priceCents"], n["priceCents"], "Recorded sale price changed.");
            }
            foreach (var p in Index(previous["articles"]))
                if (articles.ContainsKey(p.Key))
                {
                    bool used = Arr(previous["planLines"]).Any(l => (string?)l["articleId"] == p.Key) || Arr(previous["movements"]).Any(l => (string?)l["articleId"] == p.Key) || Arr(previous["menu"]).Any(m => Arr(m["recipe"]).Any(l => (string?)l["articleId"] == p.Key)) || Arr(previous["invoices"]).Any(r => Arr(r["lines"]).Any(l => (string?)l["articleId"] == p.Key)) || Arr(previous["orders"]).Any(o => Arr(o["lines"]).Any(l => (string?)l["articleId"] == p.Key));
                    if (used)
                    {
                        Same(p.Value["unit"], articles[p.Key]["unit"], "Referenced article unit changed.");
                        Same(p.Value["supplierId"], articles[p.Key]["supplierId"], "Referenced article supplier changed.");
                    }
                }
            foreach (var pair in Index(previous["invoices"]))
            {
                var old = pair.Value;
                if (Null(old["source"]))
                    continue;
                Require(maps["invoices"].ContainsKey(pair.Key), "Source invoice removed.");
                var n = maps["invoices"][pair.Key];
                Same(old["status"], n["status"], "Source status changed.");
                if ((string?)old["status"] == "Original vorhanden")
                    Same(Economics(old), Economics(n), "Original economics changed.");
                var before = Snapshot(old);
                bool changed = !JToken.DeepEquals(before, Snapshot(n));
                var history = old["corrections"] as JArray ?? new JArray();
                var nextHistory = n["corrections"] as JArray ?? new JArray();
                Require(nextHistory.Count == history.Count + (changed ? 1 : 0), "Correction history is not append-only.");
                for (int i = 0; i < history.Count; i++)
                    Same(history[i], nextHistory[i], "Prior correction changed.");
                if (old["sourceBaseline"] != null)
                    Same(old["sourceBaseline"], n["sourceBaseline"], "Source baseline changed.");
                else if (changed)
                    Same(before, n["sourceBaseline"], "Missing original baseline.");
                else
                    Same(old["sourceBaseline"], n["sourceBaseline"], "Invented baseline.");
                if (changed)
                {
                    Same(nextHistory.Last!["before"], before, "Incorrect correction snapshot.");
                    Require((bool?)n["corrected"] == true, "Correction flag missing.");
                }
                else
                    Same(old["corrected"], n["corrected"], "Correction flag changed.");
            }
        }
        public static Dictionary<string, JObject> Events(JObject state)
        {
            Require(state["archivedEvents"] == null || state["archivedEvents"] is JArray, "Invalid archived events.");
            var result = new Dictionary<string, JObject>();
            foreach (var e in new[] { state }.Concat((state["archivedEvents"] as JArray ?? new JArray()).Select(Obj)))
            {
                if(!ReferenceEquals(e,state))Require(new[]{"archivedEvents","revision","operationIds","operationRequests"}.All(k=>e[k]==null),"Archive contains aggregate fields.");
                var id = Str(Obj(e["event"])["id"], 500);
                Require(!result.ContainsKey(id), "Duplicate event ID.");
                result[id] = e;
            }
            return result;
        }
        static void Fields(JObject o, string fields) {
            var allowed=new HashSet<string>(fields.Split(' '));
            Require(o.Properties().All(p=>allowed.Contains(p.Name)), "Unknown state field.");
        }
        static JObject Slice(JObject state) {
            var slice=(JObject)state.DeepClone();
            foreach(var key in new[]{"archivedEvents","revision","operationIds","operationRequests"})slice.Remove(key);
            return slice;
        }
        public static void ValidateScope(JObject candidate, Workspace row, string targetId, string operationType) {
            var old=Events(row.State); var next=Events(candidate);
            Require(old.ContainsKey(targetId), "Unknown target event; reload required.");
            bool create=operationType=="event.create";
            Require(create ? row.CanConfigure && next.Count==old.Count+1 : next.Count==old.Count, "Event creation requires configuration permission.");
            if(create) {
                Require(!old.ContainsKey((string)candidate["event"]!["id"]!), "New event must be canonical root.");
                foreach(var e in old)Same(Slice(e.Value),Slice(next[e.Key]),"Creation changed existing event.");
            } else {
                Same(row.State["event"]!["id"],candidate["event"]!["id"],"Canonical root cannot switch.");
                var beforeIds=(row.State["archivedEvents"] as JArray ?? new JArray()).Select(e=>(string?)e["event"]!["id"]);
                var afterIds=(candidate["archivedEvents"] as JArray ?? new JArray()).Select(e=>(string?)e["event"]!["id"]);
                Require(beforeIds.SequenceEqual(afterIds), "Archive order changed.");
                foreach(var e in old)if(e.Key!=targetId)Same(Slice(e.Value),Slice(next[e.Key]),"Non-target event changed.");
                var prior=old[targetId];var updated=next[targetId];
                Same(prior["sourceNotice"],updated["sourceNotice"],"Source notice changed.");
                Same(prior["schemaVersion"],updated["schemaVersion"],"Schema changed.");
                if(!row.CanConfigure)foreach(var field in new[]{"id","name","year","dates","deliveryAddress","contact","locations","purchasingLocation"})Same(prior["event"]![field],updated["event"]![field],"Configuration permission required.");
                if(!row.CanClose) { Same(prior["event"]!["status"],updated["event"]!["status"],"Closure permission required."); Same(prior["lessons"],updated["lessons"],"Closure history permission required."); }
            }
        }
        public static void Validate(JObject candidate, JObject? previous = null)
        {
            Require(Encoding.UTF8.GetByteCount(candidate.ToString(Formatting.None)) <= StateBytes, "Aggregate exceeds 512 KiB.");
            Bounds(candidate);
            Require(Number(candidate["schemaVersion"], 2) == 2, "Unsupported schema.");
            Number(candidate["revision"], int.MaxValue);
            var ids = Arr(candidate["operationIds"]);
            var seen = new HashSet<string>();
            foreach (var id in ids)
                Require(seen.Add(Str(id, 100)), "Duplicate operation ID.");
            var signatures = candidate["operationRequests"] == null ? new JObject() : Obj(candidate["operationRequests"]);
            foreach (var p in signatures.Properties())
            {
                Require(seen.Contains(p.Name), "Signature without operation ID.");
                Str(p.Value, 50000);
            }
            var next = Events(candidate);
            var old = previous == null ? new Dictionary<string, JObject>() : Events(previous);
            foreach (var id in old.Keys)
                Require(next.ContainsKey(id), "Event history removed.");
            foreach (var e in next)
                Event(e.Value, old.TryGetValue(e.Key, out var prior) ? prior : null);
            if (previous != null)
            {
                var oldIds = Arr(previous["operationIds"]);
                Require(ids.Count >= oldIds.Count, "Operation history removed.");
                for (int i = 0; i < oldIds.Count; i++)
                    Same(oldIds[i], ids[i], "Operation history changed.");
                foreach (var p in (previous["operationRequests"] as JObject ?? new JObject()).Properties())
                    Same(p.Value, signatures[p.Name], "Operation request changed.");
            }
        }
    }
}
