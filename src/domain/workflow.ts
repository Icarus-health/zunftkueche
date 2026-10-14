import type { KitchenState } from './state.ts';

export function stockSummary(state:KitchenState,articleId:string){
  const movements=state.movements.filter(m=>m.articleId===articleId);
  const opening=movements.filter(m=>m.type==='Anfangsbestand').at(-1)?.quantity??null;
  const counted=movements.filter(m=>m.type==='Zählung').at(-1)?.quantity??null;
  const sum=(types:string[])=>movements.filter(m=>types.includes(m.type)).reduce((n,m)=>n+m.quantity,0);
  const received=sum(['Lieferung','Zugang']),waste=sum(['Abfall']),returned=sum(['Rückgabe']),consumed=sum(['Verbrauch']);
  return {opening,received,waste,returned,consumed,counted,balance:opening===null?null:opening+received-waste-returned-consumed};
}
export interface PurchasingRow {articleId:string;required:number|null;opening:number|null;packSize:number|null;suggested:number|null;planned:number|null;missing:string[]}
/** Individual days deliberately have zero stock credit. Gesamt credits the explicit
 * opening once for Friday + Saturday; only this view can be applied to purchases. */
export function purchasingNeeds(state:KitchenState,day:string):{rows:PurchasingRow[];complete:boolean;missing:string[];stockCredit:string}{
  if(!['Freitag','Samstag','Gesamt'].includes(day))throw new Error('Bedarfstag ist ungültig.');
  const days=day==='Gesamt'?['Freitag','Samstag']:[day], demand=new Map<string,{required:number;missing:string[]}>(),missing:string[]=[];
  const dishes=(state.dishPlan??[]).filter(p=>days.includes(p.day));
  if(!dishes.length)missing.push('Speisenmengen fehlen.');
  for(const dish of dishes){
    const menu=state.menu.find(m=>m.id===dish.menuId);
    if(!menu||dish.quantity===null||menu.recipeStatus!=='Bestätigt'||!menu.recipe.length){missing.push(`${menu?.name??dish.menuId}: Menge oder bestätigte Rezeptur fehlt.`);}
    if(dish.quantity===0)continue;
    for(const line of menu?.recipe??[]){
      const row=demand.get(line.articleId)??{required:0,missing:[]};
      if(dish.quantity===null||menu?.recipeStatus!=='Bestätigt'||line.quantity===null||line.quantity<=0)row.missing.push('Bestätigte Rezeptur oder Speisenmenge fehlt.');
      else row.required+=dish.quantity*line.quantity;
      demand.set(line.articleId,row);
    }
  }
  const rows=[...demand].map(([articleId,d]):PurchasingRow=>{
    const article=state.articles.find(a=>a.id===articleId),issues=[...d.missing];
    const opening=day==='Gesamt'?stockSummary(state,articleId).opening:0,packSize=article?.packSize??null;
    if(!article)issues.push('Artikel fehlt.');
    if(opening===null)issues.push('Anfangsbestand fehlt.');
    if(packSize===null)issues.push('Gebindegröße fehlt.');
    const coverage=state.planLines.filter(l=>l.articleId===articleId&&!l.purchaseGenerated&&days.concat('Allgemein').includes(l.day)&&(!l.location||l.location==='Küche'));
    if(coverage.some(l=>l.quantity===null))issues.push('Manuelle Einkaufsmenge ist offen.');
    if(coverage.some(l=>l.unit!==article?.unit||l.supplierId!==article?.supplierId))issues.push('Manuelle Einkaufsposition passt nicht zu Einheit/Lieferant.');
    const planned=coverage.some(l=>l.quantity===null)?null:coverage.reduce((n,l)=>n+l.quantity!,0);
    const required=d.missing.length?null:d.required;
    const suggested=issues.length||required===null||planned===null?null:Math.ceil(Math.max(0,required-opening!-planned)/packSize!-1e-10)*packSize!;
    if(suggested!==null&&(!Number.isFinite(suggested)||suggested>10000000))issues.push('Abgeleitete Einkaufsmenge liegt außerhalb des zulässigen Bereichs.');
    return {articleId,required,opening,packSize,planned,missing:issues,suggested:issues.length?null:suggested};
  });
  return {rows,missing,complete:!missing.length&&rows.every(r=>!r.missing.length),stockCredit:day==='Gesamt'?'Anfangsbestand einmal für Freitag und Samstag':'Keine Bestandsanrechnung im einzelnen Tag; gemeinsam unter Gesamt.'};
}
