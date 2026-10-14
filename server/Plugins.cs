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
        public void Execute(IServiceProvider provider)
        {
            var c = (IPluginExecutionContext)(provider.GetService(typeof(IPluginExecutionContext)) ?? throw new InvalidPluginExecutionException("Execution context missing."));
            var parent = c.ParentContext;
            if (c.Mode != 0 || c.Stage != 20 || !c.IsInTransaction || parent == null || parent.MessageName != "zk_KitchenCommit" || parent.Stage != 30 || parent.Mode != 0 || !parent.IsInTransaction || c.InitiatingUserId != parent.InitiatingUserId || c.UserId != parent.UserId || c.UserId != c.InitiatingUserId || !parent.SharedVariables.Contains(PluginHost.InternalWrite) || !(parent.SharedVariables[PluginHost.InternalWrite] is string marker) || !c.InputParameters.Contains("Target") || !(c.InputParameters["Target"] is Entity target))
                throw new InvalidPluginExecutionException("Direct kitchen table writes are blocked.");
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
