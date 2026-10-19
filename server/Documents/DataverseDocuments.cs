using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Zunftkueche
{
    internal sealed partial class DataverseStore : IKitchenDocumentStore
    {
        internal static string DocumentTable(bool draft) => draft ? "zk_kitchendraft" : "zk_kitchendocument";
        static JObject DocumentPayload(Entity row,Guid workspace,bool draft) {
            StatePolicy.Require(row.GetAttributeValue<EntityReference>("zk_workspace")?.Id==workspace && !string.IsNullOrWhiteSpace(row.RowVersion),"Document workspace/version invalid.");
            var raw=row.GetAttributeValue<string>("zk_payload");
            StatePolicy.Require(raw!=null && Encoding.UTF8.GetByteCount(raw)<=DocumentProtocol.MaxPayload,"Document payload bound invalid.");
            var value=Protocol.Parse(raw!);
            StatePolicy.Require((string?)value["workspaceId"]==workspace.ToString("D") && (string?)value["id"]==row.Id.ToString("D") && (string?)value["eventId"]==row.GetAttributeValue<string>("zk_eventid"),"Document persisted identity mismatch.");
            value["rowVersion"]=row.RowVersion;
            return value;
        }
        public JObject? FindDocumentRow(Guid workspace,Guid id,bool draft) {
            // Query returns absence only within the caller's effective row access. Creation uses
            // the same globally unique primary key, so an inaccessible existing row cannot duplicate.
            var table=DocumentTable(draft);
            var query=new QueryExpression(table){ColumnSet=new ColumnSet(true),TopCount=2};
            query.Criteria.AddCondition(table+"id",ConditionOperator.Equal,id);
            query.Criteria.AddCondition("zk_workspace",ConditionOperator.Equal,workspace);
            var rows=service.RetrieveMultiple(query).Entities;
            StatePolicy.Require(rows.Count<=1,"Document primary key not unique.");
            return rows.Count==0?null:DocumentPayload(rows[0],workspace,draft);
        }
        public JArray ReadDocumentRows(Guid workspace,bool drafts) {
            var table=DocumentTable(drafts);
            var query=new QueryExpression(table){ColumnSet=new ColumnSet(true),PageInfo=new PagingInfo{Count=200,PageNumber=1}};
            query.Criteria.AddCondition("zk_workspace",ConditionOperator.Equal,workspace);
            query.AddOrder(table+"id",OrderType.Ascending);
            var result=new JArray();var ids=new HashSet<Guid>();var cookies=new HashSet<string>();
            for(int page=1;page<=20;page++) {
                query.PageInfo.PageNumber=page;
                var rows=service.RetrieveMultiple(query);
                foreach(var row in rows.Entities) {
                    StatePolicy.Require(ids.Add(row.Id)&&result.Count<4000,"Duplicate or excessive document inventory.");
                    var value=DocumentPayload(row,workspace,drafts);
                    value["rawRow"]=RawEntity(row,table);
                    result.Add(value);
                }
                StatePolicy.Require(Encoding.UTF8.GetByteCount(result.ToString(Formatting.None))<=BackupProtocol.MaxSnapshotBytes,"Document inventory too large; no truncation.");
                if(!rows.MoreRecords)return result;
                StatePolicy.Require(!string.IsNullOrEmpty(rows.PagingCookie)&&cookies.Add(rows.PagingCookie),"Document pagination is incomplete.");
                query.PageInfo.PagingCookie=rows.PagingCookie;
            }
            throw new ArgumentException("Document inventory paging limit reached.");
        }
        public JObject SaveDocumentRow(Guid workspace,Guid id,bool draft,JObject payload,string? rowVersion) {
            StatePolicy.Require(context.IsInTransaction && context.UserId==context.InitiatingUserId,"Actual caller transaction required.");
            var table=DocumentTable(draft);
            var target=new Entity(table,id){RowVersion=rowVersion};
            target["zk_workspace"]=new EntityReference(WorkspaceTable,workspace);
            target["zk_eventid"]=(string)payload["eventId"]!;
            target["zk_payload"]=payload.ToString(Formatting.None);
            target["zk_actor"]=context.InitiatingUserId.ToString("D");
            target["zk_recordedat"]=DateTime.Parse((string)payload["history"]!.Last!["recordedAt"]!,System.Globalization.CultureInfo.InvariantCulture,System.Globalization.DateTimeStyles.RoundtripKind);
            if(rowVersion==null)service.Create(target);
            else service.Execute(new UpdateRequest{Target=target,ConcurrencyBehavior=ConcurrencyBehavior.IfRowVersionMatches});
            return DocumentPayload(service.Retrieve(table,id,new ColumnSet(true)),workspace,draft);
        }
    }

    /** Register on every direct/bulk mutation. Only the own synchronous API's immediate
      * Create/Update (optionally one matching platform wrapper) is admitted. No SYSTEM. */
    public sealed class KitchenDocumentWriteGuardPlugin : IPlugin
    {
        static void Require(bool condition) {
            if(!condition)throw new InvalidPluginExecutionException("Direct document/draft writes are blocked.");
        }
        public void Execute(IServiceProvider provider) {
            var c=(IPluginExecutionContext)(provider.GetService(typeof(IPluginExecutionContext))??throw new InvalidPluginExecutionException("Execution context missing."));
            Require(c.Mode==0&&c.Stage==20&&c.IsInTransaction&&c.UserId!=Guid.Empty&&c.UserId==c.InitiatingUserId);
            Require(c.InputParameters.Contains("Target")&&c.InputParameters["Target"] is Entity);
            var target=(Entity)c.InputParameters["Target"];
            Require((c.MessageName=="Create"||c.MessageName=="Update")&&(target.LogicalName=="zk_kitchendocument"||target.LogicalName=="zk_kitchendraft")&&c.PrimaryEntityName==target.LogicalName);
            var parent=c.ParentContext;
            if(parent!=null&&parent.MessageName==c.MessageName) {
                Require(parent.Stage==30&&parent.Mode==0&&parent.IsInTransaction&&parent.PrimaryEntityName==target.LogicalName&&parent.UserId==c.UserId&&parent.InitiatingUserId==c.InitiatingUserId);
                parent=parent.ParentContext;
            }
            Require(parent!=null&&parent.MessageName=="zk_KitchenCommit"&&parent.Stage==30&&parent.Mode==0&&parent.IsInTransaction&&parent.UserId==c.UserId&&parent.InitiatingUserId==c.InitiatingUserId);
            Require(parent!.InputParameters.Contains("RequestJson")&&parent.InputParameters["RequestJson"] is string);
            JObject q;
            try { q=Protocol.Parse((string)parent.InputParameters["RequestJson"]); }
            catch(Exception) { throw new InvalidPluginExecutionException("Document source request invalid."); }
            Require((string?)q["view"]=="documents");
            var action=(string?)q["action"];
            Require(target.LogicalName==(action=="draft.save"?"zk_kitchendraft":"zk_kitchendocument")&&new[]{"upload.begin","upload.claim","upload.link","draft.save"}.Contains(action));
            var value=StatePolicy.Obj(q["value"]);
            var workspace=Protocol.WorkspaceId(q);
            Require(Guid.TryParse((string?)value[action=="draft.save"?"id":"uploadId"],out var id)&&target.Id==id);
            Require(target.Attributes.Count==5&&new[]{"zk_workspace","zk_eventid","zk_payload","zk_actor","zk_recordedat"}.All(target.Contains));
            Require(target.GetAttributeValue<EntityReference>("zk_workspace")?.LogicalName=="zk_kitchenworkspace"&&target.GetAttributeValue<EntityReference>("zk_workspace")?.Id==workspace
                &&target.GetAttributeValue<string>("zk_eventid")== (string?)value["eventId"]&&target.GetAttributeValue<string>("zk_actor")==c.InitiatingUserId.ToString("D")
                &&target["zk_recordedat"] is DateTime timestamp&&timestamp.Kind==DateTimeKind.Utc);
            var payload=Protocol.Parse(target.GetAttributeValue<string>("zk_payload"));
            Require((string?)payload["id"]==id.ToString("D")&&(string?)payload["workspaceId"]==workspace.ToString("D")&&(string?)payload["eventId"]==(string?)value["eventId"]);
            var last=StatePolicy.Arr(payload["history"]).LastOrDefault() as JObject;
            Require(last!=null&&(string?)last["actorId"]==c.InitiatingUserId.ToString("D")&&(string?)last["requestId"]==(string?)q["requestId"]
                &&(string?)last["requestHash"]==Protocol.Hash(Protocol.Canonical(q).ToString(Formatting.None)));
            Require(DateTime.TryParse((string?)last!["recordedAt"],System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.RoundtripKind,out var recordedAt)
                && recordedAt.Kind==DateTimeKind.Utc && recordedAt==(DateTime)target["zk_recordedat"]);
        }
    }
}
