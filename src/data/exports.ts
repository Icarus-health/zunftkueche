import type {KitchenState} from '../domain/state.ts';
import {buildClosureChecklist} from '../domain/event-close.ts';
import {movementQuantity,effectiveSales} from '../domain/corrections.ts';
import {sameLocation,purchasingLocation} from '../domain/locations.ts';
export function buildEventExport(state:KitchenState,scope:string,createdAt=new Date().toISOString()) {
 const checklist=buildClosureChecklist(state,scope);
 const invoices=state.invoices.filter(i=>scope==='Alle'||sameLocation(state,i.scope,scope));
 const movements=state.movements.filter(m=>scope==='Alle'||sameLocation(state,m.location,scope));
 const sales=scope==='Alle'||scope===purchasingLocation(state)?effectiveSales(state):[];
 const sources=[...new Map(invoices.filter(i=>i.source).map(i=>[i.source!.hash,i.source!])).values()];
 const rows:Array<Array<string|number|null>>=[['Art','ID','Bezeichnung','Tag / Zuordnung','Menge','Brutto Cent','Netto Cent','Quelle / ursprünglicher Wert']];
 invoices.forEach(i=>rows.push(['Beleg',i.id,i.number,i.scope,null,i.grossCents,i.netCents,i.source?`${i.source.file} #${i.source.hash}`:i.documentUrl??'Original offen']));
 movements.forEach(m=>rows.push(['Bestand',m.id,state.articles.find(a=>a.id===m.articleId)?.name??m.articleId,`${m.day} / ${m.location}`,movementQuantity(state,m),null,null,`Ursprünglich ${m.quantity}; ${m.orderId??'ohne Bestellbezug'}`]));
 sales.forEach(s=>rows.push(['Verkauf',s.id,state.menu.find(m=>m.id===s.menuId)?.name??s.menuId,s.day,s.quantity,s.priceCents===null||s.quantity===null?null:s.priceCents*s.quantity,null,`Stückpreis ${s.priceCents??'Offen'} Cent; ${s.quantity===null?'Menge offen':'bestätigte Menge'}`]));
 return {kind:'event-report' as const,event:{...state.event},scope,revision:state.revision,createdAt,sources,checklist,rows,notice:'Auswertung – keine Vollsicherung. Offene Werte sind keine Nullwerte.'};
}
export type EventExport=ReturnType<typeof buildEventExport>;
const cell=(v:unknown)=>{let s=v===null||v===undefined?'Offen':String(v);if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
export function toCsv(r:EventExport){return '\uFEFF'+[['Veranstaltung',r.event.name,r.event.year],['Umfang',r.scope],['Revision',r.revision],['Erstellt',r.createdAt],[r.notice],...r.rows].map(row=>row.map(cell).join(';')).join('\r\n');}
const escape=(v:unknown)=>String(v??'Offen').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function toPrintHtml(r:EventExport){return `<!doctype html><html lang="de"><meta charset="utf-8"><title>Auswertung ${escape(r.event.name)}</title><style>body{font:12px system-ui;margin:25px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:6px;text-align:left;overflow-wrap:anywhere}thead{display:table-header-group}@media print{@page{size:A4 landscape;margin:12mm}}</style><h1>${escape(r.event.name)} ${r.event.year}</h1><p>Umfang ${escape(r.scope)} · Revision ${r.revision} · Erstellt ${escape(r.createdAt)}</p><p>${r.notice}</p><ul>${r.checklist.open.map(s=>`<li>${escape(s)}</li>`).join('')}</ul><p>${escape(r.checklist.resultReason)}</p><table><thead><tr>${r.rows[0].map(c=>`<th>${escape(c)}</th>`).join('')}</tr></thead><tbody>${r.rows.slice(1).map(row=>`<tr>${row.map(c=>`<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></html>`;}
export function downloadReport(content:string,name:string,type:string){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
/** Historical header and amounts come solely from the saved order, never current masters. */
export function orderCsv(order:any,exportRevision:number,createdAt=new Date().toISOString()) {
 const status=order.status==='bestellt'?'manuell als bestellt vermerkt':order.status==='bestaetigt'?'manuell als bestätigt vermerkt':'offen';
 const rows=[['Bestellfassung',order.id??'Nicht gespeichert'],['Veranstaltung',order.context?.eventName??'Historischer Kontext offen',order.context?.eventYear??'Offen'],['Lieferant',order.context?.supplierName??'Historischer Name offen'],['Umfang',order.day],['Ausgabe-Datenrevision',exportRevision],['Bestellrevision','historisch nicht erfasst'],['Fassung erstellt',order.createdAt??'Offen'],['Ausgabe erstellt',createdAt],['Versandstatus',status],['Lieferdatum',order.context?.deliveryDate??'Offen'],['Lieferadresse',order.context?.deliveryAddress??'Offen'],['Kontakt',order.context?.contact??'Offen'],['Auswertung – keine Vollsicherung'],['Positions-ID','Artikel','Menge','Einheit','Zeit','Netto Stückpreis Cent','Quelle'],...order.lines.map((l:any)=>[l.id,l.name,l.quantity,l.unit,l.time,l.unitPriceCents,l.source?`${l.source.file} #${l.source.hash}`:'Offen'])];
 return '\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n');
}
