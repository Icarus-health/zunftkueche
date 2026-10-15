using System.Text.Json.Nodes;
using Kitchen.Deploy;
namespace Kitchen.Acceptance;
public sealed record PlatformInventory(JsonObject[] CustomSteps,int InternalCount,string DefinitionHash);
public static class PlatformSteps {
 public const string HandlerId="29efe3a5-047c-40a3-b89c-2787eff38eee";
 public const string TypeName="Microsoft.Crm.Extensibility.InternalOperationPlugin";
 public const string EvidenceSha256="9225d64b3e1794b8e9776b832ad506fe2c43f327c3bc450e89774c052fb421b4";
 public const string BaselineSha256="f322fabfaea9c8989004def892e1cee80104422c9ec60cf0615524da9c1feb3e";
 public const string TypeQuery="plugintypes?$select=plugintypeid,typename,assemblyname,publickeytoken,version,ismanaged,customizationlevel,_pluginassemblyid_value&$filter=typename eq 'Microsoft.Crm.Extensibility.InternalOperationPlugin'&$expand=pluginassemblyid($select=pluginassemblyid,name,publickeytoken,version,culture,sourcetype,isolationmode,ismanaged,ishidden,iscustomizable,_packageid_value)";
 const string Select="sdkmessageprocessingstepid,name,stage,mode,rank,statecode,supporteddeployment,ismanaged,ishidden,iscustomizable,customizationlevel,filteringattributes,_impersonatinguserid_value,_eventhandler_value,_sdkmessagefilterid_value,_sdkmessageid_value";
 const string Expand="sdkmessageid($select=sdkmessageid,name),sdkmessagefilterid($select=sdkmessagefilterid,primaryobjecttypecode,_sdkmessageid_value),eventhandler_plugintype($select=plugintypeid,typename,_pluginassemblyid_value)";
 static readonly Lazy<JsonObject> Baseline=new(LoadBaseline);
 public static string Query(string? kitchenGuardHandler=null) {
  string own="";
  if(kitchenGuardHandler!=null){if(!Guid.TryParseExact(kitchenGuardHandler,"D",out var id)||id==Guid.Empty)throw new AcceptanceFault("guard_handler_id_invalid");own=$"_eventhandler_value eq {id:D} or ";}
  return $"sdkmessageprocessingsteps?$select={Select}&$filter={own}startswith(name,'zk_KitchenGuard_') or sdkmessagefilterid/primaryobjecttypecode eq 'zk_kitchenworkspace' or sdkmessagefilterid/primaryobjecttypecode eq 'zk_kitchenoperation'&$expand={Expand}";
 }
 static JsonObject LoadBaseline() {
  using var stream=typeof(PlatformSteps).Assembly.GetManifestResourceStream("Kitchen.Acceptance.platform-intrinsics.json")??throw new AcceptanceFault("platform_baseline_missing");
  using var buffer=new MemoryStream();stream.CopyTo(buffer);var bytes=buffer.ToArray();
  if(Seed.Hash(bytes)!=BaselineSha256)throw new AcceptanceFault("platform_baseline_hash_mismatch");
  var baseline=JsonNode.Parse(bytes)!.AsObject();
  if(baseline["steps"]?.AsArray().Count!=52||ResourceEngine.Id(baseline["handler"]!,"plugintypeid")!=HandlerId)throw new AcceptanceFault("platform_baseline_invalid");
  return baseline;
 }
 public static PlatformInventory ValidateAndExclude(JsonObject handler,JsonObject[] inventory) {
  var baseline=Baseline.Value;
  ResourceEngine.RequireMatch(handler,baseline["handler"]);
  var known=baseline["steps"]!.AsArray().ToDictionary(r=>ResourceEngine.Id(r!,"sdkmessageprocessingstepid"),r=>r!.AsObject(),StringComparer.Ordinal);
  var found=new Dictionary<string,JsonObject>(StringComparer.Ordinal);var custom=new List<JsonObject>();var allIds=new HashSet<string>();
  foreach(var row in inventory) {
   string id=ResourceEngine.Id(row,"sdkmessageprocessingstepid");
   if(!allIds.Add(id))throw new AcceptanceFault("duplicate_processing_step_identity");
   if(!known.TryGetValue(id,out var expected)){custom.Add(row);continue;}
   // Exact environment-specific GUID + full definition and handler/assembly provenance.
   // No general stage30, Microsoft-name, hidden, managed, or bulk-message exception exists.
   ResourceEngine.RequireMatch(row,expected);
   found.Add(id,Project(row,expected)!.AsObject());
  }
  if(found.Count!=52)throw new AcceptanceFault("platform_main_operation_baseline_incomplete");
  var canonical=new JsonObject{["handler"]=Project(handler,baseline["handler"]!),["steps"]=new JsonArray(found.OrderBy(p=>p.Key,StringComparer.Ordinal).Select(p=>(JsonNode)p.Value).ToArray())};
  return new(custom.ToArray(),found.Count,Checks.Hash(canonical));
 }
 static JsonNode? Project(JsonNode? actual,JsonNode expected) {
  if(expected is JsonObject shape){var result=new JsonObject();foreach(var p in shape)result[p.Key]=p.Value==null?null:Project(actual![p.Key],p.Value);return result;}
  if(expected is JsonArray array)return new JsonArray(array.Select((value,i)=>value==null?null:Project(actual![i],value)).ToArray());
  return actual?.DeepClone();
 }
}
