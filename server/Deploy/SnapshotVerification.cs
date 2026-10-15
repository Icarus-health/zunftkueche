using Newtonsoft.Json.Linq;
using Zunftkueche;
namespace Kitchen.Deploy;

// A persisted snapshot may span many commits. It is not one transition from the import.
internal static class SnapshotVerification {
    private static readonly string[] Collections = ["suppliers", "articles", "planLines", "menu", "invoices", "sales", "movements", "orders", "dishPlan", "lessons"];
    private static readonly string[] ImmutableHistories = ["orders", "movements", "lessons"];
    private static readonly string[] EconomicFields = ["supplierId", "number", "date", "grossCents", "netCents", "lines"];
    public static void Validate(JObject state, JObject baseline) {
        // Self-reference validates a snapshot without inventing a preceding commit. Unlike null,
        // it permits the imported duplicate receipt labels; their exact allowlist is checked below.
        StatePolicy.Validate(state, state);
        var currentEvents = StatePolicy.Events(state);
        var originalEvents = StatePolicy.Events(baseline);
        foreach (var pair in currentEvents) {
            var originals = originalEvents.TryGetValue(pair.Key, out var original) ? Index(original["invoices"]) : new Dictionary<string, JObject>();
            foreach (var group in Index(pair.Value["invoices"]).Values.GroupBy(InvoiceKey).Where(g => g.Count() > 1))
                foreach (var invoice in group)
                    Need(originals.TryGetValue((string)invoice["id"]!, out var known) && InvoiceKey(known) == group.Key);
        }
        foreach (var pair in originalEvents) {
            Need(currentEvents.ContainsKey(pair.Key));
            var original = pair.Value; var current = currentEvents[pair.Key];
            foreach (var collection in Collections) {
                var now = Index(current[collection]);
                foreach (var old in Index(original[collection])) {
                    if (!Present(old.Value["source"])) continue;
                    Need(now.TryGetValue(old.Key, out var row));
                    Same(old.Value["source"], row!["source"]);
                    Same(old.Value["localPath"], row["localPath"]);
                }
            }
            foreach (var history in ImmutableHistories) Prefix((JArray)original[history]!, (JArray)current[history]!);
            var sales = Index(current["sales"]);
            foreach (var old in Index(original["sales"])) {
                Need(sales.TryGetValue(old.Key, out var sale));
                Same(old.Value["menuId"], sale!["menuId"]); Same(old.Value["day"], sale["day"]);
                if (Present(old.Value["priceCents"])) Same(old.Value["priceCents"], sale["priceCents"]);
            }
            var articles = Index(current["articles"]);
            foreach (var old in Index(original["articles"]))
                if (articles.TryGetValue(old.Key, out var article) && ArticleWasUsed(original, old.Key)) {
                    Same(old.Value["unit"], article["unit"]); Same(old.Value["supplierId"], article["supplierId"]);
                }
            var invoices = Index(current["invoices"]);
            foreach (var old in Index(original["invoices"]))
                if (Present(old.Value["source"])) VerifyReceipt(old.Value, invoices[old.Key], state);
        }
        Prefix((JArray)baseline["operationIds"]!, (JArray)state["operationIds"]!);
        foreach (var p in ((JObject)baseline["operationRequests"]!).Properties()) Same(p.Value, state["operationRequests"]?[p.Name]);
    }
    private static void VerifyReceipt(JObject original, JObject current, JObject state) {
        var baseline = Snapshot(original);
        var history = current["corrections"] as JArray ?? new JArray();
        // The pinned original import contains no corrections. A changed baseline format must be reviewed.
        Need(original["corrections"] == null && original["sourceBaseline"] == null);
        var snapshots = history.Select(c => (JObject)c["before"]!).Append(Snapshot(current)).ToArray();
        Same(baseline, snapshots[0]);
        if (history.Count == 0) {
            Same(original["sourceBaseline"], current["sourceBaseline"]);
            Same(original["corrected"], current["corrected"]);
        } else {
            Same(baseline, current["sourceBaseline"]);
            Need((bool?)current["corrected"] == true);
        }
        int previousRevision = 0;
        var operationIds = (JArray)state["operationIds"]!;
        foreach (var entry in history.Select((value, index) => (value, index))) {
            int revision = (int)entry.value["revision"]!;
            string operation = (string)entry.value["operationId"]!;
            Need(revision > previousRevision && revision <= (int)state["revision"]!);
            Need(revision <= operationIds.Count && (string?)operationIds[revision - 1] == operation && state["operationRequests"]?[operation] != null);
            Need(!JToken.DeepEquals(snapshots[entry.index], snapshots[entry.index + 1]));
            previousRevision = revision;
        }
        foreach (var snapshot in snapshots) {
            Same(snapshot, Snapshot(snapshot)); // Stored before-snapshots must not recursively contain history.
            foreach (var field in new[] { "id", "source", "localPath", "status" }) Same(baseline[field], snapshot[field]);
            if ((string?)baseline["status"] == "Original vorhanden")
                foreach (var field in EconomicFields) Same(baseline[field], snapshot[field]);
        }
    }
    private static bool ArticleWasUsed(JObject e, string id) =>
        ((JArray)e["planLines"]!).Concat((JArray)e["movements"]!).Any(r => (string?)r["articleId"] == id) ||
        ((JArray)e["menu"]!).Any(m => ((JArray)m["recipe"]!).Any(r => (string?)r["articleId"] == id)) ||
        ((JArray)e["invoices"]!).Concat((JArray)e["orders"]!).Any(i => ((JArray)i["lines"]!).Any(r => (string?)r["articleId"] == id));
    private static JObject Snapshot(JObject receipt) {
        var clone = (JObject)receipt.DeepClone();
        clone.Remove("sourceBaseline"); clone.Remove("corrected"); clone.Remove("corrections");
        return clone;
    }
    private static Dictionary<string, JObject> Index(JToken? array) => ((JArray)array!).OfType<JObject>().ToDictionary(o => (string)o["id"]!, StringComparer.Ordinal);
    private static string InvoiceKey(JObject r) => (string)r["supplierId"]! + "\n" + ((string)r["number"]!).Trim().ToUpperInvariant();
    private static bool Present(JToken? value) => value != null && value.Type != JTokenType.Null;
    private static void Prefix(JArray original, JArray current) {
        Need(current.Count >= original.Count);
        for (int i = 0; i < original.Count; i++) Same(original[i], current[i]);
    }
    private static void Same(JToken? original, JToken? current) => Need(JToken.DeepEquals(original, current));
    private static void Need(bool valid) {
        if (!valid) throw new DeploymentException("workspace_baseline_or_history_invalid");
    }
}
