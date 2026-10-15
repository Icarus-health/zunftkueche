using System.Security.Cryptography;
using System.Text.Json.Nodes;
using Newtonsoft.Json.Linq;
using Zunftkueche;
namespace Kitchen.Deploy;
public static class Seed {
    public const string OriginalHash = "d38bf0ac7c2bf34211c1df01af1869dd97522da24e2bde1a284e3e505844a15f";
    public const string PackageHash = "20ebc01203f0eb5f16064ae35c535467f978353bd2ef2ce4bcc45ec164912660";
    public const string WorkspaceId = "45deaf94-5661-4110-8f16-3d2678c09f04";
    public static string Hash(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));
    public static JsonObject Normalize(byte[] bytes) {
        if (Hash(bytes) != OriginalHash) throw new DeploymentException("source_hash_mismatch_original_2026_required");
        var original = JsonNode.Parse(bytes)!.AsObject();
        if (original["schemaVersion"]?.GetValue<int>() != 1) throw new DeploymentException("source_schema_mismatch");
        var copy = original.DeepClone().AsObject();
        copy["schemaVersion"] = 2; copy["revision"] = 0;
        copy["operationIds"] = new JsonArray(); copy["operationRequests"] = new JsonObject();
        RemoveLocalPaths(copy);
        // The real server validator is compiled into this separate utility, never modified.
        var state = JObject.Parse(copy.ToJsonString());
        StatePolicy.Validate(state, state);
        return copy;
    }
    private static void RemoveLocalPaths(JsonNode? node) {
        if (node is JsonObject obj) {
            obj.Remove("localPath");
            foreach (var p in obj) RemoveLocalPaths(p.Value);
        } else if (node is JsonArray array) foreach (var child in array) RemoveLocalPaths(child);
    }
    public static byte[] Package(string path) {
        var bytes = File.ReadAllBytes(path);
        if (Hash(bytes) != PackageHash) throw new DeploymentException("package_hash_mismatch");
        return bytes;
    }
}
