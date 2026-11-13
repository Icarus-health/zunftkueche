// 1.19.0: phone layout. Tab bar instead of a menu button, one highlighted next step, delivery days as a switch, tasks take the whole screen.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {KitchenView} from '../src/kitchen/view.ts';
import {sidebar,dashboard} from '../src/kitchen/workspace.ts';
import {deliveryShortLabels} from '../src/kitchen/order-sheet.ts';
import {segmented} from '../src/kitchen/markup.ts';
import {workspace,stored,order,season,inventory} from './support/kitchen-data.mjs';

const page=html=>new JSDOM('<div id="app">'+html+'</div>').window.document.getElementById('app');
const draft=(id,extra={})=>({...structuredClone(order),id,status:'Entwurf',recordedBy:null,recordedAt:null,...extra});

test('navigation marks four areas for the tab bar and keeps the rest behind "Mehr"',()=>{
 const root=page(sidebar(workspace(),season,'Küche',season.id,'heute'));
 const buttons=[...root.querySelectorAll('nav button[data-action=nav]')];
 assert.deepEqual(buttons.filter(b=>b.dataset.tab==='main').map(b=>b.dataset.id),['heute','orders','stock','planning']);
 assert.deepEqual(buttons.filter(b=>b.dataset.tab==='more').map(b=>b.dataset.id),['articles','suppliers','reports','management']);
 assert.equal(root.querySelector('nav .nav-short').textContent,'Speisen');
 assert.equal(root.querySelector('nav .nav-long').textContent,'Speisen & Getränke','the full name stays for desktop and screen readers');
 const more=root.querySelector('nav button.nav-more');
 assert.equal(more.dataset.action,'mobile-menu');assert.equal(more.getAttribute('aria-expanded'),'false');assert.equal(more.classList.contains('is-current'),false);
 assert.equal(root.querySelector('nav button.nav-reload').dataset.action,'reload');
 assert.equal(root.querySelector('.mobile-menu'),null,'the old menu button is gone');
});

test('"Mehr" is marked while one of its areas is open',()=>{
 for(const view of ['articles','suppliers','reports','management'])assert.ok(page(sidebar(workspace(),season,'Küche',season.id,view)).querySelector('.nav-more.is-current'),view);
 assert.equal(page(sidebar(workspace(),season,'Küche',season.id,'orders')).querySelector('.nav-more.is-current'),null);
});

test('the overview highlights exactly one next step and no other button is primary',()=>{
 const s=workspace();s.orders=[stored(draft('a')),stored(draft('b'))];s.ww={ready:true,records:[]};
 const root=page(dashboard(s,season,'Küche','2027-02-01'));
 const card=root.querySelector('.next-step');
 assert.equal(card.querySelector('h2').textContent,'2 Bestellentwürfe vorbereiten und prüfen');
 assert.equal(card.querySelector('button').dataset.action,'dashboard-orders');
 assert.equal(root.querySelectorAll('button.primary').length,1);
 assert.equal(root.querySelector('.calm-notices').textContent.includes('Bestellentwürfe'),false,'the highlighted task is not repeated below');
 assert.deepEqual([...root.querySelectorAll('.workflow-start h2')].map(x=>x.textContent),['Karte und Bedarf','Bestellrunde','Warenannahme','Abendabschluss']);
 assert.equal(root.querySelector('.workflow-start button[data-action=ww-open]').dataset.id,'recipes');
});

test('work that is due today comes before drafts: saved count first',()=>{
 const s=workspace();s.orders=[stored(draft('a'))];s.inventories=[stored({...inventory,status:'Entwurf'})];
 const root=page(dashboard(s,season,'Küche','2027-02-01'));
 assert.equal(root.querySelector('.next-step h2').textContent,'Gespeicherte Zählung fortsetzen');
 assert.equal(root.querySelector('.next-step button').dataset.action,'inventory-edit');
 assert.match(root.querySelector('.calm-notices').textContent,/1 Bestellentwurf vorbereiten und prüfen/,'the draft stays listed as a further open point');
});

test('an overview without open points shows no next-step card, an archived season never does',()=>{
 const empty=workspace();empty.orders=[];empty.counts=[];empty.inventories=[];
 assert.equal(page(dashboard(empty,season,'Küche','2027-02-01')).querySelector('.next-step'),null);
 const s=workspace();s.orders=[stored(draft('a'))];
 assert.equal(page(dashboard(s,{...season,archived:true},'Küche','2027-02-01')).querySelector('.next-step'),null);
});

test('delivery days get short labels for the switch',()=>{
 const slot=(id,time,date=null)=>({id,date,time,place:'Küche'});
 assert.deepEqual(deliveryShortLabels([slot('a','Mittwoch – Datum prüfen'),slot('b','Freitag 17:00 – Datum prüfen'),slot('c','Samstag 19:30')]),['Mi','Fr 17 Uhr','Sa 19:30 Uhr']);
 assert.deepEqual(deliveryShortLabels([slot('a','','2027-02-10'),slot('b','17:00','2027-02-12')]),['Mi 10.2.','Fr 12.2. 17 Uhr']);
 assert.deepEqual(deliveryShortLabels([slot('a',''),slot('b','nach Absprache')]),['Termin 1','Termin 2']);
 assert.deepEqual(deliveryShortLabels([slot('a','Freitag'),slot('b','Freitag')]),['1 · Fr','2 · Fr'],'equal labels are numbered');
});

test('the switch is a radio group with a spoken long name per option',()=>{
 const root=page(segmented('deliveryView','Liefertag',[['all','Alle','Alle Liefertage'],['w','Mi','Termin 1 · Mittwoch (Datum offen)']],'all'));
 const radios=[...root.querySelectorAll('input[type=radio][name=deliveryView]')];
 assert.deepEqual(radios.map(r=>r.value),['all','w']);assert.equal(radios[0].checked,true);assert.equal(radios[1].checked,false);
 assert.equal(radios[1].getAttribute('aria-label'),'Termin 1 · Mittwoch (Datum offen)');
 assert.equal(root.querySelector('legend').textContent,'Liefertag');
});

function live(state){
 const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test/'});
 for(const name of ['document','Element','HTMLFormElement','HTMLSelectElement','HTMLInputElement','FormData'])globalThis[name]=dom.window[name]||dom.window.document;
 const root=document.getElementById('app');
 return {dom,root,view:new KitchenView(root,{testMode:false,load:async()=>state},'TEST Person')};
}

test('a task with its own back button switches the layout to task mode, lists do not',async()=>{
 const s=workspace();s.orders=[stored(order)];
 const {root,view}=live(s);await view.start();
 assert.equal(root.querySelector('.app-layout').classList.contains('task-mode'),false,'overview keeps header and tab bar');
 await view.action('inventory-new','');
 assert.equal(root.querySelector('.app-layout').classList.contains('task-mode'),true,'the evening count takes the whole screen');
 await view.action('cancel','');
 assert.equal(root.querySelector('.app-layout').classList.contains('task-mode'),false);
});

test('an order sheet with several delivery days offers the switch and hides the other days',async()=>{
 const deliveries=[{id:'wed',date:null,time:'Mittwoch',place:'Küche'},{id:'fri',date:null,time:'Freitag 17:00',place:'Küche'}];
 const o=draft('order',{deliveries});o.lines=o.lines.map(l=>({...l,schedule:{wed:1,fri:2}}));
 const s=workspace();s.orders=[stored(o)];
 const {dom,root,view}=live(s);await view.start();await view.action('order-edit','order');
 assert.deepEqual([...root.querySelectorAll('.segmented label')].map(l=>l.textContent),['Alle','Mi','Fr 17 Uhr']);
 const fri=root.querySelector('input[name=deliveryView][value=fri]');fri.checked=true;fri.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
 assert.deepEqual([...root.querySelectorAll('th[data-delivery-column]')].map(c=>c.hidden),[true,false]);
 assert.equal(root.querySelector('th[data-delivery-column=fri] .delivery-head span').textContent,'Fr 17 Uhr');
 assert.equal(root.querySelector('th[data-delivery-column=fri] button').dataset.action,'order-dates');
});
