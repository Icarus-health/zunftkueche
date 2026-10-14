import { prepareOrder } from './kitchen.ts';
import type {PlanLine,Source} from './kitchen.ts';
export interface Supplier {id:string;name:string;email:string|null}
export interface Article {id:string;name:string;supplierId:string;unit:string;category:string;unitPriceCents:number|null}
export interface Menu {id:string;name:string;priceCents:number|null;category:string;recipe:Array<{articleId:string;quantity:number|null}>;recipeStatus:string;source?:Source}
export interface Receipt {id:string;supplierId:string;number:string;grossCents:number|null;netCents:number|null;scope:string;status:string;documentUrl:string|null;source?:Source;lines:any[]}
export interface KitchenState {schemaVersion:number;event:{id:string;name:string;year:number;status:string;dates:Record<string,string|null>};suppliers:Supplier[];articles:Article[];planLines:(PlanLine&{location?:string})[];menu:Menu[];invoices:Receipt[];sales:Array<{id:string;menuId:string;day:string;quantity:number|null;priceCents:number|null}>;movements:Array<{id:string;articleId:string;day:string;type:string;quantity:number;location:string;note?:string}>;orders:any[];dishPlan:any[];lessons:any[];sourceNotice:string;revision:number;operationIds:string[]}
export interface Operation {id:string;baseRevision:number;type:string;payload:any}
export interface CommitResult {status:'saved'|'conflict';state:KitchenState}
function quantity(value:unknown,nullable=false):number|null {
  if(nullable&&value===null)return null;
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>10000000)throw new Error('Menge ist ungültig.');
  return value;
}
function validDay(day:unknown):string {
  if(typeof day!=='string'||!['Mittwoch','Freitag','Samstag','Sonntag','Allgemein'].includes(day))throw new Error('Tag ist ungültig.');
  return day;
}
export function applyOperation(state:KitchenState,op:Operation):CommitResult {
  if(!op.id||op.id.length>100||!Number.isInteger(op.baseRevision))throw new Error('Vorgang ist ungültig.');
  if((state.operationIds??[]).includes(op.id))return {status:'saved',state};
  if(op.baseRevision!==(state.revision??0))return {status:'conflict',state};
  const next=structuredClone(state), p=op.payload;
  switch(op.type){
    case 'plan.quantity': {
      const line=next.planLines.find(l=>l.id===p.id);
      if(!line)throw new Error('Planposition nicht gefunden.');
      line.quantity=quantity(p.quantity,true); break;
    }
    case 'plan.add': {
      const article=next.articles.find(a=>a.id===p.articleId&&a.supplierId===p.supplierId);
      if(!article)throw new Error('Artikel gehört nicht zu diesem Lieferanten.');
      const day=validDay(p.day),time=p.time||null;
      if(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('Lieferzeit ist ungültig.');
      next.planLines.push({id:op.id,articleId:article.id,supplierId:article.supplierId,name:article.name,quantity:quantity(p.quantity,true),unit:article.unit,day,time,unitPriceCents:article.unitPriceCents,note:String(p.note??'').slice(0,1000),category:article.category,location:'Küche'});break;
    }
    case 'menu.price':case 'article.price': {
      const value=p.priceCents;
      if(value!==null&&(typeof value!=='number'||!Number.isInteger(value)||value<0||value>100000000))throw new Error('Preis ist ungültig.');
      if(op.type==='menu.price'){
        const item=next.menu.find(m=>m.id===p.menuId);if(!item)throw new Error('Speise/Getränk nicht gefunden.');item.priceCents=value;
      }else{
        const item=next.articles.find(a=>a.id===p.articleId);if(!item)throw new Error('Artikel nicht gefunden.');item.unitPriceCents=value;
        for(const line of next.planLines)if(line.articleId===item.id)line.unitPriceCents=value;
      }
      break;
    }
    case 'order.prepare': {
      if(!next.suppliers.some(s=>s.id===p.supplierId))throw new Error('Lieferant nicht gefunden.');
      const day=validDay(p.day), snapshot=prepareOrder(next.planLines,p.supplierId,day);
      if(!snapshot.lines.length)throw new Error('Bestellung enthält keine Positionen.');
      if(snapshot.lines.some(l=>l.quantity===null))throw new Error('Bestellmengen sind noch offen.');
      next.orders.push({id:op.id,supplierId:p.supplierId,day,status:'Vorbereitet',createdAt:new Date().toISOString(),...snapshot}); break;
    }
    case 'delivery.record':case 'stock.count':case 'stock.waste': {
      if(!next.articles.some(a=>a.id===p.articleId))throw new Error('Artikel nicht gefunden.');
      const day=validDay(p.day),q=quantity(p.quantity)!;
      const type=op.type==='delivery.record'?'Lieferung':op.type==='stock.count'?'Zählung':'Abfall';
      next.movements.push({id:op.id,articleId:p.articleId,day,type,quantity:q,location:String(p.location??'Küche').slice(0,100),note:String(p.note??'').slice(0,1000)}); break;
    }
    case 'sales.quantity': {
      const item=next.menu.find(m=>m.id===p.menuId);
      if(!item)throw new Error('Speise/Getränk nicht gefunden.');
      const day=validDay(p.day), q=quantity(p.quantity,true);
      if(q!==null&&!Number.isInteger(q))throw new Error('Verkaufte Stückzahl muss ganzzahlig sein.');
      const existing=next.sales.find(s=>s.menuId===p.menuId&&s.day===day);
      if(existing)existing.quantity=q;
      else next.sales.push({id:op.id,menuId:p.menuId,day,quantity:q,priceCents:item.priceCents});
      break;
    }
    case 'recipe.save': {
      const item=next.menu.find(m=>m.id===p.menuId);
      if(!item)throw new Error('Speise/Getränk nicht gefunden.');
      if(!Array.isArray(p.lines)||p.lines.length>30)throw new Error('Rezeptur ist ungültig.');
      item.recipe=p.lines.map((l:any)=>{
        if(!next.articles.some(a=>a.id===l.articleId))throw new Error('Artikel nicht gefunden.');
        return {articleId:l.articleId,quantity:quantity(l.quantity,true)};
      });
      item.recipeStatus=p.confirmed&&item.recipe.length&&item.recipe.every(l=>l.quantity!==null)?'Bestätigt':'Entwurf';break;
    }
    case 'invoice.link': {
      const receipt=next.invoices.find(i=>i.id===p.id);
      if(!receipt)throw new Error('Beleg nicht gefunden.');
      const url=new URL(p.url);
      if(url.protocol!=='https:'||!url.hostname.endsWith('.sharepoint.com')||url.username||url.password)throw new Error('Bitte einen Link aus eurem SharePoint verwenden.');
      receipt.documentUrl=url.href;break;
    }
    default: throw new Error('Unbekannter Vorgang.');
  }
  next.revision=(state.revision??0)+1;
  next.operationIds=[...(state.operationIds??[]),op.id];
  return {status:'saved',state:next};
}
export function importCheck(state:KitchenState):{planLines:number;fridayWiggen:number;originalReceipts:number;originalTotalCents:number} {
  const originals=state.invoices.filter(i=>i.status==='Original vorhanden');
  return {planLines:state.planLines.length,fridayWiggen:state.planLines.filter(l=>l.supplierId==='s-wiggenhauser'&&l.day==='Freitag').length,originalReceipts:originals.length,originalTotalCents:originals.reduce((sum,i)=>sum+(i.grossCents??0),0)};
}
