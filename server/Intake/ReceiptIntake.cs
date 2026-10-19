using System;
using System.Linq;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
namespace Zunftkueche
{
    /** Preparation reads only. Persistence remains inside the existing synchronous API transaction. */
    public static class ReceiptIntake
    {
        public sealed class Prepared { public JObject Candidate=new JObject();public JObject Draft=new JObject();public Guid DraftId;public string RowVersion=""; }
        public static void ValidateRaw(JObject raw,JObject header,JArray lines) {
            DocumentProtocol.Fields(raw,"total lines");
            NumberText(raw["total"],header["grossCents"],true);
            var values=StatePolicy.Obj(raw["lines"]);
            StatePolicy.Require(values.Count==lines.Count,"Raw line inventory mismatch.");
            foreach(var line in lines.Select(StatePolicy.Obj)) {
                var value=StatePolicy.Obj(values[(string)line["id"]!]);DocumentProtocol.Fields(value,"quantity grossCents");
                NumberText(value["quantity"],line["quantity"],false);NumberText(value["grossCents"],line["grossCents"],true);
            }
        }
        static void NumberText(JToken? value,JToken? expected,bool money) {
            var text=StatePolicy.Str(value,100,true).Trim();
            if(text==""){StatePolicy.Require(expected?.Type==JTokenType.Null,"Blank raw number contradicts saved value.");return;}
            StatePolicy.Require(Regex.IsMatch(text,money?"^[0-9]+(?:[,.][0-9]{1,2})?$":"^[0-9]+(?:[,.][0-9]{1,4})?$"),"Raw input is not a strict manual number.");
            decimal number;StatePolicy.Require(decimal.TryParse(text.Replace(',','.'),NumberStyles.AllowDecimalPoint,CultureInfo.InvariantCulture,out number),"Raw input number invalid.");
            if(money)number*=100;
            StatePolicy.Require(expected!=null&&expected.Type!=JTokenType.Null&&number==expected.Value<decimal>(),"Raw input differs from reviewed fields.");
        }
        public static void ValidateTextAssist(JObject assist) {
            DocumentProtocol.Fields(assist,"origin completeness parserVersion text proposals");
            StatePolicy.Require((string?)assist["origin"]=="user-supplied"&&(string?)assist["completeness"]=="unknown"&&(string?)assist["parserVersion"]=="receipt-hints-v1","Text origin invalid.");
            var text=StatePolicy.Str(assist["text"],16000,true);var proposals=StatePolicy.Arr(assist["proposals"]);
            StatePolicy.Require(proposals.Count<=4,"Too many text proposals.");var seen=new System.Collections.Generic.HashSet<string>();
            foreach(var p in proposals.Select(StatePolicy.Obj)) {
                DocumentProtocol.Fields(p,"field value status evidence");var field=StatePolicy.Str(p["field"],30);
                StatePolicy.Require(new[]{"supplierId","number","date","grossCents"}.Contains(field)&&seen.Add(field),"Text field invalid.");
                if(p["value"]?.Type!=JTokenType.Null)StatePolicy.Str(p["value"],500,true);
                StatePolicy.Require(new[]{"proposed","missing","ambiguous","incomplete"}.Contains((string?)p["status"]),"Text status invalid.");
                var evidence=StatePolicy.Arr(p["evidence"]);StatePolicy.Require(evidence.Count<=200,"Too much text evidence.");
                foreach(var e in evidence.Select(StatePolicy.Obj)) {
                    DocumentProtocol.Fields(e,"page start end quote");StatePolicy.Require(e["page"]?.Type==JTokenType.Null,"Supplied text page is unknown.");
                    int start=(int)StatePolicy.Number(e["start"],16000),end=(int)StatePolicy.Number(e["end"],16000);
                    StatePolicy.Require(end>=start&&end<=text.Length&&text.Substring(start,end-start)==(string?)e["quote"],"Text evidence differs from supplied content.");
                }
            }
        }
        public static Prepared Prepare(JObject q,Workspace row,Guid actor,DateTime timestamp,IKitchenStore store,string hash) {
            StatePolicy.Require(store is IKitchenDocumentStore && actor==row.UserId && actor!=Guid.Empty,"Actual document caller required.");
            var source=(IKitchenDocumentStore)store;var p=StatePolicy.Obj(q["operation"]!["payload"]);
            DocumentProtocol.Fields(p,"eventId expectedWorkspaceRevision draftId draftRowVersion documentVersion reviewedFields reviewDecisions operationId");
            var eventId=StatePolicy.Str(q["targetEventId"],500);var operationId=StatePolicy.Str(q["operationId"],100);
            StatePolicy.Require((string?)p["eventId"]==eventId&&(string?)p["operationId"]==operationId&&JToken.DeepEquals(p["expectedWorkspaceRevision"],q["expectedRevision"]),"Acceptance envelope binding mismatch.");
            Guid draftId,opId;StatePolicy.Require(Guid.TryParseExact((string?)p["draftId"],"D",out draftId)&&draftId!=Guid.Empty&&Guid.TryParseExact(operationId,"D",out opId)&&opId!=Guid.Empty,"Acceptance IDs invalid.");
            var draft=source.FindDocumentRow(row.Id,draftId,true);
            StatePolicy.Require(draft!=null&&(string?)draft["eventId"]==eventId&&(string?)draft["workspaceId"]==row.Id.ToString("D"),"Draft not in this workspace/event.");
            StatePolicy.Require((string?)draft!["reviewStatus"]=="reviewed"&&draft["acceptance"]==null&&(string?)draft["rowVersion"]==(string?)p["draftRowVersion"],"Draft version changed or already accepted.");
            var state=StatePolicy.Events(row.State)[eventId];StatePolicy.Require((string?)state["event"]!["status"]!="Abgeschlossen","Closed event cannot accept receipts.");
            DocumentProtocol.ValidateDraft(draft,state,row.Id,source);
            StatePolicy.Require(JToken.DeepEquals(draft["pages"],p["documentVersion"]),"Original versions differ from reviewed draft.");
            var fields=StatePolicy.Obj(p["reviewedFields"]);DocumentProtocol.Fields(fields,"header lines raw");
            StatePolicy.Require(JToken.DeepEquals(fields["header"],draft["header"])&&JToken.DeepEquals(fields["lines"],draft["lines"]),"Reviewed fields differ from saved draft.");
            ValidateRaw(StatePolicy.Obj(fields["raw"]),StatePolicy.Obj(draft["header"]),StatePolicy.Arr(draft["lines"]));
            if(draft["rawInput"]!=null)StatePolicy.Require(JToken.DeepEquals(draft["rawInput"],fields["raw"]),"Raw review differs from saved edit.");
            var decisions=StatePolicy.Obj(p["reviewDecisions"]);DocumentProtocol.Fields(decisions,"receipt fields originals prices stock");
            StatePolicy.Require(new[]{"receipt","fields","originals"}.All(k=>decisions[k]?.Type==JTokenType.Boolean&&(bool)decisions[k]!)&&(string?)decisions["prices"]=="separate"&&(string?)decisions["stock"]=="separate","Explicit review decisions required.");
            // Same saved draft, exact file content and business identity are independent duplicate checks.
            var header=StatePolicy.Obj(draft["header"]);var invoices=StatePolicy.Arr(state["invoices"]);
            StatePolicy.Require(!invoices.Any(i=>(string?)i["id"]==draftId.ToString("D")||(string?)i["intake"]?["draftId"]==draftId.ToString("D")),"Draft already has a receipt.");
            StatePolicy.Require(!invoices.Any(i=>(string?)i["supplierId"]==(string?)header["supplierId"]&&string.Equals(((string?)i["number"])?.Trim(),((string?)header["number"])?.Trim(),StringComparison.OrdinalIgnoreCase)&&JToken.DeepEquals(i["date"],header["date"])&&JToken.DeepEquals(i["grossCents"],header["grossCents"])),"Business duplicate supplier/number/date/amount.");
            var hashes=StatePolicy.Arr(draft["pages"]).Select(v=>(string?)v["sha256"]).ToArray();
            foreach(var existing in StatePolicy.Events(row.State).Values.SelectMany(e=>StatePolicy.Arr(e["invoices"]).Select(StatePolicy.Obj))) {
                StatePolicy.Require(existing["source"]?["hash"]==null||!hashes.Contains((string?)existing["source"]!["hash"]),"Exact imported original hash already recorded.");
                if(existing["intake"]==null)continue;
                var oldId=Guid.Parse((string)existing["intake"]!["draftId"]!);
                var old=source.FindDocumentRow(row.Id,oldId,true);
                StatePolicy.Require(old!=null&&old["acceptance"]!=null&&(string?)old["acceptance"]!["operationId"]==(string?)existing["intake"]!["operationId"],"Prior intake source inaccessible; duplicate check incomplete.");
                StatePolicy.Require(!StatePolicy.Arr(old!["pages"]).Any(page=>hashes.Contains((string?)page["sha256"])),"Exact original hash already accepted.");
            }
            var invoice=(JObject)header.DeepClone();invoice["id"]=draftId.ToString("D");invoice["status"]="Erfasst";invoice["netCents"]=null;
            if((string?)invoice["date"]=="")invoice["date"]=null;
            var first=source.FindDocumentRow(row.Id,Guid.Parse((string)draft["pages"]![0]!["documentId"]!),false)!;
            invoice["documentUrl"]=first["ref"]!["webUrl"]!.DeepClone();
            invoice["lines"]=new JArray(StatePolicy.Arr(draft["lines"]).Select(StatePolicy.Obj).Select(line=>{
                var result=new JObject{{"name",line["description"]!.DeepClone()},{"quantity",line["quantity"]!.DeepClone()},{"unit",line["unit"]!.DeepClone()},{"netCents",null},{"grossCents",line["grossCents"]!.DeepClone()}};
                if((string?)line["articleId"]!="")result["articleId"]=line["articleId"]!.DeepClone();return result;
            }));
            invoice["intake"]=new JObject{{"draftId",draftId.ToString("D")},{"operationId",operationId}};
            invoice["sourceBaseline"]=invoice.DeepClone();
            var candidate=(JObject)row.State.DeepClone();StatePolicy.Arr(StatePolicy.Events(candidate)[eventId]["invoices"]).Add(invoice);
            var accepted=(JObject)draft.DeepClone();accepted.Remove("rowVersion");accepted.Remove("rawRow");accepted["reviewStatus"]="accepted";
            accepted["acceptance"]=new JObject{{"operationId",operationId},{"receiptId",draftId.ToString("D")},{"requestHash",hash},{"appliedRevision",row.Revision+1},{"actorId",actor.ToString("D")},{"recordedAt",timestamp.ToString("o")},{"reviewedFields",fields.DeepClone()},{"reviewDecisions",decisions.DeepClone()},{"documentVersion",p["documentVersion"]!.DeepClone()}};
            var snapshot=(JObject)accepted.DeepClone();snapshot.Remove("history");
            StatePolicy.Arr(accepted["history"]).Add(new JObject{{"requestId",operationId},{"requestHash",hash},{"action","receipt.draft.accept"},{"actorId",actor.ToString("D")},{"recordedAt",timestamp.ToString("o")},{"value",snapshot}});
            StatePolicy.Require(Encoding.UTF8.GetByteCount(accepted.ToString(Formatting.None))<=DocumentProtocol.MaxPayload,"Draft history limit reached; preserve before accepting.");
            return new Prepared{Candidate=candidate,Draft=accepted,DraftId=draftId,RowVersion=(string)draft["rowVersion"]!};
        }
    }
}
