import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyOperation, importCheck } from '../src/domain/state.ts';
const seed=JSON.parse(fs.readFileSync(new URL('../import/2026.json',import.meta.url),'utf8'));

test('2026-Import bewahrt 76 Zeilen, 10 Freitagpositionen und 8 Originalbelege',()=>{
  const check=importCheck(seed);
  assert.equal(check.planLines,76);
  assert.equal(check.fridayWiggen,10);
  assert.equal(check.originalReceipts,8);
  assert.equal(check.originalTotalCents,519596);
  assert.equal(seed.planLines.filter(l=>l.quantity===null).length,0);
  assert.ok(seed.planLines.every(l=>l.unitPriceCents===null));
  assert.ok(seed.planLines.every(l=>l.source.hash.length===64));
});

test('Eine Mengenänderung benötigt die aktuelle Version und bewahrt die importierte Herkunft',()=>{
  const current={...structuredClone(seed),revision:0,operationIds:[]};
  const op={id:'op-1',baseRevision:0,type:'plan.quantity',payload:{id:'p-2026-12',quantity:210}};
  const result=applyOperation(current,op);
  assert.equal(result.status,'saved');
  assert.equal(result.state.planLines.find(l=>l.id==='p-2026-12').quantity,210);
  assert.equal(result.state.planLines.find(l=>l.id==='p-2026-12').source.hash,seed.planLines.find(l=>l.id==='p-2026-12').source.hash);
  assert.equal(current.planLines.find(l=>l.id==='p-2026-12').quantity,200);
  assert.equal(applyOperation(result.state,{...op,id:'op-2'}).status,'conflict');
});

test('Wiederholte Vorgangs-ID bucht Lieferung einmal; negative Mengen werden abgelehnt',()=>{
  const state={...structuredClone(seed),revision:0,operationIds:[]};
  const op={id:'delivery-1',baseRevision:0,type:'delivery.record',payload:{articleId:'a-3',day:'Freitag',quantity:195,location:'Küche'}};
  const first=applyOperation(state,op);
  const second=applyOperation(first.state,op);
  assert.equal(second.status,'saved');
  assert.equal(second.state.movements.length,1);
  assert.throws(()=>applyOperation(state,{...op,payload:{...op.payload,quantity:-1}}),/Menge/);
});

test('Vorbereitete Bestellung ändert sich nach späterer Planung nicht',()=>{
  const state={...structuredClone(seed),revision:0,operationIds:[]};
  const prepared=applyOperation(state,{id:'o-1',baseRevision:0,type:'order.prepare',payload:{supplierId:'s-wiggenhauser',day:'Freitag'}});
  const edited=applyOperation(prepared.state,{id:'o-2',baseRevision:1,type:'plan.quantity',payload:{id:'p-2026-12',quantity:180}});
  assert.equal(edited.state.orders[0].lines.find(l=>l.id==='p-2026-12').quantity,200);
  assert.equal(edited.state.orders[0].status,'Vorbereitet');
});

test('Verkäufe speichern ausdrücklich null oder 0 und bewahren den Preis zum Erfassungszeitpunkt',()=>{
  const state={...structuredClone(seed),revision:0,operationIds:[]};
  const first=applyOperation(state,{id:'s-1',baseRevision:0,type:'sales.quantity',payload:{menuId:'m-1',day:'Freitag',quantity:0}});
  assert.equal(first.state.sales[0].quantity,0);
  assert.equal(first.state.sales[0].priceCents,500);
  const next=applyOperation(first.state,{id:'s-2',baseRevision:1,type:'sales.quantity',payload:{menuId:'m-1',day:'Freitag',quantity:null}});
  assert.equal(next.state.sales[0].quantity,null);
  assert.equal(next.state.sales.length,1);
});

test('Falsche Artikel, inkonsistente Tage und verborgene unbekannte Operationen werden abgelehnt',()=>{
  const state={...structuredClone(seed),revision:0,operationIds:[]};
  assert.throws(()=>applyOperation(state,{id:'x',baseRevision:0,type:'delivery.record',payload:{articleId:'unknown',day:'Freitag',quantity:3}}),/Artikel/);
  assert.throws(()=>applyOperation(state,{id:'x',baseRevision:0,type:'sales.quantity',payload:{menuId:'m-1',day:'Montag',quantity:3}}),/Tag/);
  assert.throws(()=>applyOperation(state,{id:'x',baseRevision:0,type:'delete.everything',payload:{}}),/Vorgang/);
});
test('Neue Bestellposition verwendet die Artikeleinheit und ergänzt keine erfundenen Einkaufspreise',()=>{
 const state={...structuredClone(seed),revision:0,operationIds:[]};
 const result=applyOperation(state,{id:'new-line',baseRevision:0,type:'plan.add',payload:{supplierId:'s-wiggenhauser',articleId:'a-3',day:'Samstag',quantity:5,time:'19:00',note:'Nachbestellung'}});
 const line=result.state.planLines.at(-1);
 assert.equal(line.quantity,5);assert.equal(line.unit,'Stück');assert.equal(line.unitPriceCents,null);assert.equal(line.day,'Samstag');
});
test('Neuer Verkaufspreis verändert den Preis bereits erfasster Verkäufe nicht',()=>{
 const state={...structuredClone(seed),revision:0,operationIds:[]};
 const sold=applyOperation(state,{id:'sold',baseRevision:0,type:'sales.quantity',payload:{menuId:'m-1',day:'Freitag',quantity:2}});
 const priced=applyOperation(sold.state,{id:'priced',baseRevision:1,type:'menu.price',payload:{menuId:'m-1',priceCents:600}});
 assert.equal(priced.state.menu[0].priceCents,600);assert.equal(priced.state.sales[0].priceCents,500);
});
