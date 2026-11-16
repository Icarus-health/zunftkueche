// 1.23.0: sechs Tabs und Zahnrad. Artikel bei Lieferanten, Bestand bei der Auswertung, Karte als eigener Tab.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {KitchenView} from '../src/kitchen/view.ts';
import {sidebar} from '../src/kitchen/workspace.ts';
import {workspace,stored,order} from './support/kitchen-data.mjs';
function live(state){
 const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test/kueche'});
 for(const name of ['document','Element','HTMLFormElement','HTMLSelectElement','HTMLInputElement','FormData'])globalThis[name]=dom.window[name]||dom.window.document;
 const root=document.getElementById('app');
 return {dom,root,view:new KitchenView(root,{testMode:false,load:async()=>state,ww:{load:async()=>state.ww}},'TEST Person')};
}
const season={id:'s',name:'Fasnet 2027',year:2027,archived:false};
test('Seitenleiste: sechs Tabs, Einstellungen als Zahnrad abgesetzt',()=>{
 const dom=new JSDOM(sidebar(season,'heute'));
 const ids=[...dom.window.document.querySelectorAll('nav button[data-action=nav]')].map(b=>b.dataset.id);
 assert.deepEqual(ids,['heute','orders','suppliers','planning','menu','reports','management']);
 assert.ok(dom.window.document.querySelector('nav button.nav-settings[data-id=management]'));
 for(const [view,tab] of [['articles','suppliers'],['stock','reports'],['menu','menu']])
  assert.equal(new JSDOM(sidebar(season,view)).window.document.querySelector('[aria-current=page]').dataset.id,tab,view);
});
test('Abschnitte: Lieferanten|Artikel und Zahlen|Bestand wechseln innerhalb des Tabs',async()=>{
 const {root,view}=live(workspace());await view.start();
 await view.action('nav','suppliers');
 assert.deepEqual([...root.querySelectorAll('.seg-tabs button')].map(b=>b.textContent),['Lieferanten','Artikel']);
 await view.action('nav','articles');
 assert.equal(root.querySelector('main h1').textContent,'Artikel');assert.equal(root.querySelector('.seg-tabs [aria-current=page]').textContent,'Artikel');
 assert.equal(root.querySelector('nav [data-id=suppliers]').getAttribute('aria-current'),'page');
 await view.action('nav','reports');
 assert.deepEqual([...root.querySelectorAll('.seg-tabs button')].map(b=>b.textContent),['Zahlen','Bestand']);
 await view.action('nav','stock');
 assert.equal(root.querySelector('main h1').textContent,'Bestand');
});
test('Je Seite ein Hauptknopf, Seltenes im Mehr-Menü',async()=>{
 const s=workspace();s.orders=[stored(order)];const {root,view}=live(s);await view.start();
 for(const id of ['orders','suppliers','articles']){
  await view.action('nav',id);
  assert.equal(root.querySelectorAll('.page-heading button.primary').length,1,id);
  assert.ok(root.querySelector('.page-heading details.more-menu'),id+' hat ein Mehr-Menü');
 }
 await view.action('nav','articles');
 assert.ok(root.querySelector('.more-menu [data-action=import]'),'CSV-Import liegt im Mehr-Menü');
});
test('Zurück steht oben links in derselben Zeile wie Bereich und Saison',async()=>{
 const s=workspace();s.orders=[stored(order)];const {root,view}=live(s);await view.start();
 await view.action('order-open',order.id);
 const bar=root.querySelector('main>.topbar');
 assert.equal(bar.firstElementChild.className,'back-link');assert.match(bar.firstElementChild.textContent,/Bestellungen/);
 assert.ok(bar.lastElementChild.classList.contains('context-switch'));
});
test('Tab Karte zeigt die Karte der Saison, auch nach Abbrechen, und ist keine Sackgasse',async()=>{
 const s=workspace();s.ww={ready:true,records:[]};
 const {root,view}=live(s);await view.start();
 await view.action('nav','menu');
 assert.equal(root.querySelector('main h1').textContent,'Karte');assert.ok(root.querySelector('form[data-form=menu]'));
 assert.equal(root.querySelector('nav [data-id=menu]').getAttribute('aria-current'),'page');
 assert.equal(root.querySelector('[data-action=menu-pdf]'),null,'leere Karte: kein Export');
 await view.action('menu-preset','');
 assert.ok(root.querySelector('[data-action=menu-pdf]'),'mit Einträgen: Export da');
 await view.action('nav','orders');
 assert.match(root.querySelector('[data-status]').textContent,/Ungespeicherte/);
 await view.action('cancel','');
 assert.ok(root.querySelector('form[data-form=menu]'),'Abbrechen lädt die gespeicherte Karte neu');
 await view.action('nav','orders');assert.equal(root.querySelector('main h1').textContent,'Bestellungen');
});
test('Gespeicherter Entwurf: „Als bestellt markieren“ fragt nach Mengen und Bestellung, ohne auf ein Häkchen zu verweisen',async()=>{
 const {JSDOM}=await import('jsdom');const {KitchenView}=await import('../src/kitchen/view.ts');const {SharePointStore}=await import('../src/kitchen/sharepoint.ts');const {Server}=await import('./support/fake-sharepoint.mjs');
 const d=await import('./support/kitchen-data.mjs');
 const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test'});for(const k of ['document','Element','HTMLInputElement','HTMLTextAreaElement','HTMLFormElement','HTMLSelectElement','FormData'])globalThis[k]=dom.window[k]||dom.window.document;
 const root=document.getElementById('app'),store=new SharePointStore('https://example.sharepoint.com/sites/kitchen',new Server().request);
 for(const [k,v] of [['seasons',d.season],['suppliers',d.supplier],['articles',d.article],['offers',d.offer]])await store.saveMaster(k,v,undefined,'seed-'+v.id);
 await store.saveOrder({...d.order,status:'Entwurf',deliveryDate:'2027-02-05',lines:[{...d.line,reviewed:false}]},undefined,'seed-order');
 const view=new KitchenView(root,store,'TEST · member@example.test');await view.start();
 await view.action('order-open',d.order.id);await view.action('order-mark',d.order.id);
 const box=root.querySelector('[data-order-confirm]');assert.ok(box,'die Frage erscheint');assert.match(box.textContent,/Stimmen Mengen und Gebinde, und ist die Bestellung beim Lieferanten aufgegeben\?/);
 await view.action('order-mark-confirm',d.order.id);const saved=(await store.load()).orders[0].value;
 assert.equal(saved.status,'Bestellt');assert.ok(saved.lines.every(l=>l.reviewed));
});
