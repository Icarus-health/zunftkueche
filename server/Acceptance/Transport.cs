using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Kitchen.Deploy;
namespace Kitchen.Acceptance;
[JsonConverter(typeof(JsonStringEnumConverter<FailureKind>))]
public enum FailureKind { unknown, guard_context, guard_target, invalid_guard_marker, invalid_execution_context, validation_prefix, invalid_json, request_required }
public sealed record DecorationFacts(int Measured,int Presence,int Types,int Nulls,int Matches,int DateKind,int UnknownCount);
public sealed record Outcome(int Status, JsonNode? Value, bool GuardDenied=false, bool Unsupported=false, string? NumericCode=null,FailureKind FailureKind=FailureKind.unknown,int? GuardMask=null,int? ParentKind=null,int? WrapperMask=null,int? SourceMask=null,int? SourceKind=null,int? GuardVersion=null,int? BindingReason=null,int? TargetMask=null,int? TargetCount=null,int? TargetIdPresence=null,DecorationFacts? Decoration=null) {
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
   var target=TargetFacts(status,code,kind,message);
   return new(status,null,guard,unsupported,code,kind,facts.Mask,facts.Parent,facts.Wrapper,facts.Source,facts.Kind,facts.Version,BindingFact(status,code,kind,message),target.Mask,target.Count,target.Presence,target.Decoration);
  }catch(Exception e)when(e is JsonException or InvalidOperationException or KeyNotFoundException){return new(status,null);}
 }
 static (int? Mask,int? Parent,int? Wrapper,int? Source,int? Kind,int? Version) GuardFacts(int status,string? code,FailureKind kind,string message) {
  if(status is not (400 or 500)||code!="0x80040265"||kind!=FailureKind.guard_context)return (null,null,null,null,null,null);
  // v1 retains historical marker bits. v2 reserves these bits; versions must match exactly.
  var match=System.Text.RegularExpressions.Regex.Match(message,@"\ADirect kitchen table writes are blocked\. \[zk_guard_v(?<version>[12]);m=(?<mask>0|[1-9][0-9]{0,4});p=(?<parent>0|[1-9][0-9]?)\](?: \[zk_guard_chain_v\k<version>;w=(?<wrapper>0|[1-9][0-9]{0,2});s=(?<source>0|[1-9][0-9]{0,4});g=(?<kind>0|[1-9][0-9]?)\])?\z",System.Text.RegularExpressions.RegexOptions.CultureInvariant);
  if(!match.Success)return (null,null,null,null,null,null);
  int version=int.Parse(match.Groups["version"].Value,System.Globalization.CultureInfo.InvariantCulture);
  if(!int.TryParse(match.Groups["mask"].Value,out int mask)||mask>32767||!int.TryParse(match.Groups["parent"].Value,out int parent)||parent>10||(version==2&&(mask&6144)!=0))return (null,null,null,null,null,null);
  if(!match.Groups["wrapper"].Success)return (mask,parent,null,null,null,version);
  if(parent is not (2 or 3)||!int.TryParse(match.Groups["wrapper"].Value,out int wrapper)||wrapper>127||!int.TryParse(match.Groups["source"].Value,out int source)||source>32767||!int.TryParse(match.Groups["kind"].Value,out int sourceKind)||sourceKind>10||(version==2&&(source&6144)!=0))return (null,null,null,null,null,null);
  return (mask,parent,wrapper,source,sourceKind,version);
 }
 static int? BindingFact(int status,string? code,FailureKind kind,string message) {
  if(status is not (400 or 500)||code!="0x80040265"||kind!=FailureKind.guard_context)return null;
  var match=System.Text.RegularExpressions.Regex.Match(message,@"\ADirect kitchen table writes are blocked\. \[zk_guard_binding_v1;b=([1-5])\]\z",System.Text.RegularExpressions.RegexOptions.CultureInvariant);
  return match.Success?int.Parse(match.Groups[1].Value,System.Globalization.CultureInfo.InvariantCulture):null;
 }
 static (int? Mask,int? Count,int? Presence,DecorationFacts? Decoration) TargetFacts(int status,string? code,FailureKind kind,string message) {
  if(status is not (400 or 500)||code!="0x80040265"||kind!=FailureKind.guard_target)return (null,null,null,null);
  var match=System.Text.RegularExpressions.Regex.Match(message,@"\AKitchen history mutations and bulk/direct writes are blocked\. \[zk_guard_target_v1;m=(0|[1-9][0-9]{0,2});n=(0|[1-9][0-9]?);i=([0-3])\](?: \[zk_guard_decor_v1;q=([01]);p=(0|[1-9][0-9]?);t=(0|[1-9][0-9]?);z=(0|[1-9][0-9]?);m=(0|[1-9][0-9]?);d=([0-3]);u=(0|[1-9][0-9]?)\])?\z",System.Text.RegularExpressions.RegexOptions.CultureInvariant);
  if(!match.Success||!int.TryParse(match.Groups[1].Value,out int mask)||mask>255||!int.TryParse(match.Groups[2].Value,out int count)||count>63)return (null,null,null,null);
  int Number(int group)=>int.Parse(match.Groups[group].Value,System.Globalization.CultureInfo.InvariantCulture);
  int presence=Number(3);
  if(!match.Groups[4].Success)return (mask,count,presence,null);
  var decoration=new DecorationFacts(Number(4),Number(5),Number(6),Number(7),Number(8),Number(9),Number(10));
  return ValidDecoration(mask,count,presence,decoration)?(mask,count,presence,decoration):(null,null,null,null);
 }
 static bool ValidDecoration(int mask,int count,int idPresence,DecorationFacts f) {
  if(f.Measured is <0 or >1||f.Presence is <0 or >15||f.Types is <0 or >15||f.Nulls is <0 or >15||f.Matches is <0 or >63||f.DateKind is <0 or >3||f.UnknownCount is <0 or >63)return false;
  if(f.Measured==0)return f.Presence==0&&f.Types==0&&f.Nulls==0&&f.Matches==0&&f.DateKind==0&&f.UnknownCount==0;
  if(mask==0||(mask&~30)!=0||(f.Types&~f.Presence)!=0||(f.Nulls&~f.Presence)!=0||(f.Types&f.Nulls)!=0)return false;
  if(((f.Matches&3)!=0&&(f.Types&1)==0)||((f.Matches&12)!=0&&(f.Types&2)==0)||((f.Matches&48)!=0&&(f.Types&8)==0))return false;
  if(((f.Types&4)!=0)!=(f.DateKind!=0)||(idPresence&1)!=(f.Presence&1)||((idPresence&2)!=0&&f.UnknownCount==0))return false;
  int business=((mask&8)==0?1:0)+((mask&16)==0?1:0);
  int known=business+System.Numerics.BitOperations.PopCount((uint)f.Presence);
  return count==Math.Min(63,known+f.UnknownCount)&&((mask&4)!=0)==(count!=2);
 }
 public static bool HasSafeDecorationFacts(Outcome o)=>HasSafeTargetFacts(o)&&o.Decoration is {} d&&ValidDecoration(o.TargetMask!.Value,o.TargetCount!.Value,o.TargetIdPresence!.Value,d);
 public static bool HasSafeGuardFacts(Outcome o)=>o.Status is 400 or 500&&o.NumericCode=="0x80040265"&&o.FailureKind==FailureKind.guard_context&&o.GuardMask is >=0 and <=32767&&o.ParentKind is >=0 and <=10&&o.GuardVersion is 1 or 2&&(o.GuardVersion!=2||(o.GuardMask.Value&6144)==0);
 public static bool HasSafeChainFacts(Outcome o)=>HasSafeGuardFacts(o)&&o.ParentKind is 2 or 3&&o.WrapperMask is >=0 and <=127&&o.SourceMask is >=0 and <=32767&&o.SourceKind is >=0 and <=10&&(o.GuardVersion!=2||(o.SourceMask.Value&6144)==0);
 public static bool HasSafeBindingFacts(Outcome o)=>o.Status is 400 or 500&&o.NumericCode=="0x80040265"&&o.FailureKind==FailureKind.guard_context&&o.BindingReason is >=1 and <=5;
 public static bool HasSafeTargetFacts(Outcome o)=>o.Status is 400 or 500&&o.NumericCode=="0x80040265"&&o.FailureKind==FailureKind.guard_target&&o.TargetMask is >=0 and <=255&&o.TargetCount is >=0 and <=63&&o.TargetIdPresence is >=0 and <=3;
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
