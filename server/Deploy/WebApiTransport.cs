using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.Json;
namespace Kitchen.Deploy;
public sealed class WebApiTransport : IDataverseTransport, IDisposable {
    private readonly HttpClient client;
    private readonly Func<Task<string>> token;
    private readonly Uri baseUri;
    public WebApiTransport(string url, Func<Task<string>> tokenProvider, HttpMessageHandler? handler = null) {
        Target.ValidateUrl(url);
        baseUri = new Uri(Target.Url + "/api/data/v9.2/"); token = tokenProvider;
        client = new HttpClient(handler ?? new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false }) { Timeout = TimeSpan.FromMinutes(3) };
    }
    public async Task<JsonNode?> SendAsync(HttpMethod method, string relativePath, JsonNode? payload = null) {
        if (method != HttpMethod.Get && method != HttpMethod.Post) throw new DeploymentException("unsupported_http_method");
        if (!Uri.TryCreate(baseUri, relativePath, out var uri) || uri.Scheme != "https" || uri.Host != baseUri.Host || uri.Port != 443 || !uri.AbsolutePath.StartsWith(baseUri.AbsolutePath, StringComparison.Ordinal) || !string.IsNullOrEmpty(uri.UserInfo))
            throw new DeploymentException("unsafe_api_path");
        using var request = new HttpRequestMessage(method, uri);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await token());
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue(relativePath == "$metadata" ? "application/xml" : "application/json"));
        request.Headers.Add("OData-MaxVersion", "4.0"); request.Headers.Add("OData-Version", "4.0");
        if (method == HttpMethod.Post && relativePath != "publishers" && relativePath != "solutions")
            request.Headers.Add("MSCRM.SolutionUniqueName", Target.Solution);
        if (payload != null) request.Content = new StringContent(payload.ToJsonString(), Encoding.UTF8, "application/json");
        using var timeout = new CancellationTokenSource(client.Timeout);
        // Avoid HttpClient's default unbounded error-body buffering before diagnosis.
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
        if (!response.IsSuccessStatusCode) throw new DeploymentException(await RefusalCode(response, timeout.Token));
        var text = await response.Content.ReadAsStringAsync(timeout.Token);
        if (text.Length == 0) return null;
        if (relativePath == "$metadata") return JsonValue.Create(text);
        return JsonNode.Parse(text);
    }
    private static async Task<string> RefusalCode(HttpResponseMessage response, CancellationToken cancellationToken) {
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
            // Only a fixed numeric identifier may leave the response; never remote messages.
            if (code.Length != 10 || !code.StartsWith("0x", StringComparison.Ordinal) ||
                !code.AsSpan(2).ToArray().All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f' or >= 'A' and <= 'F')) return generic;
            return generic + "_dataverse_" + code;
        } catch (Exception e) when (e is JsonException or IOException or HttpRequestException or OperationCanceledException or InvalidOperationException) {
            return generic;
        }
    }
    public void Dispose() => client.Dispose();
}
