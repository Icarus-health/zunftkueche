import './react-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const { MobileItemCard, ResponsiveTable } = await import('../src/components/MobileItemCard.tsx');
const h = React.createElement;
test('responsive table keeps the dish name, both days and quantity units together in each row', () => {
 const html = renderToStaticMarkup(h(ResponsiveTable, null,
  h('thead',null,h('tr',null,h('th',null,'Speise'),h('th',null,'Freitag'),h('th',null,'Samstag'))),
  h('tbody',null,h('tr',null,h('td',null,'Kartoffelsalat'),h('td',null,h('input',{'aria-label':'Kartoffelsalat Freitag',defaultValue:'0'}),' Stück'),h('td',null,h('input',{'aria-label':'Kartoffelsalat Samstag',placeholder:'Offen'}),' Stück')))));
 assert.match(html,/data-label="Freitag"/); assert.match(html,/data-label="Samstag"/);
 assert.match(html,/Kartoffelsalat/); assert.match(html,/value="0"/); assert.match(html,/placeholder="Offen"/);
 assert.equal((html.match(/Stück/g)||[]).length,2);
});
test('mobile cards retain their title, context and accessible action', () => {
 const html = renderToStaticMarkup(h(MobileItemCard,{title:'Kartoffeln',subtitle:'Lieferant · Samstag',actions:h('button',null,'Bestellmenge ändern')},'12 kg'));
 for (const text of ['Kartoffeln','Lieferant · Samstag','12 kg','Bestellmenge ändern']) assert.ok(html.includes(text));
});
test('price columns retain matching labels when optional columns are absent', () => {
 const html = renderToStaticMarkup(h(ResponsiveTable,null,
  h('thead',null,h('tr',null,h('th',null,'Artikel'),false,h('th',null,'Menge'),h('th',null,'Hinweis'))),
  h('tbody',null,h('tr',null,h('td',null,'Brot'),false,h('td',null,'2 Stück'),h('td',null,'Samstag')))));
 assert.match(html,/data-label="Menge">2 Stück/); assert.match(html,/data-label="Hinweis">Samstag/);
});
const { readFileSync } = await import('node:fs');
const seed = JSON.parse(readFileSync(new URL('../import/2026.json', import.meta.url),'utf8'));
const props = {state:seed,busy:false,readOnly:false,mode:'local',saveError:'',commit:async()=>true,go:()=>{}};
test('actual planning renders each dish once with the complete Friday/Saturday comparison', async () => {
 const {default: Planning} = await import('../src/screens/Planning.tsx');
 const html = renderToStaticMarkup(h(Planning,props));
 for (const dish of seed.menu) {
   const escaped = dish.name.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#x27;');
   assert.ok(html.includes(`Geplante Portionen ${escaped} Freitag`));
   assert.ok(html.includes(`Geplante Portionen ${escaped} Samstag`));
 }
 assert.equal((html.match(/<input aria-label="Geplante Portionen/g)||[]).length,seed.menu.length*2);
 assert.ok(html.includes('data-label="Samstag'));
});
test('actual orders keep supplier, day, item and editable quantity in a single control tree', async () => {
 const {default: Orders} = await import('../src/screens/Orders.tsx');
 const html = renderToStaticMarkup(h(Orders,{...props,initialSupplier:seed.suppliers[0].id}));
 assert.ok(html.indexOf('Lieferant<select') < html.indexOf('aria-label="Liefertag"'));
 assert.ok(html.includes('data-label="Menge"'));
 assert.ok(html.includes('Bestellung vorbereiten'));
});
test('overview presents actionable next steps before the supplier list', async () => {
 const {default: Home} = await import('../src/screens/Home.tsx');
 const html = renderToStaticMarkup(h(Home,props));
 assert.ok(html.indexOf('Nächste Schritte') < html.indexOf('supplier-list'));
 assert.ok(html.includes('Zur Planung'));
});
test('pending writes disable modal dismissal, while an ordinary or read-only preview remains closable', async () => {
 const {Modal, SavePendingContext} = await import('../src/components/shared.tsx');
 const pending = renderToStaticMarkup(h(SavePendingContext,{value:true},h(Modal,{title:'Speichern',onClose:()=>{}},h('p',null,'Eingabe'))));
 const idle = renderToStaticMarkup(h(SavePendingContext,{value:false},h(Modal,{title:'Vorschau',onClose:()=>{}},h('p',null,'Leseansicht'))));
 assert.match(pending,/<button[^>]*disabled=""[^>]*aria-label="Schließen"/);
 assert.doesNotMatch(idle,/<button[^>]*disabled=""/);
});
