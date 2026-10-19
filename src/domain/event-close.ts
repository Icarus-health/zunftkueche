import type {KitchenState} from './state.ts';
import {effectiveSales} from './corrections.ts';
import {sameLocation,purchasingLocation,historicalLocations} from './locations.ts';
import {stockSummary} from './workflow.ts';
import {buildReceivingList} from './receiving.ts';
export function buildClosureChecklist(state:KitchenState,scope:string) {
 if(scope!=='Alle'&&!historicalLocations(state).includes(scope))throw new Error('Abschlussumfang ist ungültig.');
 const open:string[]=[];
 const sales=effectiveSales(state).filter(s=>['Freitag','Samstag'].includes(s.day));
 const salesComplete=state.menu.length>0&&state.menu.every(m=>['Freitag','Samstag'].every(day=>sales.some(s=>s.menuId===m.id&&s.day===day&&s.quantity!==null&&s.priceCents!==null)));
 if(!salesComplete)open.push('Verkäufe oder bestätigte Verkaufspreise fehlen.');
 const invoices=state.invoices.filter(i=>scope==='Alle'||sameLocation(state,i.scope,scope));
 if(!invoices.length||invoices.some(i=>i.grossCents===null))open.push('Bruttobelege fehlen oder sind offen.');
 if(invoices.some(i=>i.netCents===null))open.push('Nettobeträge sind offen; Brutto ist kein Netto-Wareneinsatz.');
 if(state.invoices.some(i=>!i.scope||i.scope==='Offen'))open.push('Belegzuordnungen sind offen.');
 const movements=state.movements.filter(m=>scope==='Alle'||sameLocation(state,m.location,scope));
 if(!movements.length||movements.some(m=>{const s=stockSummary(state,m.articleId,m.location);return s.opening===null||s.counted===null;}))open.push('Anfangsbestände oder Schlusszählungen fehlen.');
 if(state.orders.some(o=>buildReceivingList(state,o.id).some((r:{remaining:number|null})=>r.remaining===null||r.remaining>0)))open.push('Bestellfassungen enthalten offene Liefermengen (einschließlich älterer Fassungen).');
 const comparable=scope!=='Alle'&&scope===purchasingLocation(state);
 if(!comparable)open.push('Kostenumfang und Küchenverkaufsumfang sind nicht vergleichbar.');
 return {scope,revision:state.revision,open,complete:open.length===0,revenueCents:salesComplete&&comparable?sales.reduce((n,s)=>n+s.quantity!*s.priceCents!,0):null,grossReceiptsCents:invoices.length&&invoices.every(i=>i.grossCents!==null)?invoices.reduce((n,i)=>n+i.grossCents!,0):null,netReceiptsCents:invoices.length&&invoices.every(i=>i.netCents!==null)?invoices.reduce((n,i)=>n+i.netCents!,0):null,resultCents:null,resultReason:'Nettoerlöse, Pfand und bewerteter Verbrauch sind nicht vollständig getrennt nachgewiesen.'};
}
