import{test}from'node:test';import assert from'node:assert/strict';import{billProposal}from'../src/kitchen/imports/bill-proposal.ts';
test('invoice text yields conservative editable metadata without inventing missing totals',()=>{const p=billProposal('Rechnung Nr. RE-2026-18\nRechnungsdatum: 12.02.2026\nNettobetrag 100,00 EUR\nMwSt. 19,00 EUR\nGesamtbetrag 119,00 EUR');assert.equal(p.number,'RE-2026-18');assert.equal(p.date,'2026-02-12');assert.equal(p.net,100);assert.equal(p.tax,19);assert.equal(p.gross,119);const empty=billProposal('Kassenbon ohne lesbare Zahlen');assert.equal(empty.gross,null);assert.equal(empty.lines.length,0);});
test('ambiguous multiple invoice totals remain open for manual review',()=>{assert.equal(billProposal('Gesamtbetrag 119,00\nGesamtbetrag 129,00').gross,null);});
test('invoice totals do not confuse taxable base with tax or read another line',()=>{
 assert.equal(billProposal('19.00% MwSt 408,03 e 77,52 e').tax,null);
 assert.equal(billProposal('MwSt\n408,03').tax,null);
 assert.equal(billProposal('zzgl. 19,00% MwSt. 27,32 EUR').tax,27.32);
 assert.equal(billProposal('Gesamtbetrag\n27,32').gross,null);
});
test('tax base and gross are accepted only when the three totals reconcile',()=>{
 const p=billProposal('Rechnungssumme 485,55 e\nSumme Netto 408,03 e\n19.00% MwSt 408,03 e 77,52 e');
 assert.equal(p.net,408.03);assert.equal(p.tax,77.52);assert.equal(p.gross,485.55);
 const bad=billProposal('Rechnungssumme 485,55 e\nSumme Netto 408,03 e\n19.00% MwSt 408,03 e 88,52 e');
 assert.equal(bad.tax,null);assert.equal(bad.gross,null);
 const other=billProposal('Gesamt Netto 670,78\nzzgl. 19,00 % USt. auf 670,78 127,45\nGesamtbetrag 798,23');
 assert.equal(other.tax,127.45);assert.equal(other.gross,798.23);
});
test('only clearly structured invoice positions become suggestions without guessing net prices from gross',()=>{
 const p=billProposal('Nr.   Artikelbeschreibung   Anz.   Brutto   Gesamtpreis\n\n1   106   Testgetränk 0,25 l\nQualitätsprodukt\n75   3,50   e   262,50   e\n\n2   803*   Testgläser   2   0,00   e   0,00   e\n\nRechnungssumme   262,50 e');
 assert.equal(p.lines.length,2);assert.equal(p.lines[0].name,'Testgetränk 0,25 l Qualitätsprodukt');assert.equal(p.lines[0].quantity,75);assert.equal(p.lines[0].unitNet,null);assert.equal(p.lines[0].totalNet,null);assert.equal(p.lines[0].articleId,null);
 const wrong=billProposal('Nr. Artikelbeschreibung Anz. Brutto Gesamtpreis\n1 106 Testgetränk\n75 3,50 e 270,00 e\nRechnungssumme 270,00');assert.equal(wrong.lines.length,0);
 assert.equal(billProposal('1 106 Testgetränk\n75 3,50 e 262,50 e').lines.length,0);
});
test('gross lines become net prices only when sum, tax rate and discount reconcile with the totals',()=>{
 const text='Nr.   Artikelbeschreibung   Anz.   Brutto   Gesamtpreis\n\n1   106   Gutedel trocken 0,25 l\n75   3,50   e   262,50   e\n\n2   503   Sekt Brut 0.2l\n42   4,90   e   205,80   e\n\n3   293   Weißherbst\n8   8,90   e   71,20   e\n\nZwischensumme   539,50   e\n\n10,00 % Rabatt   -53,95   e\n\nRechnungssumme   485,55   e\n\nSumme Netto   408,03   e\n\n19.00% MwSt   408,03 e   77,52   e';
 const p=billProposal(text);assert.deepEqual([p.net,p.tax,p.gross],[408.03,77.52,485.55]);
 assert.deepEqual(p.lines.map(l=>[l.quantity,l.unitNet,l.totalNet,l.taxRate]),[[75,2.6471,198.53,19],[42,3.7059,155.65,19],[8,6.7311,53.85,19]]);
 assert.equal(Math.round(p.lines.reduce((a,l)=>a+l.totalNet,0)*100)/100,408.03);
 const off=billProposal(text.replace('Summe Netto   408,03','Summe Netto   400,00').replace('408,03 e   77,52','400,00 e   85,55'));assert.ok(off.lines.every(l=>l.unitNet===null&&l.totalNet===null),'ohne passenden Steuersatz bleiben die Preise leer');
});
test('read positions stand in the form right away and the summary names what was read',async()=>{
 const {billForm}=await import('../src/kitchen/ww/bills-view.ts');const {workspace}=await import('./support/kitchen-data.mjs');
 const p=billProposal('Nr. Artikelbeschreibung Anz. Brutto Gesamtpreis\n1 106 Testgetränk\n75 3,50 e 262,50 e\nRechnungssumme 262,50');
 const bill={id:'b',scope:'s2027',area:'Küche',supplierId:'',name:'',date:'2026-02-20',number:'',net:null,tax:null,gross:null,adjustmentNet:0,orderIds:[],lines:[],note:'',confirmed:false,fileName:'',attachment:''};
 const html=billForm({...bill,lines:p.lines,gross:262.5},workspace(),'PDF-Text');assert.match(html,/value="Testgetränk"/);assert.doesNotMatch(html,/Positionen übernehmen/);assert.match(html,/Aus der Rechnung gelesen:<\/strong> Brutto 262,50\s€ · 1 Position/);assert.match(html,/Bitte ergänzen:<\/strong> Lieferant, Rechnungsnummer/);
});
test('a clearly labelled net-price table proposes quantities and matching net amounts',()=>{
 const p=billProposal('Pos Menge Art.-Nr. Text Einzelpreis\nEUR\nUSt.\n%\nGesamtpreis\nEUR\n1 92,00 Fl. A123 Testgetränk\nQualitätsprodukt\n3,45 19,00 317,40\nGesamt Netto 317,40');
 assert.equal(p.lines.length,1);assert.equal(p.lines[0].name,'Testgetränk Qualitätsprodukt');assert.equal(p.lines[0].quantity,92);assert.equal(p.lines[0].unit,'Fl.');assert.equal(p.lines[0].unitNet,3.45);assert.equal(p.lines[0].totalNet,317.4);assert.equal(p.lines[0].taxRate,19);
 const bad=billProposal('Pos Menge Art.-Nr. Text Einzelpreis\n1 92,00 Fl. A123 Test\n3,45 19,00 318,00\nGesamt Netto 318,00');assert.equal(bad.lines.length,0);
});
test('discounted invoice table suggests lines only when amount and discount reconcile',()=>{
 const text='Pos. Artikelnummer Artikelbezeichnung Menge USt. Einzelpreis Rabatt Gesamtpreis\n1 42007 Apfel-Prickler\n750ml\n6 Stk. 19 % 8,32 EUR 15 % 42,43 EUR\nZwischensumme (Netto) 42,43 EUR';const p=billProposal(text);
 assert.equal(p.net,42.43);assert.equal(p.lines.length,1);assert.equal(p.lines[0].name,'Apfel-Prickler 750ml');assert.equal(p.lines[0].quantity,6);assert.equal(p.lines[0].unit,'Stk.');assert.equal(p.lines[0].unitNet,7.0717);assert.equal(p.lines[0].totalNet,42.43);assert.equal(p.lines[0].taxRate,19);
 assert.equal(billProposal(text.replace('42,43 EUR\n','43,00 EUR\n')).lines.length,0);
});
test('multi-rate totals and product rows are proposed only when their printed arithmetic matches',()=>{
 const t='RECHNUNGS-NR. 06.02.2026/071/0/0032/002902\nMM ART.-NR EAN ARTIKEL PACK EINZEL INHALT KOLLI MENGE GESAMT\n516043.7 5000157104885 100x17ml TEST KETCHUP KT 8,990 1 8,99 5 44,95 B 8,190 *\nNETTO-WARENWERT: 125,48\nNETTOWERT % MWST MWST BRUTTO\n38,98 A=19,00% 7,41 46,39\n86,50 B=7,00% 6,06 92,56\n125,48 13,47 138,95\nSUMME EUR 138,95';const p=billProposal(t);
 assert.equal(p.number,'06.02.2026/071/0/0032/002902');assert.equal(p.net,125.48);assert.equal(p.tax,13.47);assert.equal(p.gross,138.95);assert.equal(p.lines.length,1);assert.equal(p.lines[0].quantity,5);assert.equal(p.lines[0].unit,'KT');assert.equal(p.lines[0].unitNet,null);
 const wrong=billProposal(t.replace('125,48 13,47 138,95','125,48 14,47 138,95'));assert.equal(wrong.tax,null);assert.equal(wrong.gross,null);
});

test('explicit Gutschrift header and signed net positions preserve originals and suggest deposit and return roles',async()=>{
 const {billProposal}=await import('../src/kitchen/imports/bill-proposal.ts');
 const text=['Gutschrift Nr. TEST-G-17','Belegdatum: 07.02.2027','Pos Menge Art.-Nr. Text Einzelpreis',
  '1 -2,00 Kiste TEST1 Rückgabe Mineralwasser','6,00 19,00 -12,00',
  '2 -2,00 Stk TEST2 Pfand','1,80 19,00 -3,60','Gesamt Netto: -15,60','MwSt.: -2,96','Gesamtbetrag: -18,56'].join('\n');
 const proposal=billProposal(text);
 assert.equal(proposal.billType,'credit');
 assert.equal(proposal.number,'TEST-G-17');
 assert.equal(proposal.gross,-18.56);
 assert.deepEqual(proposal.lines.map(r=>[r.role,r.quantity,r.totalNet]),[['return',-2,-12],['deposit',-2,-3.6]]);
 assert.equal(billProposal('Info zur früheren Gutschrift\nRechnung Nr. 4').billType,undefined);
});

test('separate invoice and credit headers suppress all proposals while repeated page headers stay one invoice',async()=>{
 const {billProposal}=await import('../src/kitchen/imports/bill-proposal.ts');
 const invoice='Seite 1\nRechnungsnummer: TEST-456\nRechnungsdatum: 20.02.2026\nGesamtbetrag: 1.530,13';
 const credit='Seite 4\nGutschrift Nr. TEST-457\nGesamtbetrag: -80,49';
 const mixed=billProposal(invoice+'\n\n'+credit);
 assert.equal(mixed.needsSeparateFiles,true);
 assert.equal(mixed.number,'');assert.equal(mixed.gross,null);assert.deepEqual(mixed.lines,[]);
 const repeat=billProposal(invoice+'\n\nSeite 2\nRechnungsnummer: TEST-456');
 assert.equal(repeat.needsSeparateFiles,undefined);
 const scoped=billProposal(invoice+'\nLieferung Zunftabend Bar:\nLieferung Zunftabend Küche:\nLieferung Zunftabend Zunftscheuer:');
 assert.deepEqual(scoped.costAreas,['Bar','Küche','Zunftscheuer']);
 assert.equal(scoped.needsSeparateFiles,undefined);
});

test('scanned tax summary assigns each printed column and ignores delivery dates', () => {
    const text = [
        'Seite 1', 'Rechnung Nr. 12345678 - 87654321 Datum: 20.02.2026',
        'Bitte unter Angabe der Rechnungsnummer und Kundennummer überweisen.',
        'Seite 2', 'Anhang zur Rechnung Nr. 12345678-87654321:',
        'Lieferdatum: 17.02.2026',
        'Artikel Nr. Beschreibung Menge Einzelpreis Preis nach Rabatt UST',
        '0000000000123 PAPRIKA 5 Stk 2,00 10,00 10,00 7%',
        '0000000000124 FEHLERHAFTE ZEILE 2 Stk 3,00 6,00 600 7%',
        'Summe Lieferschein 16,00',
        'UST-Satz Netto-Entgelt UST-Betrag Brutto-Entgelt',
        '7% 100,00 7,00 107,00', '19% 50,00 9,50 59,50',
        'Gesamtbetrag 150,00 16,50 166,50', 'Total 150,00 16,50 166,50'
    ].join('\n');
    const result = billProposal(text);
    assert.equal(result.number, '12345678-87654321');
    assert.equal(result.date, '2026-02-20');
    assert.deepEqual([result.net, result.tax, result.gross], [150, 16.5, 166.5]);
    assert.deepEqual(result.lines.map(({name,quantity,unit,unitNet,totalNet,taxRate}) =>
        [name,quantity,unit,unitNet,totalNet,taxRate]), [['PAPRIKA',5,'Stk',null,null,7]]);
    const inconsistent = billProposal(text.replace('59,50', '59,80'));
    assert.deepEqual([inconsistent.net, inconsistent.tax, inconsistent.gross], [null, null, null]);
    assert.equal(billProposal('Gesamtbetrag -150,00 -16,50 -166,50').gross, null);
    assert.equal(billProposal('Rechnungs-Nr.: 26 - 10123   Seite:').number, '26-10123');
    assert.equal(billProposal('Rechnungs-Nr. 01/12/345 TECHNICAL ID: 111').number, '01/12/345');
    assert.equal(billProposal('Belegdatum\n\n20.02.2026\nVersanddatum: 21.02.2026').date, '2026-02-20');
});

test('a scanned credit notice with a signed tax table leaves its missing document number open', () => {
    const text = [
        'Proforma-Lieferschein Datum: 25.02.2026', 'Gutschrift 35,68 EUR',
        'Bitte unter Angabe der Rechnungsnummer und Kundennummer überweisen.',
        'Artikel Nr. Beschreibung Menge Einzelpreis Preis nach Rabatt UST',
        '0000000000456 TESTARTIKEL -2 Stk 4,50 -9,00 -9,00 19%',
        'Summe Lieferschein -9,00',
        'UST-Satz Netto-Entgelt UST-Betrag Brutto-Entgelt',
        '7% -20,00 -1,40 -21,40', '19% -12,00 -2,28 -14,28',
        'Gesamtbetrag -32,00 -3,68 -35,68', 'Total -32,00 -3,68 -35,68'
    ].join('\n');
    const result = billProposal(text);
    assert.equal(result.billType, 'credit');
    assert.equal(result.number, '');
    assert.equal(result.date, '2026-02-25');
    assert.deepEqual([result.net, result.tax, result.gross], [-32, -3.68, -35.68]);
    assert.deepEqual(result.lines.map(({role,quantity,totalNet}) => [role,quantity,totalNet]), [['return',-2,null]]);
    assert.equal(billProposal(text.replace('Gutschrift 35,68', 'Gutschrift 36,68')).billType, undefined);
    const collection = billProposal('Seite 1\nRechnung Nr. TEST-1\nSeite 2\n' + text);
    assert.equal(collection.needsSeparateFiles, true);
    assert.equal(collection.gross, null);
});

const beverageSummary = [
    'Seite 1', 'Rechnungs-Nr.: TEST-4550', 'Rechnungsdatum: 21.02.2026',
    'Ware * 19,00% : EUR 1.000,00 MwSt. : EUR 190,00 Gesamt : EUR 1.190,00',
    'Pfand* 19,00%: EUR -200,00 MwSt. : EUR -38,00 Gesamt : EUR -238,00',
    'RECHNUNGSBETRAG EUR 952,00'
].join('\n');

test('a beverage invoice reconciles printed goods and deposit totals including negative deposit', () => {
    const result = billProposal(beverageSummary);
    assert.equal(result.number, 'TEST-4550');
    assert.equal(result.date, '2026-02-21');
    assert.deepEqual([result.net, result.tax, result.gross], [800, 152, 952]);
    assert.equal(result.billType, undefined);
    assert.deepEqual(result.lines, []);
});

test('unreadable or conflicting beverage totals do not become proposals', () => {
    for (const text of [
        beverageSummary.replace('952,00', '952,0]'),
        beverageSummary.replace('952,00', '952,10'),
        beverageSummary.replace('38,00', '35,00'),
        beverageSummary.replace('1.190,00', '1.191,00'),
        beverageSummary.replace(/\nPfand[^\n]+/, ''),
        beverageSummary + '\nRECHNUNGSBETRAG EUR 1.190,00',
        beverageSummary + '\nSeite 2\nRechnungs-Nr.: TEST-4551'
    ]) {
        const { net, tax, gross } = billProposal(text);
        assert.deepEqual([net, tax, gross], [null, null, null]);
    }
});

test('number conflicts from scan OCR can be reviewed only without evidence of separate documents', () => {
    const first = 'Seite 1\nRechnung\nRechnungs-Nr.: TEST-4550';
    const continuation = '\nSeite 2\nRechnungs-Nr.: TEST-4558\nRechnungsbetrag EUR 119,00';
    const result = billProposal(first + continuation, { usedOcr: true });
    assert.equal(result.needsSeparateFiles, true);
    assert.equal(result.scanNumberConflict, true);
    assert.deepEqual([result.number, result.net, result.tax, result.gross, result.lines.length], ['', null, null, null, 0]);
    assert.equal(billProposal(first + continuation).scanNumberConflict, undefined);
    assert.equal(billProposal(first + '\nGesamtbetrag 99,00' + continuation, { usedOcr: true }).scanNumberConflict, undefined);
    assert.equal(billProposal(first + '\nSeite 2\nGutschrift Nr. TEST-4558', { usedOcr: true }).scanNumberConflict, undefined);
});
