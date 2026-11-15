import type { InventorySession, Order } from './model';
import type { DeliverySlip } from './ww/model';
import { button,field,h,n,note,segmented,select } from './markup.ts';
import {deliveryRemaining} from './supplier-orders.ts';
import {dayLabel} from './ww/common.ts';
import { countQuantity,receivedQuantity } from './operations.ts';
import { searchField } from './workspace.ts';
function localTime():string{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function slipInput(): string {
 return '<label>Lieferscheindatei<input type="file" name="deliverySlipFile" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"></label>';
}
export function deliverySlipsView(order: Order, slips: DeliverySlip[], writable: boolean): string {
 if (!writable && !slips.length) return '';
 const label = (date: string | null | undefined): string => date ? dayLabel(date) : 'Termin offen';
 const lines = slips.map(slip => {
  const date = slip.deliveryId ? order.deliveries?.find(slot => slot.id === slip.deliveryId)?.date : order.deliveryDate;
  return '<div class="listrow"><div><strong>' + h(slip.name) + '</strong><small>' + h(label(date)) + '</small></div>'
   + button('slip-download', 'Herunterladen', slip.id) + '</div>';
 }).join('');
 const form = writable ? '<form data-form="delivery-slip"><div class="formgrid">'
  + (order.deliveries?.length ? select('slipDelivery', 'Liefertermin', [['', 'Termin wählen'], ...order.deliveries.map((slot): [string, string] =>
   [slot.id, label(slot.date) + (slot.place ? ' · ' + slot.place : '') + (slot.time ? ' · ' + slot.time : '')])], '', 'required') : '')
  + slipInput() + '</div><p class="muted">PDF, JPEG oder PNG · bis 8 MB</p><button type="submit">Lieferschein ablegen</button></form>' : '';
 return '<details class="receipt-history"' + (slips.length ? ' open' : '') + '><summary>Lieferscheine'
  + (slips.length ? ' (' + slips.length + ')' : '') + '</summary>' + lines
  + (form && slips.length ? '<details class="calm-disclosure"><summary>Weiteren Lieferschein ablegen</summary>' + form + '</details>' : form)
  + '</details>';
}
export function receiptForm(order:Order,deliveryId?:string,slipsReady=false):string{
 const selected=order.deliveries?.find(d=>d.id===deliveryId)||order.deliveries?.[0];
 return `<form data-form="receipt" class="panel calm-workflow receipt-form"><div class="calm-heading"><div>${button('cancel','Zurück')}<h1>Warenannahme</h1></div></div><p class="calm-subtitle">${h(order.supplierName)}</p><div class="calm-toolbar">${selected?select('receiptDelivery','Liefertermin',order.deliveries!.map(d=>[d.id,(d.date?dayLabel(d.date):'Datum offen')+' · '+d.place]),selected.id):''}${button('receipt-all','Bestellmengen eintragen')}</div><p class="calm-hint receipt-hint">„Bestellmengen eintragen“ trägt offene Mengen ein. Erst bestätigen speichert. Teilmengen bleiben offen.</p><div class="receipt-head"><span>Artikel</span><span>Noch erwartet</span><span>Jetzt geliefert</span></div>${order.lines.filter(l=>!selected||l.schedule?.[selected.id]!==0).map(l=>{const ordered=selected?(l.schedule?.[selected.id]??null):l.quantity,remaining=selected?deliveryRemaining(order,l.id,selected.id):Math.max(0,(l.quantity||0)-receivedQuantity(order,l.id)),received=(ordered||0)-remaining;return `<div class="receipt-line"><div><strong>${h(l.articleName)}</strong><small>${h(l.packName)} · ${n(l.packSize)} ${h(l.unit)}</small>${received>0?'<small>Bisher da: '+n(received)+' '+h(l.packName)+'</small>':''}</div><span class="receipt-expected"><span class="receipt-expected-label">Noch erwartet</span>${ordered===null?'Menge offen':n(remaining)+' '+h(l.packName)}</span>${ordered===null||ordered===undefined?'<strong>Menge offen – Bestellung prüfen</strong>':remaining>0?field('received_'+l.id,'Jetzt geliefert','',false,'text','inputmode="decimal" aria-label="'+h('Jetzt geliefert · '+l.articleName+' · '+l.packName+' · Rest '+n(remaining))+'"'):'<strong>Erledigt</strong>'}</div>`;}).join('')}<details class="calm-disclosure"><summary>Abweichung oder Zeitpunkt ergänzen</summary><div class="formgrid">${field('receivedAt','Tatsächlicher Zeitpunkt',localTime(),true,'datetime-local')}${select('deviation','Abweichung',[['','Keine / noch offen'],['Fehlmenge','Fehlmenge'],['Falschlieferung','Falschlieferung'],['Beschädigung','Beschädigung']],'')+note('note','Lieferschein / Hinweis','')}</div>${button('receipt-missing','Keine Lieferung erhalten vermerken')}</details>${slipsReady
  ? '<details class="calm-disclosure"><summary>Lieferschein hinzufügen (optional)</summary>' + slipInput() + '<p>PDF, JPEG oder PNG · bis 8 MB</p></details>' : ''}<div class="calm-actions"><button type="submit" class="primary">Wareneingang bestätigen</button></div></form>`;
}
function countField(name:string,unit:string,value:string,mode:string,label:string):string{
 return `<label class="count-field"><input name="${h(name)}" type="text" value="${h(value)}" inputmode="${mode}" placeholder="–" aria-label="${h(label)}" /><span aria-hidden="true">${h(unit)}</span></label>`;
}
export function assessmentLabel(assessment:string):string{return assessment==='reorder'?'Nachbestellen':assessment==='surplus'?'Überhang':'';}
export function countProgress(counted:number,visible:number,total:number):string{
 const filtered=visible<total;
 return '<strong>'+counted+' von '+visible+(filtered?' angezeigten':'')+' Artikeln gezählt</strong>'+(filtered?'<span><i> · </i>Gesamt: '+total+' Artikel</span>':'');
}
export function countShare(counted:number,visible:number):number{return visible>0?Math.round(counted/visible*100):0;}
export function inventoryForm(session:InventorySession,relevantIds:string[]=[],places:Record<string,string>={},categories:Record<string,string>={}):string{
 type Line=InventorySession['lines'][number];
 const quantity=(l:Line):number|null=>countQuantity(l.packs,l.loose,l.packSize);
 const counted=session.lines.filter(l=>quantity(l)!==null).length;
 const groupOf=(l:Line):string=>(categories[l.articleId]||'').trim();
 const groups=[...new Set(session.lines.map(groupOf))].sort((a,b)=>a===b?0:a===''?1:b===''?-1:a.localeCompare(b,'de'));
 const titled=groups.some(Boolean);
 const line=(l:Line):string=>{
  const q=quantity(l),single=l.packSize===1,place=places[l.articleId]||'',badge=assessmentLabel(l.assessment);
  return `<div class="count-line${single?' count-single':''}" data-relevant="${relevantIds.includes(l.articleId)||q!==null}" data-search="${h([l.articleName,place].filter(Boolean).join(' '))}">`
   +`<details class="count-extra" data-section-key="count:${h(l.articleId)}" ${(l.note||l.assessment!=='ok')?'open':''}><summary><span class="count-name"><strong>${h(l.articleName)}</strong><small>${place?h(place)+' · ':''}${single?'Menge in '+h(l.unit):h(l.packName)+' · '+n(l.packSize)+' '+h(l.unit)}<span class="count-total" data-count-total="${h(l.articleId)}" data-state="${q===null?'open':'counted'}">${q===null?'Noch nicht gezählt':n(q)+' '+h(l.unit)}</span><span class="count-badge" data-count-badge${badge?'':' hidden'}>${badge}</span></small></span><span class="sr-only">Einschätzung und Hinweis</span></summary>`
   +`<div class="count-extra-body">${select('assessment_'+l.articleId,'Einschätzung',[['ok','Passt'],['reorder','Nachbestellen'],['surplus','Überhang']],l.assessment)}${field('countnote_'+l.articleId,'Kurzer Hinweis · '+l.articleName,l.note)}</div></details>`
   +`<div class="count-fields">${single?'<input type="hidden" name="packs_'+h(l.articleId)+'" value="" />':countField('packs_'+l.articleId,l.packName,n(l.packs),'numeric',l.articleName+' · volle '+l.packName)}${countField('loose_'+l.articleId,l.unit,n(single?q:l.loose),'decimal',l.articleName+' · '+(single?l.unit:l.unit+' einzeln'))}</div></div>`;
 };
 const list=groups.map(group=>{const lines=session.lines.filter(l=>groupOf(l)===group);
  return `<section class="count-group" data-count-group>${titled?'<h2>'+h(group||'Ohne Kategorie')+' <span data-group-count>'+lines.length+'</span></h2>':''}${lines.map(line).join('')}</section>`;}).join('');
 return `<form data-form="inventory" class="panel inventory-form calm-workflow"><div class="calm-heading"><div>${button('cancel','Schließen')}<h1>Abendabschluss</h1></div></div><div class="inventory-entry"><div class="count-status"><p class="count-progress" data-count-progress>${countProgress(counted,session.lines.length,session.lines.length)}</p><div class="count-bar" aria-hidden="true"><i data-count-bar style="width:${countShare(counted,session.lines.length)}%"></i></div><p class="calm-hint">Leeres Feld = noch nicht gezählt. 0 = nichts vorhanden.</p></div><div class="calm-toolbar">${relevantIds.length?segmented('inventoryFilter','Artikel anzeigen',[['planned','In dieser Saison bestellt'],['all','Alle Artikel der Saison']],'planned'):''}${searchField('','Artikel suchen')}</div>${list}<div class="calm-actions"><button type="submit">Entwurf speichern</button>${button('inventory-finish','Weiter zur Prüfung','',true)}</div></div><div data-inventory-review></div></form>`;
}
