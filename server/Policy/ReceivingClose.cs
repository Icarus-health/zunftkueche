using System;
using System.Linq;
using Newtonsoft.Json.Linq;
namespace Zunftkueche {
 public static partial class StatePolicy {
  static bool Place(JObject e,string? a,string? b) {
   if(a==null||b==null)return false;
   Func<string,string> canonical=v=>{foreach(var l in History(Obj(e["event"]),"locations"))if((string?)l["name"]==v||Arr(l["historicalNames"]).Any(x=>(string?)x==v))return (string)l["name"]!;return v;};
   return canonical(a)==canonical(b);
  }
  static decimal? Effective(JObject e,JToken row,string history,string field) {
   var last=History(e,history).LastOrDefault(h=>(string?)h["targetId"]==(string?)row["id"]);
   var v=last==null?row[field]:last["after"];return Null(v)?(decimal?)null:v!.Value<decimal>();
  }
  static JObject CloseChecklist(JObject e,string scope,int revision) {
   var evScope=Obj(e["event"]);var active=evScope["locations"]==null?new[]{"Küche","Bar","Zunftscheuer","Brunnen","Mitwirkende / Aufbau / Probe"}:Arr(evScope["locations"]).Select(l=>(string)l["name"]!).ToArray();
   Require(scope=="Alle"||active.Concat(Arr(e["planLines"]).Select(l=>(string?)l["location"]??"")).Concat(Arr(e["movements"]).Select(l=>(string?)l["location"]??"")).Concat(Arr(e["invoices"]).Select(l=>(string?)l["scope"]??"")).Contains(scope),"Unknown closure scope.");
   var open=new JArray();var sales=Arr(e["sales"]).Where(s=>new[]{"Freitag","Samstag"}.Contains((string?)s["day"])).ToArray();
   var menus=Arr(e["menu"]);var complete=menus.Count>0&&menus.All(m=>new[]{"Freitag","Samstag"}.All(day=>sales.Any(s=>(string?)s["menuId"]==(string?)m["id"]&&(string?)s["day"]==day&&!Null(s["quantity"])&&Effective(e,s,"salePriceCorrections","priceCents")!=null)));
   if(!complete)open.Add("Verkäufe oder bestätigte Verkaufspreise fehlen.");
   var invoices=Arr(e["invoices"]).Where(i=>scope=="Alle"||Place(e,(string?)i["scope"],scope)).ToArray();
   if(invoices.Length==0||invoices.Any(i=>Null(i["grossCents"])))open.Add("Bruttobelege fehlen oder sind offen.");
   if(invoices.Any(i=>Null(i["netCents"])))open.Add("Nettobeträge sind offen; Brutto ist kein Netto-Wareneinsatz.");
   if(Arr(e["invoices"]).Any(i=>string.IsNullOrEmpty((string?)i["scope"])||(string?)i["scope"]=="Offen"))open.Add("Belegzuordnungen sind offen.");
   var movements=Arr(e["movements"]).Where(m=>scope=="Alle"||Place(e,(string?)m["location"],scope)).ToArray();
   if(movements.Length==0||movements.Any(m=>new[]{"Anfangsbestand","Zählung"}.Any(type=>!Arr(e["movements"]).Any(x=>(string?)x["articleId"]==(string?)m["articleId"]&&Place(e,(string?)x["location"],(string?)m["location"])&&(string?)x["type"]==type))))open.Add("Anfangsbestände oder Schlusszählungen fehlen.");
   if(Arr(e["orders"]).Any(o=>Arr(o["lines"]).Any(l=>Null(l["quantity"])||Arr(e["movements"]).Where(m=>(string?)m["orderId"]==(string?)o["id"]&&(string?)m["orderLineId"]==(string?)l["id"]).Sum(m=>Effective(e,m,"movementCorrections","quantity")??0)<l["quantity"]!.Value<decimal>())))open.Add("Bestellfassungen enthalten offene Liefermengen (einschließlich älterer Fassungen).");
   var ev=Obj(e["event"]);string? purchasing=ev["purchasingLocation"]==null?(ev["locations"]==null?"Küche":Arr(ev["locations"]).Where(l=>(string?)l["name"]=="Küche"||Arr(l["historicalNames"]).Any(x=>(string?)x=="Küche")).Select(l=>(string?)l["name"]).FirstOrDefault()):(string?)ev["purchasingLocation"];
   var comparable=scope!="Alle"&&scope==purchasing;
   if(!comparable)open.Add("Kostenumfang und Küchenverkaufsumfang sind nicht vergleichbar.");
   return new JObject{{"scope",scope},{"revision",revision},{"open",open},{"complete",open.Count==0},{"revenueCents",complete&&comparable?new JValue((long)sales.Sum(s=>s["quantity"]!.Value<decimal>()*Effective(e,s,"salePriceCorrections","priceCents")!.Value)):JValue.CreateNull()},{"grossReceiptsCents",invoices.Length>0&&invoices.All(i=>!Null(i["grossCents"]))?new JValue((long)invoices.Sum(i=>i["grossCents"]!.Value<decimal>())):JValue.CreateNull()},{"netReceiptsCents",invoices.Length>0&&invoices.All(i=>!Null(i["netCents"]))?new JValue((long)invoices.Sum(i=>i["netCents"]!.Value<decimal>())):JValue.CreateNull()},{"resultCents",JValue.CreateNull()},{"resultReason","Nettoerlöse, Pfand und bewerteter Verbrauch sind nicht vollständig getrennt nachgewiesen."}};
  }
  static void ReceivingCloseFields(JObject e,JObject? prior) {
   foreach(var m in Arr(e["movements"]).OfType<JObject>())if(m["orderId"]!=null||m["orderLineId"]!=null||m["substitutionConfirmed"]!=null) {
    var order=Arr(e["orders"]).FirstOrDefault(o=>(string?)o["id"]==Str(m["orderId"],500));Require(order!=null,"Receiving order missing.");
    var line=Arr(order!["lines"]).FirstOrDefault(l=>(string?)l["id"]==Str(m["orderLineId"],500));Require(line!=null,"Receiving line missing.");
    var article=Index(e["articles"])[(string)m["articleId"]!];Same(line!["unit"],article["unit"],"Substitute unit mismatch.");
    bool substitute=(string?)line["articleId"]!=(string?)m["articleId"];Require((bool?)m["substitutionConfirmed"]==substitute,"Substitution must be explicit.");if(substitute)Str(m["note"],1000);Require((string?)m["type"]=="Lieferung","Receiving must be a delivery.");
    if(prior!=null&&!Index(prior["movements"]).ContainsKey((string)m["id"]!))Require(Index(prior["orders"]).ContainsKey((string)m["orderId"]!),"Receiving needs an existing snapshot.");
   }
   var history=History(e,"closureHistory");Prefix(History(prior,"closureHistory"),history,prior==null?10000:1);
   foreach(var v in history){var h=Obj(v);Fields(h,"operationId revision action reason snapshot actorId confirmedAt");Audit(h);Str(h["reason"],1000);Require(new[]{"close","reopen"}.Contains((string?)h["action"]),"Invalid closure action.");if((string?)h["action"]=="close")Obj(h["snapshot"]);else Require(h["snapshot"]==null,"Reopen has no snapshot.");}
   if(history.Count>0)Require((string?)e["event"]!["status"]==((string?)history.Last!["action"]=="close"?"Abgeschlossen":"Offen"),"Closure state mismatch.");
  }
  static void ClosureScope(JObject prior,JObject updated,Workspace row) {
   var before=History(prior,"closureHistory");var after=History(updated,"closureHistory");bool changed=!JToken.DeepEquals(prior["event"]!["status"],updated["event"]!["status"]);bool appended=after.Count==before.Count+1;
   Require(changed==appended,"Status requires exactly one closure transition.");
   if(appended) {
    Require(row.CanClose,"Owner closure permission required.");var h=Obj(after.Last);bool wasClosed=(string?)prior["event"]!["status"]=="Abgeschlossen";
    Require((string?)h["action"]==(wasClosed?"reopen":"close"),"Invalid closure transition.");Str(h["reason"],1000);
    if(!wasClosed){var snapshot=Obj(h["snapshot"]);var scope=Str(snapshot["scope"],100);Same(snapshot,CloseChecklist(prior,scope,row.Revision),"Closure snapshot does not match previous state.");}
    var a=Slice(prior);var b=Slice(updated);a.Remove("closureHistory");b.Remove("closureHistory");Obj(a["event"]).Remove("status");Obj(b["event"]).Remove("status");Same(a,b,"Close/reopen must be a separate operation.");
   } else if((string?)prior["event"]!["status"]=="Abgeschlossen")Same(Slice(prior),Slice(updated),"Closed event must be reopened before changes.");
  }
 }
}
