using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Newtonsoft.Json.Linq;
using Zunftkueche;
static class WrapperTests
{
    static readonly Guid Actor = Guid.Parse("77777777-8888-4999-aaaa-bbbbbbbbbbbb");
    static readonly Guid WorkspaceId = FakeStore.WorkspaceId;
    const string Marker = "zk.KitchenCommit.InternalWrite.v1";
    static Dictionary<string, object?> Values(string message, int stage, string table = "") => new() {
        ["MessageName"]=message,["Stage"]=stage,["Mode"]=0,["IsInTransaction"]=true,
        ["UserId"]=Actor,["InitiatingUserId"]=Actor,["PrimaryEntityName"]=table,
        ["SharedVariables"]=new ParameterCollection(),["InputParameters"]=new ParameterCollection()
    };
    static Dictionary<string, object?> Data(IPluginExecutionContext c) => ((ContextProxy)(object)c).Values;
    static string Binding() => new JObject {{"protocolVersion",2},{"workspaceId",WorkspaceId.ToString("D")},{"operationId","operation"}}.ToString();
    static Entity Update() => new("zk_kitchenworkspace",WorkspaceId) { ["zk_state"]="{}",["zk_revision"]=1 };
    static Entity Receipt() => new("zk_kitchenoperation") { ["zk_workspace"]=new EntityReference("zk_kitchenworkspace",WorkspaceId),["zk_operationid"]="operation",["zk_actor"]=Actor.ToString("D") };
    static (IPluginExecutionContext Current,IPluginExecutionContext Wrapper,IPluginExecutionContext Source) Chain(string message="Update",Entity? entity=null) {
        entity ??= Update();var source=Values("zk_KitchenCommit",30);
        source["InputParameters"]=new ParameterCollection{{"RequestJson",Binding()}};
        var s=ContextProxy.Create(source);var wrapper=Values(message,30,entity.LogicalName);wrapper["ParentContext"]=s;
        var w=ContextProxy.Create(wrapper);var current=Values(message,20,entity.LogicalName);current["ParentContext"]=w;current["InputParameters"]=new ParameterCollection{{"Target",entity}};
        return (ContextProxy.Create(current),w,s);
    }
    static void Execute(IPluginExecutionContext c)=>new KitchenWriteGuardPlugin().Execute(new GuardProvider(c));
    static string Denied(IPluginExecutionContext c) { try{Execute(c);}catch(InvalidPluginExecutionException e){return e.Message;}throw new Exception("wrapper allowed bypass"); }
    static void Assert(bool value){if(!value)throw new Exception("wrapper assertion failed");}
    public static void Run(Action<string,Action> check) {
        check("guard accepts one exact Update wrapper with API-only original request",()=>Execute(Chain().Current));
        check("guard accepts one exact Create wrapper for receipt",()=>Execute(Chain("Create",Receipt()).Current));
        check("wrapper each context condition remains mandatory",()=>{
            foreach(var field in new[]{"MessageName","Stage","Mode","IsInTransaction","UserId","InitiatingUserId","PrimaryEntityName"}) {
                var x=Chain();Data(x.Wrapper)[field]=field switch {"MessageName"=>"Create","Stage"=>20,"Mode"=>1,"IsInTransaction"=>false,"PrimaryEntityName"=>"zk_kitchenoperation",_=>Guid.NewGuid()};Denied(x.Current);
            }
            foreach(var field in new[]{"Stage","Mode","IsInTransaction","UserId","InitiatingUserId"}) {
                var x=Chain();Data(x.Current)[field]=field switch {"Stage"=>10,"Mode"=>1,"IsInTransaction"=>false,_=>Guid.NewGuid()};Denied(x.Current);
            }
            foreach(var table in new string?[]{null,"","wrong"}){var x=Chain();Data(x.Current)["PrimaryEntityName"]=table;Denied(x.Current);}
            foreach(var field in new[]{"MessageName","Stage","Mode","IsInTransaction","UserId","InitiatingUserId","InputParameters"}) {
                var x=Chain();Data(x.Source)[field]=field switch {"MessageName"=>"Upsert","Stage"=>20,"Mode"=>1,"IsInTransaction"=>false,"InputParameters"=>new ParameterCollection(),_=>Guid.NewGuid()};Denied(x.Current);
            }
            var wrongType=Chain();Data(wrongType.Source)["InputParameters"]=new ParameterCollection{{"RequestJson",123}};Denied(wrongType.Current);
            var missing=Chain();Data(missing.Wrapper)["ParentContext"]=null;Denied(missing.Current);
            var deep=Chain();var middle=Values("Update",30,"zk_kitchenworkspace");middle["ParentContext"]=deep.Source;middle["SharedVariables"]=new ParameterCollection{{Marker,WorkspaceId+"|operation"}};Data(deep.Wrapper)["ParentContext"]=ContextProxy.Create(middle);Denied(deep.Current);
        });
        check("wrapped target and receipt gates remain exact",()=>{
            var extra=Update();extra["ownerid"]=Actor;Denied(Chain(entity:extra).Current);
            var other=Update();other.Id=Guid.NewGuid();Denied(Chain(entity:other).Current);
            foreach(var field in new[]{"zk_workspace","zk_operationid","zk_actor"}){var receipt=Receipt();receipt[field]=field=="zk_workspace"?new EntityReference("zk_kitchenworkspace",Guid.NewGuid()):"other";Denied(Chain("Create",receipt).Current);}
            foreach(var pair in new[]{("Create",Update()),("Update",Receipt()),("Delete",Receipt())})Denied(Chain(pair.Item1,pair.Item2).Current);
        });
        check("direct and merged bulk or Upsert cannot counterfeit commit authority",()=>{
            foreach(var operation in new[]{"Create","Update","Delete","Upsert","CreateMultiple","UpdateMultiple","UpsertMultiple","DeleteMultiple"}) {
                var x=Chain(operation,operation=="Create"?Receipt():Update());Data(x.Current)["ParentContext"]=null;Data(x.Current)["SharedVariables"]=new ParameterCollection{{Marker,WorkspaceId+"|operation"},{"tag",WorkspaceId+"|operation"}};Denied(x.Current);
                foreach(var single in new[]{"Update","Create"}){var child=Chain(single,single=="Create"?Receipt():Update());Data(child.Source)["MessageName"]=operation;Denied(child.Current);}
            }
            foreach(var place in new[]{"wrapper","current"}){var x=Chain();Data(x.Source)["InputParameters"]=new ParameterCollection();Data(place=="wrapper"?x.Wrapper:x.Current)["SharedVariables"]=new ParameterCollection{{Marker,WorkspaceId+"|operation"},{"tag",WorkspaceId+"|operation"}};Denied(x.Current);}
            var parameter=Chain();Data(parameter.Source)["InputParameters"]=new ParameterCollection();parameter.Current.InputParameters[Marker]=WorkspaceId+"|operation";Denied(parameter.Current);
            var targets=Chain();Data(targets.Current)["InputParameters"]=new ParameterCollection{{"Targets",new EntityCollection(new[]{Update()})}};Denied(targets.Current);
        });
        check("chain diagnostics identify bounded source and wrapper failures",()=>{
            var x=Chain();Data(x.Source)["InputParameters"]=new ParameterCollection();Assert(Denied(x.Current).EndsWith("[zk_guard_binding_v1;b=1]"));
            x=Chain();Data(x.Wrapper)["ParentContext"]=null;Assert(Denied(x.Current).EndsWith("[zk_guard_chain_v2;w=0;s=8;g=0]"));
            x=Chain();Data(x.Wrapper)["PrimaryEntityName"]="private-table-sentinel";var message=Denied(x.Current);Assert(message.EndsWith("[zk_guard_chain_v2;w=16;s=0;g=1]")&&!message.Contains("private-table-sentinel")&&!message.Contains(WorkspaceId.ToString()));
        });
        check("real store performs guarded CAS update then receipt and cleans source marker",()=>{
            foreach(var fail in new[]{false,true}){
                var values=Values("zk_KitchenCommit",30);values["InputParameters"]=new ParameterCollection{{"RequestJson",Binding()}};var source=ContextProxy.Create(values);var service=new StoreService(source,fail);var store=new DataverseStore(service,source);
                try{store.Commit(new Workspace{Id=WorkspaceId,RowVersion="exact-version"},new JObject{{"revision",1}},"operation","hash",Actor,DateTime.UtcNow);Assert(!fail);}catch(InvalidOperationException){Assert(fail);}
                Assert(!source.SharedVariables.Contains(Marker));Assert(service.Calls.SequenceEqual(fail?new[]{"Update"}:new[]{"Update","Create"}));
            }
        });
    }
    sealed class StoreService(IPluginExecutionContext source,bool fail):IOrganizationService {
        public readonly List<string> Calls=[];
        void Guard(string message,Entity target){var wrapper=Values(message,30,target.LogicalName);wrapper["ParentContext"]=source;var current=Values(message,20,target.LogicalName);current["ParentContext"]=ContextProxy.Create(wrapper);current["InputParameters"]=new ParameterCollection{{"Target",target}};WrapperTests.Execute(ContextProxy.Create(current));Calls.Add(message);}
        public OrganizationResponse Execute(OrganizationRequest request){Assert(request is UpdateRequest);var update=(UpdateRequest)request;Assert(update.ConcurrencyBehavior==ConcurrencyBehavior.IfRowVersionMatches&&update.Target.RowVersion=="exact-version");Guard("Update",update.Target);if(fail)throw new InvalidOperationException("synthetic CAS fault");return new UpdateResponse();}
        public Guid Create(Entity entity){Guard("Create",entity);Assert(entity.GetAttributeValue<string>("zk_requesthash")=="hash"&&entity.GetAttributeValue<int>("zk_appliedrevision")==1);return Guid.NewGuid();}
        public Entity Retrieve(string a,Guid b,Microsoft.Xrm.Sdk.Query.ColumnSet c)=>throw new NotSupportedException();
        public void Update(Entity e)=>throw new NotSupportedException();public void Delete(string a,Guid b)=>throw new NotSupportedException();
        public EntityCollection RetrieveMultiple(Microsoft.Xrm.Sdk.Query.QueryBase q)=>throw new NotSupportedException();
        public void Associate(string a,Guid b,Relationship c,EntityReferenceCollection d)=>throw new NotSupportedException();public void Disassociate(string a,Guid b,Relationship c,EntityReferenceCollection d)=>throw new NotSupportedException();
    }
}
