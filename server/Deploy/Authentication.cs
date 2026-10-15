using Microsoft.Identity.Client;
namespace Kitchen.Deploy;
public sealed class InteractiveAuthentication {
    private readonly IPublicClientApplication app = PublicClientApplicationBuilder
        .Create("51f81489-12ee-4a9e-aaae-a2591f45987d")
        .WithAuthority($"https://login.microsoftonline.com/{Target.Tenant}")
        .WithRedirectUri("http://localhost")
        .Build();
    private AuthenticationResult? result;
    private readonly string[] scopes = [Target.Url + "/user_impersonation"];
    public string ObjectId => result?.ClaimsPrincipal.FindFirst("oid")?.Value ?? throw new DeploymentException("missing_authenticated_object_id");
    public async Task SignInAsync() {
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(10));
        result = await app.AcquireTokenInteractive(scopes)
            .WithLoginHint(Target.User).WithPrompt(Prompt.SelectAccount)
            .WithUseEmbeddedWebView(false)
            .WithSystemWebViewOptions(new SystemWebViewOptions {
                OpenBrowserAsync = url => {
                    var uri = url;
                    if (uri.Scheme != "https" || uri.Host != "login.microsoftonline.com") throw new DeploymentException("unexpected_auth_authority");
                    // Public authorize request only. No authorization code or token is emitted.
                    Console.WriteLine("AUTH_URL " + url);
                    return Task.CompletedTask;
                }
            }).ExecuteAsync(timeout.Token);
        Validate(result);
    }
    private static void Validate(AuthenticationResult value) {
        Target.ValidateAccount(value.TenantId, value.Account.Username);
        var issuer = value.ClaimsPrincipal.FindFirst("iss")?.Value;
        if (issuer != $"https://sts.windows.net/{Target.Tenant}/" && issuer != $"https://login.microsoftonline.com/{Target.Tenant}/v2.0")
            throw new DeploymentException("unexpected_identity_issuer");
    }
    public async Task<string> TokenAsync() {
        if (result == null) throw new DeploymentException("authentication_required");
        if (result.ExpiresOn < DateTimeOffset.UtcNow.AddMinutes(2)) {
            result = await app.AcquireTokenSilent(scopes, result.Account).ExecuteAsync();
            Validate(result);
        }
        return result.AccessToken;
    }
}
