using System.Text.Json.Nodes;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Kitchen.Acceptance;
using Kitchen.Deploy;
using Zunftkueche;
public sealed class Fake(Func<Probe,Task<Outcome>> run):IAcceptanceTransport {
 public List<Probe> Calls {get;}=[];
 public async Task<Outcome> ProbeAsync(Probe probe){Calls.Add(probe);return await run(probe);}
 public async Task<JsonNode?> SendAsync(HttpMethod method,string path,JsonNode? body=null){var result=await ProbeAsync(new("read",method,path,body?.ToJsonString()));if(!result.Success)throw new AcceptanceFault("fake_http_refused");return result.Value;}
}
public sealed class PreflightFake:IAcceptanceTransport {
 public static readonly Guid Actor=Guid.Parse("d9e20213-6895-4480-92f1-66bbb3262e65");
 public const string ObjectId="9e78b093-8f98-4b74-a030-009bb5ee0f30";
 public JsonObject Contract=Provisioner.LoadContract("server/deployment/registration.json");
 public Dictionary<string,JsonObject> Rows=[];
 public List<Probe> Calls=[];
 public int Writes=>Calls.Count(c=>c.Method!=HttpMethod.Get);
 public bool Guards,Elastic,WrongOrganization,WrongObject,WrongLanguage,WrongCurrency,AmbiguousCreate,CreateInvisible;
 const string Id="00000000-0000-0000-0000-000000000001";
 static JsonObject List(params JsonObject[] rows)=>new(){["value"]=new JsonArray(rows.Select(r=>r.DeepClone()).ToArray())};
 public async Task<JsonNode?> SendAsync(HttpMethod method,string path,JsonNode? payload=null){var result=await ProbeAsync(new("read",method,path,payload?.ToJsonString()));if(!result.Success)throw new AcceptanceFault("fake_http_refused");return result.Value;}
 public Task<Outcome> ProbeAsync(Probe probe) {
  Calls.Add(probe);string path=probe.Path;
  Outcome Ok(JsonNode? row)=>new(200,row);
  if(probe.Method==HttpMethod.Post){
   if(path is not ("zk_kitchenworkspaces" or "zk_kitchenoperations"))throw new Exception("unexpected_write_route");
   var row=JsonNode.Parse(probe.Body!)!.AsObject();string table=path=="zk_kitchenworkspaces"?Scope.Workspace:Scope.Operation;
   string id=row[table+"id"]!.GetValue<string>();
   if(!Scope.Existing(table).Contains(id))throw new Exception("write_outside_fixed_scope");
   row.Remove("ownerid@odata.bind");row.Remove("zk_workspace@odata.bind");
   if(table==Scope.Workspace)row["_ownerid_value"]=Actor.ToString("D");else row["_zk_workspace_value"]=Scope.WorkspaceCanaries[0];
   if(!CreateInvisible)Rows[path+"("+id+")"]=row;
   if(AmbiguousCreate)throw new HttpRequestException("Bearer secret https://private.example");
   return Task.FromResult(new Outcome(204,null));
  }
  if(path=="WhoAmI")return Task.FromResult(Ok(new JsonObject{["OrganizationId"]=WrongOrganization?Id:Target.Organization,["UserId"]=Actor.ToString("D")}));
  if(path.StartsWith("systemusers("))return Task.FromResult(Ok(new JsonObject{["domainname"]=Target.User,["isdisabled"]=false,["azureactivedirectoryobjectid"]=WrongObject?Id:ObjectId}));
  if(path.StartsWith("organizations("))return Task.FromResult(Ok(new JsonObject{["languagecode"]=WrongLanguage?1033:1031,["_basecurrencyid_value"]=Id}));
  if(path.StartsWith("transactioncurrencies("))return Task.FromResult(Ok(new JsonObject{["isocurrencycode"]=WrongCurrency?"USD":"EUR"}));
  if(path.StartsWith("publishers?"))return Task.FromResult(Ok(List(new JsonObject{["publisherid"]=Id,["uniquename"]="zk_Zunftkueche",["customizationprefix"]="zk",["customizationoptionvalueprefix"]=72700})));
  if(path.StartsWith("solutions?"))return Task.FromResult(Ok(List(new JsonObject{["solutionid"]=Id,["uniquename"]=Target.Solution,["version"]="1.0.0.0",["ismanaged"]=false,["_publisherid_value"]=Id})));
  if(path.StartsWith("solutioncomponents?"))return Task.FromResult(Ok(List(new JsonObject{["solutioncomponentid"]=Id})));
  if(path.StartsWith("RelationshipDefinitions")){
   var r=Metadata.Relationship();foreach(var field in new[]{"@odata.type","Lookup","AssociatedMenuConfiguration"})r.Remove(field);r["ReferencingAttribute"]="zk_workspace";return Task.FromResult(Ok(List(r)));
  }
  if(path.StartsWith("EntityDefinitions")) {
   var spec=Contract["tables"]!.AsArray().Single(s=>path.Contains("'"+s!["logicalName"]!.GetValue<string>()+"'"))!;
   string table=spec["logicalName"]!.GetValue<string>();
   if(path.Contains("/Attributes")){
    var attr=spec["attributes"]!.AsArray().Single(a=>path.Contains("'"+a!["name"]!.GetValue<string>()+"'"))!;
    return Task.FromResult(Ok(List(Metadata.AttributeExpected(attr,attr["name"]!.GetValue<string>()=="zk_name"))));
   }
   if(path.Contains("/Keys"))return Task.FromResult(Ok(List(new JsonObject{["SchemaName"]="zk_workspace_operation",["KeyAttributes"]=new JsonArray("zk_workspace","zk_operationid"),["EntityKeyIndexStatus"]="Active"})));
   var metadata=new JsonObject{["MetadataId"]=Id,["SchemaName"]=table,["LogicalName"]=table,["OwnershipType"]=spec["ownershipType"]!.DeepClone(),["IsActivity"]=false,["IsOptimisticConcurrencyEnabled"]=true,["TableType"]=Elastic?"Elastic":"Standard",["PrimaryNameAttribute"]="zk_name",["PrimaryIdAttribute"]=table+"id",["EntitySetName"]=table+"s"};
   return Task.FromResult(Ok(path.StartsWith("EntityDefinitions(")?metadata:List(metadata)));
  }
  if(path.StartsWith("sdkmessageprocessingsteps?"))return Task.FromResult(Ok(Guards?List(new JsonObject{["sdkmessageprocessingstepid"]=Id}):List()));
  if(path.StartsWith("plugintypes?"))return Task.FromResult(Ok(List()));
  if(path.StartsWith("zk_kitchenworkspaces(")||path.StartsWith("zk_kitchenoperations("))return Task.FromResult(Rows.TryGetValue(path.Split('?')[0],out var found)?Ok(found.DeepClone()):new Outcome(404,null));
  throw new Exception("unexpected_read_route");
 }
 public Session Session()=>new(this,ObjectId,Contract,Seed.Normalize(File.ReadAllBytes("import/2026.json")),[]);
}
public sealed class RuntimeFake:IAcceptanceTransport,IKitchenStore {
 public Guid Actor=PreflightFake.Actor;
 public JObject State=JObject.Parse(Seed.Normalize(File.ReadAllBytes("import/2026.json")).ToJsonString());
 public List<JsonObject> Receipts=[];
 public List<Probe> Calls=[];
 public int Commits,WriteRequests;
 public string Failure="";
 public Task<JsonNode?> SendAsync(HttpMethod method,string path,JsonNode? payload=null)=>throw new Exception("unexpected_metadata");
 public Task<Outcome> ProbeAsync(Probe probe) {
  Calls.Add(probe);string raw=JsonNode.Parse(probe.Body!)!["RequestJson"]!.GetValue<string>();
  JObject result;
  if(probe.Path=="zk_KitchenLoad")result=Protocol.Load(raw,this);
  else {
   WriteRequests++;
   if(Failure=="before")throw new HttpRequestException("secret");
   if(Failure=="fault")return Task.FromResult(new Outcome(500,null));
   result=Protocol.Commit(raw,Actor,true,this);
   if(Failure=="after")throw new TaskCanceledException("secret");
   if(Failure=="body")return Task.FromResult(new Outcome(200,new JsonObject{["ResultJson"]="{invalid"}));
  }
  return Task.FromResult(new Outcome(200,new JsonObject{["ResultJson"]=result.ToString(Formatting.None)}));
 }
 public Workspace Read(Guid id)=>new(){Id=id,Revision=(int)State["revision"]!,State=(JObject)State.DeepClone(),CanWrite=true,RowVersion="1"};
 public ReceiptRecord? FindReceipt(Guid workspaceId,string op){var row=Receipts.SingleOrDefault(r=>r["zk_operationid"]!.GetValue<string>()==op);return row==null?null:new(){Hash=row["zk_requesthash"]!.GetValue<string>(),Actor=Guid.Parse(row["zk_actor"]!.GetValue<string>()),AppliedRevision=row["zk_appliedrevision"]!.GetValue<int>()};}
 public void Commit(Workspace prior,JObject next,string op,string hash,Guid actor,DateTime timestamp) {
  Commits++;State=(JObject)next.DeepClone();
  Receipts.Add(new JsonObject{["zk_kitchenoperationid"]="0142f058-a3f0-4ea3-bdfe-4b40af4fb64a",["_zk_workspace_value"]=Seed.WorkspaceId,["zk_operationid"]=op,["zk_requesthash"]=hash,["zk_actor"]=actor.ToString("D"),["zk_appliedrevision"]=(int)next["revision"]!,["zk_recordedat"]=timestamp.ToUniversalTime().ToString("O")});
 }
 public Task<JsonObject?> Workspace()=>Task.FromResult<JsonObject?>(new(){["zk_kitchenworkspaceid"]=Seed.WorkspaceId,["_ownerid_value"]=Actor.ToString("D"),["zk_state"]=State.ToString(Formatting.None),["zk_revision"]=(int)State["revision"]!});
 public Task<JsonObject[]> ReadReceipts()=>Task.FromResult(Receipts.Select(r=>r.DeepClone().AsObject()).ToArray());
 public Task<Fingerprint> Snapshot()=>Task.FromResult(new Fingerprint(Checks.Hash(new JsonObject{["state"]=JsonNode.Parse(State.ToString(Formatting.None)),["receipts"]=new JsonArray(Receipts.Select(r=>r.DeepClone()).ToArray())}),Receipts.Count,(int)State["revision"]!));
 public Task Run(Evidence e)=>RuntimeChecks.Run(this,Actor,Workspace,ReadReceipts,Snapshot,e);
}
public sealed class ResponseHandler(Func<HttpRequestMessage,HttpResponseMessage> response):HttpMessageHandler {
 protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token)=>Task.FromResult(response(request));
}
public sealed class CountingStream(byte[] bytes):MemoryStream(bytes) {
 public int BytesRead;
 public override ValueTask<int> ReadAsync(Memory<byte> buffer,CancellationToken token=default){var count=base.Read(buffer.Span);BytesRead+=count;return ValueTask.FromResult(count);}
}
