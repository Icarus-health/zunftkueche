import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {KitchenView} from '../src/kitchen/view.ts';
const season={id:'season',name:'2027',year:2027,archived:false};
const article={id:'article',name:'Wasser',unit:'Flasche',category:'',active:true};
const stored=value=>({itemId:1,etag:'"1"',operationId:'seed',value});
function setup(store){const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test/'});for(const name of ['document','Element','HTMLFormElement','HTMLSelectElement','FormData'])globalThis[name]=dom.window[name]||dom.window.document;const root=document.getElementById('app');const view=new KitchenView(root,store,'Testperson');return {view,root};}
function state(){return {seasons:[stored(season)],suppliers:[],articles:[stored(article)],offers:[],orders:[],counts:[]};}
test('uncertain count saves freeze fields and retry the identical timestamp and payload',async()=>{
 const workspace=state(),attempts=[];let fail=true;const store={testMode:false,load:async()=>workspace,saveMaster:async(kind,value)=>{attempts.push(structuredClone(value));if(fail){fail=false;throw new Error('Verbindung unterbrochen');}workspace.counts=[stored(value)];}};
 const {view,root}=setup(store);await view.start();await view.action('count-new','');const form=root.querySelector('form');form.querySelector('[name=articleId]').value='article';form.querySelector('[name=quantity]').value='2';await view.save(form);
 assert.equal(root.querySelector('[name=quantity]').disabled,true);assert.ok(root.querySelector('[data-action=save-retry]'));
 await new Promise(resolve=>setTimeout(resolve,5));await view.action('save-retry','');assert.deepEqual(attempts[0],attempts[1]);assert.equal(workspace.counts.length,1);assert.match(root.textContent,/2 Flasche/);
});
test('a failed import retains its row identities and cannot restart preview against stale masters',async()=>{
 const workspace=state(),ids=[];let calls=0;const store={testMode:false,load:async()=>workspace,saveMaster:async(kind,value)=>{ids.push(value.id);if(++calls===2)throw new Error('Verbindung unterbrochen');workspace.articles.push(stored(value));}};
 const {view,root}=setup(store);await view.start();await view.action('import','articles');root.querySelector('textarea').value='Name;Einheit;Kategorie\nMehl;kg;\nZucker;kg;';await view.previewImport();assert.match(root.querySelector('textarea').value,/Mehl/);await view.applyImport();assert.equal(root.querySelector('[data-action=import-preview]').disabled,true);await assert.rejects(view.previewImport(),/Übernahme|Import/);await view.applyImport();assert.equal(workspace.articles.filter(a=>a.value.name==='Mehl').length,1);assert.equal(ids[1],ids[2]);
});
test('CSV validation keeps pasted text editable for correction',async()=>{
 const store={testMode:false,load:async()=>state()};const {view,root}=setup(store);await view.start();await view.action('import','articles');const raw='Name;Einheit;Kategorie\nMehl;;';root.querySelector('textarea').value=raw;await view.previewImport();assert.equal(root.querySelector('textarea').value,raw);assert.equal(root.querySelector('textarea').disabled,false);
});

test('recorded-order retries preserve the original audit timestamp after a lost response',async()=>{
 const workspace=state();workspace.suppliers=[stored({id:'sup',name:'Lieferant',phone:'',email:'',method:'Telefon',customerNumber:'',note:'',active:true})];workspace.offers=[stored({id:'off',articleId:'article',supplierId:'sup',code:'',packName:'Kiste',packSize:12,priceNet:null,priceDate:null,deposit:null,note:'',active:true})];
 const order={id:'o',seasonId:'season',area:'Küche',supplierId:'sup',supplierName:'Lieferant',status:'Entwurf',occasion:'Test',deliveryDate:null,method:'Telefon',note:'',sourceId:null,sourceYear:null,recordedBy:null,recordedAt:null,lines:[{id:'line',articleId:'article',offerId:'off',articleName:'Wasser',code:'',unit:'Flasche',packName:'Kiste',packSize:12,quantity:8,priceNet:null,priorPriceNet:null,priceYear:null,reviewed:true}]};workspace.orders=[stored(order)];const attempts=[];
 const store={testMode:false,load:async()=>workspace,saveOrder:async(value)=>{attempts.push(structuredClone(value));if(attempts.length===1)throw new Error('Antwort verloren');workspace.orders=[stored(value)];}};
 const {view,root}=setup(store);await view.start();await view.action('order-edit','o');await view.saveOrder(root.querySelector('form'),true,true);assert.equal(root.querySelector('[name=qty_line]').disabled,true);await new Promise(resolve=>setTimeout(resolve,5));await view.action('save-retry','');assert.deepEqual(attempts[0],attempts[1]);assert.equal(workspace.orders[0].value.status,'Bestellt');
});

test('leaving a partial import refreshes confirmed rows before creating another preview',async()=>{
 const workspace=state();let calls=0,loads=0;const store={testMode:false,load:async()=>{loads++;return structuredClone(workspace);},saveMaster:async(kind,value)=>{if(++calls===2)throw new Error('Unterbrochen');workspace.articles.push(stored(value));}};
 const {view,root}=setup(store);await view.start();await view.action('import','articles');root.querySelector('textarea').value='Name;Einheit;Kategorie\nMehl;kg;\nZucker;kg;';await view.previewImport();await view.applyImport();const before=loads;await view.action('cancel','');assert.equal(loads,before+1);await view.action('import','articles');root.querySelector('textarea').value='Name;Einheit;Kategorie\nMehl;kg;';await view.previewImport();assert.match(root.textContent,/bereits/);assert.equal(view.importItems,undefined);
});
