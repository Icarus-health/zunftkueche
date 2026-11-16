// 1.23.0 Paket D: Rechnungen. Lieferant, Zahlungsziel, Bereich und Artikel werden vorgeschlagen, nie geraten.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {billTerms,billArea,supplierGuess,articleGuess,nameKey} from '../src/kitchen/imports/bill-hints.ts';
import {billProposal} from '../src/kitchen/imports/bill-proposal.ts';
import {validateBill} from '../src/kitchen/ww/domain.ts';
import {learnedArticles,withArticles,paymentNote} from '../src/kitchen/ww/bill-suggest.ts';
import {invoicePriceProposals} from '../src/kitchen/ww/invoice-prices.ts';
import {KitchenView} from '../src/kitchen/view.ts';
import {SharePointStore} from '../src/kitchen/sharepoint.ts';
import {Server} from './support/fake-sharepoint.mjs';
import {season,supplier,article,offer} from './support/kitchen-data.mjs';

test('Zahlungsziel und Skonto: datiert, in Tagen, sofort',()=>{
 assert.deepEqual(billTerms('Zahlbar bis 01.03.2026 mit 2% Skonto 12,48 €, bis 23.03.2026 ohne Abzug','2026-02-21'),
  {deliveryDate:'',dueDate:'2026-03-23',skontoUntil:'2026-03-01',skontoPercent:2,skontoAmount:12.48});
 const split=billTerms('Lieferdatum\n\n20.02.2026\n\nZahlbar innerhalb von 14 Tagen (06.03.2026) ohne Ab-\nzug.','2026-02-20');
 assert.equal(split.deliveryDate,'2026-02-20');assert.equal(split.dueDate,'2026-03-06');assert.equal(split.skontoUntil,'');
 assert.equal(billTerms('Zahlbar sofort rein netto','2026-02-24').dueDate,'2026-02-24');
 assert.equal(billTerms('Zahlungsziel 10 Tage netto. Zahlbar innerhalb von 10 Tagen.','2026-02-20').dueDate,'2026-03-02');
 assert.equal(billTerms('Diese Rechnung umfasst Lieferungen vom 11.02.2026 bis 15.02.2026','2026-02-24').deliveryDate,'2026-02-11');
 assert.deepEqual(billTerms('Vielen Dank für Ihren Einkauf.',''),{deliveryDate:'',dueDate:'',skontoUntil:'',skontoPercent:null,skontoAmount:null});
 assert.equal(billTerms('Zahlbar bis 31.02.2026 ohne Abzug','2026-02-01').dueDate,'','ein unmögliches Datum wird nicht übernommen');
});
test('Bereich nur aus Dateiname oder beschrifteter Lieferadresse, nicht aus der Vereinsanschrift',()=>{
 assert.equal(billArea('','Braun_RG_455922_Zunftscheuer.pdf'),'Zunftscheuer');
 assert.equal(billArea('','Braun_RG_455923_Marktplatzbrunnen.pdf'),'Marktplatz');
 assert.equal(billArea('','Braun_RG_455924_Belchenhalle_allgemein.pdf'),'');
 assert.equal(billArea('An die\nSchelmenzunft Staufen e.V.\nZunftscheuer\nz.Hd. Axel Wiesler','RG2026021.pdf'),'','die Anschrift des Vereins ist kein Lieferort');
 assert.equal(billArea('Lieferadresse: Marktplatzbrunnen Staufen','R1.pdf'),'Marktplatz');
 assert.equal(billArea('Lieferort: Küche\nKostenstelle: Zunftscheuer','R1.pdf'),'','zwei Bereiche: kein Vorschlag');
});
test('Lieferant: Briefkopf zählt, Empfängerzeilen zählen nicht, ohne Vorsprung kein Vorschlag',()=>{
 const list=[{id:'wiesler',name:'Wiesler'},{id:'landmann',name:'Landmann'},{id:'rewe',name:'Rewe/Nahkauf'},{id:'braun',name:'Getränke Braun'}];
 const landmann='WEINGUT PETER LANDMANN\nAuf dem Rempart 2\ninfo@landmann-wein.de\n\nSchelmenzunft\nHerrn Michael Wiesler\nKrozinger Str. 26\nRechnung Nr. 188373';
 assert.equal(supplierGuess(landmann,'Rechnung_188373.pdf',list),'landmann');
 const wiesler='Weingut Michael Wiesler,Krozinger Str. 26,79219 Staufen\nAn die\nSchelmenzunft Staufen e.V.\nz.Hd. Axel Wiesler\nRechnung Nr. 2026021\nIBAN … kontakt@weingut-wiesler.de';
 assert.equal(supplierGuess(wiesler,'RG2026021.pdf',list),'wiesler');
 assert.equal(supplierGuess('unleserlich','Nahkauf_RG_45611897.pdf',list),'rewe');
 assert.equal(supplierGuess('Schelmenzunft\nHerrn Michael Wiesler','Rechnung.pdf',list),'','nur der Empfänger heißt so');
 assert.equal(supplierGuess('Wiesler und Landmann liefern gemeinsam','Rechnung.pdf',list),'','zwei gleich gute Treffer');
 assert.equal(supplierGuess('Tel. 07633 5510','Scan.pdf',[{id:'a',name:'Hof Maier',phone:'07633 / 55 10'},{id:'b',name:'Hof Huber'}]),'a');
});
test('Artikel je Zeile: Wörter und Größe müssen passen, Gelerntes hat Vorrang',()=>{
 const wines=[{id:'g1',name:'Wiesler Gutedel trocken 1,0 l'},{id:'g75',name:'Wiesler Gutedel trocken 0,75 l'},{id:'wb',name:'Wiesler Weißer Burgunder trocken 0,75 l'},{id:'wbs',name:'Wiesler Weißer Burgunder Sekt brut 0,75 l'},{id:'rose',name:'Wiesler Pinot Rosé Sekt brut 0,75 l'}];
 const none=new Map();
 assert.equal(articleGuess('2023 Gutedel Qualitätswein trocken 1 ltr.',wines,none),'g1');
 assert.equal(articleGuess('2024 Gutedel Qualitätswein trocken 0,75 ltr.',wines,none),'g75');
 assert.equal(articleGuess('2023 Weißer Burgunder Sekt Brut 0,75 ltr.',wines,none),'wbs');
 assert.equal(articleGuess('2019 Staufener Pinot Rosé Sekt Brut 0,75 ltr.',wines,none),'rose');
 assert.equal(articleGuess('2023 Gutedel',wines,none),null,'ohne Größe sind zwei Artikel gleich gut');
 assert.equal(articleGuess('DOC Glas ohne Schrift',wines,none),null);
 assert.equal(articleGuess('2023 Gutedel',wines,new Map([[nameKey('2023 Gutedel').join(' '),'g1']])),'g1');
 assert.deepEqual(nameKey('DOCTOR FAUSTUS Sekt b.A. Brut 0.2l'),nameKey('Dr. Faustus Sekt B.A. brut 0,2 l'));
});
const base=(kind,id,extra)=>({id,kind,scope:'s27',at:'2026-11-16T10:00:00Z',by:'x',confirmed:true,...extra});
const bill=(extra={})=>base('bill','b1',{area:'Küche',name:'Wiesler 2026021',supplierId:'sup',number:'2026021',date:'2026-02-21',orderIds:[],fileHash:'',fileName:'',attachment:'',net:310.5,tax:59,gross:369.5,adjustmentNet:0,note:'',
 lines:[{id:'l1',articleId:'gut',name:'2023 Gutedel Qualitätswein trocken 1 ltr.',quantity:90,unit:'Fl.',unitNet:3.45,totalNet:310.5,taxRate:19}],...extra});
const state=(records=[])=>({seasons:[{value:{id:'s27',name:'Fasnet 2027',year:2027,archived:false}}],suppliers:[{value:{id:'sup',name:'Wiesler',phone:'1',email:'',method:'Telefon',customerNumber:'',note:'',active:true}}],
 articles:[{value:{id:'gut',name:'Wiesler Gutedel trocken 1,0 l',unit:'Flasche',active:true,category:'Wein'}},{value:{id:'glas',name:'Weinglas',unit:'Stück',active:true,category:''}}],
 offers:[{value:{id:'o1',articleId:'gut',supplierId:'sup',code:'',packName:'Flasche',packSize:1,priceNet:null,priceDate:null,deposit:null,note:'',active:true}}],orders:[],counts:[],inventories:[],ww:{ready:true,records:records.map(value=>({value}))}});
test('Bestätigen geht mit den Summen allein, Meldungen nennen die Zeile und was zu tun ist',()=>{
 validateBill(bill({lines:[],net:null,tax:null}));
 assert.throws(()=>validateBill(bill({gross:null,net:null,tax:null,lines:[]})),/Der Bruttobetrag fehlt.*Brutto gesamt/);
 assert.throws(()=>validateBill(bill({lines:[{...bill().lines[0],quantity:null,unitNet:null}]})),/Bei „2023 Gutedel[^“]*“ fehlt die Menge\. Menge eintragen oder die Position entfernen/);
 assert.throws(()=>validateBill(bill({net:300,tax:69.5})),/Die Positionen ergeben zusammen 310,50 € netto, auf der Rechnung stehen 300,00 €/);
 assert.throws(()=>validateBill(bill({dueDate:'2026-13-01'})));
 validateBill(bill({deliveryDate:'2026-02-20',dueDate:'2026-03-23',skontoUntil:'2026-03-01',skontoAmount:12.48}));
 validateBill(bill({confirmed:false,gross:null,net:null,tax:null,lines:[]}));
});
test('Was bei einem Lieferanten bestätigt wurde, wird bei der nächsten Rechnung wieder vorgeschlagen',()=>{
 const s=state([bill({lines:[{...bill().lines[0],name:'DOC Glas ohne Schrift',articleId:'glas',quantity:21,unit:'St.',unitNet:2,totalNet:42}],net:42,tax:7.98,gross:49.98})]);
 assert.equal(learnedArticles(s,'sup').get(nameKey('DOC Glas ohne Schrift').join(' ')),'glas');
 const lines=withArticles([{id:'a',articleId:null,name:'DOC Glas ohne Schrift',quantity:5,unit:'St.',unitNet:2,totalNet:10,taxRate:19},{id:'b',articleId:null,name:'2023 Gutedel Qualitätswein trocken 1 ltr.',quantity:1,unit:'Fl.',unitNet:3.45,totalNet:3.45,taxRate:19},{id:'c',articleId:null,name:'Pfand',quantity:1,unit:'',unitNet:1,totalNet:1,taxRate:19,role:'deposit'}],s,'sup');
 assert.deepEqual(lines.map(l=>l.articleId),['glas','gut',null]);
 assert.deepEqual(withArticles([{id:'a',articleId:null,name:'DOC Glas ohne Schrift',quantity:5,unit:'St.',unitNet:2,totalNet:10,taxRate:19}],s,'').map(l=>l.articleId),[null],'ohne Lieferant kein Vorschlag');
});
test('Preis aus der Rechnung: „Fl.“ gilt als Flasche, Kiste und Flasche werden nicht verwechselt',()=>{
 const s=state();const proposals=invoicePriceProposals(bill(),s);
 assert.deepEqual(proposals.map(p=>[p.offer.id,p.oldPrice,p.newPrice,p.date]),[['o1',null,3.45,'2026-02-21']]);
 s.offers[0].value={...s.offers[0].value,packName:'Kiste',packSize:6};
 assert.deepEqual(invoicePriceProposals(bill(),s),[],'Rechnung je Flasche, Gebinde ist die Kiste');
 assert.equal(paymentNote(bill({dueDate:'2026-03-23',skontoUntil:'2026-03-01',skontoAmount:12.48})),'zahlbar bis 23.03.2026 · Skonto 12,48 € bis 01.03.2026');
});
test('Großmarkt: Nettopreise mit Mengenrabatt je Artikel und Steuersatz je Kennbuchstabe',()=>{
 const text=['RECHNUNGS-NR.   06.02.2026/071/0/0/0032/002902','MM ART.-NR   EAN   ARTIKEL   PACK   EINZEL   INHALT   KOLLI   MENGE   GESAMT   M   STÜCK INT KD',
  '516043.7 5000157104885   100x17ml HEINZ TOMATO KETCHUP   KT   8,990   1   8,99   5   44,95   B   8,190 *',
  '540477.7 4337182231431   10L MPRO FLUESSIGREINIGER   KS   20,490   1   20,49   2   40,98   A   19,490 * G',
  'Mengenrabatt - 10L MPRO FLUESSIGREINIGER   2,00- A   23800','Mengenrabatt 100x17ml HEINZ TOMATO KETCHUP   4,00- B   35396',
  'KOLLI GES.:   7   KOLLI GEW.:   0,000 KG   NETTO-WARENWERT:   79,93','NETTOWERT   % MWST   MWST   BRUTTO','38,98   A=19,00%   7,41   46,39','40,95   B= 7,00%   2,87   43,82','79,93   10,28   90,21','SUMME EUR   90,21'].join('\n\n');
 const p=billProposal(text);
 assert.deepEqual(p.lines.map(l=>[l.name,l.quantity,l.unitNet,l.totalNet,l.taxRate]),[['100x17ml HEINZ TOMATO KETCHUP',5,8.19,40.95,7],['10L MPRO FLUESSIGREINIGER',2,19.49,38.98,19]]);
 const off=billProposal(text.replace('NETTO-WARENWERT:   79,93','NETTO-WARENWERT:   80,93'));assert.ok(off.lines.every(l=>l.unitNet===null),'passt die Nettosumme nicht, bleiben die Preise leer');
});
async function setup(){const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test'});for(const k of ['document','Element','HTMLInputElement','HTMLTextAreaElement','HTMLFormElement','HTMLSelectElement','FormData'])globalThis[k]=dom.window[k]||dom.window.document;const root=document.getElementById('app'),store=new SharePointStore('https://example.sharepoint.com/sites/kitchen',new Server().request);for(const [k,v] of [['seasons',season],['suppliers',supplier],['articles',article],['offers',offer]])await store.saveMaster(k,v,undefined,'seed-'+v.id);await store.ww.initialize();const view=new KitchenView(root,store,'TEST · member@example.test');await view.start();return{dom,root,store,view};}
const set=(root,name,value)=>{root.querySelector('[name="'+name+'"]').value=value;};
test('Rechnung von Hand: bestätigen nur mit Summen, Belegname entsteht von selbst, Bereich wählbar',async()=>{
 const {view,root,store}=await setup();await view.action('ww-open','bills');await view.action('ww-new','bill');
 for(const [k,v] of Object.entries({supplierId:'sup',number:'R-77',date:'2027-02-12',gross:'119,00',billArea:'Zunftscheuer',dueDate:'2027-02-26'}))set(root,k,v);
 root.querySelector('[name=confirmed]').checked=true;await view.save(root.querySelector('form[data-form=ww-bill]'));
 const saved=(await store.ww.load(season.id)).records.find(r=>r.value.kind==='bill').value;
 assert.equal(saved.confirmed,true);assert.equal(saved.name,'Getränkemarkt R-77');assert.equal(saved.area,'Zunftscheuer');assert.equal(saved.gross,119);assert.equal(saved.dueDate,'2027-02-26');assert.deepEqual(saved.lines,[]);
});
test('Bestätigte Rechnung mit zugeordnetem Artikel schreibt den neuen Preis in die Preisliste',async()=>{
 const {view,root,store}=await setup();await view.action('ww-open','bills');await view.action('ww-new','bill');
 for(const [k,v] of Object.entries({supplierId:'sup',number:'R-78',date:'2027-02-12',net:'94,00',tax:'17,86',gross:'111,86'}))set(root,k,v);
 await view.action('ww-add','bill');for(const [k,v] of Object.entries({lineName:'Mineralwasser 12er',articleId:'water',quantity:'10',unit:'Kiste',unitNet:'9,40',totalNet:'94,00'}))set(root,k,v);
 await view.wwUI.billContextChanged('articleId');
 const box=root.querySelector('[name=updatePrices]');assert.ok(box,'Preisübernahme wird angeboten');assert.equal(box.checked,true);
 assert.match(root.querySelector('.bill-prices').textContent,/Mineralwasser · Kiste: 9,40\s€ netto \(bisher 8,50\s€\)/);
 root.querySelector('[name=confirmed]').checked=true;await view.save(root.querySelector('form[data-form=ww-bill]'));
 const records=(await store.ww.load(season.id)).records.map(r=>r.value);const list=records.find(r=>r.kind==='prices');
 assert.ok(list);assert.equal(list.validFrom,'2027-02-12');assert.equal(list.confirmed,true);assert.deepEqual(list.lines.map(l=>[l.offerId,l.priceNet]),[['offer',9.4]]);
 assert.match(root.textContent,/Rechnung bestätigt · 1 Preis aktualisiert/);
});
test('Lieferant fehlt: in der Prüfung anlegen, die Eingaben bleiben stehen',async()=>{
 const {view,root,store}=await setup();await view.action('ww-open','bills');await view.action('ww-new','bill');
 set(root,'number','R-79');set(root,'gross','50,00');set(root,'newSupplier','Bäckerei Kirschner');
 await view.action('ww-bill-supplier-new','');
 const created=(await store.load()).suppliers.find(r=>r.value.name==='Bäckerei Kirschner');assert.ok(created);
 const form=root.querySelector('form[data-form=ww-bill]');assert.ok(form,'die Prüfung ist noch offen');
 assert.equal(form.querySelector('[name=supplierId]').value,created.value.id);assert.equal(form.querySelector('[name=number]').value,'R-79');assert.equal(form.querySelector('[name=gross]').value,'50,00');
 assert.equal(form.querySelector('[name=newSupplier]'),null);
});
