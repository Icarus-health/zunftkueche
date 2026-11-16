// 1.23.0 Paket F: Sprache und Feinschliff.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';import {join} from 'node:path';
import {JSDOM} from 'jsdom';
import {TableWizard} from '../src/kitchen/ww/table-wizard.ts';
import {KitchenView} from '../src/kitchen/view.ts';
import {SharePointStore} from '../src/kitchen/sharepoint.ts';
import {Server} from './support/fake-sharepoint.mjs';
import {season,supplier,article,offer} from './support/kitchen-data.mjs';
import {dateDe,amount2,euro} from '../src/kitchen/markup.ts';
import {unitName} from '../src/kitchen/units.ts';

const ports=(operatingDays)=>({state:()=>({seasons:[{value:{...season,operatingDays}}],ww:{ready:true,records:[]}}),season:()=>season.id,area:()=>'Küche',actor:'x',root:null});
const original=(name,text)=>({name,source:{id:'f',version:'1'},bytes:new TextEncoder().encode(text),hash:'h'});
test('Kassendaten: Zeitraum kommt aus der Datei, Währung wird nicht mehr gefragt',()=>{
 const html=new TableWizard('system',ports(['2027-02-04','2027-02-09']),original('Kasse.csv','ID;Artikel;Datum;Betrag\n1;Wasser;06.02.2027;8,00\n2;Wein;05.02.2027;4,00\n3;Alt;01.01.1999;1,00\n')).render();
 const d=new JSDOM(html).window.document;
 assert.equal(d.querySelector('[name=from]').value,'2027-02-05');assert.equal(d.querySelector('[name=to]').value,'2027-02-06');
 assert.match(d.body.textContent,/Zeitraum aus den Datumsangaben der Datei vorgeschlagen/);
 assert.equal(d.querySelector('[name=currency]').type,'hidden');assert.equal(d.querySelector('[name=currency]').value,'EUR');assert.doesNotMatch(d.body.textContent,/Währung/);
});
test('Kassendaten: ohne Datum in der Datei gelten Dateiname oder Einsatztage, sonst bleibt das Feld leer',()=>{
 const field=(html,n)=>new JSDOM(html).window.document.querySelector('[name='+n+']').value;
 const byName=new TableWizard('system',ports(['2027-02-04']),original('Kasse 05.02.2027.xlsx','PK')).render();
 assert.equal(field(byName,'from'),'2027-02-05');assert.match(byName,/aus dem Dateinamen/);
 const byDays=new TableWizard('system',ports(['2027-02-09','2027-02-04']),original('Kasse.xlsx','PK')).render();
 assert.equal(field(byDays,'from'),'2027-02-04');assert.equal(field(byDays,'to'),'2027-02-09');assert.match(byDays,/aus den Einsatztagen der Saison/);
 const none=new TableWizard('system',ports(undefined),original('Kasse.xlsx','PK')).render();assert.equal(field(none,'from'),'');assert.doesNotMatch(none,/vorgeschlagen/);
});
test('Datum, Beträge und Einheiten zum Lesen',()=>{
 assert.equal(dateDe('2027-02-05'),'05.02.2027');assert.equal(dateDe('2027-02-05T10:00:00Z'),'05.02.2027');assert.equal(dateDe(''),'');assert.equal(dateDe('Freitag'),'Freitag');
 assert.equal(amount2(3.5),'3,50');assert.equal(amount2(0.5047),'0,5047');assert.equal(amount2(null),'');assert.match(euro(12.5),/^12,50\s€$/);
 assert.equal(unitName('Stk',5),'Stück');assert.equal(unitName('Fl.',1),'Flasche');assert.equal(unitName('Fl',48),'Flaschen');assert.equal(unitName('Port',1),'Portion');assert.equal(unitName('kg',3),'kg');
});
async function setup(){const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test'});for(const k of ['document','Element','HTMLInputElement','HTMLTextAreaElement','HTMLFormElement','HTMLSelectElement','FormData'])globalThis[k]=dom.window[k]||dom.window.document;const root=document.getElementById('app'),store=new SharePointStore('https://example.sharepoint.com/sites/kitchen',new Server().request);for(const [k,v] of [['seasons',season],['suppliers',supplier],['articles',article],['offers',offer]])await store.saveMaster(k,v,undefined,'seed-'+v.id);await store.ww.initialize();const view=new KitchenView(root,store,'TEST · member@example.test');await view.start();return{dom,root,store,view};}
test('Offene Eingaben: kein Balken über der Seite, ein leiser Hinweis neben „Speichern“',async()=>{
 const {view,root,dom}=await setup();await view.action('supplier-edit',supplier.id);
 const name=root.querySelector('[name=contactPerson]');name.value='Frau Muster';name.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 assert.equal(root.querySelector('[data-status]').textContent,'');
 const hint=root.querySelector('[data-draft-hint]');assert.ok(hint);assert.match(hint.textContent,/gesichert|Noch nicht gespeichert/);
 assert.ok(hint.closest('.actions').querySelector('button[type=submit]'),'der Hinweis steht bei „Speichern“');
 const names=[...root.querySelectorAll('main form button')].map(b=>b.textContent.trim());assert.ok(names.includes('Abbrechen'));assert.ok(!names.includes('Schließen'),'nur ein Weg aus dem Formular');
 await view.save(root.querySelector('form[data-form=master]'));assert.equal(root.querySelector('[data-draft-hint]'),null);assert.match(root.querySelector('[data-status]').textContent,/Lieferant gespeichert\./);
});
test('Fachwörter stehen nicht mehr in sichtbaren Texten',()=>{
 const files=[];const walk=dir=>{for(const f of readdirSync(dir)){const p=join(dir,f);if(statSync(p).isDirectory())walk(p);else if(p.endsWith('.ts'))files.push(p);}};walk('src/kitchen');
 const banned=/Ordersatz|Ordersätze|Liefergebinde|Preisstand|nachgelesen|durch Lesen bestätigt|Ohne Artikelnummer|Betriebstage \(je Zeile|Angaben geprüft|Prüfvermerk|Status des aktuellen Angebots/;
 const hits=[];for(const p of files){for(const [i,line] of readFileSync(p,'utf8').split('\n').entries()){if(/^\s*(\/\/|\/\*|\*)/.test(line))continue;const m=line.match(banned);if(m)hits.push(p+':'+(i+1)+' '+m[0]);}}
 assert.deepEqual(hits,[]);
});
