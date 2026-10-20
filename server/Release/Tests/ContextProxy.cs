using System.Reflection;
using Microsoft.Xrm.Sdk;
using Zunftkueche;
using Newtonsoft.Json.Linq;
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
