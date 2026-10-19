using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Zunftkueche
{
    internal sealed partial class DataverseStore : IKitchenBackupStore
    {
        static JToken BackupValue(object? value)
        {
            if (value == null) return JValue.CreateNull();
            if (value is EntityReference reference)
                return new JObject { { "logicalName", reference.LogicalName }, { "id", reference.Id.ToString("D") }, { "name", reference.Name }, { "rowVersion", reference.RowVersion } };
            if (value is OptionSetValue option) return new JObject { { "type", "OptionSetValue" }, { "value", option.Value } };
            if (value is OptionSetValueCollection options) return new JArray(options.Select(option => BackupValue(option)));
            if (value is Money money) return new JObject { { "type", "Money" }, { "value", money.Value } };
            if (value is Guid guid) return new JValue(guid.ToString("D"));
            if (value is DateTime timestamp)
            {
                StatePolicy.Require(timestamp.Kind != DateTimeKind.Local, "Unexpected local provider timestamp.");
                return new JValue(DateTime.SpecifyKind(timestamp, DateTimeKind.Utc).ToString("o", CultureInfo.InvariantCulture));
            }
            if (value is string || value is bool || value is int || value is long || value is decimal || value is double)
                return JToken.FromObject(value);
            throw new ArgumentException("Unsupported persisted attribute type; backup stopped without dropping data.");
        }

        static JObject RawEntity(Entity entity, string expectedTable)
        {
            StatePolicy.Require(entity.LogicalName == expectedTable && entity.Id != Guid.Empty
                && !string.IsNullOrEmpty(entity.RowVersion), "Invalid backup entity identity or RowVersion.");
            var result = new JObject();
            foreach (var attribute in entity.Attributes.OrderBy(a => a.Key, StringComparer.Ordinal))
                result[attribute.Key] = BackupValue(attribute.Value);
            result[expectedTable + "id"] = entity.Id.ToString("D");
            result["@rowVersion"] = entity.RowVersion;
            result["@formattedValues"] = JObject.FromObject(entity.FormattedValues.ToDictionary(p => p.Key, p => p.Value));
            return result;
        }

        public BackupWorkspace ReadBackupWorkspace(Guid id)
        {
            var authorized = Read(id);
            StatePolicy.Require(authorized.CanConfigure && authorized.CanClose, "Owner backup permission required.");
            var entity = service.Retrieve(WorkspaceTable, id, new ColumnSet(true));
            var owner = entity.GetAttributeValue<EntityReference>("ownerid");
            StatePolicy.Require(owner?.LogicalName == "systemuser" && owner.Id == context.InitiatingUserId,
                "Workspace owner changed during backup.");
            StatePolicy.Require(entity.RowVersion == authorized.RowVersion, "Workspace changed before raw backup read.");
            var raw = entity.GetAttributeValue<string>("zk_state");
            var state = Protocol.Parse(raw);
            authorized.State = state;
            authorized.Revision = entity.GetAttributeValue<int>("zk_revision");
            authorized.RowVersion = entity.RowVersion;
            return new BackupWorkspace {
                Row = authorized, RawState = raw, RawRow = RawEntity(entity, WorkspaceTable),
                OwnerId = owner!.Id, OwnerType = owner.LogicalName
            };
        }

        public JArray ReadAllOperationRows(Guid workspaceId)
        {
            var query = new QueryExpression(ReceiptTable) {
                ColumnSet = new ColumnSet(true),
                PageInfo = new PagingInfo { Count = 500, PageNumber = 1 }
            };
            query.Criteria.AddCondition("zk_workspace", ConditionOperator.Equal, workspaceId);
            query.AddOrder(ReceiptTable + "id", OrderType.Ascending);
            var result = new JArray();
            var ids = new HashSet<Guid>();
            var cookies = new HashSet<string>();
            for (int page = 1; page <= 20; page++)
            {
                query.PageInfo.PageNumber = page;
                var rows = service.RetrieveMultiple(query);
                foreach (var row in rows.Entities)
                {
                    StatePolicy.Require(result.Count < 10000 && ids.Add(row.Id), "Duplicate or excessive operation rows.");
                    var workspace = row.GetAttributeValue<EntityReference>("zk_workspace");
                    StatePolicy.Require(workspace?.LogicalName == WorkspaceTable && workspace.Id == workspaceId,
                        "Operation row belongs to another workspace.");
                    var raw = RawEntity(row, ReceiptTable);
                    raw["_zk_workspace_value"] = workspaceId.ToString("D");
                    var recorded = BackupValue(row.GetAttributeValue<DateTime>("zk_recordedat"));
                    result.Add(new JObject {
                        { "id", row.Id.ToString("D") }, { "workspaceId", workspaceId.ToString("D") },
                        { "operationId", row.GetAttributeValue<string>("zk_operationid") },
                        { "requestHash", row.GetAttributeValue<string>("zk_requesthash") },
                        { "actorId", row.GetAttributeValue<string>("zk_actor") },
                        { "appliedRevision", row.GetAttributeValue<int>("zk_appliedrevision") },
                        { "recordedAt", recorded }, { "rowVersion", row.RowVersion }, { "rawRow", raw }
                    });
                }
                StatePolicy.Require(Encoding.UTF8.GetByteCount(result.ToString(Formatting.None)) <= BackupProtocol.MaxSnapshotBytes,
                    "Operation rows exceed bounded backup size; no partial snapshot returned.");
                if (!rows.MoreRecords) return result;
                StatePolicy.Require(!string.IsNullOrEmpty(rows.PagingCookie) && cookies.Add(rows.PagingCookie),
                    "Missing or repeated operation paging cookie.");
                query.PageInfo.PagingCookie = rows.PagingCookie;
            }
            throw new ArgumentException("Operation paging bound exceeded; no partial snapshot returned.");
        }
    }
}
