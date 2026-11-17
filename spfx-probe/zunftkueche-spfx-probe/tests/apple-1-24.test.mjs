import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {button,empty,emptyAction} from '../src/kitchen/markup.ts';

const page=html=>new JSDOM('<main>'+html+'</main>').window.document;
const css=readFileSync(new URL('../src/webparts/kitchen/KitchenWebPart.module.scss',import.meta.url),'utf8');

test('buttons come in three levels: one filled main action, tinted inside a section, plain grey otherwise',()=>{
 assert.equal(page(button('a','Speichern','',true)).querySelector('button').className,'primary');
 assert.equal(page(button('a','Profil bearbeiten','x','tinted')).querySelector('button').className,'tinted');
 assert.equal(page(button('a','Abbrechen')).querySelector('button').className,'');
});

test('an empty list names the next step and offers it as a button',()=>{
 const d=page(emptyAction('Noch keine Artikel angelegt.','article-new','Ersten Artikel anlegen'));
 assert.equal(d.querySelector('.empty-state > p.empty').textContent,'Noch keine Artikel angelegt.');
 const b=d.querySelector('.empty-state > button');
 assert.equal(b.dataset.action,'article-new'); assert.equal(b.textContent,'Ersten Artikel anlegen'); assert.equal(b.className,'tinted');
 assert.equal(page(empty('Nichts da.')).querySelector('button'),null,'plain hints stay without a button');
});

test('the look follows the house standard: system font, capsule buttons, 44 px targets, motion can be switched off',()=>{
 assert.doesNotMatch(css,/@font-face/);
 assert.match(css,/@media \(prefers-reduced-motion: reduce\) \{\s*\*,\s*\*::before,\s*\*::after \{\s*transition-duration: 0\.01ms !important;\s*animation-duration: 0\.01ms !important;/);
 assert.match(css,/:global\(\.day-chip\) \{\s*min-height: 44px;/);
 const radii=[...css.matchAll(/border-radius: ([^;]+);/g)].flatMap(m=>m[1].split(/\s+/)).filter(v=>/^\d/.test(v));
 assert.deepEqual([...new Set(radii)].sort(),['0','10px','14px','20px','50%','6px','980px'].sort(),'only the five radius steps, circles and none');
 const spacing=[...css.matchAll(/(?:^|\s)(?:padding|margin|gap|row-gap|column-gap)(?:-[a-z-]+)?: ([^;]+);/g)].flatMap(m=>m[1].split(/\s+/)).filter(v=>/^-?\d+px$/.test(v)).map(v=>Math.abs(parseInt(v)));
 const off=[...new Set(spacing.filter(v=>v>3&&v%4))];
 assert.deepEqual(off,[],'paddings, margins and gaps sit on the 4 px grid (1 to 3 px stay for fine detail)');
});

import {icon} from '../src/kitchen/icons.ts';
import {KitchenView} from '../src/kitchen/view.ts';
import {SharePointStore} from '../src/kitchen/sharepoint.ts';
import {Server} from './support/fake-sharepoint.mjs';
import {season,supplier,article,offer} from './support/kitchen-data.mjs';

test('symbols use one line: stroke 1.8 with round ends, dots are filled circles, no thicker overrides',()=>{
 for(const name of ['home','cart','list','chart','settings','info','more','grip','search','plus']){
  const svg=page(icon(name)).querySelector('svg');
  const line=svg.querySelector('.zk-line');
  assert.equal(line.getAttribute('stroke-width'),'1.8',name);
  assert.equal(line.getAttribute('stroke-linecap'),'round',name);
  assert.equal(svg.getAttribute('viewBox'),'0 0 24 24');
  assert.doesNotMatch(icon(name),/h\.01/,name+': no hairline dots');
 }
 assert.doesNotMatch(css,/zk-[a-z-]*\)[^{]*\{[^}]*stroke-width/,'no stroke override for symbols');
});

test('menu entries that ask for more input end with an ellipsis',async()=>{
 const src=['actions/order-actions.ts','actions/master-actions.ts','workspace.ts','supplier-forms.ts'].map(f=>readFileSync(new URL('../src/kitchen/'+f,import.meta.url),'utf8')).join('\n');
 for(const label of ['Aus Vorjahr übernehmen …','Vorlage laden …','Preisliste aus Excel einlesen …','Lieferanten aus CSV einlesen …','Artikel aus CSV einlesen …','Kassendateien einlesen …'])
  assert.ok(src.includes(`'${label}'`),label);
});

test('while saving, the button that started it shows a spinner and loses it afterwards',async()=>{
 const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test'});
 for(const k of ['document','Element','HTMLInputElement','HTMLTextAreaElement','HTMLFormElement','HTMLSelectElement','FormData'])globalThis[k]=dom.window[k]||dom.window.document;
 const root=dom.window.document.getElementById('app');
 const store=new SharePointStore('https://example.sharepoint.com/sites/kitchen',new Server().request);
 for(const [k,v] of [['seasons',season],['suppliers',supplier],['articles',article],['offers',offer]])await store.saveMaster(k,v,undefined,'seed-'+v.id);
 await store.ww.initialize();
 const view=new KitchenView(root,store,'TEST · member@example.test');await view.start();
 const b=root.querySelector('button[data-action=nav]');b.focus();
 let seen='';
 await view.run(async()=>{seen=b.getAttribute('aria-busy')||'';},'');
 assert.equal(seen,'true'); assert.equal(b.isConnected?b.getAttribute('aria-busy'):null,null);
 assert.equal(root.querySelectorAll('[aria-busy]').length,0);
 view.dispose();
});
