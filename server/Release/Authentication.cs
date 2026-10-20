using Microsoft.Identity.Client;
namespace Kitchen.Inventory;
// Normal public-client PKCE/loopback, tenant/account/issuer/oid checks, in-memory cache only.
// The public authorize URL is handed to the parent, who opens the approved DuckDuckGo surface.
// This tool never opens a browser, reads a browser/CLI cache, or grants consent.
public sealed class Authentication
{
    const string ClientId = "51f81489-12ee-4a9e-aaae-a2591f45987d";
    readonly IPublicClientApplication app = PublicClientApplicationBuilder.Create(ClientId).WithAuthority($"https://login.microsoftonline.com/{Target.Tenant}").WithRedirectUri("http://localhost").Build();
    readonly string[] scopes = [Target.Url + "/user_impersonation"];
    AuthenticationResult? result;
    public string ObjectId => Check.Id(result?.ClaimsPrincipal.FindFirst("oid")?.Value ?? throw new Stop());
    public async Task SignIn()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(10));
        result = await app.AcquireTokenInteractive(scopes).WithLoginHint(Target.User).WithPrompt(Prompt.SelectAccount).WithUseEmbeddedWebView(false)
            .WithSystemWebViewOptions(new SystemWebViewOptions { OpenBrowserAsync = url => PublicAuthorizationHandoff(url, Console.Out) })
            .ExecuteAsync(timeout.Token);
        Validate();
    }
    public static async Task PublicAuthorizationHandoff(Uri url, TextWriter output)
    {
        Check.Require(url.Scheme == "https" && url.Host == "login.microsoftonline.com" && url.Port == 443 && url.UserInfo == "" && url.Fragment == "" && url.AbsolutePath == $"/{Target.Tenant}/oauth2/v2.0/authorize");
        var query = new Dictionary<string, string>(StringComparer.Ordinal);
        string[] allowed = ["client_id", "scope", "redirect_uri", "client-request-id", "x-client-SKU", "x-client-Ver", "x-client-OS", "x-client-CPU", "x-client-current-telemetry", "x-client-last-telemetry", "x-client-brkrver", "client_info", "response_type", "response_mode", "code_challenge", "code_challenge_method", "state", "login_hint", "prompt", "haschrome", "x-anchormailbox"];
        foreach (var part in url.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var pair = part.Split('=', 2);
            Check.Require(pair.Length == 2);
            string name = Uri.UnescapeDataString(pair[0]);
            // MSAL4.83.0 lowercases these telemetry keys when rewriting response_mode.
            // Only the two observed spellings are aliases; OAuth names remain exact-case.
            name = name switch { "x-client-sku" => "x-client-SKU", "x-client-ver" => "x-client-Ver", _ => name };
            Check.Require(allowed.Contains(name, StringComparer.Ordinal) && query.TryAdd(name, Uri.UnescapeDataString(pair[1].Replace('+', ' '))));
        }
        // Pinned MSAL4.83.0 adds these public routing/UI fields; bind their exact values.
        Check.Require(!query.ContainsKey("haschrome") || query["haschrome"] == "1");
        Check.Require(!query.ContainsKey("x-anchormailbox") || query["x-anchormailbox"] == "upn:" + Target.User);
        Check.Require(query.GetValueOrDefault("client_id") == ClientId && query.GetValueOrDefault("response_type") == "code" && query.GetValueOrDefault("code_challenge_method") == "S256");
        var scope = query.GetValueOrDefault("scope", "").Split(' ', StringSplitOptions.RemoveEmptyEntries);
        Check.Require(scope.Contains(Target.Url + "/user_impersonation") && scope.All(s => s == Target.Url + "/user_impersonation" || s is "openid" or "profile" or "offline_access"));
        Check.Require(Uri.TryCreate(query.GetValueOrDefault("redirect_uri"), UriKind.Absolute, out var redirect) && redirect.Scheme == "http" && redirect.Host == "localhost" && redirect.UserInfo == "" && redirect.Query == "" && redirect.Fragment == "");
        string challenge = query.GetValueOrDefault("code_challenge", "");
        Check.Require(challenge.Length is >= 43 and <= 128 && challenge.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_') && query.GetValueOrDefault("state", "").Length is > 0 and < 4096);
        Check.Require(!query.ContainsKey("login_hint") || query["login_hint"].Equals(Target.User, StringComparison.OrdinalIgnoreCase));
        Check.Require(!query.ContainsKey("prompt") || query["prompt"] == "select_account");
        await output.WriteLineAsync("AUTH_HANDOFF: parent opens this public authorization URL in the approved DuckDuckGo surface; stop on new consent/grant.");
        await output.WriteLineAsync("AUTH_URL " + url.AbsoluteUri);
    }
    void Validate()
    {
        Check.Require(result != null && result.TenantId.Equals(Target.Tenant, StringComparison.OrdinalIgnoreCase) && result.Account.Username.Equals(Target.User, StringComparison.OrdinalIgnoreCase));
        string? issuer = result!.ClaimsPrincipal.FindFirst("iss")?.Value;
        Check.Require(issuer == $"https://sts.windows.net/{Target.Tenant}/" || issuer == $"https://login.microsoftonline.com/{Target.Tenant}/v2.0");
        _ = ObjectId;
    }
    public Task<string> Token()
    {
        Validate();
        if (result!.ExpiresOn <= DateTimeOffset.UtcNow.AddMinutes(2))
            throw new Stop(FailureReason.TokenExpired);
        return Task.FromResult(result.AccessToken);
    }
}
