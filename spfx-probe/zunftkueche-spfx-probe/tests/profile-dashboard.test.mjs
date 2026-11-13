import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SharePointStore} from '../src/kitchen/sharepoint.ts';
import {masterForm} from '../src/kitchen/forms.ts';
import {dashboard} from '../src/kitchen/workspace.ts';
import {Server} from './support/fake-sharepoint.mjs';
import {season,supplier,article} from './support/kitchen-data.mjs';
import {KitchenView} from '../src/kitchen/view.ts';
import {JSDOM} from 'jsdom';

test('supplier profile persists optional contact fields and fences older clients',async()=>{
 const server=new Server(), store=new SharePointStore('https://example.sharepoint.com/sites/kitchen',server.request);
 const saved=await store.saveMaster('suppliers',{...supplier,contactPerson:'Ada',address:'Markt 1',note:'Altbestand bleibt'},undefined,'profile');
 const item=JSON.parse(server.lists.get('ZK_V1_Lieferanten')[0].ZKData);
 assert.equal(item.schema,4); assert.equal((await store.load()).suppliers[0].value.address,'Markt 1');
 assert.match(masterForm({kind:'suppliers',id:saved.value.id,value:saved.value},{articles:[],offers:[],suppliers:[],seasons:[],orders:[],counts:[]}),/Ansprechpartner/);
 assert.match(masterForm({kind:'suppliers',id:saved.value.id,value:saved.value},{articles:[],offers:[],suppliers:[],seasons:[],orders:[],counts:[]}),/Altbestand bleibt/);
});

test('dashboard distinguishes uncounted articles from actual counted stock',()=>{
 const stored=value=>({itemId:1,etag:'"1"',operationId:'x',value});
 const state={seasons:[stored(season)],suppliers:[],articles:[stored(article)],offers:[],orders:[],counts:[]};
 const html=dashboard(state,season,'Küche'); assert.match(html,/0 von 1 Artikeln zuletzt gezählt/);assert.doesNotMatch(html,/0 kg|0 Flasche/);
});

test('article list searches suppliers and retains multiple independently editable offers',async()=>{
 const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test/'});for(const name of ['document','Element','HTMLFormElement','HTMLSelectElement','HTMLInputElement','FormData'])globalThis[name]=dom.window[name]||dom.window.document;
 const stored=value=>({itemId:1,etag:'"1"',operationId:'x',value});const offer=(id,supplierId)=>stored({id,articleId:article.id,supplierId,code:'',packName:'Kiste',packSize:12,priceNet:null,priceDate:null,deposit:null,note:'',active:true});
 const other={...supplier,id:'other',name:'Anderer'};const state={seasons:[stored(season)],suppliers:[stored(supplier),stored(other)],articles:[stored(article)],offers:[offer('one',supplier.id),offer('two','other')],orders:[],counts:[]};
 const root=document.getElementById('app'),view=new KitchenView(root,{testMode:false,load:async()=>state},'Test');await view.start();await view.action('nav','articles');
 const row=root.querySelector('details[data-search]');assert.ok(row);assert.equal(row.querySelectorAll('[data-action=offer-edit]').length,2);assert.match(row.dataset.search,/Anderer/);
 const search=root.querySelector('[name=workspaceSearch]');search.value='nicht vorhanden';search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.equal(row.hidden,true);
});
