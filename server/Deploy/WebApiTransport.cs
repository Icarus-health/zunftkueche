using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.Json;
using System.Globalization;
using System.Text.RegularExpressions;
namespace Kitchen.Deploy;
public sealed record PackageCreateDiagnostic(string Error, string[] Flags, int? OperationStatus, int? SubErrorCode);
public sealed class WebApiTransport : IDataverseTransport, IDisposable {
    private readonly HttpClient client;
    private readonly Func<Task<string>> token;
    private readonly Uri baseUri;
    public List<PackageCreateDiagnostic> PackageCreateDiagnostics { get; } = [];
    public WebApiTransport(string url, Func<Task<string>> tokenProvider, HttpMessageHandler? handler = null) {
        Target.ValidateUrl(url);
        baseUri = new Uri(Target.Url + "/api/data/v9.2/"); token = tokenProvider;
        client = new HttpClient(handler ?? new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false }) { Timeout = TimeSpan.FromMinutes(3) };
    }
    public Task<byte[]> ReadPackageFileAsync(string packageId) => PackageFileDownload.ReadAsync(client, token, packageId);
    public async Task<JsonNode?> SendAsync(HttpMethod method, string relativePath, JsonNode? payload = null) {
        if (method != HttpMethod.Get && method != HttpMethod.Post) throw new DeploymentException("unsupported_http_method");
        if (!Uri.TryCreate(baseUri, relativePath, out var uri) || uri.Scheme != "https" || uri.Host != baseUri.Host || uri.Port != 443 || !uri.AbsolutePath.StartsWith(baseUri.AbsolutePath, StringComparison.Ordinal) || !string.IsNullOrEmpty(uri.UserInfo))
            throw new DeploymentException("unsafe_api_path");
        bool packageCreate = method == HttpMethod.Post && relativePath == "pluginpackages";
        using var request = new HttpRequestMessage(method, uri);
        if (packageCreate) request.Headers.Add("Prefer", "odata.include-annotations=\"Microsoft.PowerApps.CDS.ErrorDetails.OperationStatus,Microsoft.PowerApps.CDS.ErrorDetails.SubErrorCode\"");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await token());
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue(relativePath == "$metadata" ? "application/xml" : "application/json"));
        request.Headers.Add("OData-MaxVersion", "4.0"); request.Headers.Add("OData-Version", "4.0");
        if (method == HttpMethod.Post && relativePath != "publishers" && relativePath != "solutions")
            request.Headers.Add("MSCRM.SolutionUniqueName", Target.Solution);
        if (payload != null) request.Content = new StringContent(payload.ToJsonString(), Encoding.UTF8, "application/json");
        using var timeout = new CancellationTokenSource(client.Timeout);
        // Avoid HttpClient's default unbounded error-body buffering before diagnosis.
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
        if (!response.IsSuccessStatusCode) {
            var facts = new PackageCreateDiagnostic("", [], null, null);
            var code = await RefusalCode(response, timeout.Token, packageCreate ? error => facts = ClassifyPackageError(error) : null);
            if (packageCreate) PackageCreateDiagnostics.Add(facts with { Error = code });
            throw new DeploymentException(code);
        }
        var text = await response.Content.ReadAsStringAsync(timeout.Token);
        if (text.Length == 0) return null;
        if (relativePath == "$metadata") return JsonValue.Create(text);
        return JsonNode.Parse(text);
    }
    internal static async Task<string> RefusalCode(HttpResponseMessage response, CancellationToken cancellationToken, Action<JsonElement>? packageDiagnostic = null) {
        string generic = "http_" + (int)response.StatusCode;
        const int limit = 8192;
        if (response.Content.Headers.ContentLength is > limit) return generic;
        try {
            using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            var bytes = new byte[limit + 1];
            int count = 0;
            while (count < bytes.Length) {
                int read = await stream.ReadAsync(bytes.AsMemory(count, bytes.Length - count), cancellationToken);
                if (read == 0) break;
                count += read;
            }
            if (count == 0 || count > limit) return generic;
            using var json = JsonDocument.Parse(bytes.AsMemory(0, count), new JsonDocumentOptions { MaxDepth = 16 });
            var root = json.RootElement;
            if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("error", out var error) || error.ValueKind != JsonValueKind.Object ||
                !error.TryGetProperty("code", out var value) || value.ValueKind != JsonValueKind.String) return generic;
            var code = value.GetString()!;
            // Only numeric identifiers and, for the exact package create endpoint, fixed lexical labels may leave the response.
            if (code.Length != 10 || !code.StartsWith("0x", StringComparison.Ordinal) ||
                !code.AsSpan(2).ToArray().All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f' or >= 'A' and <= 'F')) return generic;
            packageDiagnostic?.Invoke(error);
            return generic + "_dataverse_" + code;
        } catch (Exception e) when (e is JsonException or IOException or HttpRequestException or OperationCanceledException or InvalidOperationException) {
            return generic;
        }
    }
    // These labels indicate word presence only, not a proven validation failure or a reason to retry.
    private static readonly string[] PackageWords = [
        "package", "validation", "unique", "uniquename", "name", "prefix", "publisher", "version", "invalid", "mismatch",
        "assembly", "signed", "unsigned", "signature", "trusted", "sandbox", "nuget", "zip", "content", "manifest", "nuspec",
        "dependency", "dependencies", "reference", "references", "sdk", "newtonsoft", "duplicate", "already", "format", "strong",
        "file", "missing", "blocked", "must", "alphanumeric", "characters", "size", "guid", "required"
    ];
    private static PackageCreateDiagnostic ClassifyPackageError(JsonElement error) {
        var found = new HashSet<string>(StringComparer.Ordinal);
        void Scan(JsonElement obj) {
            if (!obj.TryGetProperty("message", out var message) || message.ValueKind != JsonValueKind.String) return;
            var tokens = Regex.Matches(message.GetString()!, "[A-Za-z]+").Select(m => m.Value).ToArray();
            foreach (var label in PackageWords)
                if (tokens.Contains(label, StringComparer.OrdinalIgnoreCase)) found.Add(label);
            foreach (var word in new[] { "found", "supported", "allowed" })
                for (int i = 1; i < tokens.Length; i++)
                    if (string.Equals(tokens[i-1], "not", StringComparison.OrdinalIgnoreCase) && string.Equals(tokens[i], word, StringComparison.OrdinalIgnoreCase))
                        found.Add("not_" + word);
        }
        Scan(error);
        if (error.TryGetProperty("innererror", out var inner) && inner.ValueKind == JsonValueKind.Object) Scan(inner);
        int? Number(string name) {
            if (!error.TryGetProperty("@Microsoft.PowerApps.CDS.ErrorDetails." + name, out var value)) return null;
            if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out int number)) return number;
            if (value.ValueKind == JsonValueKind.String && int.TryParse(value.GetString(), NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out number) &&
                value.GetString() == number.ToString(CultureInfo.InvariantCulture)) return number;
            return null;
        }
        return new("", found.Order(StringComparer.Ordinal).ToArray(), Number("OperationStatus"), Number("SubErrorCode"));
    }
    public void Dispose() => client.Dispose();
}
