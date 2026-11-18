// 1.25.0: Zunft-Design-System. Karte mit Live-Vorschau, Hausfarben und Montserrat in der App.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {KitchenView} from '../src/kitchen/view.ts';
import {registerFonts} from '../src/kitchen/fonts.ts';
import {workspace} from './support/kitchen-data.mjs';

const css=readFileSync(new URL('../src/webparts/kitchen/KitchenWebPart.module.scss',import.meta.url),'utf8');
function live(state){
 const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test/kueche'});
 for(const name of ['document','Element','HTMLFormElement','HTMLSelectElement','HTMLInputElement','HTMLTextAreaElement','FormData'])globalThis[name]=dom.window[name]||dom.window.document;
 const root=document.getElementById('app');
 return {dom,root,view:new KitchenView(root,{testMode:false,load:async()=>state,ww:{load:async()=>state.ww}},'TEST Person')};
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));

test('Karte: Vorschau neben dem Editor, ändert sich beim Tippen ohne Neuaufbau der Seite',async()=>{
 const s=workspace();s.ww={ready:true,records:[]};
 const {dom,root,view}=live(s);await view.start();
 await view.action('nav','menu');await view.action('menu-preset','');
 const preview=root.querySelector('aside.menu-preview [data-menu-preview]');
 assert.ok(preview,'Vorschau ist da');
 assert.equal(preview.querySelectorAll('svg.menu-page').length,1);
 assert.ok([...preview.querySelectorAll('text')].some(t=>t.textContent==='Pikanter Wurstsalat mit Brot'));
 const form=root.querySelector('form[data-form=menu]');
 const title=form.querySelector('input[name=title]');
 title.value='Zunftabend Probe';title.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 await wait(200);
 assert.equal(root.querySelector('form[data-form=menu]'),form,'Formular bleibt, Fokus und Eingaben bleiben');
 assert.ok([...preview.querySelectorAll('text')].some(t=>t.textContent==='Zunftabend Probe'),'Titel sofort in der Vorschau');
 // Ungültiger Preis: Vorschau bleibt beim letzten gültigen Stand, kein Fehler
 const price=form.querySelector('input[name^=price_]');price.value='abc';price.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 await wait(200);
 assert.ok([...preview.querySelectorAll('text')].some(t=>t.textContent==='Zunftabend Probe'));
 // Telefon: Knopf Vorschau öffnet und schließt die Ansicht
 const layout=root.querySelector('.menu-layout');
 await view.action('menu-preview','');assert.ok(layout.classList.contains('preview-open'));
 await view.action('menu-preview','');assert.ok(!layout.classList.contains('preview-open'));
 view.dispose();
});

test('Hausschrift wird einmal angemeldet, ohne FontFace bleibt die Ersatzschrift',()=>{
 const added=[];
 const doc={documentElement:{dataset:{}},fonts:{add:f=>added.push(f)},defaultView:{FontFace:class{constructor(family,src,d){Object.assign(this,{family,src,...d});}load(){return Promise.resolve(this);}}}};
 registerFonts(doc);registerFonts(doc);
 assert.deepEqual(added.map(f=>f.weight),['200','300','400','500'],'ExtraLight bis Medium, kein Fett');
 assert.ok(added.every(f=>f.family==='ZKMontserrat'&&/montserrat-\d00\.woff2/.test(f.src)));
 registerFonts({documentElement:{dataset:{}},fonts:undefined,defaultView:{}});
});

test('Hausfarben des Zunft-Systems als Rollen, hell (Papier) und dunkel (Nacht), keine Schatten mehr',()=>{
 const layer=css.slice(css.indexOf('/* 1.25.0 Zunft-Design-System'));
 for(const [role,value] of [['--ink','#20234b'],['--dim','#585a78'],['--line','#cfd1e5'],['--action','#3f4695'],['--action-fill','#20234b'],['--bg','#e7e8f2']])
  assert.match(layer,new RegExp(`\\.kitchen \\{[^]*?${role}: ${value};`),role);
 assert.match(layer,/\.kitchen\[data-dark='true'\] \{[^]*?--bg: #20234b;[^]*?--action-fill: #fff;[^]*?--onaction: #20234b;/,'Nacht: weißer Knopf mit nachtblauer Schrift');
 assert.doesNotMatch(layer,/box-shadow: [^;]*rgba\(0, 0, 0/,'keine Schlagschatten in der Zunft-Schicht');
 for(const sel of ['context-sheet','sheet-options-body','more-menu-list'])assert.match(layer,new RegExp(`:global\\(\\.${sel}\\)[^{]*\\{\\s*box-shadow: 0 0 0 1px var\\(--control\\);`),sel);
});
