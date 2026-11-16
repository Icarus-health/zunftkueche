// 1.19.0 review against WCAG 2.2 AA and the Web Interface Guidelines: names contain the visible label, headings do not
// skip a level, keyboard focus survives a redraw, the "Mehr" menu closes with Escape, fields keep the browser's own data out.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {KitchenView} from '../src/kitchen/view.ts';
import {field} from '../src/kitchen/markup.ts';
import {searchField} from '../src/kitchen/workspace.ts';
import {workspace,stored,order,supplier} from './support/kitchen-data.mjs';

const page=html=>new JSDOM('<div id="app">'+html+'</div>').window.document.getElementById('app');
const draft=(id,extra={})=>({...structuredClone(order),id,status:'Entwurf',recordedBy:null,recordedAt:null,...extra});
function live(state){
 const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test/'});
 for(const name of ['document','Element','HTMLFormElement','HTMLSelectElement','HTMLInputElement','FormData'])globalThis[name]=dom.window[name]||dom.window.document;
 const root=document.getElementById('app');
 return {dom,root,view:new KitchenView(root,{testMode:false,load:async()=>state},'TEST Person')};
}
/** Words of a label the way a voice-control user would say them; text in brackets does not count (WCAG 2.5.3). */
const words=text=>text.replace(/\([^()]*\)/g,' ').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const contains=(name,label)=>{const n=words(name),l=words(label);return n.some((_,i)=>l.every((w,j)=>n[i+j]===w));};

test('open delivery dates: the visible label is part of the spoken name of every button and switch option',async()=>{
 const deliveries=[{id:'wed',date:null,time:'Mittwoch – Datum prüfen',place:'Küche'},{id:'fri',date:null,time:'Freitag 17:00',place:'Küche'}];
 const o=draft('order',{deliveries});o.lines=o.lines.map(l=>({...l,schedule:{wed:1,fri:2}}));
 const s=workspace();s.orders=[stored(o)];
 const {root,view}=live(s);await view.start();await view.action('order-edit','order');
 const buttons=[...root.querySelectorAll('button[data-action=order-dates]')];
 assert.equal(buttons.length,2);
 for(const b of buttons)assert.ok(contains(b.getAttribute('aria-label'),b.textContent),b.getAttribute('aria-label'));
 assert.equal(buttons[0].getAttribute('aria-label'),'Datum offen · Termin 1 · Mittwoch – Datum prüfen · Datum festlegen');
 for(const radio of root.querySelectorAll('input[name=deliveryView]'))assert.ok(contains(radio.getAttribute('aria-label'),radio.nextElementSibling.textContent),radio.getAttribute('aria-label'));
});

test('every page starts with one main heading and no heading level is skipped',async()=>{
 const s=workspace();s.orders=[stored(order)];
 const {root,view}=live(s);await view.start();
 const levels=()=>[...root.querySelectorAll('main h1,main h2,main h3,main h4')].map(h=>Number(h.tagName[1]));
 const check=label=>{const l=levels();assert.equal(l.filter(x=>x===1).length,1,label+': exactly one h1, got '+l);l.forEach((x,i)=>assert.ok(i===0||x-l[i-1]<=1,label+': skipped level in '+l));};
 for(const view_ of ['heute','orders','stock','articles','suppliers','planning','reports','management']){await view.action('nav',view_);check(view_);}
 await view.action('nav','suppliers');await view.action('supplier-new','');check('supplier form');
 assert.equal(root.querySelector('form[data-form=master] h1.form-title').textContent,'Lieferantenprofil');
 await view.action('cancel','');await view.action('nav','articles');await view.action('article-new','');check('article form');
});

test('keyboard focus stays on the same control when the page is redrawn, otherwise it moves to the content',async()=>{
 const s=workspace();s.orders=[stored(order)];
 const {root,view}=live(s);await view.start();
 const season=root.querySelector('select[name=seasonContext]');season.focus();
 assert.equal(document.activeElement,season);
 view.render();
 assert.notEqual(root.querySelector('select[name=seasonContext]'),season,'the markup was replaced');
 assert.equal(document.activeElement,root.querySelector('select[name=seasonContext]'),'same control is focused again');
 const start=root.querySelector('main button[data-action=inventory-new]');start.focus();
 await view.action('inventory-new','');
 assert.equal(root.querySelector('main button[data-action=inventory-new]'),null,'the start button is gone in the count sheet');
 assert.equal(document.activeElement,root.querySelector('main'),'focus lands on the content, not at the page start');
});

test('a redraw does not pull focus into the app when the person is working elsewhere',async()=>{
 const {dom,root,view}=live(workspace());await view.start();
 const outside=dom.window.document.createElement('input');dom.window.document.body.append(outside);outside.focus();
 view.render();
 assert.equal(document.activeElement,outside);
 document.activeElement.blur();view.render();
 assert.equal(document.activeElement,document.body,'nothing focused before, nothing focused after');
});

test('"Mehr" closes with Escape and with a click next to it; keyboard opening moves to the first entry',async()=>{
 const {dom,root,view}=live(workspace());await view.start();
 const more=()=>root.querySelector('nav button[data-action=mobile-menu]'),bar=()=>root.querySelector('.sidebar');
 more().focus();more().click();
 assert.equal(bar().dataset.menuOpen,'true');assert.equal(more().getAttribute('aria-expanded'),'true');
 assert.equal(document.activeElement,root.querySelector('nav button[data-tab=more]'),'a keyboard click moves on to the first hidden area');
 const escape=new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});document.activeElement.dispatchEvent(escape);
 assert.equal(bar().dataset.menuOpen,'false');assert.equal(more().getAttribute('aria-expanded'),'false');assert.equal(escape.defaultPrevented,true);
 assert.equal(document.activeElement,more(),'focus returns to the button that opened the menu');
 more().dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,detail:1}));
 assert.equal(bar().dataset.menuOpen,'true');assert.equal(document.activeElement,more(),'a pointer click leaves focus where it is');
 root.querySelector('main').dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,detail:1}));
 assert.equal(bar().dataset.menuOpen,'false');
 const other=new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});root.querySelector('main').dispatchEvent(other);
 assert.equal(other.defaultPrevented,false,'Escape is left alone while the menu is closed');
});

test('fields do not offer the browser\'s own saved data, suggestion lists keep working, the phone field asks for the phone keypad',async()=>{
 assert.match(field('name','Name','Faller'),/autocomplete="off"/);
 assert.doesNotMatch(field('unit','Einheit','kg',true,'text','list="kitchen-units"'),/autocomplete/);
 assert.match(searchField('','Artikel suchen'),/autocomplete="off"/);
 const s=workspace();s.suppliers=[stored(supplier)];
 const {root,view}=live(s);await view.start();await view.action('nav','suppliers');await view.action('supplier-edit',supplier.id);
 assert.equal(root.querySelector('input[name=phone]').type,'tel');
 assert.equal(root.querySelector('input[name=email]').type,'email');
});

test('style sheet: focus is kept clear of the fixed bars, phone fields are 16 px, no blanket transition',()=>{
 const css=readFileSync(new URL('../src/webparts/kitchen/KitchenWebPart.module.scss',import.meta.url),'utf8').replace(/\s+/g,' ').replace(/\s*([{};:,>])\s*/g,'$1').replace(/\s*!important/g,'!important');
 assert.match(css,/scroll-margin:12px 0 calc\(var\(--tabbar,0px\) \+ var\(--action-bar,0px\) \+ 16px\)/);
 assert.match(css,/form:has\(:global\(\.calm-actions\)\),form:has\(:global\(\.sticky-actions\)\)\{--action-bar:88px;\}/);
 assert.match(css,/:global\(\.app-layout\) select,:global\(\.app-layout\) textarea\{font-size:16px!important;\}/);
 assert.match(css,/:global\(\.count-field\):focus-within\{outline:2px solid var\(--action\)/);
 assert.doesNotMatch(css,/transition:\s*all/);
 assert.match(css,/prefers-reduced-motion/);
});
