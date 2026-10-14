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
