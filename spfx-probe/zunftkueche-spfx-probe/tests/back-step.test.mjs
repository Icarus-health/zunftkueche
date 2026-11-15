// 1.19.0: browser back and the back gesture go one step up inside the app. One own history entry exists while the app
// shows anything but the overview; unsaved input is never dropped by going back.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {KitchenView} from '../src/kitchen/view.ts';
import {workspace,stored,order} from './support/kitchen-data.mjs';

const draft=(id,extra={})=>({...structuredClone(order),id,status:'Entwurf',recordedBy:null,recordedAt:null,...extra});
function live(state){
 const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test/kueche'});
 for(const name of ['document','Element','HTMLFormElement','HTMLSelectElement','HTMLInputElement','FormData'])globalThis[name]=dom.window[name]||dom.window.document;
 const root=document.getElementById('app');
 return {dom,root,history:dom.window.history,view:new KitchenView(root,{testMode:false,load:async()=>state},'TEST Person')};
}
const own=history=>history.state?.zunftkueche===true;
const settle=dom=>new Promise(resolve=>dom.window.setTimeout(resolve,20));
async function back(dom){dom.window.history.back();await settle(dom);}
const title=root=>root.querySelector('main h1')?.textContent;

test('one own history entry while the app is away from the overview, none on the overview',async()=>{
 const {dom,root,history,view}=live(workspace());await view.start();
 const base=history.length;
 assert.equal(own(history),false,'the overview adds nothing');
 await view.action('nav','stock');
 assert.equal(history.length,base+1);assert.equal(own(history),true);
 await view.action('inventory-new','');await view.action('cancel','');await view.action('nav','orders');
 assert.equal(history.length,base+1,'going deeper or sideways does not stack more entries');
 await view.action('nav','heute');await settle(dom);
 assert.equal(own(history),false,'returning to the overview inside the app takes the entry back');
 assert.equal(title(root),'Übersicht','taking the entry back does not move the app');
 assert.equal(dom.window.location.pathname,'/kueche','the address never changes');
});

test('back closes the open task, the next back returns to the overview, the one after leaves the app alone',async()=>{
 const {dom,root,history,view}=live(workspace());await view.start();
 await view.action('nav','stock');await view.action('inventory-new','');
 assert.equal(title(root),'Abendabschluss');
 await back(dom);
 assert.equal(title(root),'Bestand','the task is closed, the area stays');
 assert.equal(own(history),true,'still away from the overview, so the next back is caught too');
 assert.equal(document.activeElement,root.querySelector('main'));
 await back(dom);
 assert.equal(title(root),'Übersicht');assert.equal(own(history),false);
 await view.action('nav','orders');await back(dom);
 assert.equal(title(root),'Übersicht','back from another area goes to the overview');
});

test('back never drops unsaved input',async()=>{
 const {dom,root,history,view}=live(workspace());await view.start();
 await view.action('nav','stock');await view.action('inventory-new','');
 const field=root.querySelector('form[data-form=inventory] input[name^=loose_]');
 field.value='4';field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 await back(dom);
 assert.equal(title(root),'Abendabschluss','the count sheet stays open');
 assert.equal(root.querySelector('form[data-form=inventory] input[name^=loose_]').value,'4');
 assert.match(root.querySelector('[data-status]').textContent,/Ungespeicherte Eingaben/);
 assert.equal(own(history),true,'the entry is back in place for the next attempt');
 await view.action('cancel','');await back(dom);
 assert.equal(title(root),'Übersicht','after an explicit cancel, back works again');
});

test('back from the order check returns to the quantities',async()=>{
 const deliveries=[{id:'wed',date:null,time:'Mittwoch',place:'Küche'}];
 const o=draft('order',{deliveries});o.lines=o.lines.map(l=>({...l,schedule:{wed:1}}));
 const s=workspace();s.orders=[stored(o)];
 const {dom,root,view}=live(s);await view.start();
 await view.action('order-edit','order');await view.action('order-review','');
 assert.ok(root.querySelector('form.order-review'),'check is open');
 await back(dom);
 assert.ok(root.querySelector('form.order-sheet'),'quantities are shown again');
 assert.equal(root.querySelector('form.order-review'),null);
});

test('forward onto the own entry and foreign history changes do not move the app',async()=>{
 const {dom,root,history,view}=live(workspace());await view.start();
 await view.action('nav','stock');await back(dom);
 assert.equal(title(root),'Übersicht');
 history.forward();await settle(dom);
 assert.equal(title(root),'Übersicht','forward is ignored');assert.equal(own(history),true);
 await back(dom);
 assert.equal(title(root),'Übersicht','nothing left to step back from');
 dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate',{state:{other:1}}));
 assert.equal(title(root),'Übersicht');
});

test('going back to the overview clears the last status message like the navigation does',async()=>{
 const {dom,root,view}=live(workspace());await view.start();
 await view.action('nav','stock');await view.action('inventory-new','');await view.action('cancel','');
 view.info='Entwurf gespeichert.';view.render();
 assert.match(root.querySelector('[data-status]').textContent,/Entwurf gespeichert/);
 await back(dom);
 assert.equal(title(root),'Übersicht');assert.equal(root.querySelector('[data-status]').textContent,'');
});
