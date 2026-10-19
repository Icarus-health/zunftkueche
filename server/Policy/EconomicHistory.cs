using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Newtonsoft.Json.Linq;
namespace Zunftkueche
{
    public static partial class StatePolicy
    {
        static void Audit(JObject item)
        {
            Str(item["operationId"], 100);
            Number(item["revision"], int.MaxValue);
            if (item["actorId"] != null)
            {
                Guid actor;
                Require(Guid.TryParseExact(Str(item["actorId"], 36), "D", out actor) && actor != Guid.Empty, "Invalid confirmed actor.");
            }
            if (item["confirmedAt"] != null)
            {
                DateTimeOffset timestamp;
                Require(DateTimeOffset.TryParse(Str(item["confirmedAt"], 50), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out timestamp), "Invalid confirmation timestamp.");
            }
        }
        static JArray History(JObject? row, string field) => row?[field] == null ? new JArray() : Arr(row[field]);
        static void Prefix(JArray prior, JArray next, int maxAdded = 1)
        {
            Require(next.Count >= prior.Count && next.Count <= prior.Count + maxAdded, "History must append at most one event.");
            for (int i = 0; i < prior.Count; i++)
                Same(prior[i], next[i], "Prior history changed or removed.");
        }
        static void ValueHistory(JObject e, JObject? previous, string field, string collection, string value, int precision)
        {
            var history = History(e, field);
            var old = History(previous, field);
            Prefix(old, history, previous == null ? 10000 : 1);
            var rows = Index(e[collection]);
            var effective = rows.ToDictionary(p => p.Key, p => p.Value[value]);
            var ids = new HashSet<string>();
            foreach (var entry in history.OfType<JObject>())
            {
                Fields(entry, "operationId revision targetId before after reason actorId confirmedAt");
                Audit(entry);
                Str(entry["reason"], 1000);
                Require(ids.Add(Str(entry["operationId"], 100)), "Duplicate correction operation.");
                var id = Str(entry["targetId"], 500);
                Require(rows.ContainsKey(id), "Correction target missing.");
                Same(entry["before"], effective[id], "Correction before value mismatch.");
                Number(entry["after"], precision == 0 ? 100000000 : 10000000, precision);
                Require(!JToken.DeepEquals(entry["before"], entry["after"]), "Correction has no effect.");
                effective[id] = entry["after"];
            }
            Require(history.All(v => v is JObject), "Invalid correction.");
            if (previous != null && history.Count > old.Count)
                Require(Index(previous[collection]).ContainsKey(Str(history.Last!["targetId"], 500)), "Correction target must already exist.");
        }
        static JObject OrderSnapshot(JObject order)
        {
            var result = (JObject)order.DeepClone();
            result.Remove("status");
            result.Remove("statusHistory");
            return result;
        }
        static void OrderHistory(JObject order, JObject? old)
        {
            var history = History(order, "statusHistory");
            var before = History(old, "statusHistory");
            Prefix(before, history, old == null ? 0 : 1);
            Require(history.Count <= 2, "Too many order status events.");
            for (int i = 0; i < history.Count; i++)
            {
                var entry = Obj(history[i]);
                Fields(entry, "operationId revision status note actorId confirmedAt");
                Audit(entry);
                Str(entry["note"], 1000, true);
                Require((string?)entry["status"] == (i == 0 ? "bestellt" : "bestaetigt"), "Invalid order transition.");
            }
            Require((string?)order["status"] == (history.Count == 0 ? "Vorbereitet" : (string?)history.Last!["status"]), "Status/history mismatch.");
            if (old != null)
                Same(OrderSnapshot(old), OrderSnapshot(order), "Order snapshot changed.");
        }
        public static void StampEconomicHistory(JObject candidate, JObject previous, string operationId, int revision, Guid actor, DateTime timestamp)
        {
            var priorEvents = Events(previous);
            foreach (var e in Events(candidate))
            {
                if (!priorEvents.TryGetValue(e.Key, out var prior))
                    continue;
                Action<JObject> stamp = entry => { entry["operationId"] = operationId; entry["revision"] = revision; entry["actorId"] = actor.ToString("D"); entry["confirmedAt"] = timestamp.ToString("o", CultureInfo.InvariantCulture); };
                foreach (var field in new[] { "movementCorrections", "salePriceCorrections" })
                {
                    var old = History(prior, field);
                    foreach (var entry in History(e.Value, field).Skip(old.Count).OfType<JObject>())
                        stamp(entry);
                }
                foreach (var pair in new[] { new[] { "invoices", "corrections" }, new[] { "orders", "statusHistory" } })
                {
                    var old = Index(prior[pair[0]]);
                    foreach (var row in Arr(e.Value[pair[0]]).OfType<JObject>())
                    {
                        old.TryGetValue((string)row["id"]!, out var oldRow);
                        foreach (var entry in History(row, pair[1]).Skip(History(oldRow, pair[1]).Count).OfType<JObject>())
                            stamp(entry);
                    }
                }
            }
        }
    }
}
