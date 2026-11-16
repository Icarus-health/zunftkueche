import {orderReview} from '../src/kitchen/order-sheet.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspace,stored,order,line} from './support/kitchen-data.mjs';
import {copyScheduledOrder} from '../src/kitchen/supplier-orders.ts';
import {supplierCopyForm} from '../src/kitchen/supplier-forms.ts';
import {validateEntity} from '../src/kitchen/domain.ts';
import * as model from '../src/kitchen/model.ts';

test('article availability is specific to a season and legacy articles remain available',()=>{
 const s=workspace();const a={...s.articles[0].value,unavailableSeasons:['s2028']};
 assert.equal(model.articleAvailable(a,'s2027'),true);assert.equal(model.articleAvailable(a,'s2028'),false);assert.equal(model.articleAvailable(s.articles[0].value,'s2028'),true);validateEntity('articles',a);assert.throws(()=>validateEntity('articles',{...a,unavailableSeasons:['bad id']}));
});
test('copy does not select or silently copy an unavailable article into a new season',()=>{
 const s=workspace(); const target={id:'s2028',name:'2028',year:2028,archived:false};s.seasons.push(stored(target));s.articles[0].value={...s.articles[0].value,unavailableSeasons:['s2028']};
 const source={...order,status:'Entwurf',recordedAt:null,recordedBy:null,deliveries:[{id:'wed',date:null,time:'Mittwoch',place:'Küche'}],lines:[{...line,quantity:3,schedule:{wed:3}}]};
 const html=supplierCopyForm(source,s,target);assert.match(html,/in dieser Saison nicht vorgesehen/i);assert.doesNotMatch(html,/name="copyline_line" checked/);
 assert.throws(()=>copyScheduledOrder(source,target,'Küche',s,{wed:'2028-02-23'},['line']),/Saison/);
});
test('copy preserves unknown delivery quantities instead of blocking or making them zero',()=>{
 const s=workspace(), target={id:'s2028',name:'2028',year:2028,archived:false};s.seasons.push(stored(target));
 const source={...order,status:'Entwurf',recordedAt:null,recordedBy:null,deliveries:[{id:'wed',date:null,time:'Mittwoch',place:'Küche'}],lines:[{...line,quantity:null,schedule:{wed:null}}]};
 const copy=copyScheduledOrder(source,target,'Küche',s,{wed:'2028-02-23'},['line']);assert.equal(copy.lines[0].quantity,null);assert.equal(copy.lines[0].schedule.wed,null);assert.equal(copy.lines[0].reviewed,false);
});
test('season availability survives save and reload while legacy data remains readable',async()=>{
 const {SharePointStore}=await import('../src/kitchen/sharepoint.ts');const {Server}=await import('./support/fake-sharepoint.mjs');const {article,season}=await import('./support/kitchen-data.mjs');
 const server=new Server(), store=new SharePointStore('https://example.sharepoint.com/sites/kitchen',server.request);await store.saveMaster('seasons',season,undefined,'save-season');await store.saveMaster('articles',article,undefined,'save-article');
 const original=(await store.load()).articles[0];const changed={...original.value,unavailableSeasons:[season.id]};await store.saveMaster('articles',changed,original,'mark-season');const reloaded=(await store.load()).articles[0].value;
 assert.deepEqual(reloaded.unavailableSeasons,[season.id]);assert.equal(model.articleAvailable(reloaded,season.id),false);
});
test('recipe procurement refuses adding an article excluded for the plan season',async()=>{
 const {mergePlanOrders}=await import('../src/kitchen/ww/plan-procurement.ts');const {state,stored:row,base,recipe,slot}=await import('./support/ww-data.mjs');const s=state();s.ww={ready:true,records:[row(recipe),row(slot)]};s.articles[0].value={...s.articles[0].value,unavailableSeasons:['s2027']};
 const plan={...base('plan','p'),name:'Abend',area:'Küche',date:'2027-02-12',lines:[{recipeId:recipe.id,portions:100}],note:''};
 assert.throws(()=>mergePlanOrders(plan,slot,s,[{articleId:'water',offerId:'offer',stockUse:0,incomingUse:0}],{sup:'new'}),/Saison/);
});
test('article edit form offers a storage place and preserves seasonal settings',async()=>{
 const {masterForm}=await import('../src/kitchen/forms.ts');const s=workspace(), a={...s.articles[0].value,storagePlace:'Kühlraum',unavailableSeasons:['s2027']};const html=masterForm({kind:'articles',id:a.id,value:a},s);assert.match(html,/name="storagePlace"[^>]*value="Kühlraum"/);assert.match(html,/name="unavailable_s2027" checked/);
});
test('inventory identifies the primary storage location without changing count quantities',async()=>{
 const {inventoryForm}=await import('../src/kitchen/operation-forms.ts');const {inventory,inventoryLine}=await import('./support/kitchen-data.mjs');const html=inventoryForm({...inventory,lines:[inventoryLine]},[],{water:'Kühlraum'});assert.match(html,/Kühlraum/);assert.match(html,/name="packs_water"/);
});
test('a base price dated after the requested date is not applied retroactively',async()=>{
 const {effectiveOffer}=await import('../src/kitchen/ww/domain.ts');const s=workspace();const result=effectiveOffer({...s.offers[0].value,priceDate:'2028-01-01',priceNet:20},[],'2027-02-01');assert.equal(result.priceNet,null);assert.equal(result.priceDate,null);
});
test('order editor warns when supplier prices are missing or have an older price year',async()=>{
 const {supplierOrderForm}=await import('../src/kitchen/supplier-forms.ts');const s=workspace();s.offers[0].value={...s.offers[0].value,priceDate:'2025-01-01'};const html=orderReview({...order,seasonId:'s2027'},s);assert.match(html,/Preise und Hinweise prüfen/);assert.match(html,/Stand 01\.01\.2025/);assert.match(html,/älterer Preis, bitte bestätigen/);
});
test('a price-check note stays visible without deselecting an otherwise available article',()=>{
 const s=workspace();s.offers[0].value={...s.offers[0].value,note:'Preis fehlt – bitte aktuelles Angebot prüfen.'};const source={...order,deliveries:[{id:'wed',date:null,time:'Mittwoch',place:'Küche'}],lines:[{...line,quantity:3,schedule:{wed:3}}]};
 const html=supplierCopyForm(source,s,{id:'s2028',year:2028,name:'2028',archived:false});assert.match(html,/name="copyline_line" checked/);assert.match(html,/Preis fehlt/);
});
test('dashboard count totals exclude articles not planned for the chosen season',async()=>{
 const {dashboard}=await import('../src/kitchen/workspace.ts');const {season}=await import('./support/kitchen-data.mjs');const s=workspace();s.articles[0].value={...s.articles[0].value,unavailableSeasons:[season.id]};const html=dashboard(s,season,'Küche');assert.match(html,/0 von 0 Artikeln zuletzt gezählt/);
});
test('order editor explicitly compares draft price with supplier base price',async()=>{const {supplierOrderForm}=await import('../src/kitchen/supplier-forms.ts');const {workspace}=await import('./support/kitchen-data.mjs');const s=workspace();s.orders[0].value.status='Entwurf';s.offers[0].value.priceNet=11;const html=orderReview(s.orders[0].value,s);assert.match(html,/Preis am Artikel: 11,00/);assert.match(html,/Preis in diesem Entwurf: 8,50/);});
