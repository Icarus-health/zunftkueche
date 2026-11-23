// 1.26.0: Zurück auf jeder Unterseite, Lieferanten zusammenlegen, Artikel nach Kategorien, nachsichtige Rechnungserkennung.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {KitchenView} from '../src/kitchen/view.ts';
import {billProposal} from '../src/kitchen/imports/bill-proposal.ts';
import {fileNameNumber,looseNumbers,looseDates,amount,rateRowTotals,beveragePairTotals,taxLineTotals,sumRowTotals} from '../src/kitchen/imports/bill-loose.ts';
import {planMerge,mergeSummary} from '../src/kitchen/supplier-merge.ts';
import {billForm} from '../src/kitchen/ww/bills-view.ts';
import {openBillFiles} from '../src/kitchen/ww/inbox-view.ts';
import {workspace,stored,supplier,article,offer,order,line} from './support/kitchen-data.mjs';

const sum=lines=>Math.round(lines.reduce((a,l)=>a+(l.totalNet||0),0)*100)/100;

// ---------- Rechnungserkennung ----------
test('Rechnungsnummer: Beschriftung mitten in der Zeile, Nummer in der nächsten Zeile, Überschrift, führender Strich',()=>{
 assert.deepEqual(looseNumbers('Max Muster Rechnungsnummer: 2026/33'),['2026/33']);
 assert.deepEqual(looseNumbers('RECHNUNGS-NR.:\n52700 DATUM: 25.02.26'),['52700']);
 assert.deepEqual(looseNumbers('| Rechnung Nr. 45600000 - 26000050 Datum: 20.02.2026'),['45600000-26000050']);
 assert.deepEqual(looseNumbers('RECHNUNG RE-2026-0815'),['RE-2026-0815']);
 assert.deepEqual(looseNumbers('Rechnung Nr. 4711.'),['4711']);
 // Kein Wort, kein Datum, kein Bruchstück wird zur Nummer
 assert.deepEqual(looseNumbers('unter Angabe der Rechnungsnummer und Kundennummer'),[]);
 assert.deepEqual(looseNumbers('Rechnung 21.02.2026'),[]);
 assert.deepEqual(looseNumbers('Rechnungs-Nr.: Be'),[]);
});
test('Rechnungsdatum: zweistelliges Jahr und Beschriftung mitten in der Zeile, Lieferdatum zählt nicht',()=>{
 assert.deepEqual(looseDates('52700 DATUM: 25.02.26'),['2026-02-25']);
 assert.deepEqual(looseDates('79219 Staufen Datum: 17.02.2026'),['2026-02-17']);
 assert.deepEqual(looseDates('Lieferdatum: 19.02.2026\nZahlungsziel: 06.03.2026'),[]);
 assert.deepEqual(looseDates('Datum: 41.02.2026'),[]);
});
test('Dateiname nennt die Nummer nur ausdrücklich, ein Datum im Namen ist keine Nummer',()=>{
 assert.equal(fileNameNumber('Braun_RG_455925_Belchenhalle_Bar.pdf'),'455925');
 assert.equal(fileNameNumber('Rechnung RE-202626085.pdf'),'RE-202626085');
 assert.equal(fileNameNumber('RG2026020.pdf'),'2026020');
 assert.equal(fileNameNumber('Wiggenhauser_RG_2026-33.pdf'),'2026-33');
 assert.equal(fileNameNumber('Metro_2026-02-06_Ketchup.pdf'),'');
 assert.equal(fileNameNumber('Nahkauf_Gutschrift_2026-02-25.pdf'),'');
 assert.equal(fileNameNumber('Scan.pdf'),'');
});
test('Beträge mit Komma oder Punkt, nichts dazwischen',()=>{
 assert.equal(amount('1.192,10'),1192.1);assert.equal(amount('1192.10'),1192.1);assert.equal(amount('-80,49'),-80.49);
 for(const bad of ['1192','1.192','12,5','A617','8,93%'])assert.equal(amount(bad),null,bad);
});

test('Weingut (Scan): Nummer unter der Beschriftung, Jahr zweistellig, Beträge mit Punkt, Summen über die Steuerzeile',()=>{
 const text=['Seite 1','RECHNUNG','KUNDEN-NR.: 12345','RECHNUNGS-NR.:','52700 DATUM: 25.02.26','LIEFERUNG VOM: 25.02.26 NR.: Fasnet 2026',
 '03/25 0,75 149 2024er Weissburgunder 7.14 1064.31','06/25 0,75 16 2024er Riesling 7.14 114.24','1178.55','Kundenrabatt 15% 176.78','1001.77','Mehrwertsteuer 19% 190.33','EUR 1192.10'].join('\n');
 const p=billProposal(text,{usedOcr:true,fileName:'Ulmann_RG_52700.pdf'});
 assert.equal(p.number,'52700');assert.equal(p.date,'2026-02-25');assert.deepEqual([p.net,p.tax,p.gross],[1001.77,190.33,1192.1]);
 // Passt die Steuerzeile nicht zu ihren Nachbarn, bleibt alles leer
 const off=billProposal(text.replace('190.33','199.33'),{usedOcr:true});
 assert.deepEqual([off.net,off.tax,off.gross],[null,null,null]);
 assert.equal(taxLineTotals('100,00\nMwSt 19% 19,00\n119,00\n\n200,00\nMwSt 7% 14,00\n214,00'),undefined,'zwei Blöcke: nicht eindeutig');
});

test('Metzgerei (Foto): Nummer und Datum trotz Namen davor, Summenzeile nur mit nachrechenbarer Steuer',()=>{
 const head=['Seite 1','Metzgerei Muster RECHNUNG','79219 Staufen Datum: 17.02.2026','Max Muster Rechnungsnummer: 2026/33','| 50 | kg.Kartoffelsalat s63.16l 2552 | 385.00]'];
 const one=billProposal([...head,'Summe € 2.876,86 €'].join('\n'),{usedOcr:true,fileName:'Wiggenhauser_RG_2026-33.pdf'});
 assert.equal(one.number,'2026/33','Schreibweise des Belegs, nicht die des Dateinamens');assert.equal(one.date,'2026-02-17');
 assert.deepEqual([one.net,one.tax,one.gross],[null,null,null],'ein einzelner Betrag sagt nicht, ob netto oder brutto');
 const two=billProposal([...head,'Summe € 2.876,86 € | 201,38€'].join('\n'),{usedOcr:true});
 assert.deepEqual([two.net,two.tax,two.gross],[2876.86,201.38,3078.24]);
 assert.match(two.notes.join(' '),/Brutto bitte am Original prüfen/);
 assert.equal(sumRowTotals('Summe 2.876,86 211,38'),undefined,'Steuer passt zu keinem Satz');
 assert.equal(sumRowTotals('Summe 100,00 19,00 120,00'),undefined,'dritter Betrag ist nicht die Summe');
});

const receiptText=more=>['Seite 1','| Rechnung Nr. 45600000 - 26000050 Datum: 20.02.2026','Summe aller bezogenen Waren und Leistungen 141,13 EUR','Zahlungsziel: 06.03.2026','Seite 2',
 'Artikel Nr. Beschreibung Menge Einzelpreis Preis nach Rabatt UST',
 '0000002825703 MUELLS. 120L 1 Stk 2,49 2,49 249 19%',            // Komma verloren
 '0000000702501 SCHWAMMTUCH 3 Stk 0,85 2,59 2,55519:%',            // Betrag und Satz verklebt
 '| 0000000165932 JA! MINI BREZELN 18 Stk 0,89 16,02 16,02 7%',
 'Summe Lieferschein 21,06','Offener Zahlbetrag 21,06',
 'Artikel Nr. Beschreibung Menge Einzelpreis Preis nach Rabatt UST',
 '0000008075105 SCHWARZE OLIVEN 8 Stk 229 10,32 10,32 7%',         // Einzelpreis ohne Komma
 '0000001211508 BEDIENUNGSTHEKE 7 Stk 15,90 111,30 109,75 7%',     // mit Rabatt
 'Summe Lieferschein 120,07 |',...more].join('\n');
test('Marktrechnung (Scan): Steuertabelle ohne Kopfzeile, Lieferscheine nachgerechnet und in Netto umgerechnet',()=>{
 const p=billProposal(receiptText(['7% 127,19 8,90 A609','19% 4,24 0,80 5,04','Gesamtbetrag 131,43 9,70 141,13']),{usedOcr:true,fileName:'Nahkauf_RG_45600000-26000050.pdf'});
 assert.equal(p.number,'45600000-26000050');assert.equal(p.date,'2026-02-20');
 assert.deepEqual([p.net,p.tax,p.gross],[131.43,9.7,141.13]);
 assert.equal(p.lines.length,5);assert.equal(sum(p.lines),131.43,'Nettosumme der Positionen trifft den Beleg');
 assert.deepEqual(p.lines.map(l=>[l.name,l.quantity,l.taxRate]),[['MUELLS. 120L',1,19],['SCHWAMMTUCH',3,19],['JA! MINI BREZELN',18,7],['SCHWARZE OLIVEN',8,7],['BEDIENUNGSTHEKE',7,7]]);
 assert.equal(p.lines[4].totalNet,102.58,'Preis nach Rabatt zählt (109,75 brutto); der Rundungscent des Satzes liegt auf der größten Zeile');
 assert.match(p.notes.join(' '),/in Netto umgerechnet/);
});
test('Marktrechnung: stimmt ein Lieferschein nicht, kommen die Positionen ohne Preise; ohne Summenzeile keine Summen',()=>{
 const p=billProposal(receiptText(['7% 127,19 8,90 136,09','19% 4,24 0,80 5,04','Gesamtbetrag 131,43 9,70 141,13']).replace('Summe Lieferschein 21,06','Summe Lieferschein 31,06'),{usedOcr:true});
 assert.deepEqual([p.net,p.tax,p.gross],[131.43,9.7,141.13]);
 assert.ok(p.lines.every(l=>l.unitNet===null&&l.totalNet===null),'keine geratenen Preise');
 assert.equal(rateRowTotals('7% 127,19 8,90 136,09\n19% 4,24 0,80 5,04'),undefined,'Sätze ohne bestätigende Summenzeile');
 assert.equal(rateRowTotals('7% 127,19 9,90 137,09\nGesamtbetrag 127,19 9,90 137,09'),undefined,'Steuer passt nicht zum Satz');
});

const beverage=tail=>['Seite 1','Bei Zahlung bitte angeben:','455925 / 12345','Datum: 21.02.2026','Rechnungs-Nr.: 53925',   // verlesen
 'Art-Nr Bezeichnung Anzahl ME Inh. Menge E-Preis G-Preis/USt.',
 '115 Fürstenberg Alkoholfrei Longneck Flasche 200 KA 20 40 16,30 10% 29,34 *','20x0,331',     // 2,00 ohne Komma, Gebinde in der Folgezeile
 '107 Fürstenberg Pils Longneck Flasche 20x0,331 13,00 KA 20 260 16,30 10% 190,71 *',
 '745 Paulaner Spezi 24x0,331 3,00 KA 24 72 15,30 45,90 *',
 '636 Schweppes Tonic Water 6x1,0l PET -2 FL 2,07 -4,14 *',                                    // Rückgabe einzelner Flaschen
 '1002 Peterstaler Classic 12x0,5I 6,00 KA 12 72 625 5% 3562 *',                               // Preis und Betrag ohne Komma
 'Zwischensumme Warenwert 297,43',
 'Pfandwert € el zur E-Preis G-Preis',
 'BIER KAST.20*0,5/0,3 15 0_ — 3,10 46,50*','BIER KAST. 24x 0,33 12 36 _ 3,42 -82,08*','Kasten 6*1.0/0.75 -1 0 _ 2,40 2,40"',
 'Ware* 19,00%- EUR','u 2 297,43 Mwst. :','Prande 19,00% : EUR m z E. 56,51 Gesamt : EUR 353,94','T: , wSt. : EUR -6,76 Gesamt : EUR -42,34',...tail].join('\n');
test('Getränkerechnung (Scan): Summen aus den Teilsummen, Positionen mit reparierten Kommas, Pfand mit Rückgabe',()=>{
 const p=billProposal(beverage([]),{usedOcr:true,fileName:'Braun_RG_455925_Belchenhalle_Bar.pdf'});
 assert.equal(p.number,'455925','Nummer aus dem Dateinamen, weil sie so im Beleg steht');assert.match(p.notes.join(' '),/im Beleg gelesen: 53925/);
 assert.deepEqual([p.net,p.tax,p.gross],[261.85,49.75,311.6]);assert.match(p.notes.join(' '),/Rechnungsbetrag war nicht lesbar/);
 const goods=p.lines.filter(l=>l.role!=='deposit'),deposit=p.lines.filter(l=>l.role==='deposit');
 assert.deepEqual(goods.map(l=>[l.name,l.quantity,l.unit,l.totalNet]),[['Fürstenberg Alkoholfrei Longneck Flasche 20x0,331',2,'Kasten',29.34],['Fürstenberg Pils Longneck Flasche 20x0,331',13,'Kasten',190.71],['Paulaner Spezi 24x0,331',3,'Kasten',45.9],['Schweppes Tonic Water 6x1,0l PET',-2,'Flasche',-4.14],['Peterstaler Classic 12x0,5I',6,'Kasten',35.62]]);
 assert.equal(goods[3].role,'return','zurückgegebene Ware');
 assert.equal(sum(goods),297.43);assert.equal(goods[4].unitNet,5.9367,'Preis nach Rabatt je Kasten');
 assert.deepEqual(deposit.map(l=>[l.quantity,l.unitNet,l.totalNet]),[[15,3.1,46.5],[-24,3.42,-82.08]],'Rückgabe zählt negativ, Zeile mit falschem Vorzeichen bleibt draußen');
 assert.ok(p.lines.every(l=>l.taxRate===19));assert.match(p.notes.join(' '),/Warensumme passt zum Beleg/);
});
test('Getränkerechnung: lesbarer Rechnungsbetrag bestätigt, widersprechender verwirft, zerrissene Teilsumme verwirft',()=>{
 assert.match(billProposal(beverage(['RECHNUNGSBETRAG EUR 311,60']),{usedOcr:true}).notes.join(' '),/der Rechnungsbetrag passt dazu/);
 assert.equal(billProposal(beverage(['RECHNUNGSBETRAG EUR 311,6]']),{usedOcr:true}).gross,311.6,'letzte Ziffer unscharf');
 assert.equal(billProposal(beverage(['RECHNUNGSBETRAG EUR 321,60']),{usedOcr:true}).gross,null);
 assert.equal(billProposal(beverage(['RECHNUNGSBETRAG EUR 321,6]']),{usedOcr:true}).gross,null);
 assert.equal(beveragePairTotals('x 57,30 Gesamt : EUR 358,87\nPfand Gesamt : EUR -42,34'),undefined,'eine Teilsumme ohne Steuer davor');
 assert.equal(beveragePairTotals('x 60,30 Gesamt : EUR 358,87'),undefined,'Steuer passt zu keinem Satz');
 assert.equal(beveragePairTotals('Pfandwert € E-Preis\nx 57,30 Gesamt : EUR 358,87'),undefined,'Pfandteil vorhanden, aber nur eine Teilsumme');
 // Ohne Texterkennung bleibt die strenge Erkennung allein zuständig
 assert.equal(billProposal(beverage([])).gross,null);
});
test('zwei verlesene Nummern auf einem Scan: der Dateiname entscheidet, ohne ihn bleibt die Rückfrage',()=>{
 const text=['Seite 1','Rechnungs-Nr.: 455922','Seite 2','Rechnungs-Nr.: 4559Z2','Ware* 19,00%: EUR 100,00 MwSt. : EUR 19,00 Gesamt : EUR 119,00','RECHNUNGSBETRAG EUR 119,00'].join('\n');
 const named=billProposal(text,{usedOcr:true,fileName:'Braun_RG_455922_Zunftscheuer.pdf'});
 assert.equal(named.needsSeparateFiles,undefined);assert.equal(named.number,'455922');assert.equal(named.gross,119);
 const plain=billProposal(text,{usedOcr:true,fileName:'Scan_0042.pdf'});
 assert.equal(plain.needsSeparateFiles,true);assert.equal(plain.scanNumberConflict,true);
});

test('Formular: sagt, was gelesen wurde und was fehlt; bestätigen und Entwurf sind zwei Knöpfe',()=>{
 const bill={id:'b',scope:'s2027',area:'Küche',supplierId:'sup',name:'',date:'2026-11-23',number:'455925',net:265.99,tax:50.54,gross:316.53,adjustmentNet:0,orderIds:[],lines:[],note:'',confirmed:false,fileName:'x.pdf',attachment:''};
 const d=new JSDOM(billForm(bill,workspace(),'Text',[],'',undefined,false,'',false,{date:false,notes:['Summen aus den Teilsummen errechnet.'],usedOcr:true})).window.document;
 const read=d.querySelector('.bill-read').textContent;
 assert.match(read,/Nummer 455925/);assert.match(read,/Netto 265,99\s*€ und Steuer 50,54\s*€/);
 assert.match(read,/Bitte ergänzen: Rechnungsdatum \(steht noch auf heute\)/);assert.match(d.querySelector('.bill-read-notes').textContent,/Teilsummen/);
 const actions=d.querySelector('.sticky-actions');
 assert.deepEqual([...actions.querySelectorAll('button')].map(b=>b.textContent),['Rechnung bestätigen','Als Entwurf speichern','Abbrechen']);
 assert.equal(actions.querySelector('button.primary').dataset.action,'ww-bill-confirm');assert.equal(actions.querySelector('button[type=submit]').className,'');
 assert.equal(actions.querySelector('[name=confirmed]').hidden,true);assert.equal(actions.querySelector('[name=confirmed]').checked,false);
 const inbox=new JSDOM(billForm({...bill,date:'2026-02-21'},workspace(),'Text',[],'',undefined,true,'2 von 5',true,{date:true,notes:[],usedOcr:false})).window.document;
 assert.equal(inbox.querySelector('.sticky-actions button.primary').textContent,'Bestätigen und nächste Rechnung');
 assert.match(inbox.querySelector('.bill-read').textContent,/Datum 21\.02\.2026/);assert.equal(inbox.querySelector('.bill-read-notes'),null);
});

test('Übersicht zählt offene Rechnungen je Saison mit den Belegen dieser Saison',()=>{
 const folder={exists:true,files:[{id:'f1',name:'a.pdf',version:'1',size:10},{id:'f2',name:'b.pdf',version:'1',size:10}]};
 const bill={kind:'bill',id:'b1',scope:'s2026',confirmed:true,sourceFile:{id:'f1',version:'1'}};
 const state={...workspace(),ww:{ready:true,records:[stored(bill)]}};
 assert.equal(openBillFiles(folder,state,'s2026'),1);
 assert.equal(openBillFiles(folder,{...state,ww:{ready:true,records:[]}},'s2026'),2,'ohne die Belege der Saison zählt alles als offen: deshalb lädt die Übersicht sie nach');
});

// ---------- Lieferanten zusammenlegen ----------
function mergeState(){
 const s=workspace();
 const braun={...supplier,id:'braun',name:'Braun',method:'E-Mail'};
 s.suppliers.push(stored(braun));
 s.articles.push(stored({...article,id:'cola',name:'Cola',category:'Getränke'}),stored({...article,id:'alt',name:'Altartikel',active:false}));
 s.offers.push(stored({...offer,id:'cola-old',articleId:'cola',code:'C1',packName:'Kasten',packSize:24}),
  stored({...offer,id:'cola-braun',articleId:'cola',supplierId:'braun',code:'C1',packName:'Kasten',packSize:24,priceNet:19}),
  stored({...offer,id:'alt-old',articleId:'alt',code:'A1'}));
 s.orders=[stored({...order,id:'placed',status:'Bestellt'}),stored({...order,id:'draft',status:'Entwurf',receipts:[],lines:[{...line,id:'l1'},{...line,id:'l2',articleId:'cola',offerId:'cola-old',code:'C1',packName:'Kasten',packSize:24}]})];
 return s;
}
test('Zusammenlegen: Artikel und Entwürfe wechseln, Geschehenes bleibt, der alte Lieferant merkt sich das Ziel',()=>{
 const s=mergeState();
 const docs=[{kind:'template',id:'t',supplierId:'sup',lines:[{offerId:'offer'},{offerId:'cola-old'}]},{kind:'rule',id:'r',supplierId:'sup'},{kind:'bill',id:'b',supplierId:'sup'},{kind:'prices',id:'p',supplierId:'sup',validFrom:'2026-01-01',lines:[]}];
 const plan=planMerge(s,docs,'sup','braun','2026-11-23');
 assert.deepEqual(plan.moved.map(m=>[m.before.id,m.after.supplierId,m.article]),[['offer','braun','Mineralwasser']]);
 assert.deepEqual(plan.doubled.map(d=>[d.before.id,d.after.active,d.twin.id]),[['cola-old',false,'cola-braun']],'gleiches Gebinde beim Ziel: dessen Eintrag bleibt');
 assert.deepEqual(plan.left.map(l=>l.offer.id),['alt-old'],'Gebinde zu inaktiven Artikeln bleiben liegen');
 assert.equal(plan.fixedOrders,1);assert.equal(plan.drafts.length,1);
 const draft=plan.drafts[0].after;
 assert.deepEqual([draft.supplierId,draft.supplierName,draft.method],['braun','Braun','E-Mail']);
 assert.deepEqual(draft.lines.map(l=>l.offerId),['offer','cola-braun'],'Entwurf zeigt auf das Gebinde, das bleibt');
 assert.deepEqual(plan.templates[0].after.lines.map(l=>l.offerId),['offer','cola-braun']);assert.equal(plan.templates[0].after.supplierId,'braun');
 assert.equal(plan.rule.after.supplierId,'braun');assert.equal(plan.ruleStays,false);
 assert.equal(plan.bills,1);assert.equal(plan.priceLists,1);
 assert.deepEqual([plan.retired.active,plan.retired.mergedInto],[false,'braun']);assert.match(plan.retired.note,/Zusammengelegt mit Braun am 23\.11\.2026\./);
 assert.match(mergeSummary(plan),/„Getränkemarkt“ ist in „Braun“ aufgegangen: 1 Artikel gewechselt, 1 Bestellentwurf umgestellt\./);
 // Hat das Ziel eigene Liefertage, bleiben sie
 const own=planMerge(s,[...docs,{kind:'rule',id:'r2',supplierId:'braun'}],'sup','braun','2026-11-23');
 assert.equal(own.rule,undefined);assert.equal(own.ruleStays,true);
});
test('Zusammenlegen: ein Entwurf mit Wareneingang oder unbekanntem Gebinde bleibt, falsche Ziele werden abgelehnt',()=>{
 const s=mergeState();
 s.orders.push(stored({...order,id:'received',status:'Entwurf',receipts:[{id:'x'}]}),stored({...order,id:'foreign',status:'Entwurf',receipts:[],lines:[{...line,offerId:'gone'}]}));
 const plan=planMerge(s,[],'sup','braun','2026-11-23');
 assert.deepEqual(plan.drafts.map(d=>d.before.id),['draft']);assert.equal(plan.fixedOrders,3);
 assert.throws(()=>planMerge(s,[],'sup','sup','2026-11-23'),/anderen Lieferanten/);
 assert.throws(()=>planMerge(s,[],'sup','nix','2026-11-23'),/Lieferanten wählen/);
 s.suppliers[1].value.active=false;
 assert.throws(()=>planMerge(s,[],'sup','braun','2026-11-23'),/inaktiv/);
});

// ---------- Ansicht: Zurück, Zusammenlegen, Kategorien ----------
function live(state,extra={}){
 const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test/kueche'});
 for(const name of ['document','Element','HTMLFormElement','HTMLSelectElement','HTMLInputElement','HTMLTextAreaElement','FormData'])globalThis[name]=dom.window[name]||dom.window.document;
 const root=document.getElementById('app');
 const saved=[];
 const store={testMode:false,load:async()=>structuredClone(state),
  saveMaster:async(kind,value,previous,op,transfer)=>{saved.push(['master',kind,value.id,transfer===true]);const list=state[kind];const i=list.findIndex(r=>r.value.id===value.id);const row=stored(value);if(i<0)list.push(row);else list[i]=row;return row;},
  saveOrder:async(value)=>{saved.push(['order',value.id]);const i=state.orders.findIndex(r=>r.value.id===value.id);state.orders[i]=stored(value);return state.orders[i];},...extra};
 return {dom,root,store,saved,view:new KitchenView(root,store,'TEST Person')};
}
const click=(dom,el)=>el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));
const wait=(ms=0)=>new Promise(r=>setTimeout(r,ms));

test('jede Unterseite hat oben links ein Zurück mit dem Namen der Seite, von der man kam',async()=>{
 const {root,view}=live(mergeState());await view.start();
 await view.action('nav','suppliers');
 assert.equal(root.querySelector('.back-link'),null,'Hauptseite ohne Zurück');
 await view.action('supplier-edit','sup');
 const back=root.querySelector('.back-link');
 assert.ok(back,'Lieferantenformular');assert.match(back.textContent,/Lieferanten/);
 await view.action(back.dataset.action,back.dataset.id||'');
 assert.equal(root.querySelector('form[data-form=master]'),null);assert.equal(root.querySelector('h1').textContent,'Lieferanten');
 await view.action('nav','articles');await view.action('article-edit','water');
 assert.match(root.querySelector('.back-link').textContent,/Artikel/);
 await view.action('back','');
 assert.equal(root.querySelector('h1').textContent,'Artikel');
});
test('Zurück mit offenen Eingaben verwirft nichts stillschweigend',async()=>{
 const {dom,root,view}=live(mergeState());await view.start();
 await view.action('nav','suppliers');await view.action('supplier-edit','sup');
 const form=root.querySelector('form[data-form=master]');
 const name=form.querySelector('[name=name]');name.value='Getränkemarkt Neu';name.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 click(dom,root.querySelector('.back-link'));await wait();
 assert.equal(root.querySelector('form[data-form=master]'),form,'Formular bleibt stehen');
 assert.equal(form.querySelector('[name=name]').value,'Getränkemarkt Neu');
 // jsdom kennt kein showModal: dann steht die Meldung auf der Seite; im Browser fragt ein Dialog „Eingaben verwerfen?“
 const dialog=root.querySelector('dialog.leave-dialog');
 assert.ok(dialog?.open||/Ungespeicherte Eingaben/.test(root.textContent));
});
test('Zusammenlegen über das Mehr-Menü: Vorschau, dann wechseln die Artikel und der alte Lieferant wird inaktiv',async()=>{
 const state=mergeState();const {dom,root,view,saved}=live(state);await view.start();
 await view.action('nav','suppliers');
 assert.ok(root.querySelector('[data-action=supplier-merge][data-id=sup]'),'Eintrag im Mehr-Menü des Lieferanten');
 await view.action('supplier-merge','sup');
 const form=root.querySelector('form[data-form=merge]');
 assert.ok(form);assert.equal(form.querySelector('button[type=submit]').disabled,true,'ohne Ziel kein Zusammenlegen');
 assert.match(root.querySelector('.back-link').textContent,/Lieferanten/);
 const target=form.querySelector('[name=mergeTarget]');
 assert.deepEqual([...target.options].map(o=>o.textContent),['Bitte wählen','Braun']);
 target.value='braun';target.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await wait();
 const preview=root.querySelector('.merge-preview').textContent;
 assert.match(preview,/1 Artikel wechselt zu Braun/);assert.match(preview,/Mineralwasser/);assert.match(preview,/1 Artikel gibt es bei Braun schon gleich/);
 assert.match(preview,/1 Bestellentwurf wird auf Braun umgestellt/);assert.match(preview,/1 aufgegebene oder abgeschlossene Bestellung/);
 assert.match(preview,/Rückgängig machen geht nur von Hand/);
 await view.save(root.querySelector('form[data-form=merge]'));
 assert.deepEqual(saved,[['master','offers','offer',true],['master','offers','cola-old',false],['order','draft'],['master','suppliers','sup',false]]);
 assert.equal(state.offers.find(r=>r.value.id==='offer').value.supplierId,'braun');
 assert.equal(state.suppliers.find(r=>r.value.id==='sup').value.active,false);
 assert.equal(root.querySelector('form[data-form=merge]'),null);assert.match(root.textContent,/ist in „Braun“ aufgegangen/);
 assert.ok(root.querySelector('details.inactive-suppliers'),'der alte Lieferant steht unter den inaktiven');
});
test('Artikel stehen nach Kategorien, mit Zahl je Gruppe und Filter',async()=>{
 const s=mergeState();
 s.articles.push(stored({...article,id:'brot',name:'Brot',category:'Backwaren'}),stored({...article,id:'ohne',name:'Zettel',category:''}));
 const {dom,root,view}=live(s);await view.start();await view.action('nav','articles');
 const groups=[...root.querySelectorAll('section.article-group')];
 assert.deepEqual(groups.map(g=>g.querySelector('h2').textContent.replace(/\s*\d+$/,'').trim()),['Backwaren','Getränke','Ohne Kategorie']);
 assert.deepEqual(groups.map(g=>[...g.querySelectorAll('.article-list-row summary')].map(r=>r.textContent.trim().split(/\s*\n\s*/)[0])),[['Brot'],['Cola','Mineralwasser','Altartikel Inaktiv'],['Zettel']],'innerhalb der Gruppe nach Namen, inaktive am Ende');
 const filter=root.querySelector('[name=articleCategory][value="Getränke"]');
 assert.ok(filter,'Filter je Kategorie');
 filter.checked=true;filter.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await wait();
 const visible=[...root.querySelectorAll('.article-list-row')].filter(r=>!r.hidden).map(r=>r.querySelector('summary').textContent.trim().split(/\s*\n\s*/)[0]);
 assert.deepEqual(visible,['Cola','Mineralwasser','Altartikel Inaktiv']);
});
