// Layouts der echten Belege Fasnet 2026 (Text gekürzt, Beträge wie auf den Belegen).
import {test} from 'node:test';import assert from 'node:assert/strict';
import {billProposal} from '../src/kitchen/imports/bill-proposal.ts';
test('Bäckerei: Summenzeile Netto/MwSt/Brutto und Positionen mit Rabatt',()=>{
 const text=['Rechnungs-Nr.: 26 - 10123   Seite:','Datum: 24.02.2026','Rabatt','in %','Preis Art.Nr.   Bezeichnung',
 'Schweizer Brötchen   70   Stück   0,60   10,0   0,54   37,80 3','Spitzbrötchen   470   Stück   0,90   10,0   0,81   380,70 320',
 'Halbweiß BaslerArt 1kg   26   Stück   6,00   10,0   5,40   140,40 1070','Quarkbällchen Stk.   300   Stück   0,80   10,0   0,72   216,00 8102',
 'Summe:   774,90','Netto:   724,21   7,0 % MwSt:   50,69   Brutto:   774,90','Zahlbetrag EUR:   774,90'].join('\n');
 const p=billProposal(text);
 assert.equal(p.number,'26-10123');assert.equal(p.date,'2026-02-24');
 assert.deepEqual([p.net,p.tax,p.gross],[724.21,50.69,774.9]);
 assert.equal(p.lines.length,4);assert.equal(p.lines[1].name,'Spitzbrötchen');assert.equal(p.lines[1].quantity,470);
 // Positionen sind brutto. Weil Summe, Steuersatz und Nettosumme zusammenpassen, werden sie in Netto umgerechnet.
 assert.deepEqual(p.lines.map(l=>[l.unitNet,l.totalNet,l.taxRate]),[[0.5047,35.33,7],[0.757,355.8,7],[5.0467,131.21,7],[0.6729,201.87,7]]);
 assert.equal(Math.round(p.lines.reduce((a,l)=>a+l.totalNet,0)*100)/100,724.21);
});
test('Bäckerei: widersprüchliche Summenzeile wird nicht übernommen',()=>{
 const p=billProposal('Netto:   724,21   7,0 % MwSt:   50,69   Brutto:   780,00');
 assert.deepEqual([p.net,p.tax,p.gross],[null,null,null]);
});
test('Shop-Rechnung: Nummer und Datum als getrennte Blöcke, Rundung bei Rabatt',()=>{
 const text=['RECHNUNG','Rechnungsnummer:','Rechnungsdatum:','RE-202626085','19.02.2026',
 'Pos.   Artikelnummer   Artikelbezeichnung   Menge   USt.   Einzelpreis   Rabatt   Gesamtpreis',
 'Lieferung Zunftabend Bar:','1   42007   Paradies-Prickler Apfel-Rosenblüte','750ml','6 Stk.   19 %   8,32 EUR   15 %   42,43 EUR',
 'Lieferung Zunftabend Küche:','2   42006   Paradies-Prickler Apfel-Rosenblüte','200ml','22 Stk.   19 %   3,15 EUR   15 %   58,93 EUR',
 'Zwischensumme (Netto)   143,79 EUR'].join('\n');
 const p=billProposal(text);
 assert.equal(p.number,'RE-202626085');assert.equal(p.date,'2026-02-19');
 assert.equal(p.lines.length,2);assert.equal(p.lines[1].totalNet,58.93);assert.equal(p.lines[1].quantity,22);
 // deutlich abweichender Betrag bleibt draußen
 assert.equal(billProposal(text.replace('58,93','60,93')).lines.length,1);
});
test('Weingut: kurze Position mit Beträgen in derselben Zeile',()=>{
 const text=['Rechnung Nr. 2026024','Datum:   21.02.2026','Pos   Menge   Art.-Nr.   Text   Einzelpreis',
 '1   117,00   Fl.   G2401   2023 Gutedel','Qualitätswein trocken 1 ltr.','3,45   19,00   403,65',
 '2   49,00   St.   GL002W   1/4 ltr. Glas   1,60   19,00   78,40','Gesamt Netto   482,05','zzgl. 19,00 % USt. auf   482,05   91,59','Gesamtbetrag   573,64'].join('\n');
 const p=billProposal(text);
 assert.equal(p.gross,573.64);assert.equal(p.lines.length,2);
 assert.deepEqual([p.lines[1].name,p.lines[1].quantity,p.lines[1].unit,p.lines[1].unitNet,p.lines[1].totalNet],['1/4 ltr. Glas',49,'St.',1.6,78.4]);
});
test('Texterkennung: abgeschnittene Rechnungsnummer auf Seite 2 trennt den Beleg nicht',()=>{
 const text=['RECHNUNG','Rechnungs-Nr.: 455','Seite 2','RECHNUNG','Datum: 21.02.2026','Rechnungs-Nr.: 455923','RECHNUNGSBETRAG EUR 797,03'].join('\n');
 const scan=billProposal(text,{usedOcr:true});
 assert.equal(scan.needsSeparateFiles,undefined);assert.equal(scan.number,'455923');
 // Ohne Texterkennung bleiben zwei Nummern ein Warnsignal
 assert.equal(billProposal(text).needsSeparateFiles,true);
});
test('Texterkennung Getränkerechnung: Sternchen als Anführungszeichen, letzte Ziffer unscharf',()=>{
 const text=['Seite 1','Rechnungs-Nr.: Be','Seite 2','Datum: 21.02.2026','Rechnungs-Nr.: 455922',
 'Ware* 19,00%: EUR 351,84 MwSt. : EUR 66,85 Gesamt : EUR 418,69','Pfand“ 19,00% : EUR 108,00 MwSt. : EUR 20,52 Gesamt : EUR 128,52','RECHNUNGSBETRAG EUR 547,2]'].join('\n');
 const p=billProposal(text,{usedOcr:true});
 assert.equal(p.needsSeparateFiles,undefined);assert.equal(p.number,'455922');assert.deepEqual([p.net,p.tax,p.gross],[459.84,87.37,547.21]);
 // passt die unscharfe Zahl nicht zu den Teilsummen, bleibt alles offen
 assert.equal(billProposal(text.replace('547,2]','548,2]'),{usedOcr:true}).gross,null);
});
test('Texterkennung Sammelgutschrift: Gesamtzeile ohne Steuerzeilen nur mit zweiter Fundstelle',()=>{
 const base=['Proforma-Lieferschein Datum: 25.02.2026','| UST-Satz Netto-Entgelt UST-Betrag Brutto-Entgelt','Gesamtbetrag -73,81 -6,68 -80,49'];
 const p=billProposal([...base,'Summe aller bezogenen Waren und Leistungen -80,49 EUR'].join('\n'),{usedOcr:true});
 assert.deepEqual([p.net,p.tax,p.gross],[-73.81,-6.68,-80.49]);
 assert.equal(billProposal(base.join('\n'),{usedOcr:true}).gross,null);
});
