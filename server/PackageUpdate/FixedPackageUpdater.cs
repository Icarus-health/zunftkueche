using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Kitchen.Deploy;
namespace Kitchen.PackageUpdate;

// Single-purpose updater. The only mutation is one conditional Content PATCH to the fixed existing package.
public sealed class FixedPackageUpdater:IDataverseTransport,IDisposable {
 public const string PackageId="70a54daa-73c8-f111-a05c-7ced8d5f6e0d";
 const string Row="pluginpackages("+PackageId+")";
 const string RowQuery=Row+"?$select=pluginpackageid,name,uniquename,version,statecode,package";
 const string Concurrency="EntityDefinitions(LogicalName='pluginpackage')?$select=IsOptimisticConcurrencyEnabled";
 readonly HttpClient client;readonly Func<Task<string>> token;readonly string objectId;
 bool started;
 public FixedPackageUpdater(Func<Task<string>> token,string objectId,HttpMessageHandler? handler=null) {
  this.token=token;this.objectId=objectId;
  client=new(handler??new HttpClientHandler{AllowAutoRedirect=false,UseCookies=false}){Timeout=TimeSpan.FromMinutes(3)};
 }
 public async Task<string> ExecuteAsync() {
  if(started)throw new DeploymentException("updater_already_used");started=true;
  Profiles.ValidateLocal();
  if(!Guid.TryParseExact(objectId,"D",out var oid)||oid==Guid.Empty)throw new DeploymentException("invalid_identity_object");
  await new ResourceEngine(this,objectId).AuthenticateTargetAsync();
  var capability=await SendAsync(HttpMethod.Get,Concurrency);
  if(capability?["IsOptimisticConcurrencyEnabled"]?.GetValue<bool>()!=true)throw new DeploymentException("package_concurrency_required");
  string etag=await ReadIdentity();
  byte[] prior=Profiles.ReadPinned(Profiles.PriorPath,Profiles.PriorHash,Profiles.PriorLength);
  byte[] current=Profiles.ReadPinned(Profiles.CurrentPath,Seed.PackageHash,PackageFileDownload.ExpectedLength);
  var before=await ReadFile();
  if(before.AsSpan().SequenceEqual(current))return "already_current";
  if(!before.AsSpan().SequenceEqual(prior))throw new DeploymentException("unexpected_existing_package_bytes");
  try {
   using var request=await Request(HttpMethod.Patch,Row);
   request.Headers.IfMatch.Add(EntityTagHeaderValue.Parse(etag));
   request.Content=new StringContent(new JsonObject{["content"]=Convert.ToBase64String(current)}.ToJsonString(),Encoding.UTF8,"application/json");
   using var timeout=new CancellationTokenSource(client.Timeout);
   // Status or body cannot establish success. No body is logged, parsed, persisted or retried.
   using var response=await client.SendAsync(request,HttpCompletionOption.ResponseHeadersRead,timeout.Token);
  } catch(Exception) { /* Ambiguous outcome: independent fixed-resource readback below, never repeat. */ }
  try {
   await ReadIdentity();var after=await ReadFile();
   if(after.AsSpan().SequenceEqual(current))return "updated_exact";
   if(after.AsSpan().SequenceEqual(prior))return "unchanged_prior";
  } catch(Exception) { /* No remote details escape; Root must investigate read-only. */ }
  return "unconfirmed";
 }
 async Task<string> ReadIdentity() {
  var row=await SendAsync(HttpMethod.Get,RowQuery)??throw new DeploymentException("package_missing");
  ResourceEngine.RequireMatch(row,new JsonObject{["pluginpackageid"]=PackageId,["name"]="zk_Zunftkueche.Dataverse",["uniquename"]="zk_Zunftkueche.Dataverse",["version"]="1.0.0",["statecode"]=0});
  ResourceEngine.Id(row,"package");
  string? etag=row["@odata.etag"]?.GetValue<string>();
  if(etag==null||!Regex.IsMatch(etag,"\\AW/\"[0-9]{1,20}\"\\z",RegexOptions.CultureInvariant))throw new DeploymentException("package_etag_required");
  return etag;
 }
 // ResourceEngine is reused for exact account/object/organization/language/currency checks.
 // Public interface is read-only and rejects every path outside this small fixed set.
 public async Task<JsonNode?> SendAsync(HttpMethod method,string relativePath,JsonNode? payload=null) {
  if(method!=HttpMethod.Get||payload!=null||!AllowedRead(relativePath))throw new DeploymentException("updater_read_path_rejected");
  var bytes=await Read(relativePath,8192,false);
  return JsonNode.Parse(bytes,documentOptions:new JsonDocumentOptions{MaxDepth=16});
 }
 static bool AllowedRead(string path) => path is "WhoAmI" or RowQuery or Concurrency ||
  path=="organizations("+Target.Organization+")?$select=languagecode,_basecurrencyid_value" ||
  Regex.IsMatch(path,@"\Asystemusers\([0-9a-f-]{36}\)\?\$select=domainname,isdisabled,azureactivedirectoryobjectid\z",RegexOptions.CultureInvariant)||
  Regex.IsMatch(path,@"\Atransactioncurrencies\([0-9a-f-]{36}\)\?\$select=isocurrencycode\z",RegexOptions.CultureInvariant);
 Task<byte[]> ReadFile()=>Read(Row+"/package/$value",Math.Max(Profiles.PriorLength,PackageFileDownload.ExpectedLength),true);
 async Task<byte[]> Read(string path,int bound,bool file) {
  using var request=await Request(HttpMethod.Get,path);
  request.Headers.Accept.Add(new(file?"application/octet-stream":"application/json"));
  using var timeout=new CancellationTokenSource(client.Timeout);
  using var response=await client.SendAsync(request,HttpCompletionOption.ResponseHeadersRead,timeout.Token);
  if(response.StatusCode!=HttpStatusCode.OK)throw new DeploymentException("package_read_refused");
  if(response.Content.Headers.ContentLength is long length&&(length>bound||(file&&length!=Profiles.PriorLength&&length!=PackageFileDownload.ExpectedLength)))throw new DeploymentException("package_read_bound");
  using var stream=await response.Content.ReadAsStreamAsync(timeout.Token);var buffer=new byte[bound+1];int count=0;
  while(count<buffer.Length){int n=await stream.ReadAsync(buffer.AsMemory(count),timeout.Token);if(n==0)break;count+=n;}
  if(count>bound||(file&&count!=Profiles.PriorLength&&count!=PackageFileDownload.ExpectedLength))throw new DeploymentException("package_read_bound");
  return buffer[..count];
 }
 async Task<HttpRequestMessage> Request(HttpMethod method,string path) {
  var request=new HttpRequestMessage(method,Target.Url+"/api/data/v9.2/"+path);
  request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",await token());
  request.Headers.Add("OData-MaxVersion","4.0");request.Headers.Add("OData-Version","4.0");return request;
 }
 public void Dispose()=>client.Dispose();
}
