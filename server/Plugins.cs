using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using Microsoft.Crm.Sdk.Messages;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
namespace Zunftkueche
{
    public sealed class KitchenLoadPlugin : IPlugin
    {
        public void Execute(IServiceProvider provider) => PluginHost.Execute(provider, false);
    }
    public sealed class KitchenCommitPlugin : IPlugin
    {
        public void Execute(IServiceProvider provider) => PluginHost.Execute(provider, true);
    }
    internal static class PluginHost
    {
        internal const string InternalWrite = "zk.KitchenCommit.InternalWrite.v1";
        internal static void Execute(IServiceProvider provider, bool commit)
        {
            var context = (IPluginExecutionContext)(provider.GetService(typeof(IPluginExecutionContext)) ?? throw new InvalidPluginExecutionException("Execution context missing."));
            if (context.MessageName != (commit ? "zk_KitchenCommit" : "zk_KitchenLoad") || context.Mode != 0 || context.Stage != 30 || context.UserId != context.InitiatingUserId || context.UserId == Guid.Empty)
                throw new InvalidPluginExecutionException("Invalid kitchen execution context.");
            if (!context.InputParameters.Contains("RequestJson") || !(context.InputParameters["RequestJson"] is string raw))
                throw new InvalidPluginExecutionException("RequestJson is required.");
            var factory = (IOrganizationServiceFactory)(provider.GetService(typeof(IOrganizationServiceFactory)) ?? throw new InvalidPluginExecutionException("Organization service factory missing."));
            var service = factory.CreateOrganizationService(context.UserId);
            var store = new DataverseStore(service, context);
            try
            {
                var result = commit ? Protocol.Commit(raw, context.InitiatingUserId, context.IsInTransaction, store) : Protocol.Load(raw, store);
                context.OutputParameters["ResultJson"] = result.ToString(Formatting.None);
            }
            catch (ArgumentException e) { throw new InvalidPluginExecutionException("Kitchen validation: " + e.Message); }
            catch (JsonException) { throw new InvalidPluginExecutionException("Kitchen request JSON is invalid."); }
            // OrganizationService faults MUST escape. Never continue inside a failed transaction.
        }
    }
    internal sealed class DataverseStore : IKitchenStore
    {
        const string WorkspaceTable = "zk_kitchenworkspace", ReceiptTable = "zk_kitchenoperation";
        readonly IOrganizationService service; readonly IPluginExecutionContext context;
        public DataverseStore(IOrganizationService service, IPluginExecutionContext context)
        {
            this.service = service;
            this.context = context;
        }
        public Workspace Read(Guid id)
        {
            var row = service.Retrieve(WorkspaceTable, id, new ColumnSet("zk_state", "zk_revision", "versionnumber"));
            var access = (RetrievePrincipalAccessResponse)service.Execute(new RetrievePrincipalAccessRequest { Principal = new EntityReference("systemuser", context.InitiatingUserId), Target = new EntityReference(WorkspaceTable, id) });
            StatePolicy.Require((access.AccessRights & AccessRights.ReadAccess) != 0, "Workspace read permission required.");
            var state = Protocol.Parse(row.GetAttributeValue<string>("zk_state"));
            return new Workspace { Id = id, State = state, Revision = row.GetAttributeValue<int>("zk_revision"), RowVersion = row.RowVersion, CanWrite = (access.AccessRights & AccessRights.WriteAccess) != 0 };
        }
        public ReceiptRecord? FindReceipt(Guid workspaceId, string operationId)
        {
            var query = new QueryExpression(ReceiptTable) { ColumnSet = new ColumnSet("zk_requesthash", "zk_actor", "zk_appliedrevision"), TopCount = 2 };
            query.Criteria.AddCondition("zk_workspace", ConditionOperator.Equal, workspaceId);
            query.Criteria.AddCondition("zk_operationid", ConditionOperator.Equal, operationId);
            var rows = service.RetrieveMultiple(query).Entities;
            StatePolicy.Require(rows.Count <= 1, "Receipt key is not unique.");
            if (rows.Count == 0)
                return null;
            var r = rows[0];
            return new ReceiptRecord { Hash = r.GetAttributeValue<string>("zk_requesthash"), Actor = Guid.Parse(r.GetAttributeValue<string>("zk_actor")), AppliedRevision = r.GetAttributeValue<int>("zk_appliedrevision") };
        }
        public void Commit(Workspace prior, JObject next, string operationId, string hash, Guid actor, DateTime timestamp)
        {
            StatePolicy.Require(context.IsInTransaction, "Synchronous transaction required.");
            context.SharedVariables[PluginHost.InternalWrite] = prior.Id.ToString("D") + "|" + operationId;
            try
            {
                var update = new Entity(WorkspaceTable, prior.Id) { RowVersion = prior.RowVersion };
                update["zk_state"] = next.ToString(Formatting.None);
                update["zk_revision"] = (int)next["revision"]!;
                service.Execute(new UpdateRequest { Target = update, ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches });
                var receipt = new Entity(ReceiptTable);
                receipt["zk_workspace"] = new EntityReference(WorkspaceTable, prior.Id);
                receipt["zk_operationid"] = operationId;
                receipt["zk_requesthash"] = hash;
                receipt["zk_actor"] = actor.ToString("D");
                receipt["zk_appliedrevision"] = (int)next["revision"]!;
                receipt["zk_recordedat"] = timestamp;
                service.Create(receipt);
            }
            finally { context.SharedVariables.Remove(PluginHost.InternalWrite); }
        }
    }
    public sealed class KitchenWriteGuardPlugin : IPlugin
    {
        private static int ParentKind(IPluginExecutionContext? p)
        {
            if (p == null) return 0;
            var names = new[] { "zk_KitchenCommit", "Create", "Update", "Delete", "CreateMultiple", "UpdateMultiple", "Upsert", "UpsertMultiple", "DeleteMultiple" };
            int index = Array.IndexOf(names, p.MessageName); return index < 0 ? 10 : index + 1;
        }
        // v2 keeps structural bit positions; former private-marker bits 2048/4096 are reserved.
        private static int ContextMask(IPluginExecutionContext c, IPluginExecutionContext? p)
        {
            int mask = 0;
            if (c.Mode != 0) mask |= 1;
            if (c.Stage != 20) mask |= 2;
            if (!c.IsInTransaction) mask |= 4;
            if (p == null) mask |= 8;
            else
            {
                if (p.MessageName != "zk_KitchenCommit") mask |= 16;
                if (p.Stage != 30) mask |= 32;
                if (p.Mode != 0) mask |= 64;
                if (!p.IsInTransaction) mask |= 128;
                if (c.InitiatingUserId != p.InitiatingUserId) mask |= 256;
                if (c.UserId != p.UserId) mask |= 512;
            }
            if (c.UserId != c.InitiatingUserId) mask |= 1024;
            if (!c.InputParameters.Contains("Target")) mask |= 8192;
            else if (!(c.InputParameters["Target"] is Entity)) mask |= 16384;
            return mask;
        }
        // Only this single operation/table wrapper may be transparent. Never search ancestors.
        private static int WrapperMask(IPluginExecutionContext c, IPluginExecutionContext p)
        {
            var target = c.InputParameters != null && c.InputParameters.Contains("Target") ? c.InputParameters["Target"] as Entity : null;
            bool allowed = target != null && ((c.MessageName == "Update" && target.LogicalName == "zk_kitchenworkspace") || (c.MessageName == "Create" && target.LogicalName == "zk_kitchenoperation"));
            int mask = 0;
            if (!allowed || p.MessageName != c.MessageName) mask |= 1;
            if (p.Stage != 30) mask |= 2;
            if (p.Mode != 0) mask |= 4;
            if (!p.IsInTransaction) mask |= 8;
            if (target == null || p.PrimaryEntityName != target.LogicalName || c.PrimaryEntityName != target.LogicalName) mask |= 16;
            if (p.InitiatingUserId != c.InitiatingUserId) mask |= 32;
            if (p.UserId != c.UserId) mask |= 64;
            return mask;
        }
        // Called only after denial. Fixed numbers never expose the context's values.
        private static string GuardDiagnostic(IPluginExecutionContext c)
        {
            int mask = 0, kind = 0;
            try { mask = ContextMask(c, c.ParentContext); kind = ParentKind(c.ParentContext); }
            catch (Exception) { mask = 0; kind = 0; }
            string result = "[zk_guard_v2;m=" + mask.ToString(System.Globalization.CultureInfo.InvariantCulture) + ";p=" + kind.ToString(System.Globalization.CultureInfo.InvariantCulture) + "]";
            if (kind == 2 || kind == 3)
            {
                int wrapper = 0, source = 0, sourceKind = 0;
                try { var p = c.ParentContext; wrapper = WrapperMask(c, p); source = ContextMask(c, p.ParentContext); sourceKind = ParentKind(p.ParentContext); }
                catch (Exception) { wrapper = 0; source = 0; sourceKind = 0; }
                result += " [zk_guard_chain_v2;w=" + wrapper.ToString(System.Globalization.CultureInfo.InvariantCulture) + ";s=" + source.ToString(System.Globalization.CultureInfo.InvariantCulture) + ";g=" + sourceKind.ToString(System.Globalization.CultureInfo.InvariantCulture) + "]";
            }
            return result;
        }
        private static InvalidPluginExecutionException BindingDenied(int reason) => new InvalidPluginExecutionException("Direct kitchen table writes are blocked. [zk_guard_binding_v1;b=" + reason.ToString(System.Globalization.CultureInfo.InvariantCulture) + "]");
        private static void RequestBinding(IPluginExecutionContext source, out Guid workspace, out string operationId)
        {
            // Input values bind the target only after the exact own API-origin checks succeed.
            // The sole configured API handler validates the full request before its only writes.
            if (source.InputParameters == null || !source.InputParameters.Contains("RequestJson")) throw BindingDenied(1);
            if (!(source.InputParameters["RequestJson"] is string raw)) throw BindingDenied(2);
            JObject request;
            try { request = Protocol.Parse(raw); }
            catch (Exception e) when (e is JsonException || e is ArgumentException || e is InvalidCastException || e is FormatException || e is OverflowException) { throw BindingDenied(3); }
            try { workspace = Protocol.WorkspaceId(request); }
            catch (Exception e) when (e is JsonException || e is ArgumentException || e is InvalidCastException || e is FormatException || e is OverflowException) { throw BindingDenied(4); }
            try { operationId = StatePolicy.Str(request["operationId"], 100); }
            catch (Exception e) when (e is JsonException || e is ArgumentException || e is InvalidCastException || e is FormatException || e is OverflowException) { throw BindingDenied(5); }
        }
        // Refusal-only measurement. Attribute names and values never enter the result.
        private static string TargetDiagnostic(IPluginExecutionContext c, Entity target, Guid workspace, string operationId)
        {
            int mask = 0, count = 0, presence = 0;
            try
            {
                count = Math.Min(target.Attributes.Count, 63);
                if (target.Contains("zk_kitchenworkspaceid")) presence |= 1;
                if (target.Contains("zk_kitchenoperationid")) presence |= 2;
                if (c.MessageName == "Update" && target.LogicalName == "zk_kitchenworkspace")
                {
                    if (target.Id != workspace) mask |= 2;
                    if (target.Attributes.Count != 2) mask |= 4;
                    if (!target.Contains("zk_state")) mask |= 8;
                    if (!target.Contains("zk_revision")) mask |= 16;
                }
                else if (c.MessageName == "Create" && target.LogicalName == "zk_kitchenoperation")
                {
                    if (target.GetAttributeValue<EntityReference>("zk_workspace")?.Id != workspace) mask |= 32;
                    if (target.GetAttributeValue<string>("zk_operationid") != operationId) mask |= 64;
                    if (target.GetAttributeValue<string>("zk_actor") != c.InitiatingUserId.ToString("D")) mask |= 128;
                }
                else mask = 1;
            }
            catch (Exception) { mask = 0; count = 0; presence = 0; }
            return "[zk_guard_target_v1;m=" + mask.ToString(System.Globalization.CultureInfo.InvariantCulture) + ";n=" + count.ToString(System.Globalization.CultureInfo.InvariantCulture) + ";i=" + presence.ToString(System.Globalization.CultureInfo.InvariantCulture) + "]";
        }
        // Refusal-only bookkeeping measurement. No values or arbitrary attribute names leave this method.
        private static string DecorationDiagnostic(IPluginExecutionContext c, Entity target, Guid workspace)
        {
            int q = 1, presence = 0, types = 0, nulls = 0, matches = 0, dateKind = 0, unknown = 0;
            try
            {
                var names = new[] { "zk_kitchenworkspaceid", "modifiedby", "modifiedon", "modifiedonbehalfby" };
                for (int slot = 0; slot < names.Length; slot++)
                {
                    if (!target.Contains(names[slot])) continue;
                    int bit = 1 << slot; presence |= bit;
                    var value = target[names[slot]];
                    if (value == null) { nulls |= bit; continue; }
                    if (slot == 0 && value is Guid id)
                    {
                        types |= bit;
                        if (id != Guid.Empty && id == target.Id) matches |= 1;
                        if (id != Guid.Empty && id == workspace) matches |= 2;
                    }
                    else if (slot == 2 && value is DateTime timestamp)
                    {
                        types |= bit; dateKind = (int)timestamp.Kind + 1;
                    }
                    else if ((slot == 1 || slot == 3) && value is EntityReference reference)
                    {
                        types |= bit;
                        if (reference.LogicalName == "systemuser") matches |= slot == 1 ? 4 : 16;
                        if (reference.Id != Guid.Empty && reference.Id == c.InitiatingUserId) matches |= slot == 1 ? 8 : 32;
                    }
                }
                int known = (target.Contains("zk_state") ? 1 : 0) + (target.Contains("zk_revision") ? 1 : 0);
                for (int bit = 1; bit <= 8; bit <<= 1) if ((presence & bit) != 0) known++;
                unknown = Math.Min(63, target.Attributes.Count - known);
            }
            catch (Exception) { q = presence = types = nulls = matches = dateKind = unknown = 0; }
            return "[zk_guard_decor_v1;q=" + q.ToString(System.Globalization.CultureInfo.InvariantCulture) + ";p=" + presence.ToString(System.Globalization.CultureInfo.InvariantCulture) + ";t=" + types.ToString(System.Globalization.CultureInfo.InvariantCulture) + ";z=" + nulls.ToString(System.Globalization.CultureInfo.InvariantCulture) + ";m=" + matches.ToString(System.Globalization.CultureInfo.InvariantCulture) + ";d=" + dateKind.ToString(System.Globalization.CultureInfo.InvariantCulture) + ";u=" + unknown.ToString(System.Globalization.CultureInfo.InvariantCulture) + "]";
        }
        public void Execute(IServiceProvider provider)
        {
            var c = (IPluginExecutionContext)(provider.GetService(typeof(IPluginExecutionContext)) ?? throw new InvalidPluginExecutionException("Execution context missing."));
            var parent = c.ParentContext;
            if (parent != null && (parent.MessageName == "Create" || parent.MessageName == "Update") && WrapperMask(c, parent) == 0)
                parent = parent.ParentContext;
            if (c.Mode != 0 || c.Stage != 20 || !c.IsInTransaction || parent == null || parent.MessageName != "zk_KitchenCommit" || parent.Stage != 30 || parent.Mode != 0 || !parent.IsInTransaction || c.InitiatingUserId != parent.InitiatingUserId || c.UserId != parent.UserId || c.UserId != c.InitiatingUserId || !c.InputParameters.Contains("Target") || !(c.InputParameters["Target"] is Entity target))
                throw new InvalidPluginExecutionException("Direct kitchen table writes are blocked. " + GuardDiagnostic(c));
            RequestBinding(parent, out Guid workspace, out string operationId);
            bool valid = c.MessageName == "Update" && target.LogicalName == "zk_kitchenworkspace" && target.Id == workspace && target.Attributes.Count == 2 && target.Contains("zk_state") && target.Contains("zk_revision");
            if (c.MessageName == "Create" && target.LogicalName == "zk_kitchenoperation")
                valid = target.GetAttributeValue<EntityReference>("zk_workspace")?.Id == workspace && target.GetAttributeValue<string>("zk_operationid") == operationId && target.GetAttributeValue<string>("zk_actor") == c.InitiatingUserId.ToString("D");
            if (!valid)
                throw new InvalidPluginExecutionException("Kitchen history mutations and bulk/direct writes are blocked. " + TargetDiagnostic(c, target, workspace, operationId) + (c.MessageName == "Update" && target.LogicalName == "zk_kitchenworkspace" ? " " + DecorationDiagnostic(c, target, workspace) : ""));
        }
    }
}
