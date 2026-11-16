// 1.22.0 Gesamtbestellung: Raster nach Liefertag, Prüfhinweise, Termine der Entwürfe speichern.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {overviewData,overviewChanges,suggestDate,clockTime,orderOverview,overviewPdf} from '../src/kitchen/order-overview.ts';
import {validateSchedule} from '../src/kitchen/supplier-orders.ts';
const season={id:'s27',name:'Fasnet 2027',year:2027,archived:false};
const line=(id,name,schedule)=>({id,articleId:'a-'+id,offerId:'o-'+id,articleName:name,code:'',unit:'Stk',packName:'Stück',packSize:1,quantity:Object.values(schedule).reduce((a,b)=>a+(b||0),0),priceNet:null,priorPriceNet:null,priceYear:null,reviewed:false,schedule});
const order=(id,supplier,status,deliveries,lines)=>({value:{id,seasonId:'s27',area:'Küche',supplierId:'sup-'+id,supplierName:supplier,status,occasion:'Zunftabende',deliveryDate:null,method:'Telefon',note:'',sourceId:null,sourceYear:null,recordedBy:status==='Entwurf'?null:'X',recordedAt:status==='Entwurf'?null:'2026-11-16T10:00:00.000Z',lines,deliveries}, itemId:1, etag:'"1"', operationId:'op'});
const plan=(date)=>({value:{id:'p'+date,kind:'plan',scope:'s27',area:'Küche',date,name:'x',lines:[],note:'',at:'',by:'',confirmed:false}});
function state(){return {seasons:[{value:season}],suppliers:[],articles:[],offers:[],counts:[],inventories:[],ww:{ready:true,records:[plan('2027-02-03'),plan('2027-02-05'),plan('2027-02-06')]},orders:[
 order('w','Wiggenhauser','Entwurf',[{id:'wed',date:null,time:'Mittwoch – Datum prüfen',place:'Küche'},{id:'fri17',date:null,time:'Freitag 17:00 – Datum prüfen',place:'Küche'}],[line('1','Bockwurst',{wed:50,fri17:160}),line('2','Fleischkäse heiß',{wed:8,fri17:0})]),
 order('r','Rewe','Bestellt',[{id:'d1',date:'2027-02-05',time:'15:00',place:'Halle'}],[line('3','Bockwurst',{d1:20})]),
 order('h','Historisch','Entwurf',[{id:'d1',date:'2027-02-05',time:'',place:''}],[line('4','Brot',{d1:1})])]};}
state().orders[2].value.occasion='Historische Bestellliste 2026 – PRÜFEN';
test('Uhrzeit und Datumsvorschlag aus freiem Zeitfenster',()=>{
 assert.equal(clockTime('Freitag 17:00 – Datum prüfen'),'17:00');assert.equal(clockTime('ab 9.30 Uhr'),'09:30');assert.equal(clockTime('Mittwoch'),'');
 const days=['2027-02-03','2027-02-05','2027-02-06'];
 assert.equal(suggestDate({id:'wed',date:null,time:'Mittwoch – Datum prüfen',place:''},days),'2027-02-03');
 assert.equal(suggestDate({id:'sat19',date:null,time:'',place:''},days),'2027-02-06');
 assert.equal(suggestDate({id:'x',date:null,time:'irgendwann',place:''},days),null);
});
test('Raster, Hinweise und keine historischen Entwürfe',()=>{
 const s=state();s.orders[2].value.occasion='Historische Bestellliste 2026 – PRÜFEN';
 const d=overviewData(s,season,'Küche');
 assert.deepEqual(d.days,['2027-02-03','2027-02-05','2027-02-06']);
 assert.deepEqual(d.suppliers,['Rewe','Wiggenhauser']);
 assert.equal(d.deliveries.find(x=>x.deliveryId==='fri17').suggestedDate,'2027-02-05');
 assert.ok(d.issues.some(i=>/2 Datumsvorschläge sind noch nicht gespeichert: Wiggenhauser/.test(i)),d.issues.join('|'));
 assert.ok(!d.issues.some(i=>/noch kein Datum/.test(i)),d.issues.join('|'));
 const html=orderOverview(s,season,'Küche');
 // Vorschläge stehen im Raster in ihrer Tagesspalte, markiert, und die Karte nennt die Uhrzeit
 assert.doesNotMatch(html,/ohne Datum/);assert.match(html,/ov-slot draft suggested/);assert.match(html,/Datum vorgeschlagen/);
 assert.match(html,/<h4>Wiggenhauser<small>17:00<\/small><\/h4>/);assert.match(html,/placeholder="hh:mm"/);
 assert.match(html,/Gesamtbestellung/);assert.match(html,/Liefertermine speichern/);assert.match(html,/Bereits bestellt/);
 assert.doesNotMatch(html,/Historisch/);
});
test('Gleicher Artikel am selben Tag bei zwei Lieferanten wird gemeldet',()=>{
 const s=state();s.orders[2].value.occasion='Historische Bestellliste';
 s.orders[0].value.deliveries[1].date='2027-02-05';
 const d=overviewData(s,season,'Küche');
 assert.ok(d.issues.some(i=>/Bockwurst kommt am Fr\.?, 05\.02\.? von Rewe und Wiggenhauser/.test(i)),d.issues.join('|'));
});
test('Speichern übernimmt Datum, Uhrzeit und Ort nur bei Entwürfen',()=>{
 const s=state();s.orders[2].value.occasion='Historische Bestellliste';
 const f=new FormData();
 f.set('date|w|wed','2027-02-03');f.set('time|w|wed','16:30');f.set('place|w|wed','Küchentür');
 f.set('date|w|fri17','2027-02-05');f.set('time|w|fri17','17:00');f.set('place|w|fri17','Küche');
 f.set('date|r|d1','2027-02-09');
 const changes=overviewChanges(f,s,'s27','Küche');
 assert.equal(changes.length,1);
 const o=changes[0].order;assert.equal(o.id,'w');
 assert.deepEqual(o.deliveries.map(d=>[d.date,d.time,d.place]),[['2027-02-03','16:30','Küchentür'],['2027-02-05','17:00','Küche']]);
 assert.equal(o.lines[0].quantity,210);validateSchedule(o);
 // Ohne Änderung kein Speichervorgang
 const same=new FormData();same.set('date|w|wed','');same.set('time|w|wed','');same.set('place|w|wed','Küche');
 assert.equal(overviewChanges(same,s,'s27','Küche').length,0);
});
test('Bestellung ohne Liefertermine bekommt beim Speichern einen Termin',()=>{
 const s=state();s.orders=[order('n','Metro','Entwurf',undefined,[{...line('5','Senf',{x:600}),schedule:undefined,quantity:600}])];
 const f=new FormData();f.set('date|n|single','2027-02-05');f.set('time|n|single','10:00');f.set('place|n|single','');
 const [c]=overviewChanges(f,s,'s27','Küche');
 assert.equal(c.order.deliveries.length,1);assert.equal(c.order.deliveries[0].time,'10:00');assert.equal(c.order.lines[0].schedule[c.order.deliveries[0].id],600);
 validateSchedule(c.order);assert.equal(c.order.deliveryDate,'2027-02-05');
});
test('Lieferplan als PDF',()=>{
 const s=state();s.orders[2].value.occasion='Historische Bestellliste';
 const bytes=overviewPdf(s,season,'Küche','2026-11-16T10:00:00.000Z');
 const text=new TextDecoder('latin1').decode(bytes);
 assert.match(text,/^%PDF-1\.4/);assert.match(text,/Lieferplan/);assert.match(text,/Wiggenhauser/);assert.match(text,/Bockwurst/);
});
test('Ohne passenden Einsatztag bleibt die Lieferung ohne Datum',()=>{
 const s=state();s.orders[2].value.occasion='Historische Bestellliste';
 s.orders[0].value.deliveries[0].time='irgendwann';s.orders[0].value.deliveries[0].id='x1';
 s.orders[0].value.lines.forEach(l=>{l.schedule.x1=l.schedule.wed;delete l.schedule.wed;});
 const d=overviewData(s,season,'Küche');
 assert.ok(d.issues.some(i=>/1 Lieferung hat noch kein Datum: Wiggenhauser/.test(i)),d.issues.join('|'));
 assert.ok(d.issues.some(i=>/1 Datumsvorschlag ist noch nicht gespeichert/.test(i)),d.issues.join('|'));
 assert.match(orderOverview(s,season,'Küche'),/ohne Datum/);
});
