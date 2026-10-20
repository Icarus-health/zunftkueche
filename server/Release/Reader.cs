using System.Net;
using System.Net.Http.Headers;
using System.Text.Json.Nodes;
namespace Kitchen.Inventory;
// No request method, body, target host, arbitrary action or path is accepted from CLI.
public sealed class Reader : IDisposable
{
    readonly HttpClient client; readonly Func<Task<string>> token; readonly Action<string, byte[]> capture;
    readonly HashSet<string> allowed = ["WhoAmI", Queries.Org]; readonly HashSet<string> apiChildren = []; int serial; long total;
    public Reader(Func<Task<string>> token, Action<string, byte[]> capture, HttpMessageHandler? handler = null)
    {
        this.token = token;
        this.capture = capture;
        client = new(handler ?? new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false })
        {
            Timeout = TimeSpan.FromSeconds(90)
        };
    }
    internal void IdentityUser(string id) => allowed.Add(Queries.User(id));
    internal void IdentityCurrency(string id) => allowed.Add(Queries.Currency(id));
    internal void Verified(string user)
    {
        foreach (var p in new[] { Queries.Workspace, Queries.Receipts, Queries.Package, Queries.PackageBytes, Queries.Solution, Queries.Publishers, Queries.Bypass, Queries.Components, Queries.Types, Queries.Apis, Queries.Filters, Queries.Platform, Queries.Access(user), Queries.Privileges(user) })
            allowed.Add(p);
        foreach (var table in new[] { "zk_kitchenworkspace", "zk_kitchenoperation", "zk_kitchendocument", "zk_kitchendraft" })
            foreach (var suffix in new[] { "", "/Attributes", "/Keys", "/ManyToOneRelationships", "/OneToManyRelationships" })
                allowed.Add(Queries.Table(table) + suffix);
    }
    internal void ReleaseQueries(IEnumerable<string> paths) { foreach(var p in paths) { Check.Require(Kitchen.Release.ReleaseQueries.All.Contains(p)); allowed.Add(p); } }
    // Called only after both fresh fixed API roots pass the metadata contract.
    internal void ApiChildren(string id)
    {
        Check.Require(allowed.Contains(Queries.Apis));
        foreach (var path in new[] { Queries.ApiRequestParameters(id), Queries.ApiResponseProperties(id) })
        {
            apiChildren.Add(path);
            allowed.Add(path);
        }
    }
    internal void Guard(string id) => allowed.Add(Queries.Guards(id));
    internal void Owner(string id) => allowed.Add(Queries.User(id));
    internal void CaptureSemanticResponse(string name,byte[] bytes) { Check.Require(name is "CanBeReferenced" or "CanBeReferencing"); capture($"semantic-read-{++serial:D4}-{name}.bin",bytes); }
    // These helpers are private to the fixed release adapters. No caller supplies a URL.
    internal async Task<JsonObject?> ExactMetadata(Kitchen.Release.SchemaStep step,CancellationToken cancellation) {
        Check.Require(allowed.Contains(Queries.Table(Kitchen.Release.DocumentSchema.Logical(step.Table))));
        var path=Kitchen.Release.SchemaPhase.ExactPath(step);
        var reply=await SendResponse(new Uri(Target.Api+path),8*1024*1024,true,cancellation);
        if(reply.Status==HttpStatusCode.NotFound)return null;
        var row=Check.Parse(reply.Bytes);Check.NoNestedContinuation(row);return row;
    }
    internal async Task<JsonObject[]> ExactMembershipCandidates(string objectId,int type) {
        Check.Require(allowed.Contains(Queries.Components)&&type is 1 or 2 or 10);
        var path=$"solutioncomponents?$filter=objectid eq {Check.Id(objectId)} and componenttype eq {type} and _solutionid_value eq {Target.Solution}&$count=true";
        allowed.Add(path);return await Rows(path,"solutioncomponentid",2);
    }
    internal async Task<JsonObject[]> ExactGuardCandidates(Kitchen.Release.ReviewedBinding binding) {
        Check.Require(Kitchen.Release.DocumentGuards.IndividualMessage(binding.Message));
        var path=$"sdkmessageprocessingsteps?$filter=_sdkmessagefilterid_value eq {Check.Id(binding.FilterId)} and _eventhandler_value eq {Check.Id(binding.TypeId)}&$expand=sdkmessageid,sdkmessagefilterid,eventhandler_plugintype&$count=true";
        allowed.Add(path);return await Rows(path,"sdkmessageprocessingstepid",2);
    }
    internal async Task<JsonObject> ExactObservedRow(JsonObject locator,bool guard,CancellationToken cancellation) {
        var path=guard?$"sdkmessageprocessingsteps({Check.Id(locator,"sdkmessageprocessingstepid")})?$expand=sdkmessageid,sdkmessagefilterid,eventhandler_plugintype":$"solutioncomponents({Check.Id(locator,"solutioncomponentid")})";
        // A locator-to-object disappearance is Unknown, never Missing.
        var reply=await SendResponse(new Uri(Target.Api+path),8*1024*1024,false,cancellation);
        var row=Check.Parse(reply.Bytes);Check.NoNestedContinuation(row);return row;
    }
    public async Task<byte[]> Get(string path)
    {
        Check.Require(allowed.Contains(path));
        return await Send(new Uri(Target.Api + path), path == Queries.PackageBytes ? 32 * 1024 * 1024 : 8 * 1024 * 1024);
    }
    async Task<byte[]> Send(Uri uri,int bound)=>(await SendResponse(uri,bound,false,CancellationToken.None)).Bytes;
    async Task<(HttpStatusCode Status,byte[] Bytes)> SendResponse(Uri uri, int bound,bool allowNotFound,CancellationToken caller)
    {
        Check.Require(uri.Scheme == "https" && uri.Host == new Uri(Target.Url).Host && uri.Port == 443 && uri.UserInfo == "" && uri.Fragment == "");
        using var request = new HttpRequestMessage(HttpMethod.Get, uri);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await token());
        request.Headers.Add("OData-Version", "4.0");
        request.Headers.Add("OData-MaxVersion", "4.0");
        request.Headers.Add("Prefer", "odata.include-annotations=\"Microsoft.Dynamics.CRM.lookuplogicalname\",odata.maxpagesize=500");
        using var cancel = CancellationTokenSource.CreateLinkedTokenSource(caller);
        cancel.CancelAfter(client.Timeout);
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancel.Token);
        Check.Require(response.Content.Headers.ContentLength is not long length || length <= bound);
        using var stream = await response.Content.ReadAsStreamAsync(cancel.Token);
        using var data = new MemoryStream();
        byte[] buffer = new byte[81920];
        int n;
        while ((n = await stream.ReadAsync(buffer, cancel.Token)) > 0)
        {
            Check.Require(data.Length + n <= bound && total + n <= 256L * 1024 * 1024);
            data.Write(buffer, 0, n);
            total += n;
        }
        byte[] bytes = data.ToArray();
        int index = ++serial;
        capture($"response-{index:D4}.bin", bytes);
        capture($"request-{index:D4}.json", System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(new
        {
            method = "GET",
            status = (int)response.StatusCode,
            url = uri.AbsoluteUri,
            receivedUtc = DateTime.UtcNow,
            bytes = bytes.Length,
            sha256 = Check.Hash(bytes)
        }));
        Check.Require(response.StatusCode == HttpStatusCode.OK || allowNotFound&&response.StatusCode==HttpStatusCode.NotFound);
        return (response.StatusCode,bytes);
    }
    public async Task<JsonObject> Object(string path)
    {
        var row = Check.Parse(await Get(path));
        Check.NoNestedContinuation(row);
        return row;
    }
    public async Task<JsonObject[]> Rows(string path, string idField, int max = 100000)
    {
        Check.Require(allowed.Contains(path));
        var first = new Uri(Target.Api + path);
        Uri next = first;
        var seenPages = new HashSet<string>();
        var ids = new HashSet<string>();
        var rows = new List<JsonObject>();
        long? advertised = null;
        for (int page = 0; page < 500; page++)
        {
            Check.Require(seenPages.Add(next.AbsoluteUri));
            var root = Check.Parse(await Send(next, 8 * 1024 * 1024));
            Check.Require(root.All(p => p.Key is "value" or "@odata.context" or "@odata.nextLink" or "@odata.count"));
            if (root["@odata.count"] != null)
            {
                long count = root["@odata.count"]!.GetValue<long>();
                Check.Require(count >= 0 && count <= max && (advertised == null || advertised == count));
                advertised = count;
            }
            Check.Require(root["value"] is JsonArray);
            foreach (var v in root["value"]!.AsArray())
            {
                var row = v as JsonObject ?? throw new Stop();
                Check.NoNestedContinuation(row);
                Check.Require(ids.Add(Check.Id(row, idField)) && rows.Count < max);
                rows.Add(row);
            }
            var link = root["@odata.nextLink"]?.GetValue<string>();
            if (link == null)
            {
                Check.Require(advertised == null || advertised == rows.Count);
                if (path == Queries.Receipts || path.Contains("$count=true", StringComparison.Ordinal) || apiChildren.Contains(path))
                    Check.Require(advertised != null);
                return rows.OrderBy(r => Check.Id(r, idField), StringComparer.Ordinal).ToArray();
            }
            next = ValidateNext(first, link);
        }
        throw new Stop();
    }
    public static Uri ValidateNext(Uri first, string link)
    {
        Check.Require(link.Length < 16384 && Uri.TryCreate(link, UriKind.Absolute, out var candidate));
        var next = new Uri(link);
        Check.Require(next.Scheme == first.Scheme && next.Host == first.Host && next.Port == first.Port && next.UserInfo == "" && next.Fragment == "" && next.AbsolutePath == first.AbsolutePath);
        var a = Query(first.Query);
        var b = Query(next.Query);
        Check.Require(b.Keys.All(k => a.ContainsKey(k) || k == "$skiptoken") && a.All(p => b.TryGetValue(p.Key, out var value) && value == p.Value) && b.TryGetValue("$skiptoken", out var skip) && skip.Length > 0 && skip.Length <= 12000);
        return next;
    }
    static Dictionary<string, string> Query(string query)
    {
        var result = new Dictionary<string, string>();
        foreach (var item in query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var pair = item.Split('=', 2);
            Check.Require(pair.Length == 2);
            Check.Require(result.TryAdd(Uri.UnescapeDataString(pair[0]), Uri.UnescapeDataString(pair[1])));
        }
        return result;
    }
    public void Dispose() => client.Dispose();
}
