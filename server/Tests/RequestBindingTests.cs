using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using Microsoft.Crm.Sdk.Messages;
using Newtonsoft.Json.Linq;
using Zunftkueche;
static class RequestBindingTests
{
    static readonly Guid Actor=Guid.Parse("77777777-8888-4999-aaaa-bbbbbbbbbbbb");
    static readonly Guid Id=FakeStore.WorkspaceId;
    const string Marker="zk.KitchenCommit.InternalWrite.v1";
    static void Assert(bool v){if(!v)throw new Exception("request binding assertion");}
    static Dictionary<string,object?> Context(string message,int stage,string table="")=>new(){["MessageName"]=message,["Stage"]=stage,["Mode"]=0,["IsInTransaction"]=true,["UserId"]=Actor,["InitiatingUserId"]=Actor,["PrimaryEntityName"]=table,["InputParameters"]=new ParameterCollection(),["OutputParameters"]=new ParameterCollection(),["SharedVariables"]=new ParameterCollection()};
    static JObject Binding()=>new(){{"protocolVersion",1},{"workspaceId",Id.ToString("D")},{"operationId","operation"}};
    static Entity Target()=>new("zk_kitchenworkspace",Id){["zk_state"]="{}",["zk_revision"]=1};
    static string Denial(Action a){try{a();}catch(InvalidPluginExecutionException e){return e.Message;}throw new Exception("binding bypass accepted");}
    static void Guard(object? raw,Entity target,bool missing=false,string message="Update",bool wrapped=true){
        var source=Context("zk_KitchenCommit",30);if(!missing)((ParameterCollection)source["InputParameters"]!).Add("RequestJson",raw);
        var parent=ContextProxy.Create(source);
        if(wrapped){var wrapper=Context(message,30,target.LogicalName);wrapper["ParentContext"]=parent;wrapper["InputParameters"]=new ParameterCollection{{"RequestJson",Binding().ToString()}};wrapper["SharedVariables"]=new ParameterCollection{{Marker,Id+"|operation"},{"tag",Binding().ToString()}};parent=ContextProxy.Create(wrapper);}
        var current=Context(message,20,target.LogicalName);current["ParentContext"]=parent;current["InputParameters"]=new ParameterCollection{{"Target",target},{"RequestJson",Binding().ToString()}};current["SharedVariables"]=new ParameterCollection{{Marker,Id+"|operation"},{"tag",Binding().ToString()}};
        new KitchenWriteGuardPlugin().Execute(new GuardProvider(ContextProxy.Create(current)));
    }
    public static void Run(Action<string,Action> check,JObject seed){
        check("source request authorizes binding with absent or untrusted late marker",()=>{Guard(Binding().ToString(),Target());Guard(Binding().ToString(),Target(),wrapped:false);});
        check("source binding failures are fixed and cannot use current wrapper or tag copies",()=>{
            void Bad(object? raw,int reason,bool missing=false){var m=Denial(()=>Guard(raw,Target(),missing));Assert(m=="Direct kitchen table writes are blocked. [zk_guard_binding_v1;b="+reason+"]");}
            Bad(null,1,true);Bad(123,2);Bad(null,2);Bad("private-source-sentinel",3);Bad("{} {}",3);Bad("{\"a\":1,\"a\":2}",3);Bad("{\"a\":"+new string('[',40)+"0"+new string(']',40)+"}",3);Bad(new string('x',655361),3);
            foreach(var token in new JToken[]{JValue.CreateNull(),new JValue(""),new JValue("not-a-guid"),new JValue(Guid.Empty.ToString("D"))}){var q=Binding();q["workspaceId"]=token;Bad(q.ToString(),4);}
            var wrongProtocol=Binding();wrongProtocol["protocolVersion"]=2;Bad(wrongProtocol.ToString(),4);
            foreach(var token in new JToken[]{JValue.CreateNull(),new JValue(123),new JValue(" "),new JValue(new string('x',101))}){var q=Binding();q["operationId"]=token;Bad(q.ToString(),5);}
        });
        check("target diagnostics measure extra primary ID without permitting it",()=>{
            var extra=Target();extra["zk_kitchenworkspaceid"]=Id;var m=Denial(()=>Guard(Binding().ToString(),extra));Assert(m.EndsWith("[zk_guard_target_v1;m=4;n=3;i=1]")&&!m.Contains(Id.ToString()));
            extra=Target();extra["private-extra-name"]=Id;m=Denial(()=>Guard(Binding().ToString(),extra));Assert(m.EndsWith("[zk_guard_target_v1;m=4;n=3;i=0]")&&!m.Contains("private-extra-name"));
            extra=Target();for(int i=0;i<70;i++)extra["extra"+i]=i;Assert(Denial(()=>Guard(Binding().ToString(),extra)).EndsWith("[zk_guard_target_v1;m=4;n=63;i=0]"));
            extra=Target();extra.Id=Guid.NewGuid();Assert(Denial(()=>Guard(Binding().ToString(),extra)).EndsWith("[zk_guard_target_v1;m=2;n=2;i=0]"));
            extra=Target();extra.Attributes.Remove("zk_state");Assert(Denial(()=>Guard(Binding().ToString(),extra)).EndsWith("[zk_guard_target_v1;m=12;n=1;i=0]"));
            extra=Target();extra.Attributes.Remove("zk_revision");Assert(Denial(()=>Guard(Binding().ToString(),extra)).EndsWith("[zk_guard_target_v1;m=20;n=1;i=0]"));
            foreach(var field in new[]{"zk_workspace","zk_operationid","zk_actor"}){var receipt=new Entity("zk_kitchenoperation"){["zk_workspace"]=new EntityReference("zk_kitchenworkspace",Id),["zk_operationid"]="operation",["zk_actor"]=Actor.ToString("D")};receipt[field]=field=="zk_workspace"?new EntityReference("zk_kitchenworkspace",Guid.NewGuid()):"wrong";var bit=field=="zk_workspace"?32:field=="zk_operationid"?64:128;Assert(Denial(()=>Guard(Binding().ToString(),receipt,message:"Create")).EndsWith("[zk_guard_target_v1;m="+bit+";n=3;i=0]"));}
            Assert(Denial(()=>Guard(Binding().ToString(),Target(),message:"Delete",wrapped:false)).EndsWith("[zk_guard_target_v1;m=1;n=2;i=0]"));
        });
        check("target diagnostic failure remains fixed unknown",()=>{
            var broken=Context("Update",20);broken["MessageName"]=123;
            var method=typeof(KitchenWriteGuardPlugin).GetMethod("TargetDiagnostic",System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Static)!;
            Assert((string?)method.Invoke(null,new object[]{ContextProxy.Create(broken),Target(),Id,"operation"})=="[zk_guard_target_v1;m=0;n=0;i=0]");
        });
        check("real host validates before snapshot-bound direct and wrapped CAS receipt writes",()=>{
            foreach(var wrapped in new[]{false,true}){var service=new HostService(seed,wrapped);var raw=Request(seed).ToString();var result=service.Run(raw);Assert((string?)result["status"]=="saved"&&service.Writes.SequenceEqual(new[]{"Update","Create"})&&service.State.Value<int>("revision")==1&&service.Receipt!.GetAttributeValue<string>("zk_requesthash")==Protocol.Hash(raw));Assert(!service.LastContext!.SharedVariables.Contains(Marker));}
        });
        check("real host rejects invalid requests and permission before write and handles conflict replay",()=>{
            foreach(var failure in new[]{"schema","unknown","operation","candidate","permission","conflict"}){var svc=new HostService(seed,true);var q=Request(seed);switch(failure){case "schema":q["protocolVersion"]=2;break;case "unknown":q["extra"]=true;break;case "operation":q["operation"]!["type"]="arbitrary";break;case "candidate":q["candidateState"]!["menu"]![0]!["priceCents"]=1.23;break;case "permission":svc.CanWrite=false;break;case "conflict":q["expectedRevision"]=1;break;}
                try{var result=svc.Run(q.ToString());Assert(failure is "candidate" or "conflict");Assert((string?)result["status"]==(failure=="candidate"?"rejected":"conflict"));}catch(InvalidPluginExecutionException){Assert(failure is not ("candidate" or "conflict"));}Assert(svc.Writes.Count==0);
            }
            var service=new HostService(seed,true);var raw=Request(seed).ToString();service.Run(raw);int writes=service.Writes.Count;Assert((string?)service.Run(raw)["status"]=="saved"&&service.Writes.Count==writes);Denial(()=>service.Run(raw+" "));Denial(()=>service.Run(raw,Guid.NewGuid()));Assert(service.Writes.Count==writes);
        });
        check("real host CAS service fault escapes without receipt and still cleans marker",()=>{var svc=new HostService(seed,true){FailCas=true};try{svc.Run(Request(seed).ToString());throw new Exception("CAS swallowed");}catch(InvalidOperationException){Assert(svc.Writes.SequenceEqual(new[]{"Update"})&&svc.Receipt==null&&svc.State.Value<int>("revision")==0&&!svc.LastContext!.SharedVariables.Contains(Marker));}});
    }
    static JObject Request(JObject seed){var q=Binding();q["expectedRevision"]=0;q["operation"]=new JObject{{"type","article.price"},{"payload",new JObject{{"articleId",(string)seed["articles"]![0]!["id"]!},{"priceCents",12.34}}}};var candidate=(JObject)seed.DeepClone();candidate["articles"]![0]!["unitPriceCents"]=12.34;candidate["revision"]=1;((JArray)candidate["operationIds"]!).Add("operation");candidate["operationRequests"]!["operation"]="client-untrusted";q["candidateState"]=candidate;return q;}
    sealed class HostProvider(IPluginExecutionContext context,HostService service):IServiceProvider,IOrganizationServiceFactory {
        public object? GetService(Type t)=>t==typeof(IPluginExecutionContext)?context:t==typeof(IOrganizationServiceFactory)?this:null;
        public IOrganizationService CreateOrganizationService(Guid? user){Assert(user==context.UserId);return service;}
    }
    sealed class HostService(JObject seed,bool wrapped):IOrganizationService {
        public JObject State=(JObject)seed.DeepClone();public Entity? Receipt;public bool CanWrite=true,FailCas;public readonly List<string> Writes=[];public IPluginExecutionContext? LastContext;IPluginExecutionContext? snapshot;
        public JObject Run(string raw,Guid? actor=null){var values=Context("zk_KitchenCommit",30);values["InputParameters"]=new ParameterCollection{{"RequestJson",raw}};values["UserId"]=actor??Actor;values["InitiatingUserId"]=actor??Actor;LastContext=ContextProxy.Create(values);var copied=new Dictionary<string,object?>(values){["SharedVariables"]=new ParameterCollection(),["InputParameters"]=new ParameterCollection{{"RequestJson",raw}}};snapshot=ContextProxy.Create(copied);new KitchenCommitPlugin().Execute(new HostProvider(LastContext,this));return JObject.Parse((string)LastContext.OutputParameters["ResultJson"]);}
        void GuardWrite(string message,Entity entity){var parent=snapshot!;if(wrapped){var wrapper=Context(message,30,entity.LogicalName);wrapper["ParentContext"]=parent;parent=ContextProxy.Create(wrapper);}var current=Context(message,20,entity.LogicalName);current["ParentContext"]=parent;current["InputParameters"]=new ParameterCollection{{"Target",entity}};new KitchenWriteGuardPlugin().Execute(new GuardProvider(ContextProxy.Create(current)));Writes.Add(message);}
        public Entity Retrieve(string table,Guid id,ColumnSet columns){Assert(table=="zk_kitchenworkspace"&&id==Id);return new Entity(table,id){RowVersion="exact-rowversion",["zk_state"]=State.ToString(),["zk_revision"]=State.Value<int>("revision")};}
        public EntityCollection RetrieveMultiple(QueryBase q){Assert(q is QueryExpression query&&query.EntityName=="zk_kitchenoperation");return Receipt==null?new EntityCollection():new EntityCollection(new[]{Receipt});}
        public OrganizationResponse Execute(OrganizationRequest request){if(request is RetrievePrincipalAccessRequest access){Assert(access.Principal.Id==LastContext!.InitiatingUserId&&access.Target.Id==Id);var response=new RetrievePrincipalAccessResponse();response.Results["AccessRights"]=AccessRights.ReadAccess|(CanWrite?AccessRights.WriteAccess:0);return response;}Assert(request is UpdateRequest);var update=(UpdateRequest)request;Assert(update.ConcurrencyBehavior==ConcurrencyBehavior.IfRowVersionMatches&&update.Target.RowVersion=="exact-rowversion");GuardWrite("Update",update.Target);if(FailCas)throw new InvalidOperationException("synthetic CAS");State=JObject.Parse(update.Target.GetAttributeValue<string>("zk_state"));return new UpdateResponse();}
        public Guid Create(Entity entity){GuardWrite("Create",entity);Receipt=entity;return Guid.NewGuid();}
        public void Update(Entity e)=>throw new NotSupportedException();public void Delete(string a,Guid b)=>throw new NotSupportedException();public void Associate(string a,Guid b,Relationship c,EntityReferenceCollection d)=>throw new NotSupportedException();public void Disassociate(string a,Guid b,Relationship c,EntityReferenceCollection d)=>throw new NotSupportedException();
    }
}
