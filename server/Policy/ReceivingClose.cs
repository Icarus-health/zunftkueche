using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace Zunftkueche
{
    public static partial class StatePolicy
    {
        static string CanonicalPlace(JObject e, string raw)
        {
            foreach (var location in History(Obj(e["event"]), "locations"))
                if ((string?)location["name"] == raw || Arr(location["historicalNames"]).Any(v => (string?)v == raw))
                    return (string)location["name"]!;
            return raw;
        }

        static bool Place(JObject e, string? raw, string? selected) =>
            selected != null && CanonicalPlace(e, raw ?? "Küche") == CanonicalPlace(e, selected);

        static string? PurchasingPlace(JObject e)
        {
            var ev = Obj(e["event"]);
            if (ev["purchasingLocation"] != null) return (string?)ev["purchasingLocation"];
            if (ev["locations"] == null) return "Küche";
            var kitchen = CanonicalPlace(e, "Küche");
            return Arr(ev["locations"]).Any(l => (string?)l["name"] == kitchen) ? kitchen : null;
        }

        static void RequireScope(JObject e, string scope)
        {
            var ev = Obj(e["event"]);
            var active = ev["locations"] == null
                ? new[] { "Küche", "Bar", "Zunftscheuer", "Brunnen", "Mitwirkende / Aufbau / Probe" }
                : Arr(ev["locations"]).Select(l => (string)l["name"]!).ToArray();
            var places = active
                .Concat(Arr(e["planLines"]).Select(l => (string?)l["location"] ?? ""))
                .Concat(Arr(e["movements"]).Select(l => (string?)l["location"] ?? ""))
                .Concat(Arr(e["invoices"]).Select(l => (string?)l["scope"] ?? ""));
            Require(scope == "Alle" || places.Contains(scope), "Unknown closure scope.");
        }

        static decimal? Effective(JObject e, JToken row, string history, string field)
        {
            var last = History(e, history).LastOrDefault(h => (string?)h["targetId"] == (string?)row["id"]);
            var value = last == null ? row[field] : last["after"];
            return Null(value) ? (decimal?)null : value!.Value<decimal>();
        }

        static void StockChecklist(JObject e, string scope, JArray open)
        {
            var targets = new List<Tuple<string, string>>();
            var seen = new HashSet<string>();
            bool unassigned = false;
            Func<string?, bool> included = place => scope == "Alle" || Place(e, place, scope);
            Action<string?, string?> add = (article, place) =>
            {
                if (!included(place)) return;
                if (string.IsNullOrEmpty(article) || string.IsNullOrEmpty(place))
                {
                    unassigned = true;
                    return;
                }
                var canonical = CanonicalPlace(e, place!);
                if (seen.Add(new JArray(article!, canonical).ToString()))
                    targets.Add(Tuple.Create(article!, canonical));
            };

            foreach (var invoice in Arr(e["invoices"]))
            {
                var place = (string?)invoice["scope"];
                if (!included(place)) continue;
                if (Arr(invoice["lines"]).Count == 0) unassigned = true;
                foreach (var line in Arr(invoice["lines"])) add((string?)line["articleId"], place);
            }
            foreach (var order in Arr(e["orders"]))
                foreach (var line in Arr(order["lines"]))
                    if (Null(line["quantity"]) || line["quantity"]!.Value<decimal>() != 0)
                        add((string?)line["articleId"], (string?)line["location"] ?? "Küche");
            foreach (var line in Arr(e["planLines"]))
            {
                var allocations = History(Obj(line), "allocations");
                decimal? quantity = allocations.Count > 0
                    ? allocations.Sum(a => a["quantity"]!.Value<decimal>())
                    : Null(line["quantity"]) ? (decimal?)null : line["quantity"]!.Value<decimal>();
                if (quantity != 0) add((string?)line["articleId"], (string?)line["location"] ?? "Küche");
            }
            foreach (var movement in Arr(e["movements"]))
                add((string?)movement["articleId"], (string?)movement["location"]);
            var kitchen = PurchasingPlace(e);
            foreach (var menu in Arr(e["menu"]))
            {
                bool used = Arr(e["sales"]).Any(s => (string?)s["menuId"] == (string?)menu["id"]
                    && (Null(s["quantity"]) || s["quantity"]!.Value<decimal>() != 0));
                if (!used || (scope != "Alle" && scope != kitchen)) continue;
                bool unresolved = kitchen == null || Arr(menu["recipe"]).Count == 0
                    || (string?)menu["recipeStatus"] != "Bestätigt"
                    || (string?)menu["supplyMode"] == "manual"
                    || (Str(menu["category"]).ToLowerInvariant().Contains("getränk") && menu["supplyMode"] == null);
                if (unresolved) unassigned = true;
                else foreach (var line in Arr(menu["recipe"])) add((string?)line["articleId"], kitchen);
            }
            if (unassigned) open.Add("Artikel- oder Ortszuordnung für Bestandsnachweise fehlt.");
            bool missing = targets.Count == 0 || targets.Any(target =>
                new[] { "Anfangsbestand", "Zählung" }.Any(type => !Arr(e["movements"]).Any(m =>
                    (string?)m["articleId"] == target.Item1 && Place(e, (string?)m["location"], target.Item2)
                    && (string?)m["type"] == type)));
            if (missing) open.Add("Anfangsbestände oder Schlusszählungen fehlen.");
        }

        static JObject CloseChecklist(JObject e, string scope, int revision)
        {
            RequireScope(e, scope);
            var open = new JArray();
            var sales = Arr(e["sales"]).Where(s => new[] { "Freitag", "Samstag" }.Contains((string?)s["day"])).ToArray();
            var menus = Arr(e["menu"]);
            bool salesComplete = menus.Count > 0 && menus.All(m => new[] { "Freitag", "Samstag" }.All(day =>
                sales.Any(s => (string?)s["menuId"] == (string?)m["id"] && (string?)s["day"] == day
                    && !Null(s["quantity"]) && Effective(e, s, "salePriceCorrections", "priceCents") != null)));
            if (!salesComplete) open.Add("Verkäufe oder bestätigte Verkaufspreise fehlen.");
            var invoices = Arr(e["invoices"]).Where(i => scope == "Alle" || Place(e, (string?)i["scope"], scope)).ToArray();
            if (invoices.Length == 0 || invoices.Any(i => Null(i["grossCents"]))) open.Add("Bruttobelege fehlen oder sind offen.");
            if (invoices.Any(i => Null(i["netCents"]))) open.Add("Nettobeträge sind offen; Brutto ist kein Netto-Wareneinsatz.");
            if (Arr(e["invoices"]).Any(i => string.IsNullOrEmpty((string?)i["scope"]) || (string?)i["scope"] == "Offen"))
                open.Add("Belegzuordnungen sind offen.");
            StockChecklist(e, scope, open);
            bool deliveriesOpen = Arr(e["orders"]).Any(o => Arr(o["lines"]).Any(line =>
                Null(line["quantity"]) || Arr(e["movements"])
                    .Where(m => (string?)m["orderId"] == (string?)o["id"] && (string?)m["orderLineId"] == (string?)line["id"])
                    .Sum(m => Effective(e, m, "movementCorrections", "quantity") ?? 0) < line["quantity"]!.Value<decimal>()));
            if (deliveriesOpen) open.Add("Bestellfassungen enthalten offene Liefermengen (einschließlich älterer Fassungen).");
            bool comparable = scope != "Alle" && scope == PurchasingPlace(e);
            if (!comparable) open.Add("Kostenumfang und Küchenverkaufsumfang sind nicht vergleichbar.");

            var evidence = History(e, "economicEvidence").LastOrDefault();
            string? reason = null;
            if (evidence == null) reason = "Bestätigte Nettoerlöse und bewerteter Nettoverbrauch fehlen.";
            else if ((string?)evidence["scope"] != scope || scope != PurchasingPlace(e))
                reason = "Bestätigter Nettoumfang und ausgewählter Küchenumfang sind nicht vergleichbar.";
            else if ((int)evidence["revision"]! != revision)
                reason = "Nettobewertung gilt für Revision " + evidence["revision"] + "; aktuelle Revision " + revision + " muss neu bestätigt werden.";
            else if (open.Count > 0) reason = "Grundlagen unvollständig: " + open.Count + " offene Prüfpunkte.";
            JToken result = reason == null && evidence != null
                ? new JValue((long)evidence["netRevenueCents"]! - (long)evidence["netConsumptionCents"]!)
                : JValue.CreateNull();
            if (evidence == null || (string?)evidence["scope"] != scope || (int)evidence["revision"]! != revision)
                if (reason != null) open.Add(reason);

            return new JObject {
                { "scope", scope }, { "revision", revision }, { "open", open }, { "complete", open.Count == 0 },
                { "revenueCents", salesComplete && comparable ? new JValue((long)sales.Sum(s => s["quantity"]!.Value<decimal>() * Effective(e, s, "salePriceCorrections", "priceCents")!.Value)) : JValue.CreateNull() },
                { "grossReceiptsCents", invoices.Length > 0 && invoices.All(i => !Null(i["grossCents"])) ? new JValue((long)invoices.Sum(i => i["grossCents"]!.Value<decimal>())) : JValue.CreateNull() },
                { "netReceiptsCents", invoices.Length > 0 && invoices.All(i => !Null(i["netCents"])) ? new JValue((long)invoices.Sum(i => i["netCents"]!.Value<decimal>())) : JValue.CreateNull() },
                { "resultCents", result },
                { "resultReason", reason ?? "Bestätigte Nettoerlöse minus bewerteter Nettoverbrauch für denselben Umfang." }
            };
        }

        static void ReceivingReferences(JObject e, JObject? prior)
        {
            foreach (var movement in Arr(e["movements"]).OfType<JObject>())
            {
                if (movement["orderId"] == null && movement["orderLineId"] == null && movement["substitutionConfirmed"] == null) continue;
                var order = Arr(e["orders"]).FirstOrDefault(o => (string?)o["id"] == Str(movement["orderId"], 500));
                Require(order != null, "Receiving order missing.");
                var line = Arr(order!["lines"]).FirstOrDefault(l => (string?)l["id"] == Str(movement["orderLineId"], 500));
                Require(line != null, "Receiving line missing.");
                var article = Index(e["articles"])[(string)movement["articleId"]!];
                Same(line!["unit"], article["unit"], "Substitute unit mismatch.");
                bool substitute = (string?)line["articleId"] != (string?)movement["articleId"];
                Require((bool?)movement["substitutionConfirmed"] == substitute, "Substitution must be explicit.");
                if (substitute) Str(movement["note"], 1000);
                Require((string?)movement["type"] == "Lieferung", "Receiving must be a delivery.");
                if (prior != null && !Index(prior["movements"]).ContainsKey((string)movement["id"]!))
                    Require(Index(prior["orders"]).ContainsKey((string)movement["orderId"]!), "Receiving needs an existing snapshot.");
            }
        }

        static void ClosureSnapshotFields(JObject snapshot)
        {
            Fields(snapshot, "scope revision open complete revenueCents grossReceiptsCents netReceiptsCents resultCents resultReason");
            Require(snapshot.Count == 9, "Closure snapshot fields missing.");
            Str(snapshot["scope"], 100);
            Number(snapshot["revision"], int.MaxValue);
            Require(snapshot["complete"]?.Type == JTokenType.Boolean, "Invalid snapshot completeness.");
            foreach (var item in Arr(snapshot["open"])) Str(item, 1000);
            Str(snapshot["resultReason"], 1000);
            foreach (var field in new[] { "revenueCents", "grossReceiptsCents", "netReceiptsCents" })
                Number(snapshot[field], 1000000000000000000m, 0, true);
            if (!Null(snapshot["resultCents"]))
            {
                Require(snapshot["resultCents"]!.Type == JTokenType.Integer, "Invalid net result.");
                Require(Math.Abs(snapshot["resultCents"]!.Value<decimal>()) <= 100000000, "Net result exceeds bound.");
            }
        }

        static void EconomicHistory(JObject e, JObject? prior)
        {
            var history = History(e, "economicEvidence");
            Prefix(History(prior, "economicEvidence"), history, prior == null ? 10000 : 1);
            foreach (var item in history)
            {
                var entry = Obj(item);
                Fields(entry, "operationId revision eventId scope sourceRevision netRevenueCents netConsumptionCents sourceReason valuationReason actorId confirmedAt");
                Audit(entry);
                Same(entry["eventId"], e["event"]!["id"], "Economic evidence event mismatch.");
                Str(entry["scope"], 100);
                Number(entry["sourceRevision"], int.MaxValue - 1);
                Require((int)entry["revision"]! == (int)entry["sourceRevision"]! + 1, "Economic evidence revision mismatch.");
                Number(entry["netRevenueCents"], 100000000);
                Number(entry["netConsumptionCents"], 100000000);
                Str(entry["sourceReason"], 1000);
                Str(entry["valuationReason"], 1000);
            }
        }

        static void ReceivingCloseFields(JObject e, JObject? prior)
        {
            ReceivingReferences(e, prior);
            EconomicHistory(e, prior);
            var history = History(e, "closureHistory");
            Prefix(History(prior, "closureHistory"), history, prior == null ? 10000 : 1);
            foreach (var item in history)
            {
                var entry = Obj(item);
                Fields(entry, "operationId revision action reason snapshot actorId confirmedAt");
                Audit(entry);
                Str(entry["reason"], 1000);
                Require(new[] { "close", "reopen" }.Contains((string?)entry["action"]), "Invalid closure action.");
                if ((string?)entry["action"] == "close") ClosureSnapshotFields(Obj(entry["snapshot"]));
                else Require(entry["snapshot"] == null, "Reopen has no snapshot.");
            }
            if (history.Count > 0)
                Require((string?)e["event"]!["status"] == ((string?)history.Last!["action"] == "close" ? "Abgeschlossen" : "Offen"), "Closure state mismatch.");
        }

        static void ClosureScope(JObject prior, JObject updated, Workspace row)
        {
            var economicsBefore = History(prior, "economicEvidence");
            var economicsAfter = History(updated, "economicEvidence");
            if (economicsAfter.Count > economicsBefore.Count)
            {
                Require(row.CanClose, "Owner economic evidence permission required.");
                var evidence = Obj(economicsAfter.Last);
                Require((int)evidence["sourceRevision"]! == row.Revision, "Economic evidence is stale.");
                RequireScope(prior, Str(evidence["scope"], 100));
                var beforeSlice = Slice(prior);
                var afterSlice = Slice(updated);
                beforeSlice.Remove("economicEvidence");
                afterSlice.Remove("economicEvidence");
                Same(beforeSlice, afterSlice, "Economic confirmation must be a separate operation.");
            }

            var before = History(prior, "closureHistory");
            var after = History(updated, "closureHistory");
            bool changed = !JToken.DeepEquals(prior["event"]!["status"], updated["event"]!["status"]);
            bool appended = after.Count == before.Count + 1;
            Require(changed == appended, "Status requires exactly one closure transition.");
            if (appended)
            {
                Require(row.CanClose, "Owner closure permission required.");
                var entry = Obj(after.Last);
                bool wasClosed = (string?)prior["event"]!["status"] == "Abgeschlossen";
                Require((string?)entry["action"] == (wasClosed ? "reopen" : "close"), "Invalid closure transition.");
                Str(entry["reason"], 1000);
                if (!wasClosed)
                {
                    var snapshot = Obj(entry["snapshot"]);
                    var scope = Str(snapshot["scope"], 100);
                    Same(snapshot, CloseChecklist(prior, scope, row.Revision), "Closure snapshot does not match previous state.");
                }
                var a = Slice(prior);
                var b = Slice(updated);
                a.Remove("closureHistory"); b.Remove("closureHistory");
                Obj(a["event"]).Remove("status"); Obj(b["event"]).Remove("status");
                Same(a, b, "Close/reopen must be a separate operation.");
            }
            else if ((string?)prior["event"]!["status"] == "Abgeschlossen")
                Same(Slice(prior), Slice(updated), "Closed event must be reopened before changes.");
        }
    }
}
