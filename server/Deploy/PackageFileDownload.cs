using System.Net;
using System.Net.Http.Headers;
namespace Kitchen.Deploy;

// Read only the reviewed package file. No arbitrary URL, column, range or redirect is accepted.
public static class PackageFileDownload {
    public const int ExpectedLength = 297290;
    public static async Task<byte[]> ReadAsync(HttpClient client, Func<Task<string>> token, string packageId) {
        if (!Guid.TryParseExact(packageId, "D", out var id) || id == Guid.Empty)
            throw new DeploymentException("invalid_package_id");
        using var request = new HttpRequestMessage(HttpMethod.Get, Target.Url + $"/api/data/v9.2/pluginpackages({id:D})/package/$value");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await token());
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/octet-stream"));
        request.Headers.Add("OData-MaxVersion", "4.0"); request.Headers.Add("OData-Version", "4.0");
        using var timeout = new CancellationTokenSource(client.Timeout);
        try {
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
            if (!response.IsSuccessStatusCode)
                throw new DeploymentException(await WebApiTransport.RefusalCode(response, timeout.Token));
            if (response.StatusCode != HttpStatusCode.OK)
                throw new DeploymentException("package_file_full_response_required");
            if (response.Content.Headers.ContentLength is long length && length != ExpectedLength)
                throw new DeploymentException("package_file_length_mismatch");
            using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
            var bytes = new byte[ExpectedLength + 1]; int count = 0;
            while (count < bytes.Length) {
                int read = await stream.ReadAsync(bytes.AsMemory(count, bytes.Length - count), timeout.Token);
                if (read == 0) break;
                count += read;
            }
            if (count != ExpectedLength) throw new DeploymentException("package_file_length_mismatch");
            return bytes[..count];
        } catch (Exception error) when (error is HttpRequestException or IOException or OperationCanceledException) {
            throw new DeploymentException("package_file_read_failed");
        }
    }
}
