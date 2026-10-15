using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Kitchen.Deploy;
namespace Kitchen.Acceptance;
public sealed record Outcome(int Status, JsonNode? Value, bool GuardDenied=false, bool Unsupported=false, string? NumericCode=null) {
 public bool Success=>Status is >=200 and <=299;
}
public interface IAcceptanceTransport:IDataverseTransport {
 Task<Outcome> ProbeAsync(Probe probe);
}
public sealed class AcceptanceFault(string code):Exception(code);
public static class Diagnosis {
 public const int Limit=8192;
 public static Outcome Refusal(int status,ReadOnlySpan<byte> bytes) {
  if(bytes.Length>Limit)return new(status,null);
  try {
   using var doc=JsonDocument.Parse(bytes.ToArray(),new JsonDocumentOptions{MaxDepth=16});
   var error=doc.RootElement.GetProperty("error");
   string? code=error.TryGetProperty("code",out var c)&&c.ValueKind==JsonValueKind.String?c.GetString():null;
   if(code?.Length!=10||!code.StartsWith("0x",StringComparison.Ordinal)||!code.AsSpan(2).ToArray().All(x=>x is >= '0' and <= '9' or >= 'a' and <= 'f' or >= 'A' and <= 'F'))code=null;
   string message=error.TryGetProperty("message",out var m)&&m.ValueKind==JsonValueKind.String?m.GetString()!:"";
   bool guard=status is 400 or 500 && (message.Contains("Direct kitchen table writes are blocked.",StringComparison.Ordinal)||message.Contains("Kitchen history mutations and bulk/direct writes are blocked.",StringComparison.Ordinal));
   bool unsupported=status is 400 or 404 or 405 or 500 or 501 && message.Contains("DeleteMultiple",StringComparison.Ordinal) &&
    (message.Contains("DeleteMultiple has not yet been implemented.",StringComparison.Ordinal)||message.Contains("not supported",StringComparison.OrdinalIgnoreCase)||message.Contains("not available",StringComparison.OrdinalIgnoreCase)||message.Contains("Resource not found for the segment",StringComparison.Ordinal)||message.Contains("not a valid action",StringComparison.OrdinalIgnoreCase));
   return new(status,null,guard,unsupported,code);
  }catch(Exception e)when(e is JsonException or InvalidOperationException or KeyNotFoundException){return new(status,null);}
 }
 public static string SafeError(Exception error)=>error is AcceptanceFault f&&f.Message.All(c=>c is >= 'a' and <= 'z' or '_')?f.Message:"acceptance_failed_details_suppressed";
}
public sealed class AcceptanceTransport:IAcceptanceTransport,IDisposable {
 readonly HttpClient client; readonly Func<Task<string>> token;
 readonly Uri root=new(Target.Url+"/api/data/v9.2/");
 public AcceptanceTransport(string url,Func<Task<string>> token,HttpMessageHandler? handler=null) {
  Target.ValidateUrl(url);this.token=token;
  client=new(handler??new HttpClientHandler{AllowAutoRedirect=false,UseCookies=false}){Timeout=TimeSpan.FromMinutes(3)};
 }
 public async Task<JsonNode?> SendAsync(HttpMethod method,string relativePath,JsonNode? payload=null) {
  var result=await ProbeAsync(new("prerequisite",method,relativePath,payload?.ToJsonString()));
  if(method==HttpMethod.Get&&result.Status==404&&relativePath.Contains('(')&&!relativePath.Contains('?'))return null;
  if(!result.Success)throw new AcceptanceFault("prerequisite_http_refused");
  return result.Value;
 }
 public async Task<Outcome> ProbeAsync(Probe probe) {
  if(!new[]{HttpMethod.Get,HttpMethod.Post,HttpMethod.Patch,HttpMethod.Delete}.Contains(probe.Method))throw new AcceptanceFault("unsupported_http_method");
  if(!Uri.TryCreate(root,probe.Path,out var uri)||uri.Scheme!="https"||uri.Host!=root.Host||uri.Port!=443||!uri.AbsolutePath.StartsWith(root.AbsolutePath,StringComparison.Ordinal)||uri.UserInfo.Length!=0||uri.Fragment.Length!=0)throw new AcceptanceFault("unsafe_api_path");
  using var request=new HttpRequestMessage(probe.Method,uri);
  request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",await token());
  request.Headers.Accept.Add(new(probe.Path=="$metadata"?"application/xml":"application/json"));
  request.Headers.Add("OData-MaxVersion","4.0");request.Headers.Add("OData-Version","4.0");
  if(probe.UpdateOnly)request.Headers.TryAddWithoutValidation("If-Match","*");
  if(probe.Body!=null)request.Content=new ByteArrayContent(Encoding.UTF8.GetBytes(probe.Body)){Headers={ContentType=new("application/json"){CharSet="utf-8"}}};
  using var timeout=new CancellationTokenSource(client.Timeout);
  using var response=await client.SendAsync(request,HttpCompletionOption.ResponseHeadersRead,timeout.Token);
  int status=(int)response.StatusCode;
  int limit=response.IsSuccessStatusCode?64*1024*1024:Diagnosis.Limit;
  using var stream=await response.Content.ReadAsStreamAsync(timeout.Token);
  using var buffer=new MemoryStream();var block=new byte[8192];
  while(buffer.Length<=limit){int read=await stream.ReadAsync(block.AsMemory(0,Math.Min(block.Length,limit+1-(int)buffer.Length)),timeout.Token);if(read==0)break;buffer.Write(block,0,read);}
  var bytes=buffer.ToArray();
  if(!response.IsSuccessStatusCode)return Diagnosis.Refusal(status,bytes);
  if(bytes.Length>limit)throw new AcceptanceFault("response_bound_exceeded");
  if(bytes.Length==0)return new(status,null);
  return new(status,probe.Path=="$metadata"?JsonValue.Create(Encoding.UTF8.GetString(bytes)):JsonNode.Parse(bytes));
 }
 public void Dispose()=>client.Dispose();
}
