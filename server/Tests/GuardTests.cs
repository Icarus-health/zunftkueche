using System.Reflection;
using Microsoft.Xrm.Sdk;
using Zunftkueche;
public class ContextProxy : DispatchProxy
{
    public readonly Dictionary<string, object?> Values = new();
    protected override object? Invoke(MethodInfo? method, object?[]? args)
    {
        var name = method!.Name;
        if (name.StartsWith("get_"))
        {
            if (Values.TryGetValue(name[4..], out var value))
                return value;
            return method.ReturnType.IsValueType ? Activator.CreateInstance(method.ReturnType) : null;
        }
        throw new NotSupportedException(name);
    }
    public static IPluginExecutionContext Create(Dictionary<string, object?> values)
    {
        var result = Create<IPluginExecutionContext, ContextProxy>();
        foreach (var p in values)
            ((ContextProxy)(object)result).Values[p.Key] = p.Value;
        return result;
    }
}
sealed class GuardProvider : IServiceProvider
{
    readonly IPluginExecutionContext context; public GuardProvider(IPluginExecutionContext c)
    {
        context = c;
    }
    public object? GetService(Type service) => service == typeof(IPluginExecutionContext) ? context : null;
}
static class GuardTests
{
    public static void Run(Action<string, Action> check)
    {
        var actor = Guid.NewGuid();
        var workspace = FakeStore.WorkspaceId;
        var parent = ContextProxy.Create(new() { { "MessageName", "zk_KitchenCommit" }, { "Mode", 0 }, { "Stage", 30 }, { "IsInTransaction", true }, { "UserId", actor }, { "InitiatingUserId", actor }, { "SharedVariables", new ParameterCollection { { "zk.KitchenCommit.InternalWrite.v1", workspace + "|operation" } } } });
        var target = new Entity("zk_kitchenworkspace", workspace) { ["zk_state"] = "{}", ["zk_revision"] = 1 };
        Dictionary<string, object?> Context(string message, Entity entity) => new() { { "ParentContext", parent }, { "MessageName", message }, { "Stage", 20 }, { "Mode", 0 }, { "IsInTransaction", true }, { "UserId", actor }, { "InitiatingUserId", actor }, { "InputParameters", new ParameterCollection { { "Target", entity } } } };
        void Execute(Dictionary<string, object?> values) => new KitchenWriteGuardPlugin().Execute(new GuardProvider(ContextProxy.Create(values)));
        void Denied(Dictionary<string, object?> values)
        {
            try
            {
                Execute(values);
            }
            catch (InvalidPluginExecutionException) { return; }
            throw new Exception("guard allowed bypass");
        }
        check("guard diagnostic reports each failed first-gate condition without remote values", () => {
            var parentValues = ((ContextProxy)(object)parent).Values;
            void Case(Action<Dictionary<string, object?>, Dictionary<string, object?>> change, int mask, int kind = 1) {
                var pv = new Dictionary<string, object?>(parentValues);
                pv["SharedVariables"] = new ParameterCollection { { "zk.KitchenCommit.InternalWrite.v1", workspace + "|private-marker" } };
                var c = Context("Update", target); c["ParentContext"] = ContextProxy.Create(pv); change(c, pv);
                try { Execute(c); throw new Exception("expected denial"); }
                catch (InvalidPluginExecutionException e) {
                    var expected = "Direct kitchen table writes are blocked. [zk_guard_v1;m=" + mask + ";p=" + kind + "]";
                    if (e.Message != expected) throw new Exception("diagnostic mismatch: expected mask " + mask);
                }
            }
            Case((c,p) => c["Mode"] = 1, 1);
            Case((c,p) => c["Stage"] = 10, 2);
            Case((c,p) => c["IsInTransaction"] = false, 4);
            Case((c,p) => c["ParentContext"] = null, 8, 0);
            // Proxy copies dictionaries: mutate the instantiated parent for parent cases.
            void Parent(string key, object value, int mask, int kind=1) => Case((c,p) => ((ContextProxy)(object)c["ParentContext"]!).Values[key]=value, mask, kind);
            Parent("MessageName", "private-parent", 16, 10);
            Parent("Stage", 20, 32); Parent("Mode", 1, 64); Parent("IsInTransaction", false, 128);
            Parent("InitiatingUserId", Guid.NewGuid(), 256); Parent("UserId", Guid.NewGuid(), 512);
            Case((c,p) => c["UserId"] = Guid.NewGuid(), 512+1024);
            Case((c,p) => { var other=Guid.NewGuid(); c["UserId"]=other; ((ContextProxy)(object)c["ParentContext"]!).Values["UserId"]=other; }, 1024);
            Case((c,p) => { c["Mode"]=1; c["InputParameters"]=null; }, 0, 0);
            Parent("SharedVariables", new ParameterCollection(), 2048);
            Parent("SharedVariables", new ParameterCollection {{"zk.KitchenCommit.InternalWrite.v1", 123}}, 4096);
            Case((c,p) => c["InputParameters"] = new ParameterCollection(), 8192);
            Case((c,p) => c["InputParameters"] = new ParameterCollection {{"Target", "private-target"}}, 16384);
            Case((c,p) => { c["Mode"]=1; c["Stage"]=10; c["IsInTransaction"]=false; }, 7);
            var names = new[]{"Create","Update","Delete","CreateMultiple","UpdateMultiple","Upsert","UpsertMultiple","DeleteMultiple"};
            for(int i=0;i<names.Length;i++) Parent("MessageName",names[i],16,i+2);
        });
        check("real guard allows only expected internal workspace update", () => Execute(Context("Update", target)));
        check("real guard blocks direct API context and forged caller flags", () => { var c = Context("Update", target); c["ParentContext"] = null; Denied(c); });
        check("real guard blocks another workspace", () => { var other = new Entity("zk_kitchenworkspace", Guid.NewGuid()) { ["zk_state"] = "{}", ["zk_revision"] = 1 }; Denied(Context("Update", other)); });
        foreach (var message in new[] { "Create", "Delete", "Upsert", "CreateMultiple", "UpdateMultiple", "UpsertMultiple", "DeleteMultiple" })
        {
            var name = message;
            check("real guard denies workspace " + name, () => Denied(Context(name, target)));
        }
        check("real guard blocks actor mismatch and nontransactional write", () => { var c = Context("Update", target); c["UserId"] = Guid.NewGuid(); Denied(c); c = Context("Update", target); c["IsInTransaction"] = false; Denied(c); });
        var receipt = new Entity("zk_kitchenoperation") { ["zk_workspace"] = new EntityReference("zk_kitchenworkspace", workspace), ["zk_operationid"] = "operation", ["zk_actor"] = actor.ToString("D") };
        check("real guard allows internal receipt creation", () => Execute(Context("Create", receipt)));
        check("real guard denies receipt update and delete even internally", () => { Denied(Context("Update", receipt)); Denied(Context("Delete", receipt)); });
    }
}
