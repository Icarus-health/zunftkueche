import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scheduledOrder,validateSchedule,copyScheduledOrder,deliveryRemaining} from '../src/kitchen/supplier-orders.ts';
import {validateOrder} from '../src/kitchen/domain.ts';
import {validateReceipt} from '../src/kitchen/operations.ts';
import {supplierPdf} from '../src/kitchen/supplier-pdf.ts';
import {orderMailView,supplierMail} from '../src/kitchen/order-mail.ts';
import {workspace,order,line,receipt} from './support/kitchen-data.mjs';
export const scheduled=()=>({...structuredClone(order),status:'Entwurf',recordedBy:null,recordedAt:null,deliveryDate:'2027-02-03',deliveries:[{id:'wed',date:'2027-02-03',time:'09–11 Uhr',place:'Küche'},{id:'fri',date:'2027-02-05',time:'Vormittag',place:'Küche'}],lines:[{...line,quantity:8,schedule:{wed:3,fri:5}}]});
test('a scheduled supplier order keeps two deliveries in one order and derives its total',()=>{
 const value=scheduled();value.lines[0].quantity=999;const ready=scheduledOrder(value);assert.equal(ready.lines[0].quantity,8);assert.equal(ready.deliveries.length,2);assert.equal(value.lines[0].quantity,999);
 value.lines[0].schedule.fri=null;assert.equal(scheduledOrder(value).lines[0].quantity,null,'unknown does not mean zero');
});
test('schedule validation rejects mismatched totals, orphan cells and impossible or repeated dates',()=>{
 validateOrder(scheduled());
 for(const mutate of [v=>v.lines[0].quantity=9,v=>v.lines[0].schedule.other=2,v=>v.deliveries[1].date='2027-02-30',v=>{v.deliveries[1].date='2027-02-03';v.deliveries[1].time=v.deliveries[0].time;},v=>v.deliveries[1].id='wed',v=>v.lines[0].schedule.wed=-1]){
  const value=scheduled();mutate(value);assert.throws(()=>validateOrder(value));
 }
 const missing=scheduled();missing.deliveries[0].date=null;missing.deliveryDate='2027-02-05';validateSchedule(missing);missing.status='Bestellt';assert.throws(()=>validateSchedule(missing),/Datum|Termin/);
});
test('per-delivery receiving cannot consume another days allowance',()=>{
 const value={...scheduled(),status:'Bestellt',recordedAt:order.recordedAt,recordedBy:order.recordedBy};
 assert.throws(()=>validateReceipt(value,receipt),/Liefertermin/);
 validateReceipt(value,{...receipt,deliveryId:'wed'});
 assert.throws(()=>validateReceipt(value,{...receipt,deliveryId:'wed',lines:[{lineId:'line',quantity:4}]}),/Restmenge|Termin/);
 value.receipts=[{...receipt,deliveryId:'wed'}];assert.equal(deliveryRemaining(value,'line','wed'),0);assert.equal(deliveryRemaining(value,'line','fri'),5);
});
test('annual copy requires explicit new dates and refreshes prices without carrying deliveries or contributions',()=>{
 const state=workspace();state.seasons.push({value:{id:'s2028',name:'2028',year:2028,archived:false}});
 const source={...scheduled(),contributions:[{planId:'old',articleId:'water',stockUse:2,incomingUse:0}],receipts:[]};
 assert.throws(()=>copyScheduledOrder(source,state.seasons.at(-1).value,'Küche',state,{}),/Termin|Datum/);
 const copy=copyScheduledOrder(source,state.seasons.at(-1).value,'Küche',state,{wed:'2028-02-23',fri:'2028-02-25'});
 assert.equal(copy.lines[0].quantity,8);assert.deepEqual(copy.lines[0].schedule,{wed:3,fri:5});assert.equal(copy.lines[0].priceNet,8.5);assert.equal(copy.lines[0].reviewed,false);assert.equal(copy.status,'Entwurf');assert.equal(copy.receipts,undefined);assert.equal(copy.contributions,undefined);assert.equal(copy.recordedAt,null);assert.equal(copy.deliveries[1].date,'2028-02-25');assert.equal(copyScheduledOrder(source,state.seasons.at(-1).value,'Küche',state,{wed:'2028-02-23',fri:'2028-02-25'}).id,copy.id);
});
test('supplier PDF contains all delivery columns and total but excludes internal planning notes',()=>{
 const value=scheduled();value.note='INTERNAL example-plan';value.supplierNote='Bitte am Seiteneingang liefern.';
 const bytes=supplierPdf(value,workspace().suppliers[0].value,'2026-10-26T12:00:00Z');const pdf=new TextDecoder('latin1').decode(bytes);
 assert.ok(pdf.startsWith('%PDF-'));assert.match(pdf,/03\.02\.2027/);assert.match(pdf,/05\.02\.2027/);assert.match(pdf,/Mineralwasser/);assert.match(pdf,/W12/);assert.match(pdf,/Seiteneingang/);assert.doesNotMatch(pdf,/INTERNAL|example-plan/);assert.match(pdf,/xref/);assert.match(pdf,/%%EOF/);
 const entries=pdf.match(/\d{10} 00000 n/g);for(const entry of entries){const offset=Number(entry.slice(0,10));assert.match(pdf.slice(offset,offset+25),/^\d+ 0 obj/);}
});

test('dispatch PDF requires a reviewed schedule and leaves the persisted order status alone', () => {
    const source = scheduled();
    source.note = 'INTERN';
    source.supplierNote = 'Bitte an die Küche liefern.';
    const supplier = workspace().suppliers[0].value;
    const timestamp = '2026-10-26T12:00:00Z';
    const preview = new TextDecoder('latin1').decode(supplierPdf(source, supplier, timestamp));
    const dispatch = new TextDecoder('latin1').decode(supplierPdf(source, supplier, timestamp, true));
    assert.match(preview, /ENTWURF - noch nicht aufgegeben/);
    assert.match(dispatch, /BESTELLUNG/);
    assert.doesNotMatch(dispatch, /ENTWURF|INTERN/);
    assert.match(dispatch, /03\.02\.2027[\s\S]*05\.02\.2027/);
    assert.equal(source.status, 'Entwurf');
    source.deliveries[0].date = null;
    assert.throws(() => supplierPdf(source, supplier, timestamp, true), /Datum/);
});

test('prepared text remains available when the recipient field cannot name one safe mailbox', () => {
    const source = scheduled();
    const supplier = { ...workspace().suppliers[0].value, email: 'bestellung@example.invalid,extra@example.invalid' };
    const message = supplierMail(source, supplier);
    assert.equal(message.href, '');
    assert.equal(message.to, '');
    assert.match(message.body, /Mineralwasser/);
});
test('PDF keeps full long article names and long delivery notes across page breaks',()=>{
 const v=scheduled();v.lines=Array.from({length:30},(_,i)=>({...v.lines[0],id:'l'+i,articleName:'Bio Rinderbraten aus der Region ohne Knochen tiefgekühlt Variante '+i}));v.supplierNote='Lieferhinweis '.repeat(50)+'ABSCHLUSS-HINWEIS';const pdf=new TextDecoder('latin1').decode(supplierPdf(v,workspace().suppliers[0].value));assert.match(pdf,/Knochen tiefgekühlt Variante 29/);assert.match(pdf,/ABSCHLUSS-HINWEIS/);assert.ok((pdf.match(/\/Type \/Page /g)||[]).length>1);
});

test('one supplier can deliver twice on the same day at different times',()=>{const v=scheduled();v.deliveries[1].date=v.deliveries[0].date;validateOrder(v);});
test('annual copy can retain unspecified dates and unknown prices in a working draft',()=>{
 const s=workspace();const target={id:'s2028',name:'2028',year:2028,archived:false};s.seasons.push({value:target});const source={...scheduled(),occasion:'Historische Bestellliste 2027 – PRÜFEN'};
 const value=copyScheduledOrder(source,target,'Küche',s,{wed:'',fri:''});assert.equal(value.deliveries[0].date,null);assert.equal(value.deliveries[1].date,null);assert.equal(value.lines[0].priceNet,null);assert.equal(value.lines[0].quantity,8);assert.doesNotMatch(value.occasion,/^Historisch/i);assert.equal(value.status,'Entwurf');
});
test('PDF does not invent a weekday for an undated delivery',()=>{const value=scheduled();value.deliveries[0].date=null;value.deliveryDate=value.deliveries[1].date;const pdf=new TextDecoder('latin1').decode(supplierPdf(value,workspace().suppliers[0].value));assert.doesNotMatch(pdf,/\(Sa\) Tj/);assert.match(pdf,/Termin offen/);});

test('a long supplier order still opens a mail with recipient and subject and keeps the full text available', () => {
    const source = scheduled();
    source.deliveries = Array.from({ length: 5 }, (_, index) => ({
        id: 'day-' + index, date: '2027-02-0' + (3 + index), time: 'Vormittag', place: 'Küche'
    }));
    source.lines = Array.from({ length: 13 }, (_, index) => ({
        ...source.lines[0], id: 'line-' + index, offerId: 'offer-' + index,
        articleName: 'Mineralwasser Gebinde für den Zunftabend ' + index,
        quantity: 5, schedule: Object.fromEntries(source.deliveries.map(day => [day.id, 1]))
    }));
    const supplier = { ...workspace().suppliers[0].value, email: 'bestellung@example.invalid' };
    const message = supplierMail(source, supplier);
    assert.ok(message.href.startsWith('mailto:bestellung@example.invalid?subject='));
    assert.equal(new URL(message.href).searchParams.get('subject'), message.subject);
    assert.equal(new URL(message.href).searchParams.has('body'), false);
    assert.match(message.body, /Mineralwasser Gebinde für den Zunftabend 12/);
    assert.match(message.body, /07\.02\.2027/);
    const rendered = orderMailView(source, supplier);
    assert.match(rendered, /Nur E-Mail mit Betreff öffnen/);
    assert.match(rendered, /Bestelltext kopieren/);
    assert.match(rendered, /PDF speichern und E-Mail öffnen/);
    assert.match(rendered, /PDF anhängen/);
    const shared = orderMailView(source, supplier, true);
    assert.match(shared, /data-action="order-share"[^>]*class="primary">Mit PDF teilen/);
    assert.match(shared, /Empfänger dort eintragen: bestellung@example\.invalid/);
});
