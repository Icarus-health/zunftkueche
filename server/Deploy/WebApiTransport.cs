using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;
namespace Kitchen.Deploy;
public sealed class WebApiTransport : IDataverseTransport, IDisposable {
    private readonly HttpClient client;
    private readonly Func<Task<string>> token;
    private readonly Uri baseUri;
    public WebApiTransport(string url, Func<Task<string>> tokenProvider) {
        Target.ValidateUrl(url);
        baseUri = new Uri(Target.Url + "/api/data/v9.2/"); token = tokenProvider;
        client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false }) { Timeout = TimeSpan.FromMinutes(3) };
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
        using var response = await client.SendAsync(request);
        if (!response.IsSuccessStatusCode) throw new DeploymentException("http_" + (int)response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        if (text.Length == 0) return null;
        if (relativePath == "$metadata") return JsonValue.Create(text);
        return JsonNode.Parse(text);
    }
    public void Dispose() => client.Dispose();
}
