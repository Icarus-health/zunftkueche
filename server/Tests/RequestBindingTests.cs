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
    static JObject Binding()=>new(){{"protocolVersion",2},{"workspaceId",Id.ToString("D")},{"operationId","operation"}};
    static Entity Target()=>new("zk_kitchenworkspace",Id){["zk_state"]="{}",["zk_revision"]=1};
    static Entity Decorate(Entity e){e["zk_kitchenworkspaceid"]=e.Id;e["modifiedby"]=new EntityReference("systemuser",Actor);e["modifiedon"]=new DateTime(2026,1,1,0,0,0,DateTimeKind.Utc);e["modifiedonbehalfby"]=null;return e;}
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
            var wrongProtocol=Binding();wrongProtocol["protocolVersion"]=1;Bad(wrongProtocol.ToString(),4);
            foreach(var token in new JToken[]{JValue.CreateNull(),new JValue(123),new JValue(" "),new JValue(new string('x',101))}){var q=Binding();q["operationId"]=token;Bad(q.ToString(),5);}
        });
        check("target diagnostics measure extra primary ID without permitting it",()=>{
            var extra=Target();extra["zk_kitchenworkspaceid"]=Id;var m=Denial(()=>Guard(Binding().ToString(),extra));Assert(m.Contains("[zk_guard_target_v1;m=4;n=3;i=1]")&&!m.Contains(Id.ToString()));
            extra=Target();extra["private-extra-name"]=Id;m=Denial(()=>Guard(Binding().ToString(),extra));Assert(m.Contains("[zk_guard_target_v1;m=4;n=3;i=0]")&&!m.Contains("private-extra-name"));
            extra=Target();for(int i=0;i<70;i++)extra["extra"+i]=i;Assert(Denial(()=>Guard(Binding().ToString(),extra)).Contains("[zk_guard_target_v1;m=4;n=63;i=0]"));
            extra=Target();extra.Id=Guid.NewGuid();Assert(Denial(()=>Guard(Binding().ToString(),extra)).Contains("[zk_guard_target_v1;m=2;n=2;i=0]"));
            extra=Target();extra.Attributes.Remove("zk_state");Assert(Denial(()=>Guard(Binding().ToString(),extra)).Contains("[zk_guard_target_v1;m=12;n=1;i=0]"));
            extra=Target();extra.Attributes.Remove("zk_revision");Assert(Denial(()=>Guard(Binding().ToString(),extra)).Contains("[zk_guard_target_v1;m=20;n=1;i=0]"));
            foreach(var field in new[]{"zk_workspace","zk_operationid","zk_actor"}){var receipt=new Entity("zk_kitchenoperation"){["zk_workspace"]=new EntityReference("zk_kitchenworkspace",Id),["zk_operationid"]="operation",["zk_actor"]=Actor.ToString("D")};receipt[field]=field=="zk_workspace"?new EntityReference("zk_kitchenworkspace",Guid.NewGuid()):"wrong";var bit=field=="zk_workspace"?32:field=="zk_operationid"?64:128;Assert(Denial(()=>Guard(Binding().ToString(),receipt,message:"Create")).Contains("[zk_guard_target_v1;m="+bit+";n=3;i=0]"));}
            Assert(Denial(()=>Guard(Binding().ToString(),Target(),message:"Delete",wrapped:false)).Contains("[zk_guard_target_v1;m=1;n=2;i=0]"));
        });
        check("target diagnostic failure remains fixed unknown",()=>{
            var broken=Context("Update",20);broken["MessageName"]=123;
            var method=typeof(KitchenWriteGuardPlugin).GetMethod("TargetDiagnostic",System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Static)!;
            Assert((string?)method.Invoke(null,new object[]{ContextProxy.Create(broken),Target(),Id,"operation"})=="[zk_guard_target_v1;m=0;n=0;i=0]");
        });
        check("observed six-field workspace accepts only authorized direct and one-wrapper writes",()=>{
            foreach(var wrapped in new[]{false,true}){Guard(Binding().ToString(),Target(),wrapped:wrapped);Guard(Binding().ToString(),Decorate(Target()),wrapped:wrapped);}
        });
        check("observed decorations reject every missing wrong extra and hybrid shape",()=>{
            foreach(var wrapped in new[]{false,true}){
                void Reject(Entity e)=>Denial(()=>Guard(Binding().ToString(),e,wrapped:wrapped));
                foreach(var field in new[]{"zk_state","zk_revision","zk_kitchenworkspaceid","modifiedby","modifiedon","modifiedonbehalfby"}){var e=Decorate(Target());e.Attributes.Remove(field);Reject(e);e["unknown-extra"]=null;Reject(e);}
                foreach(var field in new[]{"zk_kitchenworkspaceid","modifiedby","modifiedon"})foreach(var value in new object?[]{null,"wrong-type",new Poison()}){var e=Decorate(Target());e[field]=value;Reject(e);}
                foreach(var id in new[]{Guid.Empty,Guid.NewGuid()}){var e=Decorate(Target());e["zk_kitchenworkspaceid"]=id;Reject(e);e=Decorate(Target());e.Id=id;Reject(e);e=Decorate(Target());e["modifiedby"]=new EntityReference("systemuser",id);Reject(e);}
                foreach(var name in new[]{"team","SystemUser",""}){var e=Decorate(Target());e["modifiedby"]=new EntityReference(name,Actor);Reject(e);}
                foreach(var kind in new[]{DateTimeKind.Unspecified,DateTimeKind.Local}){var e=Decorate(Target());e["modifiedon"]=new DateTime(2026,1,1,0,0,0,kind);Reject(e);}
                foreach(var value in new object[]{new EntityReference("systemuser",Actor),"",Guid.Empty,new Poison()}){var e=Decorate(Target());e["modifiedonbehalfby"]=value;Reject(e);}
                foreach(var extra in new[]{"ownerid","statecode","statuscode","zk_custom","private-extra-sentinel"}){var e=Decorate(Target());e[extra]=new Poison();Reject(e);}
                for(int bits=1;bits<15;bits++){var e=Decorate(Target());var fields=new[]{"zk_kitchenworkspaceid","modifiedby","modifiedon","modifiedonbehalfby"};for(int i=0;i<4;i++)if((bits&(1<<i))==0)e.Attributes.Remove(fields[i]);Reject(e);}
                var only=Decorate(Target());only.Attributes.Remove("zk_state");only.Attributes.Remove("zk_revision");Reject(only);
            }
        });
        check("observed decoration cannot authorize direct bulk Upsert or forged request paths",()=>{
            foreach(var message in new[]{"Delete","Create","Upsert","CreateMultiple","UpdateMultiple","UpsertMultiple","DeleteMultiple"})Denial(()=>Guard(Binding().ToString(),Decorate(Target()),message:message,wrapped:false));
            Denial(()=>Guard(null,Decorate(Target()),missing:true));var other=Binding();other["workspaceId"]=Guid.NewGuid().ToString("D");Denial(()=>Guard(other.ToString(),Decorate(Target())));
            var direct=Context("Update",20,"zk_kitchenworkspace");direct["InputParameters"]=new ParameterCollection{{"Target",Decorate(Target())},{"RequestJson",Binding().ToString()}};direct["SharedVariables"]=new ParameterCollection{{Marker,Id+"|operation"},{"tag",Binding().ToString()}};Denial(()=>new KitchenWriteGuardPlugin().Execute(new GuardProvider(ContextProxy.Create(direct))));
        });
        check("decoration types nulls mismatches and timestamp kinds are fixed facts",()=>{
            string Facts(Entity e)=>Denial(()=>Guard(Binding().ToString(),e));
            var e=Target();e["private-name-sentinel"]=new Poison();Assert(Facts(e).EndsWith("[zk_guard_decor_v1;q=1;p=0;t=0;z=0;m=0;d=0;u=1]"));
            e=Target();foreach(var name in new[]{"zk_kitchenworkspaceid","modifiedby","modifiedon","modifiedonbehalfby"})e[name]=null;Assert(Facts(e).EndsWith("[zk_guard_decor_v1;q=1;p=15;t=0;z=15;m=0;d=0;u=0]"));
            foreach(var name in new[]{"zk_kitchenworkspaceid","modifiedby","modifiedon","modifiedonbehalfby"})e[name]=new Poison();Assert(Facts(e).EndsWith("[zk_guard_decor_v1;q=1;p=15;t=0;z=0;m=0;d=0;u=0]"));
            e["zk_kitchenworkspaceid"]=Guid.Empty;e["modifiedby"]=new EntityReference("private-name-sentinel",Guid.Empty);e["modifiedonbehalfby"]=new EntityReference("private-name-sentinel",Guid.Empty);Assert(Facts(e).EndsWith("[zk_guard_decor_v1;q=1;p=15;t=11;z=0;m=0;d=0;u=0]"));
            e["zk_kitchenworkspaceid"]=Id;e["modifiedby"]=new EntityReference("private-name-sentinel",Actor);e["modifiedonbehalfby"]=new EntityReference("systemuser",Guid.Empty);Assert(Facts(e).EndsWith("[zk_guard_decor_v1;q=1;p=15;t=11;z=0;m=27;d=0;u=0]"));
            e["modifiedby"]=new EntityReference("systemuser",Actor);e["modifiedonbehalfby"]=new EntityReference("systemuser",Actor);
            foreach(var kind in new[]{DateTimeKind.Unspecified,DateTimeKind.Utc,DateTimeKind.Local}){e["modifiedon"]=new DateTime(2026,1,1,0,0,0,kind);Assert(Facts(e).EndsWith("[zk_guard_decor_v1;q=1;p=15;t=15;z=0;m=63;d="+((int)kind+1)+";u=0]"));}
            for(int i=0;i<70;i++)e["private-name-sentinel"+i]=new Poison();Assert(Facts(e).EndsWith(";u=63]")&&!Facts(e).Contains("sentinel"));
        });
        check("decoration diagnostic errors cannot authorize or emit exception text",()=>{
            var broken=Context("Update",20);broken["InitiatingUserId"]="private-error-sentinel";var e=Target();e["modifiedby"]=new EntityReference("systemuser",Actor);
            var method=typeof(KitchenWriteGuardPlugin).GetMethod("DecorationDiagnostic",System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Static)!;
            Assert(method!=null);Assert((string?)method!.Invoke(null,new object[]{ContextProxy.Create(broken),e,Id})=="[zk_guard_decor_v1;q=0;p=0;t=0;z=0;m=0;d=0;u=0]");
        });
        check("actual owner capabilities fail closed for editor team owner and read-only owner",()=>{
            foreach(var kind in new[]{"owner","editor","team","reader","missing"}) {
                var svc=new HostService(seed,true);svc.Owner=kind=="missing"?null:new EntityReference(kind=="team"?"team":"systemuser",kind=="editor"?Guid.NewGuid():Actor);svc.CanWrite=kind!="reader";
                var result=svc.Load();Assert((bool)result["canEdit"]! == (kind!="reader"));Assert((bool)result["canConfigure"]! == (kind=="owner"));Assert((bool)result["canClose"]! == (kind=="owner"));Assert((string?)result["identity"]!["userId"]==Actor.ToString("D"));
                if(kind is "owner" or "editor" or "team") {var q=Request(seed);q["candidateState"]!["event"]!["name"]="changed";Assert((string?)svc.Run(q.ToString())["status"]==(kind=="owner"?"saved":"rejected"));Assert(svc.Writes.Count==(kind=="owner"?2:0));}
            }
        });
        check("real host validates before snapshot-bound direct and wrapped CAS receipt writes",()=>{
            foreach(var wrapped in new[]{false,true})foreach(var decorated in new[]{false,true}){var service=new HostService(seed,wrapped){Decorated=decorated};var raw=Request(seed).ToString();var result=service.Run(raw);Assert((string?)result["status"]=="saved"&&service.Writes.SequenceEqual(new[]{"Update","Create"})&&service.Attempts.SequenceEqual(new[]{"Update","Create"})&&service.State.Value<int>("revision")==1&&service.Receipt!.GetAttributeValue<string>("zk_requesthash")==Protocol.Hash(raw));Assert(!service.LastContext!.SharedVariables.Contains(Marker));}
        });
        check("correction crosses direct wrapped host with server actor time and one immutable receipt",()=>{
            foreach(var wrapped in new[]{false,true}){var s=(JObject)seed.DeepClone();((JArray)s["movements"]!).Add(new JObject{{"id","delivery"},{"articleId","a-1"},{"day","Freitag"},{"type","Lieferung"},{"quantity",100},{"location","Küche"}});var q=Request(s);q["operation"]!["type"]="movement.correct";q["operation"]!["payload"]=new JObject{{"movementId","delivery"},{"replacementQuantity",10},{"reason","Zahlendreher"}};q["candidateState"]!["movementCorrections"]=new JArray(new JObject{{"operationId","forged"},{"revision",99},{"targetId","delivery"},{"before",100},{"after",10},{"reason","Zahlendreher"},{"actorId",Guid.NewGuid().ToString("D")},{"confirmedAt","2000-01-01T00:00:00Z"}});var svc=new HostService(s,wrapped);var raw=q.ToString();Assert((string?)svc.Run(raw)["status"]=="saved");var audit=svc.State["movementCorrections"]![0]!;Assert((string?)audit["actorId"]==Actor.ToString("D")&&(string?)audit["operationId"]=="operation"&&(int?)audit["revision"]==1&&(int?)svc.State["movements"]![0]!["quantity"]==100);Assert(svc.Receipt!.GetAttributeValue<string>("zk_actor")==Actor.ToString("D")&&svc.Receipt.GetAttributeValue<string>("zk_requesthash")==Protocol.Hash(raw));Assert((string?)svc.Run(raw)["status"]=="saved"&&svc.Writes.Count==2);}
        });
        check("real host rejects invalid requests and permission before write and handles conflict replay",()=>{
            foreach(var failure in new[]{"schema","unknown","operation","candidate","permission","conflict"}){var svc=new HostService(seed,true);var q=Request(seed);switch(failure){case "schema":q["protocolVersion"]=1;break;case "unknown":q["extra"]=true;break;case "operation":q["operation"]!["type"]="arbitrary";break;case "candidate":q["candidateState"]!["menu"]![0]!["priceCents"]=1.23;break;case "permission":svc.CanWrite=false;break;case "conflict":q["expectedRevision"]=1;break;}
                try{var result=svc.Run(q.ToString());Assert(failure is "candidate" or "conflict");Assert((string?)result["status"]==(failure=="candidate"?"rejected":"conflict"));}catch(InvalidPluginExecutionException){Assert(failure is not ("candidate" or "conflict"));}Assert(svc.Writes.Count==0&&svc.Attempts.Count==0);
            }
            var service=new HostService(seed,true);var raw=Request(seed).ToString();service.Run(raw);int writes=service.Writes.Count,attempts=service.Attempts.Count;Assert((string?)service.Run(raw)["status"]=="saved"&&service.Writes.Count==writes&&service.Attempts.Count==attempts);Denial(()=>service.Run(raw+" "));Denial(()=>service.Run(raw,Guid.NewGuid()));Assert(service.Writes.Count==writes&&service.Attempts.Count==attempts);
        });
        check("host attempt counter observes dispatch even when the guard rejects before accepted write",()=>{var svc=new HostService(seed,true);var q=Request(seed);q["protocolVersion"]=1;Denial(()=>svc.Run(q.ToString()));Assert(svc.Attempts.Count==0);var e=Target();e.RowVersion="exact-rowversion";Denial(()=>svc.Execute(new UpdateRequest{Target=e,ConcurrencyBehavior=ConcurrencyBehavior.IfRowVersionMatches}));Assert(svc.Attempts.SequenceEqual(new[]{"Update"})&&svc.Writes.Count==0&&svc.Receipt==null);});
        check("real host CAS service fault escapes without receipt and still cleans marker",()=>{var svc=new HostService(seed,true){FailCas=true};try{svc.Run(Request(seed).ToString());throw new Exception("CAS swallowed");}catch(InvalidOperationException){Assert(svc.Writes.SequenceEqual(new[]{"Update"})&&svc.Attempts.SequenceEqual(new[]{"Update"})&&svc.Receipt==null&&svc.State.Value<int>("revision")==0&&!svc.LastContext!.SharedVariables.Contains(Marker));}});
    }
    sealed class Poison {public override string ToString()=>throw new Exception("private-value-sentinel");}
    static JObject Request(JObject seed){var q=Binding();q["identity"]=new JObject{{"organizationId",Guid.Empty.ToString("D")},{"userId",Actor.ToString("D")},{"workspaceId",Id.ToString("D")}};q["targetEventId"]=(string)seed["event"]!["id"]!;q["expectedRevision"]=0;q["operation"]=new JObject{{"type","article.price"},{"payload",new JObject{{"articleId",(string)seed["articles"]![0]!["id"]!},{"priceCents",12.34}}}};var candidate=(JObject)seed.DeepClone();candidate["articles"]![0]!["unitPriceCents"]=12.34;candidate["revision"]=1;((JArray)candidate["operationIds"]!).Add("operation");candidate["operationRequests"]!["operation"]="client-untrusted";q["candidateState"]=candidate;return q;}
    sealed class HostProvider(IPluginExecutionContext context,HostService service):IServiceProvider,IOrganizationServiceFactory {
        public object? GetService(Type t)=>t==typeof(IPluginExecutionContext)?context:t==typeof(IOrganizationServiceFactory)?this:null;
        public IOrganizationService CreateOrganizationService(Guid? user){Assert(user==context.UserId);return service;}
    }
    sealed class HostService(JObject seed,bool wrapped):IOrganizationService {
        public EntityReference? Owner;
        public JObject State=(JObject)seed.DeepClone();public Entity? Receipt;public bool CanWrite=true,FailCas,Decorated;public readonly List<string> Writes=[],Attempts=[];public IPluginExecutionContext? LastContext;IPluginExecutionContext? snapshot;
        public JObject Load(){var values=Context("zk_KitchenLoad",30);values["InputParameters"]=new ParameterCollection{{"RequestJson",new JObject{{"protocolVersion",2},{"workspaceId",Id.ToString("D")}}.ToString()}};LastContext=ContextProxy.Create(values);new KitchenLoadPlugin().Execute(new HostProvider(LastContext,this));return JObject.Parse((string)LastContext.OutputParameters["ResultJson"]);}
        public JObject Run(string raw,Guid? actor=null){var values=Context("zk_KitchenCommit",30);values["InputParameters"]=new ParameterCollection{{"RequestJson",raw}};values["UserId"]=actor??Actor;values["InitiatingUserId"]=actor??Actor;LastContext=ContextProxy.Create(values);var copied=new Dictionary<string,object?>(values){["SharedVariables"]=new ParameterCollection(),["InputParameters"]=new ParameterCollection{{"RequestJson",raw}}};snapshot=ContextProxy.Create(copied);new KitchenCommitPlugin().Execute(new HostProvider(LastContext,this));return JObject.Parse((string)LastContext.OutputParameters["ResultJson"]);}
        void GuardWrite(string message,Entity entity){var parent=snapshot!;if(wrapped){var wrapper=Context(message,30,entity.LogicalName);wrapper["ParentContext"]=parent;parent=ContextProxy.Create(wrapper);}var current=Context(message,20,entity.LogicalName);current["ParentContext"]=parent;current["InputParameters"]=new ParameterCollection{{"Target",entity}};new KitchenWriteGuardPlugin().Execute(new GuardProvider(ContextProxy.Create(current)));Writes.Add(message);}
        public Entity Retrieve(string table,Guid id,ColumnSet columns){Assert(table=="zk_kitchenworkspace"&&id==Id);return new Entity(table,id){RowVersion="exact-rowversion",["zk_state"]=State.ToString(),["zk_revision"]=State.Value<int>("revision"),["ownerid"]=Owner};}
        public EntityCollection RetrieveMultiple(QueryBase q){Assert(q is QueryExpression query&&query.EntityName=="zk_kitchenoperation");return Receipt==null?new EntityCollection():new EntityCollection(new[]{Receipt});}
        public OrganizationResponse Execute(OrganizationRequest request){if(request is RetrievePrincipalAccessRequest access){Assert(access.Principal.Id==LastContext!.InitiatingUserId&&access.Target.Id==Id);var response=new RetrievePrincipalAccessResponse();response.Results["AccessRights"]=AccessRights.ReadAccess|(CanWrite?AccessRights.WriteAccess:0);return response;}Assert(request is UpdateRequest);var update=(UpdateRequest)request;Attempts.Add("Update");Assert(update.ConcurrencyBehavior==ConcurrencyBehavior.IfRowVersionMatches&&update.Target.RowVersion=="exact-rowversion");if(Decorated)Decorate(update.Target);GuardWrite("Update",update.Target);if(FailCas)throw new InvalidOperationException("synthetic CAS");State=JObject.Parse(update.Target.GetAttributeValue<string>("zk_state"));return new UpdateResponse();}
        public Guid Create(Entity entity){Attempts.Add("Create");GuardWrite("Create",entity);Receipt=entity;return Guid.NewGuid();}
        public void Update(Entity e)=>throw new NotSupportedException();public void Delete(string a,Guid b)=>throw new NotSupportedException();public void Associate(string a,Guid b,Relationship c,EntityReferenceCollection d)=>throw new NotSupportedException();public void Disassociate(string a,Guid b,Relationship c,EntityReferenceCollection d)=>throw new NotSupportedException();
    }
}
