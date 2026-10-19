using Newtonsoft.Json.Linq;
using Zunftkueche;
static class LocationTests {
 public static void Run(Action<string,Action> check,JObject seed) {
  JObject Configured(){var s=(JObject)seed.DeepClone();s["event"]!["locations"]=new JArray(new JObject{{"name","Halle Küche"},{"historicalNames",new JArray()}});return s;}
  void Reject(Action action){try{action();}catch(ArgumentException){return;}throw new Exception("inactive location accepted");}
  check("configured locations reject inactive new movements and receipts without rewriting history",()=>{
   foreach(var kind in new[]{"movement","receipt","plan"}) {var prior=Configured();var next=(JObject)prior.DeepClone();
    if(kind=="movement")((JArray)next["movements"]!).Add(new JObject{{"id","new-movement"},{"articleId",(string)next["articles"]![0]!["id"]!},{"day","Freitag"},{"type","Lieferung"},{"quantity",1},{"location","Küche"}});
    if(kind=="receipt"){var r=(JObject)next["invoices"]![0]!.DeepClone();r["id"]="new-receipt";r["number"]="new-number";r["scope"]="Küche";r.Remove("source");((JArray)next["invoices"]!).Add(r);}
    if(kind=="plan"){var p=(JObject)next["planLines"]![0]!.DeepClone();p["id"]="new-plan";p["location"]="Küche";p.Remove("source");((JArray)next["planLines"]!).Add(p);}
    Reject(()=>StatePolicy.Validate(next,prior));StatePolicy.Validate(prior,prior);
   }
  });
  check("empty configured locations preserve old records but deny new entries",()=>{var prior=Configured();prior["event"]!["locations"]=new JArray();StatePolicy.Validate(prior,prior);var next=(JObject)prior.DeepClone();((JArray)next["movements"]!).Add(new JObject{{"id","new"},{"articleId",(string)next["articles"]![0]!["id"]!},{"day","Freitag"},{"type","Lieferung"},{"quantity",0},{"location","Küche"}});Reject(()=>StatePolicy.Validate(next,prior));});
  check("explicit purchasing location must be active and owner authorized",()=>{var prior=Configured();var next=(JObject)prior.DeepClone();next["event"]!["purchasingLocation"]="Halle Küche";StatePolicy.Validate(next,prior);Reject(()=>StatePolicy.ValidateScope(next,new Workspace{State=prior,CanWrite=true},(string)prior["event"]!["id"]!,"article.price"));next["event"]!["purchasingLocation"]="Retired";Reject(()=>StatePolicy.Validate(next,prior));});
 }
}
