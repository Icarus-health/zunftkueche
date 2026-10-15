using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Kitchen.Deploy;
namespace Kitchen.Acceptance;
[JsonConverter(typeof(JsonStringEnumConverter<FailureKind>))]
public enum FailureKind { unknown, guard_context, guard_target, invalid_guard_marker, invalid_execution_context, validation_prefix, invalid_json, request_required }
public sealed record Outcome(int Status, JsonNode? Value, bool GuardDenied=false, bool Unsupported=false, string? NumericCode=null,FailureKind FailureKind=FailureKind.unknown,int? GuardMask=null,int? ParentKind=null,int? WrapperMask=null,int? SourceMask=null,int? SourceKind=null) {
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
   code=ValidatedCode(code);
   string message=error.TryGetProperty("message",out var m)&&m.ValueKind==JsonValueKind.String?m.GetString()!:"";
   bool guard=status is 400 or 500 && (message.Contains("Direct kitchen table writes are blocked.",StringComparison.Ordinal)||message.Contains("Kitchen history mutations and bulk/direct writes are blocked.",StringComparison.Ordinal));
   // An absent action route does not prove the Standard-table operation was refused.
   // Microsoft documents this exact refusal; an unrecognized status/code/text fails closed.
   bool unsupported=status==400 && code!=null &&
    string.Equals(message,"DeleteMultiple has not yet been implemented.",StringComparison.Ordinal);
   var kind=KnownFailureKind(message);
   var facts=GuardFacts(status,code,kind,message);
   return new(status,null,guard,unsupported,code,kind,facts.Mask,facts.Parent,facts.Wrapper,facts.Source,facts.Kind);
  }catch(Exception e)when(e is JsonException or InvalidOperationException or KeyNotFoundException){return new(status,null);}
 }
 static (int? Mask,int? Parent,int? Wrapper,int? Source,int? Kind) GuardFacts(int status,string? code,FailureKind kind,string message) {
  if(status is not (400 or 500)||code!="0x80040265"||kind!=FailureKind.guard_context)return (null,null,null,null,null);
  const string prefix="Direct kitchen table writes are blocked. ";
  // Exact full message: no remote prefix/suffix, duplicate markers or unknown versions.
  var match=System.Text.RegularExpressions.Regex.Match(message,@"\ADirect kitchen table writes are blocked\. \[zk_guard_v1;m=(0|[1-9][0-9]{0,4});p=(0|[1-9][0-9]?)\](?: \[zk_guard_chain_v1;w=(0|[1-9][0-9]{0,2});s=(0|[1-9][0-9]{0,4});g=(0|[1-9][0-9]?)\])?\z",System.Text.RegularExpressions.RegexOptions.CultureInvariant);
  if(!message.StartsWith(prefix,StringComparison.Ordinal)||!match.Success)return (null,null,null,null,null);
  if(!int.TryParse(match.Groups[1].Value,out int mask)||mask>32767||!int.TryParse(match.Groups[2].Value,out int parent)||parent>10)return (null,null,null,null,null);
  if(!match.Groups[3].Success)return (mask,parent,null,null,null);
  if(parent is not (2 or 3)||!int.TryParse(match.Groups[3].Value,out int wrapper)||wrapper>127||!int.TryParse(match.Groups[4].Value,out int source)||source>32767||!int.TryParse(match.Groups[5].Value,out int sourceKind)||sourceKind>10)return (null,null,null,null,null);
  return (mask,parent,wrapper,source,sourceKind);
 }
 public static bool HasSafeGuardFacts(Outcome o)=>o.Status is 400 or 500&&o.NumericCode=="0x80040265"&&o.FailureKind==FailureKind.guard_context&&o.GuardMask is >=0 and <=32767&&o.ParentKind is >=0 and <=10;
 public static bool HasSafeChainFacts(Outcome o)=>HasSafeGuardFacts(o)&&o.ParentKind is 2 or 3&&o.WrapperMask is >=0 and <=127&&o.SourceMask is >=0 and <=32767&&o.SourceKind is >=0 and <=10;
 static FailureKind KnownFailureKind(string message) {
  if(message.Contains("Direct kitchen table writes are blocked.",StringComparison.Ordinal))return FailureKind.guard_context;
  if(message.Contains("Kitchen history mutations and bulk/direct writes are blocked.",StringComparison.Ordinal))return FailureKind.guard_target;
  if(message.Contains("Invalid kitchen write context.",StringComparison.Ordinal))return FailureKind.invalid_guard_marker;
  if(message.Contains("Invalid kitchen execution context.",StringComparison.Ordinal))return FailureKind.invalid_execution_context;
  if(message.Contains("Kitchen validation:",StringComparison.Ordinal))return FailureKind.validation_prefix;
  if(message.Contains("Kitchen request JSON is invalid.",StringComparison.Ordinal))return FailureKind.invalid_json;
  if(message.Contains("RequestJson is required.",StringComparison.Ordinal))return FailureKind.request_required;
  return FailureKind.unknown;
 }
 public static string? ValidatedCode(string? code)=>code is {Length:10} && code.StartsWith("0x",StringComparison.Ordinal) && code.AsSpan(2).ToArray().All(x=>x is >= '0' and <= '9' or >= 'a' and <= 'f' or >= 'A' and <= 'F')?code:null;
 public static string SafeError(Exception error)=>error is AcceptanceFault f&&f.Message.All(c=>c is >= 'a' and <= 'z' or '_')?f.Message:"acceptance_failed_details_suppressed";
}
public sealed class AcceptanceTransport:IAcceptanceTransport,IDisposable {
 readonly HttpClient client; readonly Func<Task<string>> token;
 readonly Uri root=new(Target.Url+"/api/data/v9.2/");
 public AcceptanceTransport(string url,Func<Task<string>> token,HttpMessageHandler? handler=null) {
  Target.ValidateUrl(url);this.token=token;
  client=new(handler??new HttpClientHandler{AllowAutoRedirect=false,UseCookies=false}){Timeout=TimeSpan.FromMinutes(3)};
 }
 public Task<byte[]> ReadPackageFileAsync(string packageId)=>PackageFileDownload.ReadAsync(client,token,packageId);
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
