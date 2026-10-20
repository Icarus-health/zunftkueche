extern alias Plugin;
using Microsoft.Xrm.Sdk;
using KitchenDocumentWriteGuardPlugin = Plugin::Zunftkueche.KitchenDocumentWriteGuardPlugin;
using Newtonsoft.Json.Linq;
using Zunftkueche;
// GuardTests.cs supplies the accepted context proxy only; no unrelated suite is run.
static class FakeStore { public static readonly Guid WorkspaceId=Guid.Parse("11111111-1111-4111-8111-111111111111"); }
static class GuardMappingTests
{
    public static void Run(Action<string,Action> test) {
        foreach(var action in new[]{"upload.begin","upload.claim","upload.link","draft.save"})foreach(var message in new[]{"Create","Update"}) {
            var a=action;var m=message;
            test("guard action/message "+a+"/"+m,()=>RunCase(a,m,a=="draft.save"||(a=="upload.begin"?m=="Create":m=="Update")));
        }
        foreach(var route in new[]{"Delete","Assign","GrantAccess","ModifyAccess","RevokeAccess","SetState","CreateMultiple","UpdateMultiple","Upsert","Restore"}) {
            var r=route;test("guard refusal before Target parsing "+r,()=>{
                var actor=Guid.NewGuid();var c=ContextProxy.Create(new(){{"Mode",0},{"Stage",20},{"IsInTransaction",true},{"UserId",actor},{"InitiatingUserId",actor},{"MessageName",r},{"InputParameters",null}});
                Denied(()=>new KitchenDocumentWriteGuardPlugin().Execute(new GuardProvider(c)));
            });
        }
        test("guard update requires matching row version",()=>RunCase("upload.claim","Update",false,"wrong"));
        test("guard initial draft rejects source row version",()=>RunCase("draft.save","Create",false,"existing"));
    }
    static void Denied(Action f){try{f();}catch(InvalidPluginExecutionException){return;}throw new Exception("guard admitted forbidden mapping");}
    static void RunCase(string action,string message,bool expected,string? changedVersion=null) {
        var actor=Guid.Parse("cccccccc-1111-4111-8111-111111111111");var id=Guid.Parse("22222222-1111-4111-8111-111111111111");var workspace=FakeStore.WorkspaceId;
        var value=new JObject{{action=="draft.save"?"id":"uploadId",id.ToString("D")},{"eventId","synthetic-event"}};
        if(message=="Update"||changedVersion!=null)value["rowVersion"]=changedVersion??"42";
        var q=new JObject{{"protocolVersion",2},{"workspaceId",workspace.ToString("D")},{"view","documents"},{"action",action},{"requestId","33333333-1111-4111-8111-111111111111"},{"value",value}};
        var snapshot=new JObject{{"id",id.ToString("D")},{"workspaceId",workspace.ToString("D")},{"eventId","synthetic-event"}};
        var at=new DateTime(2026,10,20,10,0,0,DateTimeKind.Utc);
        var payload=(JObject)snapshot.DeepClone();payload["history"]=new JArray(new JObject{{"actorId",actor.ToString("D")},{"requestId",q["requestId"]!.DeepClone()},{"requestHash",Protocol.Hash(Protocol.Canonical(q).ToString(Newtonsoft.Json.Formatting.None))},{"action",action},{"recordedAt",at.ToString("o")},{"value",snapshot}});
        var table=action=="draft.save"?"zk_kitchendraft":"zk_kitchendocument";
        var entity=new Entity(table,id){RowVersion=message=="Update"?"42":null,["zk_workspace"]=new EntityReference("zk_kitchenworkspace",workspace),["zk_eventid"]="synthetic-event",["zk_payload"]=payload.ToString(Newtonsoft.Json.Formatting.None),["zk_actor"]=actor.ToString("D"),["zk_recordedat"]=at};
        var parent=ContextProxy.Create(new(){{"MessageName","zk_KitchenCommit"},{"Stage",30},{"Mode",0},{"IsInTransaction",true},{"UserId",actor},{"InitiatingUserId",actor},{"InputParameters",new ParameterCollection{{"RequestJson",q.ToString()}}}});
        var context=ContextProxy.Create(new(){{"ParentContext",parent},{"MessageName",message},{"PrimaryEntityName",table},{"Stage",20},{"Mode",0},{"IsInTransaction",true},{"UserId",actor},{"InitiatingUserId",actor},{"InputParameters",new ParameterCollection{{"Target",entity}}}});
        void Act()=>new KitchenDocumentWriteGuardPlugin().Execute(new GuardProvider(context));if(expected)Act();else Denied(Act);
    }
}
