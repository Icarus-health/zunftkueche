using System.Text.Json.Nodes;
using Kitchen.Deploy;
namespace Kitchen.Acceptance;
public sealed record Probe(string Check, HttpMethod Method, string Path, string? Body, bool UpdateOnly = false, bool Unsupported = false);
public static class Scope {
 public const string Workspace = "zk_kitchenworkspace", Operation = "zk_kitchenoperation";
 public const string CommitOperation = "8e73764d-8e28-4c0f-b24d-c7a686e23ed3", ConflictOperation = "dc317607-f344-4e0f-a597-33322424571b";
 public const string MarkerState = "{\"acceptanceOnly\":true,\"marker\":\"kitchen-runtime-2026-10-15\"}";
 public const string RecordedAt = "2026-10-15T00:00:00Z";
 public static readonly string[] WorkspaceCanaries = ["fb82b1ce-01eb-496c-8d8c-c63c386ebc40", "439792a9-1b67-4287-8775-6fd831e36026"];
 public static readonly string[] ReceiptCanaries = ["576fe0cc-f64b-42f0-a073-40041c32118d", "3b58aeab-9905-49eb-bd38-e865481dfc93"];
 public static readonly string[] ReceiptOperations = ["bac8345e-afdb-4d0a-93ee-871440151d20", "3d9ea0ef-ac8c-4475-b450-51e3263c9078"];
 public static readonly string[] MissingWorkspaces = ["bf206a46-9816-46c6-bd4f-f80540fae828", "5b8ee9c7-516f-44d3-a322-7e075471a5a9"];
 public static readonly string[] MissingReceipts = ["4db43c23-1e40-43c2-a545-f9326c4de950", "83b955f3-c187-415d-b0ac-889857bfa214"];
 public static string[] Existing(string table) => table switch { Workspace => WorkspaceCanaries.ToArray(), Operation => ReceiptCanaries.ToArray(), _ => throw new DeploymentException("unknown_acceptance_table") };
 public static string[] Missing(string table) => table switch { Workspace => MissingWorkspaces.ToArray(), Operation => MissingReceipts.ToArray(), _ => throw new DeploymentException("unknown_acceptance_table") };
 public static string ValidateSet(string table, string set) {
  Existing(table);
  if(set.Length is < 3 or > 100 || !set.All(c=>c is >= 'a' and <= 'z' or >= '0' and <= '9' or '_'))throw new DeploymentException("invalid_entity_set");
  return set;
 }
 public static JsonObject Row(string table, int index, Guid actor, string workspaceSet, bool missing=false) {
  string id=(missing?Missing(table):Existing(table))[index];
  var row=new JsonObject{[table+"id"]=id,["zk_name"]="ACCEPTANCE ONLY kitchen runtime "+(missing?"absent ":"canary ")+index};
  if(table==Workspace){row["zk_state"]=MarkerState;row["zk_revision"]=0;row["ownerid@odata.bind"]=$"/systemusers({actor:D})";}
  else {
   row["zk_workspace@odata.bind"]=$"/{ValidateSet(Workspace,workspaceSet)}({WorkspaceCanaries[0]})";
   row["zk_operationid"]=missing?id:ReceiptOperations[index];row["zk_requesthash"]=new string('a',64);
   row["zk_actor"]=actor.ToString("D");row["zk_appliedrevision"]=1;row["zk_recordedat"]=RecordedAt;
  }
  return row;
 }
 public static IReadOnlyList<Probe> SupportedProbes(string table,string set,Guid actor,string workspaceSet) {
  var plan=Probes(table,set,actor,workspaceSet);
  return ValidateSupportedPlan(table,set,plan);
 }
 public static IReadOnlyList<Probe> ValidateSupportedPlan(string table,string set,IReadOnlyList<Probe> plan) {
  ValidateSet(table,set);
  var names=new[]{"create","update","delete","upsert_existing","upsert_missing","create_multiple_1","create_multiple_2","update_multiple_1","update_multiple_2","upsert_multiple_existing_1","upsert_multiple_missing_1","upsert_multiple_mixed_2","delete_multiple"};
  if(plan.Count!=13||!plan.Select(p=>p.Check).SequenceEqual(names.Select(n=>table+"_"+n)))throw new AcceptanceFault("denial_plan_drift");
  var unavailable=plan[12];
  if(!unavailable.Unsupported||unavailable.Method!=HttpMethod.Post||unavailable.Path!=set+"/Microsoft.Dynamics.CRM.DeleteMultiple"||plan.Take(12).Any(p=>p.Unsupported||p.Path.Contains("DeleteMultiple",StringComparison.Ordinal)))throw new AcceptanceFault("denial_plan_drift");
  return plan.Take(12).ToArray();
 }
 public static IReadOnlyList<Probe> Probes(string table,string set,Guid actor,string workspaceSet="zk_kitchenworkspaces") {
  ValidateSet(table,set); var ids=Existing(table);var missing=Missing(table);var list=new List<Probe>();
  void Add(string name,HttpMethod method,string path,JsonNode? body=null,bool update=false,bool unsupported=false)=>list.Add(new(table+"_"+name,method,path,body?.ToJsonString(),update,unsupported));
  JsonObject New(int i)=>Row(table,i,actor,workspaceSet,true);
  JsonObject Update(int i)=>new(){[table+"id"]=ids[i],["zk_name"]="ACCEPTANCE ONLY prohibited rename"};
  Add("create",HttpMethod.Post,set,New(0));
  Add("update",HttpMethod.Patch,$"{set}({ids[0]})",new JsonObject{["zk_name"]="ACCEPTANCE ONLY prohibited rename"},true);
  Add("delete",HttpMethod.Delete,$"{set}({ids[1]})");
  Add("upsert_existing",HttpMethod.Patch,$"{set}({ids[0]})",new JsonObject{["zk_name"]="ACCEPTANCE ONLY prohibited rename"});
  Add("upsert_missing",HttpMethod.Patch,$"{set}({missing[0]})",New(0));
  void Bulk(string name,string suffix,params JsonObject[] rows) {
   foreach(var r in rows)r["@odata.type"]="Microsoft.Dynamics.CRM."+table;
   Add(suffix,HttpMethod.Post,set+"/Microsoft.Dynamics.CRM."+name,new JsonObject{["Targets"]=new JsonArray(rows.Cast<JsonNode>().ToArray())});
  }
  Bulk("CreateMultiple","create_multiple_1",New(0));Bulk("CreateMultiple","create_multiple_2",New(0),New(1));
  Bulk("UpdateMultiple","update_multiple_1",Update(0));Bulk("UpdateMultiple","update_multiple_2",Update(0),Update(1));
  Bulk("UpsertMultiple","upsert_multiple_existing_1",Update(0));Bulk("UpsertMultiple","upsert_multiple_missing_1",New(0));
  Bulk("UpsertMultiple","upsert_multiple_mixed_2",Update(0),New(0));
  var references=ids.Select(id=>(JsonNode)new JsonObject{["@odata.type"]="Microsoft.Dynamics.CRM."+table,[table+"id"]=id}).ToArray();
  Add("delete_multiple",HttpMethod.Post,set+"/Microsoft.Dynamics.CRM.DeleteMultiple",new JsonObject{["Targets"]=new JsonArray(references)},unsupported:true);
  return list;
 }
}
