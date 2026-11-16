import {priceReview} from './order-prices.ts';
import type {Order,OrderLine,Workspace,Method,Delivery} from './model';
import {articleAvailable} from './model.ts';
import {scheduledOrder,withSchedule} from './supplier-orders.ts';
import {fieldNumber} from './field-errors.ts';
import {effectiveOffer} from './ww/domain.ts';
import {documents} from './ww/model.ts';
import {button,field,select,note,check,segmented,h,n,money} from './markup.ts';
import {dayLabel} from './ww/common.ts';
import {orderTotal} from './domain.ts';
import {icon} from './icons.ts';

export function deliveryTitle(d:Delivery,index:number):string{return d.date?dayLabel(d.date):'Termin '+(index+1)+(d.time?' · '+d.time:'')+' (Datum offen)';}
const weekdayShort:Record<string,string>={montag:'Mo',dienstag:'Di',mittwoch:'Mi',donnerstag:'Do',freitag:'Fr',samstag:'Sa',sonnabend:'Sa',sonntag:'So'};
/** Kurze Beschriftung je Liefertermin für Umschalter und Spaltenkopf, zum Beispiel „Mi“, „Fr 17 Uhr“ oder „Fr 12.2.“. */
export function deliveryShortLabels(dates:Delivery[]):string[]{
 const labels=dates.map((d,index)=>{
  const time=/(\d{1,2})[:.](\d{2})/.exec(d.time||''),clock=time?' '+Number(time[1])+(time[2]==='00'?'':':'+time[2])+' Uhr':'';
  if(d.date){const day=new Date(d.date+'T12:00:00');return ['So','Mo','Di','Mi','Do','Fr','Sa'][day.getDay()]+' '+day.getDate()+'.'+(day.getMonth()+1)+'.'+clock;}
  const word=/^\s*(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend|sonntag)/i.exec(d.time||'');
  return word?weekdayShort[word[1].toLowerCase()]+clock:'Termin '+(index+1);
 });
 return labels.map((label,index)=>labels.indexOf(label)!==labels.lastIndexOf(label)?(index+1)+' · '+label:label);
}
/** Bis fünf Liefertage als Umschalter. Darüber würden die Segmente am Telefon zu schmal, dann eine Auswahlliste. */
export function dayChoice(dates:Delivery[]):string{
 const short=deliveryShortLabels(dates);
 return dates.length>5?select('deliveryView','Liefertag',[['all','Alle Liefertage'],...dates.map((d,i)=>[d.id,short[i]+' · '+deliveryTitle(d,i)] as [string,string])],'all').replace('<label>','<label class="day-choice">')
  :segmented('deliveryView','Liefertag',[['all','Alle','Alle Liefertage'],...dates.map((d,i)=>[d.id,short[i],short[i]+' · '+deliveryTitle(d,i)] as [string,string,string])],'all');
}
/** Catalogue rows are temporary UI rows, never saved until a quantity is selected. */
export function sheetRows(source:Order,state:Workspace):OrderLine[]{
 const order=withSchedule(source),existing=new Set(order.lines.map(l=>l.offerId));
 const extra=state.offers.filter(({value:o})=>o.active&&o.supplierId===order.supplierId&&!existing.has(o.id)&&state.articles.some(a=>a.value.id===o.articleId&&articleAvailable(a.value,order.seasonId))).map(({value:o})=>{
  const a=state.articles.find(x=>x.value.id===o.articleId)!.value;
  const price=effectiveOffer(o,documents(state.ww,'prices'),order.deliveryDate||order.deliveries?.find(d=>d.date)?.date||new Date().toISOString().slice(0,10));
  return {id:'sheet-'+o.id,articleId:a.id,offerId:o.id,articleName:a.name,code:o.code,unit:a.unit,packName:o.packName,packSize:o.packSize,quantity:null,priceNet:price.priceNet,priorPriceNet:null,priceYear:null,reviewed:false,schedule:Object.fromEntries(order.deliveries!.map(d=>[d.id,null]))} as OrderLine;
 });
 return [...order.lines,...extra.sort((a,b)=>a.articleName.localeCompare(b.articleName,'de'))];
}
export function readSheetOrder(form:HTMLFormElement,source:Order,state:Workspace,show=true):Order{
 const data=new FormData(form),old=withSchedule(source);
 const text=(name:string,fallback:string):string=>data.has(name)?String(data.get(name)||'').trim():fallback;
 const supplierId=text('supplierId',old.supplierId),supplier=state.suppliers.find(s=>s.value.id===supplierId)?.value;
 const deliveries=old.deliveries!.map(d=>({...d,date:text('date_'+d.id,d.date||'')||null,time:text('time_'+d.id,d.time),place:text('place_'+d.id,d.place)}));
 const base={...old,deliveries,deliveryDate:deliveries.map(d=>d.date).filter((d):d is string=>!!d).sort()[0]||null,supplierId,supplierName:supplier?.name||old.supplierName};
 const lines=sheetRows(base,state).flatMap(l=>{
  const existing=old.lines.some(x=>x.id===l.id);
  const values=old.deliveries!.map(d=>{const name='schedule_'+l.id+'_'+d.id;return form.elements.namedItem(name)?fieldNumber(form,name,{show}):l.schedule?.[d.id]??null;});
  // A new catalogue selection only orders entered quantities. Previously unknown fields keep their meaning.
  if(!existing&&!values.some(v=>v!==null&&v>0))return [];
  const schedule=Object.fromEntries(old.deliveries!.map((d,i)=>[d.id,existing?values[i]:values[i]??0]));
  const priceName='price_'+l.id,reviewName='review_'+l.id,changed=existing&&old.deliveries!.some(d=>(l.schedule?.[d.id]??null)!==schedule[d.id]);
  return [{...l,schedule,priceNet:form.elements.namedItem(priceName)?fieldNumber(form,priceName,{show}):l.priceNet,reviewed:form.elements.namedItem('reviewAll')?data.has('reviewAll'):changed?false:form.elements.namedItem(reviewName)?data.has(reviewName):l.reviewed}];
 });
 return scheduledOrder({...base,occasion:text('occasion',old.occasion),method:text('method',old.method) as Method,note:text('note',old.note),supplierNote:text('supplierNote',old.supplierNote||''),deliveries,lines});
}
function settings(order:Order,state:Workspace):string{
 const offers=state.offers.filter(o=>o.value.active&&o.value.supplierId===order.supplierId);
 return `<details class="sheet-options"><summary><span class="sr-only">Optionen</span>${icon('more')}</summary><div class="sheet-options-body"><h2>Bestelldaten</h2>${field('occasion','Bestellrunde',order.occasion)}${select('method','Bestellweg',['Telefon','E-Mail','Onlineshop','Abholung'].map(x=>[x,x]),order.method)}${note('supplierNote','Mitteilung auf der PDF',order.supplierNote||'')}${note('note','Interner Hinweis',order.note)}<h2>Liefertermine</h2>${order.deliveries!.map((d,i)=>'<div class="sheet-date">'+field('date_'+d.id,'Lieferdatum · Termin '+(i+1),d.date||'',false,'date')+field('time_'+d.id,'Zeitfenster',d.time)+field('place_'+d.id,'Lieferort',d.place)+button('delivery-remove','Tag entfernen',d.id)+'</div>').join('')}${button('delivery-add','Liefertag hinzufügen')}<h2>Artikel und Gebinde</h2>${select('addOffer','Liefergebinde auswählen',[['','Bitte wählen'],...offers.map(o=>[o.value.id,(state.articles.find(a=>a.value.id===o.value.articleId)?.value.name||'Artikel')+' · '+o.value.packName] as [string,string])],'')}${button('line-add','Position hinzufügen')}${button('order-ingredient','Neuen Artikel mit Liefergebinde anlegen')}${order.lines.map(l=>'<div class="sheet-manage-line"><span>'+h(l.articleName)+'</span>'+button('line-remove','Entfernen',l.id)+'</div>').join('')}<h2>Entwurf</h2><button type="submit">Entwurf speichern</button></div></details>`;
}
export function orderSheet(source:Order,state:Workspace):string{
 const order=withSchedule(source),rows=sheetRows(order,state);
 const supplier=order.supplierId?'':select('supplierId','Lieferant',[['','Lieferant auswählen'],...state.suppliers.filter(s=>s.value.active).map(s=>[s.value.id,s.value.name] as [string,string])],'','required');
 const dates=order.deliveries!,short=deliveryShortLabels(dates);
 return `<form data-form="order" class="panel supplier-order calm-workflow order-sheet"><div class="calm-heading"><div>${button('cancel','Zurück')}<h1>${h(order.supplierName||'Lieferant auswählen')}</h1></div>${settings(order,state)}</div>${supplier}${order.supplierId?'<p class="sheet-meta"><span class="badge '+(order.status==='Entwurf'?'warning':'neutral')+'">'+h(order.status)+'</span><span>'+dates.length+' '+(dates.length===1?'Liefertag':'Liefertage')+'</span></p><div class="calm-toolbar"><label class="search-label"><span class="sr-only">Artikel im Ordersatz suchen</span><input type="search" name="sheetSearch" aria-label="Artikel im Ordersatz suchen" placeholder="Artikel suchen …" autocomplete="off"></label>'+(dates.length>1?dayChoice(dates):'')+'</div><div class="supplier-matrix-scroll"><table class="supplier-matrix calm-sheet"><thead><tr><th>Artikel</th>'+dates.map((d,i)=>'<th data-delivery-column="'+h(d.id)+'"><span class="delivery-head"><span>'+h(d.date?dayLabel(d.date):short[i])+'</span>'+(d.date?'':button('order-dates','Datum offen',d.id).replace('<button ','<button aria-label="'+h('Datum offen · '+deliveryTitle(d,i).replace(' (Datum offen)','')+' · Datum festlegen')+'" '))+'</span></th>').join('')+'</tr></thead><tbody>'+rows.map(l=>'<tr data-sheet-row data-search="'+h(l.articleName+' '+l.code)+'"><th scope="row">'+h(l.articleName)+'<small>'+h(l.packName)+(l.packSize!==1?' · '+n(l.packSize)+' '+h(l.unit):'')+'</small><input type="checkbox" name="review_'+h(l.id)+'" '+(l.reviewed?'checked':'')+' hidden aria-hidden="true" tabindex="-1"></th>'+dates.map((d,i)=>'<td data-delivery-column="'+h(d.id)+'"><input name="schedule_'+h(l.id)+'_'+h(d.id)+'" value="'+h(n(l.schedule?.[d.id]??null))+'" inputmode="decimal" aria-label="'+h(l.articleName+' · '+deliveryTitle(d,i)+' · '+l.packName)+'" placeholder="–"></td>').join('')+'</tr>').join('')+'</tbody></table></div><p data-sheet-empty hidden>Keine passenden Artikel.</p>':''}<div class="calm-actions"><span data-sheet-summary>${order.lines.length?order.lines.length+' Artikel':'Mengen eintragen'}</span>${order.supplierId&&!rows.length?'<p>Noch keine Liefergebinde hinterlegt.</p>'+button('order-ingredient','Artikel und Gebinde anlegen','',true):order.supplierId?button('order-review','Weiter zur Prüfung','',true):''}</div></form>`;
}
export function orderReview(source:Order,state:Workspace):string{
 const order=withSchedule(source),supplier=state.suppliers.find(s=>s.value.id===order.supplierId)?.value,total=orderTotal(order);
 return `<form data-form="order" class="panel supplier-order calm-workflow order-review"><div class="calm-heading"><div>${button('order-edit-sheet','Mengen bearbeiten')}<h1>Bestellung prüfen</h1></div></div><p class="calm-subtitle">${h(order.supplierName)} · ${h(order.occasion)}</p><div class="supplier-matrix-scroll"><table class="supplier-matrix calm-review"><thead><tr><th>Artikel</th><th>Liefermengen</th><th>Netto / Gebinde</th></tr></thead><tbody>${order.lines.map(l=>'<tr><th scope="row">'+h(l.articleName)+'<small>'+n(l.quantity)+' '+h(l.packName)+'</small></th><td>'+order.deliveries!.map((d,i)=>l.schedule?.[d.id]!==0?h(deliveryTitle(d,i))+': '+n(l.schedule?.[d.id]??null):'').filter(Boolean).join('<br>')+'</td><td>'+field('price_'+l.id,'Nettopreis · '+l.articleName,n(l.priceNet),false,'text','inputmode="decimal"')+(l.priceNet===null?'<small>Preis offen</small>':'')+'</td></tr>').join('')}</tbody></table></div><p data-order-total class="calm-total">${total===null?'Warenwert unvollständig · Preise oder Mengen offen':money(total)+' netto'}</p><details class="calm-disclosure"><summary>Kontakt und Preisstand prüfen</summary><p>${h(order.method)} · ${h(supplier?.phone||supplier?.email||'Kontakt noch offen')}</p><p>${h(supplier?.note||'')}</p><div data-price-review>${priceReview(order,state)}</div></details>${check('reviewAll','Mengen und Gebinde geprüft',order.lines.every(l=>l.reviewed))}<div class="calm-actions"><button type="submit">Entwurf speichern</button>${button('order-preview-pdf','PDF herunterladen')}${button('order-preview-mail','Bestellmail vorbereiten','',true)}</div><details class="calm-disclosure"><summary>Bestellung bereits aufgegeben?</summary><p>Nach der Abgabe beim Lieferanten dokumentieren.</p>${button('order-record','Als bestellt dokumentieren')}</details></form>`;
}
