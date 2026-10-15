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
        // Called only after the original guard has already denied the operation.
        private static string GuardDiagnostic(IPluginExecutionContext c)
        {
            int mask = 0, kind = 0;
            try
            {
                if (c.Mode != 0) mask |= 1;
                if (c.Stage != 20) mask |= 2;
                if (!c.IsInTransaction) mask |= 4;
                var p = c.ParentContext;
                if (p == null) mask |= 8;
                else
                {
                    var names = new[] { "zk_KitchenCommit", "Create", "Update", "Delete", "CreateMultiple", "UpdateMultiple", "Upsert", "UpsertMultiple", "DeleteMultiple" };
                    int index = Array.IndexOf(names, p.MessageName); kind = index < 0 ? 10 : index + 1;
                    if (p.MessageName != "zk_KitchenCommit") mask |= 16;
                    if (p.Stage != 30) mask |= 32;
                    if (p.Mode != 0) mask |= 64;
                    if (!p.IsInTransaction) mask |= 128;
                    if (c.InitiatingUserId != p.InitiatingUserId) mask |= 256;
                    if (c.UserId != p.UserId) mask |= 512;
                    if (!p.SharedVariables.Contains(PluginHost.InternalWrite)) mask |= 2048;
                    else if (!(p.SharedVariables[PluginHost.InternalWrite] is string)) mask |= 4096;
                }
                if (c.UserId != c.InitiatingUserId) mask |= 1024;
                if (!c.InputParameters.Contains("Target")) mask |= 8192;
                else if (!(c.InputParameters["Target"] is Entity)) mask |= 16384;
            }
            catch (Exception) { mask = 0; kind = 0; } // Diagnosis must never replace or bypass denial.
            return "[zk_guard_v1;m=" + mask.ToString(System.Globalization.CultureInfo.InvariantCulture) + ";p=" + kind.ToString(System.Globalization.CultureInfo.InvariantCulture) + "]";
        }
        public void Execute(IServiceProvider provider)
        {
            var c = (IPluginExecutionContext)(provider.GetService(typeof(IPluginExecutionContext)) ?? throw new InvalidPluginExecutionException("Execution context missing."));
            var parent = c.ParentContext;
            if (c.Mode != 0 || c.Stage != 20 || !c.IsInTransaction || parent == null || parent.MessageName != "zk_KitchenCommit" || parent.Stage != 30 || parent.Mode != 0 || !parent.IsInTransaction || c.InitiatingUserId != parent.InitiatingUserId || c.UserId != parent.UserId || c.UserId != c.InitiatingUserId || !parent.SharedVariables.Contains(PluginHost.InternalWrite) || !(parent.SharedVariables[PluginHost.InternalWrite] is string marker) || !c.InputParameters.Contains("Target") || !(c.InputParameters["Target"] is Entity target))
                throw new InvalidPluginExecutionException("Direct kitchen table writes are blocked. " + GuardDiagnostic(c));
            var parts = marker.Split(new[] { '|' }, 2);
            Guid workspace;
            if (parts.Length != 2 || !Guid.TryParse(parts[0], out workspace))
                throw new InvalidPluginExecutionException("Invalid kitchen write context.");
            bool valid = c.MessageName == "Update" && target.LogicalName == "zk_kitchenworkspace" && target.Id == workspace && target.Attributes.Count == 2 && target.Contains("zk_state") && target.Contains("zk_revision");
            if (c.MessageName == "Create" && target.LogicalName == "zk_kitchenoperation")
                valid = target.GetAttributeValue<EntityReference>("zk_workspace")?.Id == workspace && target.GetAttributeValue<string>("zk_operationid") == parts[1] && target.GetAttributeValue<string>("zk_actor") == c.InitiatingUserId.ToString("D");
            if (!valid)
                throw new InvalidPluginExecutionException("Kitchen history mutations and bulk/direct writes are blocked.");
        }
    }
}
