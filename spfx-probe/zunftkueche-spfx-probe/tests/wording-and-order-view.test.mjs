// 1.19.0: one name per thing, and the read-only order view uses the same delivery-day switch as the order sheet.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {KitchenView} from '../src/kitchen/view.ts';
import {sidebar,dashboard,stockOverview} from '../src/kitchen/workspace.ts';
import {inventoryForm} from '../src/kitchen/operation-forms.ts';
import {deliveryMatrix} from '../src/kitchen/supplier-forms.ts';
import {workspace,stored,order,season,inventory} from './support/kitchen-data.mjs';

const page=html=>new JSDOM('<div id="app">'+html+'</div>').window.document.getElementById('app');
const draft=(id,extra={})=>({...structuredClone(order),id,status:'Entwurf',recordedBy:null,recordedAt:null,...extra});
function live(state){
 const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test/'});
 for(const name of ['document','Element','HTMLFormElement','HTMLSelectElement','HTMLInputElement','FormData'])globalThis[name]=dom.window[name]||dom.window.document;
 const root=document.getElementById('app');
 return {dom,root,view:new KitchenView(root,{testMode:false,load:async()=>state},'TEST Person')};
}

test('the evening count has one name: "Abendabschluss" on the overview, in the stock area and in the sheet',()=>{
 const s=workspace();s.orders=[];s.inventories=[stored({...inventory,status:'Entwurf'})];
 const stock=page(stockOverview(s,season,'Küche',''));
 assert.equal(stock.querySelector('.page-heading button').textContent,'Abendabschluss starten');
 assert.match(stock.querySelector('.resume strong').textContent,/^1 begonnener Abendabschluss$/);
 const home=page(dashboard(s,season,'Küche','2027-02-01'));
 assert.equal(home.querySelector('.next-step button').textContent,'Abendabschluss fortsetzen');
 const sheet=page(inventoryForm({...inventory,status:'Entwurf'}));
 assert.equal(sheet.querySelector('h1').textContent,'Abendabschluss');
 assert.equal(sheet.querySelector('[data-action=inventory-finish]').textContent,'Weiter zur Prüfung','same wording as in the order sheet');
 for(const root of [stock,home,sheet])assert.doesNotMatch(root.textContent,/Zählliste|Zählentw/,'the old second and third name are gone');
});

test('the overview calls the recipes area by the name the navigation uses',()=>{
 const s=workspace();s.ww={ready:true,records:[]};
 const home=page(dashboard(s,season,'Küche','2027-02-01')),nav=page(sidebar(s,season,'Küche',season.id,'heute'));
 const names=[...home.querySelectorAll('.workflow-start h2')].map(x=>x.textContent);
 assert.equal(names[0],'Speisen & Getränke');
 assert.equal(nav.querySelector('button[data-id=planning] .nav-long').textContent,names[0]);
});

test('read-only order view: delivery days are a switch, headers are short, and choosing a day hides the others',async()=>{
 const deliveries=[{id:'wed',date:null,time:'Mittwoch – Datum prüfen',place:'Küche'},{id:'fri',date:null,time:'Freitag 17:00',place:'Küche'}];
 const o=draft('order',{deliveries});o.lines=o.lines.map(l=>({...l,schedule:{wed:1,fri:2}}));
 const matrix=page(deliveryMatrix(o,false));
 assert.equal(matrix.querySelector('select[name=deliveryView]'),null,'no dropdown any more');
 assert.deepEqual([...matrix.querySelectorAll('.segmented label')].map(l=>l.textContent),['Alle','Mi','Fr 17 Uhr']);
 assert.ok(matrix.querySelector('table.delivery-plan'));
 assert.deepEqual([...matrix.querySelectorAll('thead .delivery-day>span')].map(x=>x.textContent),['Mi','Fr 17 Uhr']);
 assert.match(matrix.querySelector('thead .delivery-day small').textContent,/^Datum offen · Mittwoch – Datum prüfen · Küche$/);
 const s=workspace();s.orders=[stored(o)];
 const {dom,root,view}=live(s);await view.start();await view.action('order-open','order');
 const columns=()=>[...root.querySelectorAll('thead th[data-delivery-column]')].map(c=>c.hidden);
 assert.deepEqual(columns(),[false,false],'all days at first on a wide screen');
 const fri=root.querySelector('input[name=deliveryView][value=fri]');fri.checked=true;fri.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
 assert.deepEqual(columns(),[true,false],'the switch works in the read-only view');
 assert.deepEqual([...root.querySelectorAll('tbody td[data-delivery-column]')].map(c=>c.hidden),[true,false]);
});

test('an article without a supplier number keeps its text; the filler can be hidden on the phone',()=>{
 const o=draft('order',{deliveries:[{id:'wed',date:null,time:'Mittwoch',place:'Küche'}]});o.lines=o.lines.map(l=>({...l,code:'',schedule:{wed:1}}));
 const small=page(deliveryMatrix(o,false)).querySelector('tbody th small');
 assert.match(small.textContent,/^Ohne Artikelnummer · /);
 assert.equal(small.querySelector('.no-code').textContent,'Ohne Artikelnummer · ');
});
