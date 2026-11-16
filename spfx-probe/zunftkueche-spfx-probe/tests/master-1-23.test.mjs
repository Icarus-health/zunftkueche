// 1.23.0 Paket E: Stammdaten. Artikel in einem Schritt, Preisliste als Tabelle, Einsatztage als Liefertage.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {KitchenView} from '../src/kitchen/view.ts';
import {SharePointStore} from '../src/kitchen/sharepoint.ts';
import {Server} from './support/fake-sharepoint.mjs';
import {season,supplier,article,offer} from './support/kitchen-data.mjs';
import {deliverySlots} from '../src/kitchen/ww/delivery-days.ts';
import {deliveryOptions,planOrders} from '../src/kitchen/ww/plan-procurement.ts';
import {masterForm} from '../src/kitchen/forms.ts';
import {supplierHint} from '../src/kitchen/review-status.ts';
async function setup(){const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test'});for(const k of ['document','Element','HTMLInputElement','HTMLTextAreaElement','HTMLFormElement','HTMLSelectElement','FormData'])globalThis[k]=dom.window[k]||dom.window.document;const root=document.getElementById('app'),store=new SharePointStore('https://example.sharepoint.com/sites/kitchen',new Server().request);for(const [k,v] of [['seasons',season],['suppliers',supplier],['articles',article],['offers',offer]])await store.saveMaster(k,v,undefined,'seed-'+v.id);await store.ww.initialize();const view=new KitchenView(root,store,'TEST · member@example.test');await view.start();return{dom,root,store,view};}
const set=(root,name,value)=>{root.querySelector('[name="'+name+'"]').value=value;};
test('Artikel anlegen: Name, Einheit, Lieferant, Gebinde und Preis in einem Formular',async()=>{
 const {view,root,store}=await setup();await view.action('article-new','supplier:'+supplier.id);
 const form=root.querySelector('form[data-form=master]');assert.equal(form.querySelector('[name=supplierId]').value,supplier.id);
 set(root,'name','Bockwurst');set(root,'unit','Stück');set(root,'packName','Packung');set(root,'packSize','10');set(root,'priceNet','7,90');
 await view.save(form);const state=await store.load();const created=state.articles.find(a=>a.value.name==='Bockwurst').value;
 const made=state.offers.find(o=>o.value.articleId===created.id).value;
 assert.equal(made.supplierId,supplier.id);assert.equal(made.packName,'Packung');assert.equal(made.packSize,10);assert.equal(made.priceNet,7.9);assert.match(made.priceDate,/^\d{4}-\d{2}-\d{2}$/);
});
test('Artikel ohne Lieferant bleibt möglich, Preis ohne Lieferant wird erklärt',async()=>{
 const {view,root,store}=await setup();await view.action('article-new','');set(root,'name','Servietten');set(root,'unit','Packung');
 set(root,'priceNet','3');await assert.rejects(()=>view.save(root.querySelector('form[data-form=master]')),/bitte auch den Lieferanten wählen/);
 set(root,'priceNet','');await view.save(root.querySelector('form[data-form=master]'));
 const state=await store.load();const made=state.articles.find(a=>a.value.name==='Servietten');assert.ok(made);assert.equal(state.offers.filter(o=>o.value.articleId===made.value.id).length,0);
});
test('Lieferant: keine Prüf-Felder mehr, gespeicherte Angaben bleiben erhalten, Hinweis nur bei fehlendem Kontakt',async()=>{
 const {view,root,store}=await setup();const old=(await store.load()).suppliers[0];
 await store.saveMaster('suppliers',{...old.value,reviewStatus:'geprueft',reviewDate:'2026-11-02',reviewReason:'ok'},old,'review');await view.action('reload','');
 await view.action('supplier-edit',supplier.id);const form=root.querySelector('form[data-form=master]');
 assert.doesNotMatch(form.textContent,/Angaben geprüft|Prüfdatum|Prüfvermerk/);set(root,'contactPerson','Frau Muster');await view.save(form);
 const saved=(await store.load()).suppliers[0].value;assert.equal(saved.contactPerson,'Frau Muster');assert.equal(saved.reviewStatus,'geprueft');assert.equal(saved.reviewDate,'2026-11-02');
 assert.equal(supplierHint({...saved,method:'Telefon',phone:''}),'Telefonnummer fehlt');assert.equal(supplierHint({...saved,method:'Telefon',phone:'07633 1'}),'');
});
test('Preisliste: Tabelle mit allen Artikeln des Lieferanten, gespeichert wird nur die geänderte Zeile',async()=>{
 const {view,root,store}=await setup();const second={...article,id:'art2',name:'Apfelschorle'};await store.saveMaster('articles',second,undefined,'a2');
 await store.saveMaster('offers',{...offer,id:'off2',articleId:'art2',priceNet:11},undefined,'o2');await view.action('reload','');
 await view.action('nav','suppliers');assert.match(root.querySelector('.supplier-profile .price-table').textContent,/Apfelschorle[\s\S]*11,00/);
 await view.action('supplier-prices',supplier.id);const rows=[...root.querySelectorAll('form[data-form=ww-prices] tr[data-line]')];assert.equal(rows.length,2);
 const apple=rows.find(r=>/Apfelschorle/.test(r.textContent));assert.equal(apple.querySelector('[name=priceNet]').value,'11,00');apple.querySelector('[name=priceNet]').value='12,40';
 await view.save(root.querySelector('form[data-form=ww-prices]'));
 const lists=(await store.ww.load(season.id)).records.filter(r=>r.value.kind==='prices');assert.equal(lists.length,1);assert.deepEqual(lists[0].value.lines.map(l=>[l.offerId,l.priceNet]),[['off2',12.4]]);
 assert.ok(root.querySelector('.supplier-profile'),'nach dem Speichern zurück bei den Lieferanten');assert.match(root.querySelector('.price-table').textContent,/12,40/);
 await view.action('supplier-prices',supplier.id);await assert.rejects(()=>view.save(root.querySelector('form[data-form=ww-prices]')),/Es wurde kein Preis geändert/);
});
test('Einsatztage gelten als Liefertage, auch ohne eigene Liefertermine',()=>{
 const base=(kind,id,extra)=>({id,kind,scope:'s27',at:'2026-11-16T10:00:00Z',by:'x',confirmed:true,...extra});
 const state={seasons:[{value:{id:'s27',name:'Fasnet 2027',year:2027,archived:false,operatingDays:['2027-02-04','2027-02-05','2027-02-08']}}],
  suppliers:[{value:{id:'sup',name:'Metzger',phone:'1',email:'',method:'Telefon',customerNumber:'',note:'',active:true}}],
  articles:[{value:{id:'wurst',name:'Bockwurst',unit:'Stück',active:true,category:''}}],
  offers:[{value:{id:'o1',articleId:'wurst',supplierId:'sup',code:'',packName:'Packung',packSize:10,priceNet:7.9,priceDate:'2026-11-01',deposit:null,note:'',active:true}}],
  orders:[],counts:[],inventories:[],
  ww:{ready:true,records:[{value:base('recipe','r1',{scope:'global',familyId:'r1',name:'Bockwurst',category:'Speise',yield:1,salePriceGross:4,ingredients:[{articleId:'wurst',quantity:1,unit:'Stück'}]})}]}};
 const plan=base('plan','p',{area:'Küche',name:'Freitag',date:'2027-02-05',note:'',lines:[{recipeId:'r1',portions:95}]});
 assert.deepEqual(deliverySlots(state,'s27').map(s=>s.date),['2027-02-04','2027-02-05','2027-02-08']);
 const options=deliveryOptions(plan,state);assert.deepEqual(options.map(s=>s.date),['2027-02-04','2027-02-05']);
 const orders=planOrders(plan,options[0],state,[{articleId:'wurst',offerId:'o1',stockUse:0,incomingUse:0}]);
 assert.equal(orders.length,1);assert.equal(orders[0].deliveryDate,'2027-02-04');assert.equal(orders[0].lines[0].quantity,10);
});
test('Saison: Einsatztage per Datumsfeld statt Textzeilen',()=>{
 const html=masterForm({kind:'seasons',id:'s',value:{id:'s',name:'Fasnet 2027',year:2027,archived:false,operatingDays:['2027-02-04']}},{seasons:[],suppliers:[],articles:[],offers:[],orders:[],counts:[]});
 assert.match(html,/<input type="date" name="operatingDays" value="2027-02-04"/);assert.doesNotMatch(html,/JJJJ-MM-TT/);assert.match(html,/data-action="day-add"/);
});
