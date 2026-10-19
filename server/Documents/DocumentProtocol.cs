using System;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Zunftkueche
{
    public interface IKitchenDocumentStore
    {
        JArray ReadDocumentRows(Guid workspace, bool drafts);
        JObject? FindDocumentRow(Guid workspace, Guid id, bool draft);
        JObject SaveDocumentRow(Guid workspace, Guid id, bool draft, JObject payload, string? rowVersion);
    }

    public static class DocumentProtocol
    {
        public const string Contract = "kitchen-documents-v1";
        public const int MaxPayload = 131072;
        public const string Site = "f8177aa4-4ba3-4ba1-8c26-5ed32d5b2923";
        public const string Web = "c24ab669-3ca6-4530-aabf-6f42f8343ae7";
        public const string Library = "9e71defe-f678-4c0c-b69c-45e4370a735a";
        public static void Fields(JObject value, string fields)
        {
            var keys = fields.Split(' ');
            StatePolicy.Require(value.Properties().All(p => keys.Contains(p.Name)), "Unknown document field.");
        }
        static string Text(JToken? value, int length) {
            var text=StatePolicy.Str(value,length);
            StatePolicy.Require(!text.Any(character=>character<32),"Document text contains control characters.");
            return text;
        }
        static Guid Id(JToken? value)
        {
            Guid id;
            StatePolicy.Require(Guid.TryParseExact(Text(value,36),"D",out id) && id != Guid.Empty, "Document ID required.");
            return id;
        }
        static Workspace Authorize(JObject q, IKitchenStore store)
        {
            var workspace = Protocol.WorkspaceId(q);
            var row = store.Read(workspace);
            StatePolicy.Require(row.Id == workspace && row.CanWrite, "Document editor permission required.");
            var identity = new JObject { {"organizationId",row.OrganizationId.ToString("D")}, {"userId",row.UserId.ToString("D")}, {"workspaceId",workspace.ToString("D")} };
            StatePolicy.Require(JToken.DeepEquals(identity,q["identity"]),"Document identity changed.");
            StatePolicy.Validate(row.State,row.State);
            StatePolicy.Require((int?)row.State["revision"]==row.Revision,"Document workspace revision mismatch.");
            StatePolicy.Require(store is IKitchenDocumentStore,"Document source unavailable.");
            return row;
        }
        public static JObject Load(JObject q, IKitchenStore store)
        {
            Fields(q,"protocolVersion workspaceId view identity");
            var row = Authorize(q,store);
            var source=(IKitchenDocumentStore)store;
            var response=new JObject { {"protocolVersion",2},{"workspaceId",row.Id.ToString("D")},{"identity",q["identity"]!.DeepClone()}, {"view","documents"},
                {"documents",source.ReadDocumentRows(row.Id,false)},{"drafts",source.ReadDocumentRows(row.Id,true)} };
            StatePolicy.Require(Encoding.UTF8.GetByteCount(response.ToString(Formatting.None))<=BackupProtocol.MaxSnapshotBytes,"Document inventory bound exceeded; no truncation.");
            return response;
        }
        public static JObject Commit(JObject q, Guid actor, bool transaction, IKitchenStore store)
        {
            Func<JObject>? persist;
            JObject? replay;
            try { replay=Prepare(q,actor,transaction,store,out persist); }
            catch(ArgumentException error) {
                return new JObject{{"protocolVersion",2},{"workspaceId",q["workspaceId"]?.DeepClone()},{"identity",q["identity"]?.DeepClone()},{"view","documents"},{"status","rejected"},{"message",error.Message}};
            }
            // All storage faults after mutation starts escape the ambient transaction.
            return replay ?? persist!();
        }
        static JObject? Prepare(JObject q, Guid actor, bool transaction, IKitchenStore store,out Func<JObject>? persist)
        {
            persist=null;
            Fields(q,"protocolVersion workspaceId view identity action value requestId");
            var row=Authorize(q,store);
            StatePolicy.Require(transaction && actor!=Guid.Empty && actor==row.UserId,"Actual caller transaction required.");
            var source=(IKitchenDocumentStore)store;
            var action=Text(q["action"],40);
            StatePolicy.Require(new[]{"upload.begin","upload.claim","upload.link","draft.save"}.Contains(action),"Unsupported document action. Acceptance requires KitchenCommit receipt.draft.accept.");
            var draft=action=="draft.save";
            var value=(JObject)StatePolicy.Obj(q["value"]).DeepClone();
            var id=Id(value[draft?"id":"uploadId"]);
            var eventId=Text(value["eventId"],500);
            var events=StatePolicy.Events(row.State);
            StatePolicy.Require(events.ContainsKey(eventId),"Document event belongs to another workspace.");
            StatePolicy.Require((string?)events[eventId]["event"]!["status"]!="Abgeschlossen","Closed event cannot receive drafts.");
            var prior=source.FindDocumentRow(row.Id,id,draft);
            var requestId=Id(q["requestId"]).ToString("D");
            var hash=Protocol.Hash(Protocol.Canonical(q).ToString(Formatting.None));
            if(prior!=null)
            {
                StatePolicy.Require((string?)prior["eventId"]==eventId && (string?)prior["workspaceId"]==row.Id.ToString("D"),"Document event/workspace mismatch.");
                var replay=StatePolicy.Arr(prior["history"]).Select(StatePolicy.Obj).FirstOrDefault(h=>(string?)h["requestId"]==requestId);
                if(replay!=null) {
                    StatePolicy.Require((string?)replay["requestHash"]==hash && (string?)replay["actorId"]==actor.ToString("D"),"Document request replay mismatch.");
                    return Response(q,prior);
                }
            }
            JObject next;
            if(action=="upload.begin") {
                Fields(value,"uploadId eventId principal sha256 mimeType size originalName");
                ValidateOriginal(value);
                StatePolicy.Require(Regex.IsMatch(id.ToString("D"),"^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$"),"UUID v4 required.");
                Text(value["principal"],512);
                if(prior!=null) {
                    StatePolicy.Require(value.Properties().All(p=>JToken.DeepEquals(prior[p.Name],p.Value)),"Upload ID already bound to different original.");
                    return Response(q,prior);
                }
                next=value; next["id"]=id.ToString("D"); next["status"]="selected";
            }
            else {
                if(draft) ValidateDraft(value,events[eventId],row.Id,source);
                else {
                    Fields(value,"id uploadId eventId principal sha256 mimeType size originalName status rowVersion ref workspaceId history");
                    StatePolicy.Require(prior!=null,"Upload reservation missing.");
                    StatePolicy.Require(new[]{"uploadId","principal","sha256","mimeType","size","originalName"}.All(k=>JToken.DeepEquals(value[k],prior![k])),"Original identity cannot change.");
                }
                StatePolicy.Require(prior==null?value["rowVersion"]==null:(string?)value["rowVersion"]==(string?)prior["rowVersion"],"Document RowVersion conflict.");
                next=draft?value:(JObject)prior!.DeepClone();
                if(action=="upload.claim") {
                    StatePolicy.Require((string?)prior!["status"]=="selected","Upload already claimed; no repeated create.");
                    next["status"]="uploading";
                }
                if(action=="upload.link") {
                    StatePolicy.Require(new[]{"selected","uploading","uploaded-unlinked"}.Contains((string?)prior!["status"]),"Upload cannot relink.");
                    ValidateRef(StatePolicy.Obj(value["ref"]),prior!);
                    next["ref"]=value["ref"]!.DeepClone(); next["status"]="linked";
                }
            }
            next.Remove("rowVersion");next.Remove("rawRow");
            next["workspaceId"]=row.Id.ToString("D");
            var history=prior?["history"] is JArray old?(JArray)old.DeepClone():new JArray();
            var snapshot=(JObject)next.DeepClone();snapshot.Remove("history");
            history.Add(new JObject { {"requestId",requestId},{"requestHash",hash},{"action",action},{"actorId",actor.ToString("D")},{"recordedAt",DateTime.UtcNow.ToString("o")},{"value",snapshot} });
            next["history"]=history;
            StatePolicy.Require(Encoding.UTF8.GetByteCount(next.ToString(Formatting.None))<=MaxPayload,"Document history limit reached; preserve and review before continuing.");
            persist=()=>Response(q,source.SaveDocumentRow(row.Id,id,draft,next,(string?)prior?["rowVersion"]));
            return null;
        }
        static JObject Response(JObject q,JObject value) => new JObject { {"protocolVersion",2},{"workspaceId",q["workspaceId"]!.DeepClone()},{"identity",q["identity"]!.DeepClone()},{"view","documents"},{"value",value} };
        public static void ValidateOriginal(JObject value) {
            StatePolicy.Require(Regex.IsMatch(Text(value["sha256"],64),"^[a-f0-9]{64}$"),"Invalid original hash.");
            StatePolicy.Require(new[]{"image/jpeg","image/png","application/pdf"}.Contains(Text(value["mimeType"],30)),"Unsupported original type.");
            StatePolicy.Require(StatePolicy.Number(value["size"],5242880)>=1,"Invalid original size.");
            Text(value["originalName"],200);
        }
        public static void ValidateRef(JObject reference,JObject original) {
            Fields(reference,"provider siteCollectionId webId libraryId itemId version connectorIdentifier webUrl sha256 mimeType size originalName");
            ValidateOriginal(reference);
            StatePolicy.Require((string?)reference["provider"]=="sharepoint"&&(string?)reference["siteCollectionId"]==Site&&(string?)reference["webId"]==Web&&(string?)reference["libraryId"]==Library,"Unexpected SharePoint destination.");
            StatePolicy.Require(new[]{"sha256","mimeType","size","originalName"}.All(k=>JToken.DeepEquals(original[k],reference[k])),"Original reference mismatch.");
            StatePolicy.Require(Regex.IsMatch(Text(reference["itemId"],20),"^[1-9][0-9]*$"),"Invalid native item ID.");
            Text(reference["version"],256);Text(reference["connectorIdentifier"],4096);
            var extension=(string?)original["mimeType"]=="image/jpeg"?"jpg":(string?)original["mimeType"]=="image/png"?"png":"pdf";
            var expected="https://schelmenzunft.sharepoint.com/sites/SchelmenzunftStaufenTraditionszunftderStaufenerStubengesells/Shared Documents/General/Zunftküche/Rechnungen/receipt-"+(string?)original["uploadId"]+"."+extension;
            StatePolicy.Require(Uri.UnescapeDataString(Text(reference["webUrl"],4096))==expected,"Original URL outside reserved destination.");
        }
        static void OptionalText(JToken? token,int max) { StatePolicy.Require(token?.Type==JTokenType.String && ((string)token!).Length<=max&&!((string)token!).Any(character=>character<32),"Draft text invalid."); }
        static void NumberOrNull(JToken? token,bool money) {
            StatePolicy.Require(token!=null,"Missing draft number.");
            if(token!.Type==JTokenType.Null)return;
            var n=StatePolicy.Number(token,1000000000,money?0:4);
            StatePolicy.Require(!money||decimal.Truncate(n)==n,"Draft money must use integer cents.");
        }
        public static void ValidateDraft(JObject value,JObject state,Guid workspace,IKitchenDocumentStore source) {
            Fields(value,"schemaVersion id eventId rowVersion workspaceId source parserVersion modelVersion promptVersion reviewStatus pages header lines history");
            StatePolicy.Require((int?)value["schemaVersion"]==1&&(string?)value["source"]=="manual"&&new[]{"parserVersion","modelVersion","promptVersion"}.All(k=>value[k]?.Type==JTokenType.Null),"Manual provenance required.");
            StatePolicy.Require(new[]{"editing","reviewed"}.Contains((string?)value["reviewStatus"]),"Draft review status invalid.");
            var pages=StatePolicy.Arr(value["pages"]);StatePolicy.Require(pages.Count>=1&&pages.Count<=10,"One to ten ordered originals required.");
            var seen=new System.Collections.Generic.HashSet<string>();long size=0;
            foreach(var page in pages.Select(StatePolicy.Obj)) {
                Fields(page,"documentId documentRowVersion version sha256 originalReviewed");
                var id=Id(page["documentId"]);StatePolicy.Require(seen.Add(id.ToString()),"Duplicate draft original.");
                var document=source.FindDocumentRow(workspace,id,false);
                StatePolicy.Require(document!=null&&(string?)document["eventId"]==(string?)value["eventId"]&&(string?)document["status"]=="linked","Draft original not linked to same event.");
                StatePolicy.Require((string?)page["documentRowVersion"]==(string?)document!["rowVersion"]&&(string?)page["version"]==(string?)document["ref"]!["version"]&&(string?)page["sha256"]==(string?)document["sha256"],"Draft source version changed.");
                StatePolicy.Require(page["originalReviewed"]?.Type==JTokenType.Boolean&&((string?)value["reviewStatus"]!="reviewed"||(bool)page["originalReviewed"]!),"Explicit original review missing.");
                size+=(long)document["size"]!;
            }
            StatePolicy.Require(size<=20971520,"Original bundle exceeds 20 MiB.");
            var header=StatePolicy.Obj(value["header"]);Fields(header,"supplierId number date scope grossCents");
            foreach(var key in new[]{"supplierId","number","date","scope"})OptionalText(header[key],200);
            var supplier=(string?)header["supplierId"];StatePolicy.Require(supplier==""||StatePolicy.Arr(state["suppliers"]).Any(s=>(string?)s["id"]==supplier),"Draft supplier invalid.");
            var date=(string?)header["date"];DateTime parsed;StatePolicy.Require(date==""||DateTime.TryParseExact(date,"yyyy-MM-dd",System.Globalization.CultureInfo.InvariantCulture,System.Globalization.DateTimeStyles.None,out parsed),"Draft date invalid.");
            NumberOrNull(header["grossCents"],true);
            var lines=StatePolicy.Arr(value["lines"]);StatePolicy.Require(lines.Count<=100,"Draft line limit exceeded.");
            var lineIds=new System.Collections.Generic.HashSet<string>();
            foreach(var line in lines.Select(StatePolicy.Obj)) {
                Fields(line,"id description articleId quantity unit grossCents");StatePolicy.Require(lineIds.Add(Id(line["id"]).ToString()),"Duplicate draft line.");
                foreach(var key in new[]{"description","articleId","unit"})OptionalText(line[key],500);
                var article=(string?)line["articleId"];StatePolicy.Require(article==""||StatePolicy.Arr(state["articles"]).Any(a=>(string?)a["id"]==article),"Draft article invalid.");
                NumberOrNull(line["quantity"],false);NumberOrNull(line["grossCents"],true);
            }
        }
    }
}
