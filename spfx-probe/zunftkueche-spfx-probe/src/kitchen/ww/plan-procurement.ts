/* eslint-disable @rushstack/no-new-null -- Uncounted inventory remains unknown. */
import {withSchedule,scheduledOrder,validateSchedule} from '../supplier-orders.ts';
import type { Order, Workspace } from '../model';
import type { Plan, Slot, AllocationLedger } from './model';
import { documents } from './model.ts';
import { recipeDemand, stockProjection, round, templateOrders } from './domain.ts';
import { receivedQuantity } from '../operations.ts';
import { select, field, h, n } from '../markup.ts';
import { heading, confirmationActions, dayLabel } from './common.ts';
export interface ProcurementRow {
    articleId: string;
    name: string;
    unit: string;
    required: number;
    stock: number | null;
    incoming: number;
    available?:number;
    issues: string[];
}
export interface Allocation {
    articleId: string;
    offerId: string;
    stockUse: number;
    incomingUse: number;
}
export function procurementRows(plan: Plan, s: Workspace): ProcurementRow[] { const sum = new Map<string, ProcurementRow>(), recipes = documents(s.ww, 'recipe'), stocks = stockProjection(s, (s.ww?.records || []).map(r => r.value), plan.scope, plan.area, ''); for (const l of plan.lines) {
    const recipe = recipes.find(r => r.id === l.recipeId);
    if (!recipe?.confirmed)
        throw new Error('Bestätigte Rezeptversion fehlt.');
    const demand = recipeDemand(recipe, l.portions, s, documents(s.ww, 'prices'), plan.date);
    if (demand.issues.length)
        throw new Error(demand.issues.join(' '));
    for (const r of demand.rows) {
        const value = sum.get(r.articleId) || { articleId: r.articleId, name: r.name, unit: r.unit, required: 0, stock: stocks.find(c => c.articleId === r.articleId)?.quantity ?? null, incoming: 0, issues: [] };
        value.required = round(value.required + r.quantity);
        sum.set(r.articleId, value);
    }
} for (const row of sum.values()) {
    for (const { value: o } of s.orders.filter(o => o.value.area === plan.area && o.value.seasonId === plan.scope && o.value.status === 'Bestellt'))
        for (const l of o.lines.filter(l => l.articleId === row.articleId)) {
            if ((!o.deliveries&&!o.deliveryDate) || (o.deliveries?o.deliveries.every(d=>!d.date||d.date>plan.date):o.deliveryDate!>plan.date)) {
                row.issues.push('Offene Lieferung ohne rechtzeitigen Termin.');
                continue;
            }
            if (l.quantity === null || l.unit !== row.unit) {
                row.issues.push('Offene Liefermenge / Einheit prüfen.');
                continue;
            }
            const pending=o.deliveries?o.deliveries.filter(d=>d.date&&d.date<=plan.date).reduce((sum,d)=>sum+Math.max(0,(l.schedule?.[d.id]||0)-(o.receipts||[]).filter(r=>r.deliveryId===d.id).reduce((n,r)=>n+r.lines.filter(x=>x.lineId===l.id).reduce((n,x)=>n+x.quantity,0),0)),0):Math.max(0,l.quantity-receivedQuantity(o,l.id));row.incoming=round(row.incoming+pending*l.packSize);
        }
} for(const row of sum.values()){const ledger=documents(s.ww,'allocation').find(l=>l.scope===plan.scope&&l.area===plan.area);const used=ledger?ledger.entries.filter(c=>c.planId!==plan.id&&c.articleId===row.articleId):s.orders.filter(o=>o.value.seasonId===plan.scope&&o.value.area===plan.area&&o.value.status!=='Storniert').flatMap(o=>o.value.contributions||[]).filter(c=>c.planId!==plan.id&&c.articleId===row.articleId);row.available=Math.max(0,round((row.stock||0)+row.incoming-used.reduce((n,c)=>n+c.stockUse+c.incomingUse,0)));} return [...sum.values()]; }
export function planOrders(plan: Plan, slot: Slot, s: Workspace, allocations: Allocation[]): Order[] { if (slot.scope !== plan.scope || slot.date > plan.date)
    throw new Error('Liefertermin muss in derselben Saison spätestens am Verwendungstag liegen.'); if (new Set(allocations.map(a => a.articleId)).size !== allocations.length)
    throw new Error('Bestandsmenge darf nicht doppelt angerechnet werden.'); const groups = new Map<string, Array<{
    offerId: string;
    quantity: number;
}>>(); for (const r of procurementRows(plan, s)) {
    const a = allocations.find(a => a.articleId === r.articleId);
    if (!a)
        throw new Error('Jeden benötigten Artikel zuordnen.');
    if (!Number.isFinite(a.stockUse) || a.stockUse < 0 || a.stockUse > (r.stock ?? 0))
        throw new Error('Angerechneten Bestand oder Zählung bitte prüfen.');
    if (!Number.isFinite(a.incomingUse) || a.incomingUse < 0 || a.incomingUse > r.incoming)
        throw new Error('Angerechnete offene Lieferung bitte prüfen.');
    if(round(a.stockUse+a.incomingUse)>Math.min(r.required,r.available??0))throw new Error('Bestand ist bereits in anderen Plänen angerechnet oder übersteigt den Bedarf.');
    const required = round(Math.max(0, r.required - a.stockUse - a.incomingUse));
    if (!required)
        continue;
    const offer = s.offers.find(o => o.value.id === a.offerId && o.value.articleId === r.articleId && o.value.active)?.value;
    if (!offer)
        throw new Error('Passendes Lieferangebot auswählen.');
    const lines = groups.get(offer.supplierId) || [];
    lines.push({ offerId: offer.id, quantity: Math.ceil(required / offer.packSize) });
    groups.set(offer.supplierId, lines);
} return [...groups].flatMap(([supplierId, lines]) => templateOrders({ id: 'plan-' + plan.id, kind: 'template', scope: 'global', at: plan.at, by: plan.by, confirmed: false, name: plan.name, supplierId, area: plan.area, lines, note: 'Bedarf aus Plan ' + plan.id + '. Bestand und offene Lieferung gemäß geprüfter Anrechnung; keine automatische Reservierung.' }, [slot], s, documents(s.ww, 'prices')).map(o => ({ ...o, id: o.id + '-' + supplierId, sourceId: null, note: o.note + ' · Verwendung ' + plan.date }))); }
export function procurementReservation(plan:Plan,allocations:Allocation[],s:Workspace):AllocationLedger{
const current=documents(s.ww,'allocation').find(l=>l.scope===plan.scope&&l.area===plan.area);
const entries=current?current.entries:s.orders.filter(o=>o.value.seasonId===plan.scope&&o.value.area===plan.area&&o.value.status!=='Storniert').flatMap(o=>(o.value.contributions||[]).map(c=>({...c,date:plan.date})));
const unique=new Map(entries.filter(c=>c.planId!==plan.id).map(c=>[c.planId+':'+c.articleId,c]));
for(const a of allocations)unique.set(plan.id+':'+a.articleId,{planId:plan.id,articleId:a.articleId,date:plan.date,stockUse:a.stockUse,incomingUse:a.incomingUse});
return{id:current?.id||'allocation:'+plan.scope+':'+(plan.area==='Küche'?'kitchen':'bar'),kind:'allocation',scope:plan.scope,area:plan.area,at:new Date().toISOString(),by:plan.by,confirmed:false,entries:[...unique.values()]};
}
export function mergePlanOrders(plan:Plan,slot:Slot,s:Workspace,allocations:Allocation[],targets:Record<string,string>):Order[]{
 const additions=planOrders(plan,slot,s,allocations);
 const linked=s.orders.filter(o=>o.value.seasonId===plan.scope&&o.value.area===plan.area&&o.value.status!=='Storniert'&&(o.value.contributions?.some(c=>c.planId===plan.id)||o.value.lines.some(l=>l.sources?.some(c=>c.planId===plan.id))));
 for(const row of linked)if(row.value.status!=='Entwurf')throw new Error('Dieser Plan ist bereits bestellt. Bitte eine bewusste Nachbestellung planen.');
 const supplierIds=new Set([...additions.map(o=>o.supplierId),...linked.map(o=>o.value.supplierId)]);
 const result:Order[]=[];
 for(const supplierId of supplierIds){
  const targetId=targets[supplierId];if(!targetId)throw new Error('Für jeden Lieferanten die gemeinsame Entwurfsbestellung wählen.');
  const addition=additions.find(o=>o.supplierId===supplierId);
  const target=targetId==='new'?undefined:s.orders.find(o=>o.value.id===targetId)?.value;
  if(targetId!=='new'&&(!target||target.supplierId!==supplierId||target.status!=='Entwurf'||target.seasonId!==plan.scope||target.area!==plan.area))throw new Error('Ziel muss eine passende Entwurfsbestellung sein.');
  if(linked.some(o=>o.value.supplierId===supplierId&&o.value.id!==target?.id))throw new Error('Dieser Plan ist bereits in einer anderen Bestellung enthalten. Bitte diesen Entwurf auswählen.');
  if(!addition&&!target)continue;
  const order=target?withSchedule(target):withSchedule(addition!,[{id:slot.id,date:slot.date,time:slot.time,place:slot.place}]);
  if(!target){order.occasion=plan.name;order.note='';order.lines.forEach(l=>{l.schedule={[slot.id]:0};l.sources=[];});}
  for(const line of order.lines){for(const source of line.sources?.filter(c=>c.planId===plan.id)||[])line.schedule![source.deliveryId]=round((line.schedule![source.deliveryId]||0)-source.quantity);line.sources=(line.sources||[]).filter(c=>c.planId!==plan.id);}
  let date=order.deliveries!.find(d=>d.date===slot.date);
  if(!date){date={id:slot.id,date:slot.date,time:slot.time,place:slot.place};if(order.deliveries!.some(d=>d.id===date!.id))throw new Error('Liefertermin wurde geändert. Bitte die Termine in der Bestellung prüfen.');order.deliveries!.push(date);order.lines.forEach(l=>{l.schedule![date!.id]=0;});}
  for(const add of addition?.lines||[]){let line=order.lines.find(l=>l.offerId===add.offerId);if(!line){line={...add,id:crypto.randomUUID(),schedule:Object.fromEntries(order.deliveries!.map(d=>[d.id,0])),sources:[]};order.lines.push(line);}if(line.packSize!==add.packSize||line.unit!==add.unit)throw new Error('Liefergebinde hat sich geändert. Bitte den Entwurf prüfen.');if(line.schedule![date.id]===null)throw new Error('Bestehende Menge ist noch offen. Bitte zuerst die manuelle Menge in der Bestellung klären.');line.schedule![date.id]=round((line.schedule![date.id]||0)+(add.quantity||0));line.sources!.push({planId:plan.id,deliveryId:date.id,quantity:add.quantity||0});line.reviewed=false;}
  order.contributions=(order.contributions||[]).filter(c=>c.planId!==plan.id);
  for(const a of allocations){const offer=s.offers.find(o=>o.value.id===a.offerId)?.value;if(offer?.supplierId===supplierId)order.contributions.push({planId:plan.id,articleId:a.articleId,stockUse:a.stockUse,incomingUse:a.incomingUse});}
  const merged=scheduledOrder(order);validateSchedule(merged);result.push(merged);
 }
 return result;
}
export function planProcurementForm(plan: Plan, s: Workspace): string { const rows = procurementRows(plan, s), slots = documents(s.ww, 'slot').filter(slot => slot.scope === plan.scope && slot.date <= plan.date); return `<form data-form="ww-procure" class="panel">${heading('Zutaten in Bestellungen übernehmen', plan.name + ' · Verwendung ' + dayLabel(plan.date))}<p>Bedarf und vorhandene Ware gemeinsam prüfen. Bereits in anderen Plänen angerechnete Mengen sind abgezogen. Eine erneute Übernahme ersetzt den Beitrag dieses Plans.</p>${select('slot', 'Liefertermin', [['', 'Bitte wählen'], ...slots.map(s => [s.id, dayLabel(s.date) + ' · ' + s.name] as [
        string,
        string
    ])], slots.length===1?slots[0].id:'')}<div class="procurement-rows">${rows.map(r => {const old=s.orders.flatMap(o=>o.value.contributions||[]).find(c=>c.planId===plan.id&&c.articleId===r.articleId);return `<section data-allocation="${h(r.articleId)}" class="procurement-row"><h2>${h(r.name)}</h2><p>Benötigt: <strong>${n(r.required)} ${h(r.unit)}</strong></p><small>${h(r.issues.join(' '))}</small><div class="formgrid">${field('stockUse', 'Davon aus vorhandenem Bestand',n(old?.stockUse||0),true,'text','inputmode="decimal"')}${field('incomingUse','Davon aus rechtzeitig bestellter Ware',n(old?.incomingUse||0),true,'text','inputmode="decimal"')}${select('offerId','Zusätzlichen Bedarf bestellen als',s.offers.filter(o=>o.value.active&&o.value.articleId===r.articleId).map(o=>[o.value.id,(s.suppliers.find(v=>v.value.id===o.value.supplierId)?.value.name||'')+' · '+o.value.packName+' à '+n(o.value.packSize)+' '+r.unit]),'')}</div><p class="muted">Noch anrechenbar: Bestand ${r.stock===null?'unbekannt':n(r.stock)+' '+h(r.unit)} · rechtzeitig bestellt ${n(r.incoming)} ${h(r.unit)} · davon zusammen noch nicht verplant: ${n(r.available??0)} ${h(r.unit)}. Restbedarf wird auf ganze Liefergebinde aufgerundet.</p></section>`;}).join('')}</div><h2>Gemeinsame Bestellung wählen</h2>${s.suppliers.filter(v=>s.offers.some(o=>o.value.supplierId===v.value.id&&rows.some(r=>r.articleId===o.value.articleId))).map(v=>{const drafts=s.orders.filter(o=>o.value.status==='Entwurf'&&o.value.supplierId===v.value.id&&o.value.seasonId===plan.scope&&o.value.area===plan.area);const linked=drafts.find(o=>o.value.contributions?.some(c=>c.planId===plan.id));return select('target_'+v.value.id,v.value.name,[['','Bitte wählen'],['new','Neue Lieferantenbestellung'],...drafts.map(o=>[o.value.id,o.value.occasion+' · '+o.value.lines.length+' Artikel'] as [string,string])],linked?.value.id||(drafts.length===1?drafts[0].value.id:!drafts.length?'new':''));}).join('')}<p>Vorhandene manuelle Mengen bleiben erhalten. Vor der Abgabe die gesamte Lieferantenbestellung prüfen.</p>${confirmationActions('Bedarf in gewählte Bestellungen übernehmen')}</form>`; }
