import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seed,run} from './task4-fixture.mjs';
import {prepareOrder} from '../src/domain/kitchen.ts';
import {buildClosureChecklist} from '../src/domain/event-close.ts';
import {completeFixture} from './task4-complete-fixture.mjs';
test('allocated Orders edit changes only that allocation, retaining original total and snapshot identity',()=>{
 let s=run(seed,'plan.allocate',{id:seed.planLines[0].id,allocations:[{day:'Freitag',time:'18:00',quantity:60},{day:'Samstag',time:'19:00',quantity:60}]});
 const original=s.planLines[0].quantity;const row=prepareOrder(s.planLines,seed.planLines[0].supplierId,'Freitag').lines.find(l=>l.id.endsWith(':allocation:0'));
 s=run(s,'plan.allocationQuantity',{id:row.id,quantity:70});
 assert.equal(s.planLines[0].quantity,original);assert.equal(s.planLines[0].allocations[0].quantity,70);assert.equal(s.planLines[0].allocations[1].quantity,60);
 assert.equal(prepareOrder(s.planLines,row.supplierId,'Freitag').lines.find(l=>l.id===row.id).quantity,70);
 assert.throws(()=>run(s,'plan.allocationQuantity',{id:row.id,quantity:null}));
});
test('receipt article without any movement cannot be stock-complete via another article',()=>{
 const s=completeFixture();s.invoices[0].lines[0].articleId='article-b';
 assert.ok(buildClosureChecklist(s,'Küche').open.some(x=>x.includes('Anfangsbestände')));
});
test('explicit current comparable net evidence yields a bounded result, later facts invalidate it',()=>{
 let s=completeFixture();
 s=run(s,'event.economics',{eventId:s.event.id,revision:s.revision,scope:'Küche',netRevenueCents:1000,netConsumptionCents:400,sourceReason:'Geprüfte Netto-Umsatzliste R0',valuationReason:'Bewerteter Verbrauch aus Inventur R0'});
 const check=buildClosureChecklist(s,'Küche');assert.equal(check.complete,true);assert.equal(check.resultCents,600);
 const original=structuredClone(s.economicEvidence);s=run(s,'article.price',{articleId:s.articles[0].id,priceCents:123});
 assert.equal(buildClosureChecklist(s,'Küche').resultCents,null);assert.match(buildClosureChecklist(s,'Küche').resultReason,/Revision/);assert.deepEqual(s.economicEvidence,original);
});
test('stock completeness requires purchased, planned, ordered and used articles plus unresolved mappings',()=>{
 for(const change of [
  s=>s.planLines.push({id:'planned',articleId:'article-b',quantity:1}),
  s=>s.orders.push({id:'order',lines:[{id:'line',articleId:'article-b',quantity:1}]}),
  s=>s.menu[0].recipe.push({articleId:'article-b',quantity:1}),
 ]) {const s=completeFixture();change(s);assert.ok(buildClosureChecklist(s,'Küche').open.some(reason=>reason.includes('Anfangsbestände')));}
 const unassigned=completeFixture();unassigned.invoices[0].lines[0].articleId=null;
 assert.ok(buildClosureChecklist(unassigned,'Küche').open.some(reason=>reason.includes('Artikel- oder Ortszuordnung')));
});
test('net evidence does not manufacture comparable result from incomplete or mixed-scope facts',()=>{
 for(const change of [s=>s.invoices[0].netCents=null,s=>s.sales[0].quantity=null,s=>s.movements=[]]) {
  let s=completeFixture();change(s);s=run(s,'event.economics',{eventId:s.event.id,revision:s.revision,scope:'Küche',netRevenueCents:1000,netConsumptionCents:400,sourceReason:'Net source',valuationReason:'Inventory valuation'});
  const c=buildClosureChecklist(s,'Küche');assert.equal(c.resultCents,null);assert.equal(c.complete,false);assert.match(c.resultReason,/unvollständig/);
 }
 let s=completeFixture();s=run(s,'event.economics',{eventId:s.event.id,revision:s.revision,scope:'Alle',netRevenueCents:1000,netConsumptionCents:400,sourceReason:'Net source',valuationReason:'Inventory valuation'});
 assert.equal(buildClosureChecklist(s,'Alle').resultCents,null);
 assert.throws(()=>run(s,'event.economics',{eventId:s.event.id,revision:0,scope:'Küche',netRevenueCents:1,netConsumptionCents:0,sourceReason:'Source',valuationReason:'Reason'}));
});
test('CSV explains open checklist and net result; closed export retains confirmed snapshot',async()=>{
 const {buildEventExport,toCsv}=await import('../src/data/exports.ts');let s=completeFixture();
 const csv=toCsv(buildEventExport(s,'Küche'));assert.match(csv,/Offener Prüfpunkt/);assert.match(csv,/Nettoerlöse/);assert.match(csv,/Ergebnisgrundlage/);
 s=run(s,'event.economics',{eventId:s.event.id,revision:s.revision,scope:'Küche',netRevenueCents:1000,netConsumptionCents:400,sourceReason:'Net source',valuationReason:'Inventory valuation'});
 s=run(s,'event.close',{eventId:s.event.id,revision:s.revision,confirmedScope:'Küche',note:'Checked'});
 assert.equal(buildEventExport(s,'Küche').checklist.resultCents,600);
});
