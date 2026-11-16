// 1.18.5: feedback where the person is working, new pages start at the top, stock shortcut opens its form.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {KitchenView} from '../src/kitchen/view.ts';
import {SharePointStore} from '../src/kitchen/sharepoint.ts';
import {Server} from './support/fake-sharepoint.mjs';
import {season,supplier,article,offer,line} from './support/kitchen-data.mjs';

/** layout: what the browser would report. jsdom has no layout, so the tests state it explicitly. */
async function setup(layout={statusTop:20,pageTop:0,covered:false}){
 const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test'});
 for(const name of ['document','Element','HTMLInputElement','HTMLTextAreaElement','HTMLFormElement','HTMLSelectElement','FormData','DOMParser'])globalThis[name]=dom.window[name]||dom.window.document;
 const scrolled=[];
 dom.window.HTMLElement.prototype.scrollIntoView=function(options){scrolled.push({target:this.getAttribute('data-status')!==null?'status':this.getAttribute('data-inline-status')!==null?'inline':this.className,block:options?.block});};
 dom.window.HTMLElement.prototype.getBoundingClientRect=function(){
  if(this.hasAttribute('data-status'))return {top:layout.statusTop,left:0,width:600,height:40};
  if(this.classList.contains('workspace-main'))return {top:layout.pageTop,left:0,width:600,height:2000};
  return {top:0,left:0,width:0,height:0};
 };
 dom.window.document.elementFromPoint=(x,y)=>layout.covered||y<0?null:dom.window.document.querySelector('[data-status]');
 const root=document.getElementById('app'),server=new Server(),store=new SharePointStore('https://example.sharepoint.com/sites/kitchen',server.request);
 for(const[k,v]of [['seasons',season],['suppliers',supplier],['articles',article],['offers',offer]])await store.saveMaster(k,v,undefined,'seed-'+v.id);
 await store.initialize();await store.ww.initialize();
 const view=new KitchenView(root,store,'TEST Person');await view.start();
 const click=async element=>{element.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,20));};
 return {view,root,store,dom,layout,scrolled,click};
}
const draft={id:'draft',seasonId:season.id,area:'Küche',supplierId:supplier.id,supplierName:supplier.name,status:'Entwurf',occasion:'Zunftabend',deliveryDate:null,method:'Telefon',note:'',sourceId:null,sourceYear:null,recordedBy:null,recordedAt:null,lines:[{...line,quantity:null,reviewed:false}]};

test('the stock page shortcut opens the movement form and cancelling returns to the stock page',async()=>{
 const {view,root,click}=await setup();
 await view.action('nav','stock');
 const shortcut=root.querySelector('[data-action=ww-new][data-id=movement]');
 assert.ok(shortcut,'shortcut is offered on the stock page');
 await click(shortcut);
 const form=root.querySelector('form[data-form=ww-movement]');
 assert.ok(form,'movement form is shown');
 assert.equal(root.querySelector('[data-id=stock]').getAttribute('aria-current'),'page');
 await click(form.querySelector('[data-action=ww-cancel]'));
 assert.equal(root.querySelector('form[data-form=ww-movement]'),null);
 assert.equal(root.querySelector('main h1').textContent,'Bestand');
});
test('a movement entered through the stock page shortcut is saved and shown in the journal',async()=>{
 const {view,root,store,click}=await setup();
 await view.action('nav','stock');
 await click(root.querySelector('[data-action=ww-new][data-id=movement]'));
 const form=root.querySelector('form[data-form=ww-movement]');
 form.querySelector('[name=type]').value='opening';form.querySelector('[name=quantity]').value='20';
 await view.save(form);
 const moves=(await store.ww.load(season.id)).records.filter(r=>r.value.kind==='movement');
 assert.equal(moves.length,1);assert.equal(moves[0].value.quantity,20);
 assert.match(root.querySelector('main').textContent,/Buchungsjournal/);
});
test('the journal button still opens the same form and cancelling stays in the journal',async()=>{
 const {view,root}=await setup();
 await view.action('ww-open','journal');await view.action('ww-new','movement');
 assert.ok(root.querySelector('form[data-form=ww-movement]'));
 await view.action('ww-cancel','');
 assert.match(root.querySelector('main').textContent,/Bestandsbewegungen/);
});

test('an error is repeated beside the button when the status line is scrolled out of view',async()=>{
 const {view,root,store,click}=await setup({statusTop:-1131,pageTop:-1100,covered:false});
 await store.saveOrder(draft,undefined,'seed-draft');await view.action('reload','');
 await view.action('order-open','draft');
 const mail=root.querySelector('[data-action=order-mail]');
 assert.ok(mail);
 await click(mail);
 const status=root.querySelector('[data-status]'),hint=root.querySelector('[data-inline-status]');
 assert.match(status.textContent,/fehlt eine Menge/);
 assert.equal(status.getAttribute('role'),'alert');
 assert.ok(hint,'error is repeated near the button');
 assert.equal(hint.textContent,status.textContent);
 assert.equal(hint.getAttribute('aria-hidden'),'true','screen readers hear the alert once');
 assert.ok(mail.closest('.actions').contains(hint));
});
test('a status line hidden behind the surrounding page counts as out of view',async()=>{
 const {view,root,store,click}=await setup({statusTop:30,pageTop:0,covered:true});
 await store.saveOrder(draft,undefined,'seed-draft');await view.action('reload','');
 await view.action('order-open','draft');
 await click(root.querySelector('[data-action=order-mail]'));
 assert.ok(root.querySelector('[data-inline-status]'));
});
test('no duplicate message appears while the status line is visible, and it clears with the error',async()=>{
 const {view,root,store,click,layout}=await setup();
 await store.saveOrder(draft,undefined,'seed-draft');await view.action('reload','');
 await view.action('order-open','draft');
 await click(root.querySelector('[data-action=order-mail]'));
 assert.match(root.querySelector('[data-status]').textContent,/fehlt eine Menge/);
 assert.equal(root.querySelector('[data-inline-status]'),null);
 layout.statusTop=-900;
 await click(root.querySelector('[data-action=order-mail]'));
 assert.ok(root.querySelector('[data-inline-status]'));
 await view.action('nav','orders');
 assert.equal(root.querySelector('[data-inline-status]'),null);
 assert.equal(root.querySelector('[data-status]').textContent,'');
});
test('an error without a usable control brings the status line into view',async()=>{
 const {view,root,scrolled}=await setup({statusTop:-900,pageTop:-880,covered:false});
 scrolled.length=0;
 view.showError(new Error('Verbindung fehlgeschlagen.'));
 assert.equal(root.querySelector('[data-inline-status]'),null);
 assert.deepEqual(scrolled,[{target:'status',block:'nearest'}]);
});

test('redrawing a page with an older error does not move the page',async()=>{
 const {view,root,scrolled}=await setup({statusTop:-900,pageTop:-880,covered:false});
 await view.action('nav','articles');
 view.showError(new Error('Verbindung fehlgeschlagen.'));
 scrolled.length=0;
 view.render();
 assert.match(root.querySelector('[data-status]').textContent,/Verbindung fehlgeschlagen/);
 assert.deepEqual(scrolled,[]);
});
test('a failed save brings the recovery choices into view',async()=>{
 const {view,root,store,scrolled,layout}=await setup();
 await view.action('article-edit',article.id);
 store.saveMaster=async()=>{throw new Error('Verbindung unterbrochen');};
 layout.statusTop=-700;layout.pageTop=-680;scrolled.length=0;
 await view.save(root.querySelector('form'));
 assert.ok(root.querySelector('[data-recovery]'));
 assert.deepEqual(scrolled.at(-1),{target:'status',block:'start'});
});
test('a new page starts at the top, a redraw of the same page keeps its place and its opened sections',async()=>{
 const {view,root,scrolled,layout}=await setup();
 assert.deepEqual(scrolled,[],'the first page is not moved');
 layout.pageTop=-5400;
 await view.action('nav','stock');
 assert.deepEqual(scrolled,[{target:'workspace-main',block:'start'}]);
 const section=()=>Array.from(root.querySelectorAll('details')).find(d=>d.querySelector('summary').textContent.includes('Verbrauch'));
 section().open=true;scrolled.length=0;
 await view.action('reload','');
 assert.deepEqual(scrolled,[],'same page: position stays');
 assert.equal(section().open,true,'same page: opened section stays open');
 await view.action('ww-open','journal');
 assert.deepEqual(scrolled,[{target:'workspace-main',block:'start'}],'sub page starts at the top');
 scrolled.length=0;layout.pageTop=0;
 await view.action('nav','articles');
 assert.deepEqual(scrolled,[],'nothing to move when the top is already in view');
});
test('opening and closing a form are page changes; editing inside it is not',async()=>{
 const {view,root,scrolled,layout}=await setup();
 layout.pageTop=-800;
 await view.action('nav','articles');scrolled.length=0;
 await view.action('article-edit',article.id);
 assert.equal(scrolled.length,1);
 root.querySelector('form [name=name]').value='Mineralwasser still';
 view.render();
 assert.equal(scrolled.length,1,'redraw of the open form keeps the position');
 await view.action('cancel','');
 assert.equal(scrolled.length,2);
});
