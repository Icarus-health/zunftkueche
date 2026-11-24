// Eingang, Kern ohne Oberfläche: Meldung verstehen, gegen Stammdaten prüfen, zwei Lesungen vergleichen, Datensätze bauen.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {INTAKE_SCHEMA,intakePrompt,normalizeIntake,saidNumber,resolveDay,lexicalCandidates,checkIntake,mergeReadings,readIntake} from '../src/kitchen/ai/intake.ts';
import {intakeContext,buildCounts,buildOrders,reorderMessage} from '../src/kitchen/intake-records.ts';
import {kitchen} from './support/eingang-data.mjs';

const ctx=()=>intakeContext(kitchen(),'s2027','Küche','2027-02-05');
const entry=(o={})=>({kind:'count',spoken:'',articleId:'',alternatives:[],quantity:'',quantityUnit:'unknown',quantityWord:'',loose:'',state:'none',supplierId:'',day:'',...o});
const reading=(entries,extra={})=>normalizeIntake({entries,other:[],documentType:'none',question:'',...extra});
const scope=()=>{let i=0;return {seasonId:'s2027',area:'Küche',user:'TEST Person',now:'2027-02-05T22:10:00.000Z',id:()=>'id-'+(++i)};};

test('Schema: geschlossen, alles Pflicht, Mengen als Text; Auftrag nennt Datum, Lieferanten und Artikel mit Gebinden',()=>{
 const walk=o=>{if(o.type==='object'){assert.equal(o.additionalProperties,false);assert.deepEqual(o.required,Object.keys(o.properties));Object.values(o.properties).forEach(walk);}if(o.type==='array')walk(o.items);assert.ok(!('anyOf' in o)&&!('minimum' in o));};
 walk(INTAKE_SCHEMA);
 assert.equal(INTAKE_SCHEMA.properties.entries.items.properties.quantity.type,'string');
 const p=intakePrompt(ctx(),'Pils noch drei Kästen',false);
 assert.match(p,/^Heute: 2027-02-05 \(Freitag\)\. Bereich: Küche\./);
 assert.match(p,/braun \| Getränke Braun/);assert.doesNotMatch(p,/Altlieferant/,'inaktive Lieferanten gehen nicht hinaus');
 assert.match(p,/pils33 \| Pils 0,33 l \| Flasche \| Kasten zu 24 \(Getränke Braun\)/);
 assert.match(p,/cola \| Cola \| Flasche \| Kasten zu 24 \(Getränke Braun\); Kasten zu 12 \(Waldhaus\)/);
 assert.match(p,/salz \| Salz \| kg \| kein Gebinde/);assert.doesNotMatch(p,/Ausgelistet/);
 assert.match(p,/Meldung:\nPils noch drei Kästen$/);
 assert.match(intakePrompt(ctx(),'',true),/Meldung \(dazu das Foto\):\n\(nur das Foto\)$/);
});
test('Antwort des Modells wird vollständig: Fehlendes bleibt leer, Auswahlwerte unabhängig von Groß- und Kleinschreibung',()=>{
 const r=normalizeIntake({entries:[{kind:'REORDER',spoken:' Pils ',quantity:3,quantityUnit:'Pack',state:'LOW'},null,'x'],other:['Wer hat den Schlüssel?',''],question:null});
 assert.deepEqual(r.entries[0],{kind:'reorder',spoken:'Pils',articleId:'',alternatives:[],quantity:'',quantityUnit:'pack',quantityWord:'',loose:'',state:'low',supplierId:'',day:''});
 assert.equal(r.entries.length,3);assert.equal(r.entries[1].kind,'count');
 assert.deepEqual(r.other,['Wer hat den Schlüssel?']);assert.equal(r.documentType,'none');assert.equal(r.question,'');
 assert.deepEqual(normalizeIntake('kaputt'),{entries:[],other:[],documentType:'none',question:''});
});
test('genannte Zahlen und Tage: nur Eindeutiges zählt',()=>{
 assert.equal(saidNumber('3'),3);assert.equal(saidNumber('1,5'),1.5);assert.equal(saidNumber(' 12 '),12);
 for(const bad of ['drei','3-4','ca. 3','','-2','1.234.567','3 Kästen'])assert.equal(saidNumber(bad),undefined,bad);
 const t='2027-02-05'; // Freitag
 assert.equal(resolveDay('heute',t),'2027-02-05');assert.equal(resolveDay('Morgen',t),'2027-02-06');assert.equal(resolveDay('übermorgen',t),'2027-02-07');
 assert.equal(resolveDay('Samstag',t),'2027-02-06');assert.equal(resolveDay('am Montag',t),'2027-02-08');
 assert.equal(resolveDay('Freitag',t),'2027-02-12','der genannte Wochentag ist nie heute');
 assert.equal(resolveDay('6.2.',t),'2027-02-06');assert.equal(resolveDay('06.02.2027',t),'2027-02-06');assert.equal(resolveDay('6.2.27',t),'2027-02-06');
 assert.equal(resolveDay('3.1.','2026-12-28'),'2027-01-03','ohne Jahr gilt der nächste solche Tag');
 assert.equal(resolveDay('04.02.2027',t),'','Vergangenes wird nicht übernommen');
 for(const bad of ['nächste Woche','bald','31.2.','','Fasnet'])assert.equal(resolveDay(bad,t),'',bad);
});
test('eigene Wortsuche der App findet Artikel unabhängig vom Modell',()=>{
 const a=ctx().articles;
 assert.deepEqual(lexicalCandidates('Pils noch drei Kästen',a).sort(),['pils33','pils50']);
 assert.deepEqual(lexicalCandidates('Spezi ist leer',a),['spezi']);
 assert.deepEqual(lexicalCandidates('noch drei Kästen',a),[],'Füllwörter, Zahlen und Einheiten zählen nicht');
 assert.deepEqual(lexicalCandidates('zwei Fässer Fassbier',a),['fass']);
});
test('Bestandsmeldung: Gebinde, Einzelmenge, leer, knapp',()=>{
 const lines=checkIntake(reading([
  entry({spoken:'Spezi noch drei Kästen und fünf Flaschen',articleId:'spezi',quantity:'3',quantityUnit:'pack',quantityWord:'Kästen',loose:'5'}),
  entry({spoken:'Fassbier ist leer',articleId:'fass',state:'empty'}),
  entry({spoken:'Salz wird knapp, noch 2 Kilo',articleId:'salz',quantity:'2',quantityUnit:'piece',state:'low'}),
  entry({spoken:'Cola 10 Flaschen',articleId:'cola',quantity:'10',quantityUnit:'piece'})
 ]),ctx());
 assert.deepEqual([lines[0].articleId,lines[0].offerId,lines[0].packs,lines[0].loose,lines[0].reorder,lines[0].flags],['spezi','sp',3,5,false,[]]);
 assert.deepEqual([lines[1].packs,lines[1].loose,lines[1].reorder,lines[1].flags],[undefined,0,true,[]],'leer heißt null und Nachbestellen vorgemerkt');
 assert.deepEqual([lines[2].offerId,lines[2].loose,lines[2].reorder,lines[2].flags],['',2,true,[]]);
 assert.deepEqual([lines[3].offerId,lines[3].packs,lines[3].loose],['',undefined,10],'Einzelstücke bleiben Einzelstücke');
 assert.deepEqual(lines[3].flags,['Mehrere Gebinde oder Lieferanten möglich. Bitte wählen.'],'Cola gibt es in zwei Kastengrößen');
});
test('Gebinde der Größe 1 ist die Einzelmenge: nichts wird umgerechnet, ein gesagtes Gebinde wird hinterfragt',()=>{
 const check=e=>checkIntake(reading([entry(e)]),ctx())[0];
 const bottles=check({spoken:'Gutedel noch 3 Flaschen',articleId:'wein',quantity:'3',quantityUnit:'piece'});
 assert.deepEqual([bottles.offerId,bottles.packs,bottles.loose,bottles.flags],['',undefined,3,[]]);
 const crates=check({spoken:'Gutedel noch 2 Kisten',articleId:'wein',quantity:'2',quantityUnit:'pack',quantityWord:'Kisten'});
 assert.deepEqual([crates.offerId,crates.packs,crates.loose],['',undefined,2]);
 assert.deepEqual(crates.flags,['Gesagt war ein Gebinde („Kisten“), hinterlegt ist nur die Einzelmenge. Bitte die Stückzahl prüfen.']);
 const order=check({kind:'reorder',spoken:'sechs Flaschen Gutedel bestellen',articleId:'wein',quantity:'6',quantityUnit:'piece'});
 assert.deepEqual([order.offerId,order.packs,order.loose,order.flags],['gu',6,undefined,[]]);
});
test('Unklares wird nie still übernommen: jede Unsicherheit steht als Hinweis an der Zeile',()=>{
 const check=(e,pattern)=>{const l=checkIntake(reading([entry(e)]),ctx())[0];assert.ok(l.flags.some(f=>pattern.test(f)),JSON.stringify(l.flags)+' ~ '+pattern);return l;};
 const two=check({spoken:'Pils noch drei Kästen',alternatives:['pils33','pils50'],quantity:'3',quantityUnit:'pack'},/Mehrere Artikel passen/);
 assert.equal(two.articleId,'');assert.deepEqual(two.candidates.sort(),['pils33','pils50']);
 const guessed=check({spoken:'Pils noch drei Kästen',articleId:'pils33',quantity:'3',quantityUnit:'pack'},/Ähnliche Artikel/);
 assert.equal(guessed.articleId,'pils33','Vorschlag bleibt, aber mit Hinweis');assert.ok(guessed.candidates.includes('pils50'));
 check({spoken:'Zitronen noch 5',articleId:'',quantity:'5'},/Artikel nicht erkannt/);
 check({spoken:'Spezi noch drei Kästen',articleId:'cola',quantity:'3',quantityUnit:'pack'},/passen eher zu einem anderen Artikel/);
 check({spoken:'Spezi',articleId:'gibtsnicht',quantity:'3',quantityUnit:'pack'},/nicht in der Artikelliste/);
 check({spoken:'Spezi noch drei',articleId:'spezi',quantity:'3'},/Keine Einheit genannt/);
 check({spoken:'Spezi noch ein paar',articleId:'spezi',quantity:'ein paar',quantityUnit:'pack'},/keine lesbare Zahl/);
 check({spoken:'Spezi wird knapp',articleId:'spezi',state:'low'},/Keine Menge genannt/);
 check({spoken:'Spezi leer, noch 2 Kästen',articleId:'spezi',quantity:'2',quantityUnit:'pack',state:'empty'},/„Leer“ und eine Menge zugleich/);
 check({spoken:'Spezi noch 2,5 Kästen',articleId:'spezi',quantity:'2,5',quantityUnit:'pack'},/ganze Zahl/);
 check({spoken:'Spezi noch 300 Kästen',articleId:'spezi',quantity:'300',quantityUnit:'pack'},/Ungewöhnlich große Menge/);
 const sack=check({spoken:'Salz noch 2 Säcke',articleId:'salz',quantity:'2',quantityUnit:'pack'},/kein Gebinde hinterlegt/);
 assert.deepEqual([sack.packs,sack.loose],[undefined,2]);
 const twice=checkIntake(reading([entry({spoken:'Spezi 3 Kästen',articleId:'spezi',quantity:'3',quantityUnit:'pack'}),entry({spoken:'Spezi 4 Kästen',articleId:'spezi',quantity:'4',quantityUnit:'pack'})]),ctx());
 assert.deepEqual(twice[0].flags,[]);assert.match(twice[1].flags.join(),/zweimal/);
});
test('Nachbestellung: Gebinde, Lieferant, Tag',()=>{
 const check=e=>checkIntake(reading([entry({kind:'reorder',...e})]),ctx())[0];
 const a=check({spoken:'bestell fünf Kästen Spezi für morgen',articleId:'spezi',quantity:'5',quantityUnit:'pack',day:'morgen'});
 assert.deepEqual([a.offerId,a.packs,a.day,a.reorder,a.flags],['sp',5,'2027-02-06',false,[]]);
 const cola=check({spoken:'zwei Kästen Cola',articleId:'cola',quantity:'2',quantityUnit:'pack'});
 assert.match(cola.flags.join(),/Mehrere Gebinde oder Lieferanten/,'zwei Lieferanten: die App wählt nicht selbst');
 const named=check({spoken:'zwei Kästen Cola beim Waldhaus',articleId:'cola',quantity:'2',quantityUnit:'pack',supplierId:'wald'});
 assert.deepEqual([named.offerId,named.flags],['co2',[]],'genannter Lieferant entscheidet');
 assert.match(check({spoken:'Spezi beim Waldhaus',articleId:'spezi',quantity:'2',quantityUnit:'pack',supplierId:'wald'}).flags.join(),/Lieferanten ist dieser Artikel nicht hinterlegt/);
 const exact=check({spoken:'48 Flaschen Spezi',articleId:'spezi',quantity:'48',quantityUnit:'piece'});
 assert.deepEqual([exact.packs,exact.loose,exact.flags],[2,undefined,[]],'48 Flaschen sind genau 2 Kästen');
 assert.match(check({spoken:'30 Flaschen Spezi',articleId:'spezi',quantity:'30',quantityUnit:'piece'}).flags.join(),/kein ganzes Gebinde/);
 assert.match(check({spoken:'Spezi bestellen',articleId:'spezi'}).flags.join(),/Bestellmenge fehlt/);
 assert.match(check({spoken:'Salz bestellen 2',articleId:'salz',quantity:'2',quantityUnit:'piece'}).flags.join(),/kein Lieferant hinterlegt/);
 assert.match(check({spoken:'Spezi 2 Kästen für bald',articleId:'spezi',quantity:'2',quantityUnit:'pack',day:'bald'}).flags.join(),/Tag „bald“ nicht eindeutig/);
});
test('zwei Lesungen: Abweichung, Fehlendes und Zusätzliches werden vermerkt, Gleiches bleibt unauffällig',()=>{
 const line=e=>checkIntake(reading([entry(e)]),ctx())[0];
 const same=mergeReadings([line({spoken:'Spezi 3 Kästen',articleId:'spezi',quantity:'3',quantityUnit:'pack'})],[line({spoken:'Spezi drei Kästen',articleId:'spezi',quantity:'3',quantityUnit:'pack'})]);
 assert.deepEqual(same.map(l=>l.flags),[[]]);
 const differ=mergeReadings([line({spoken:'Spezi 3 Kästen',articleId:'spezi',quantity:'3',quantityUnit:'pack'})],[line({spoken:'Spezi 13 Kästen',articleId:'spezi',quantity:'13',quantityUnit:'pack'})]);
 assert.match(differ[0].flags.join(),/Zwei Lesungen, zwei Mengen: 3 Gebinde und keine Angabe einzeln gegen 13 und keine Angabe/);assert.equal(differ[0].packs,3);
 const other=mergeReadings([line({spoken:'Pils 3 Kästen',articleId:'pils33',quantity:'3',quantityUnit:'pack'})],[line({spoken:'Pils 3 Kästen',articleId:'pils50',quantity:'3',quantityUnit:'pack'})]);
 assert.match(other[0].flags.join(),/anderen Artikel/);
 const missing=mergeReadings([line({spoken:'Spezi 3 Kästen',articleId:'spezi',quantity:'3',quantityUnit:'pack'}),line({spoken:'Fassbier leer',articleId:'fass',state:'empty'})],[line({spoken:'Spezi 3 Kästen',articleId:'spezi',quantity:'3',quantityUnit:'pack'})]);
 assert.match(missing[1].flags.join(),/zweite Lesung kennt diesen Eintrag nicht/);
 const extra=mergeReadings([],[line({spoken:'Fassbier leer',articleId:'fass',state:'empty'})]);
 assert.equal(extra.length,1);assert.match(extra[0].flags.join(),/Nur eine der zwei Lesungen/);
});
test('Meldung lesen: zwei Aufrufe mit demselben Auftrag, Foto geht mit, Kosten werden addiert',async()=>{
 const sent=[];const answers=[reading([entry({spoken:'Spezi 3 Kästen',articleId:'spezi',quantity:'3',quantityUnit:'pack'})],{question:''}),reading([entry({spoken:'Spezi 3 Kästen',articleId:'spezi',quantity:'8',quantityUnit:'pack'})],{other:['Wer schließt ab?']})];
 const fake=async(url,init)=>{const body=JSON.parse(init.body);sent.push(body);return new Response(JSON.stringify({model:'claude-haiku-5-5',stop_reason:'end_turn',usage:{input_tokens:900,output_tokens:120},content:[{type:'text',text:JSON.stringify(answers[sent.length-1])}]}),{status:200});};
 const photo={name:'zettel.jpg',mediaType:'image/jpeg',bytes:new Uint8Array([255,216,255])};
 const r=await readIntake({provider:'anthropic',key:'k',model:'claude-haiku-5-5'},ctx(),'Spezi 3 Kästen',photo,fake);
 assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);
 assert.equal(sent[0].messages[0].content[0].type,'image');assert.match(sent[0].messages[0].content[1].text,/Meldung \(dazu das Foto\):\nSpezi 3 Kästen$/);
 assert.equal(sent[0].output_config.format.type,'json_schema');assert.ok(!('temperature' in sent[0]));
 assert.equal(r.lines.length,1);assert.match(r.lines[0].flags.join(),/Zwei Lesungen, zwei Mengen/);
 assert.deepEqual(r.other,['Wer schließt ab?']);assert.deepEqual([r.usage.input,r.usage.output,r.usage.model],[1800,240,'claude-haiku-5-5']);assert.equal(r.readings.length,2);
 await assert.rejects(readIntake({provider:'anthropic',key:'',model:'m'},ctx(),'x',undefined,fake),e=>e.kind==='key');
});

// ---------- Datensätze ----------
const confirmed=(o={})=>({kind:'count',spoken:'Spezi noch drei Kästen',articleId:'spezi',offerId:'sp',packs:3,loose:null,reorder:false,day:'',...o});
test('Bestandsmeldung speichern: Gebinde mal Größe plus Einzelmenge, Diktat steht im Hinweis',()=>{
 const counts=buildCounts([confirmed({loose:5,reorder:true}),confirmed({spoken:'Salz 2 Kilo',articleId:'salz',offerId:'',packs:null,loose:2}),confirmed({spoken:'Fassbier leer',articleId:'fass',offerId:'',packs:null,loose:0}),confirmed({kind:'reorder'})],kitchen(),scope());
 assert.equal(counts.length,3,'Bestellzeilen werden keine Bestandsmeldung');
 assert.deepEqual(counts[0],{id:'id-1',seasonId:'s2027',area:'Küche',articleId:'spezi',articleName:'Spezi',unit:'Flasche',quantity:77,countedAt:'2027-02-05T22:10:00.000Z',countedBy:'TEST Person',note:'Eingang: „Spezi noch drei Kästen“',reorder:true});
 assert.deepEqual([counts[1].quantity,counts[1].unit,counts[2].quantity],[2,'kg',0]);
 const s=kitchen();
 assert.throws(()=>buildCounts([confirmed({articleId:'weg'})],s,scope()),/fehlt der Artikel/);
 assert.throws(()=>buildCounts([confirmed({packs:null,loose:null})],s,scope()),/fehlt die Menge/);
 assert.throws(()=>buildCounts([confirmed({offerId:'p33'})],s,scope()),/Gebinde von Spezi wurde geändert/,'Gebinde eines anderen Artikels wird nicht angenommen');
 assert.throws(()=>buildCounts([confirmed({offerId:'',packs:3})],s,scope()),/kein Gebinde gewählt/);
 assert.throws(()=>buildCounts([confirmed(),confirmed()],s,scope()),/kommt zweimal vor/);
 assert.throws(()=>buildCounts([confirmed({packs:2.5})],s,scope()),/ganze Gebinde/);
});
test('Nachbestellung speichern: ein Entwurf je Lieferant und Tag, gültig nach den Regeln der Bestellungen',()=>{
 const s=kitchen();
 const orders=buildOrders([confirmed({kind:'reorder',spoken:'5 Kästen Spezi',packs:5,day:'2027-02-06'}),confirmed({kind:'reorder',spoken:'2 Kästen Pils',articleId:'pils33',offerId:'p33',packs:2,day:'2027-02-06'}),confirmed({kind:'reorder',spoken:'ein Fass',articleId:'fass',offerId:'fa',packs:1,day:''}),confirmed({kind:'reorder',spoken:'noch 1 Kasten Spezi',packs:1,day:'2027-02-06'}),confirmed()],s,scope());
 assert.equal(orders.length,2);
 const [braun,wald]=orders;
 assert.deepEqual([braun.supplierId,braun.supplierName,braun.status,braun.deliveryDate,braun.method,braun.area,braun.seasonId],['braun','Getränke Braun','Entwurf','2027-02-06','Telefon','Küche','s2027']);
 assert.match(braun.occasion,/^Nachbestellung Sa\., 06\.02\.2027$/);assert.equal(braun.note,'Eingang: „5 Kästen Spezi · 2 Kästen Pils · noch 1 Kasten Spezi“');
 assert.deepEqual(braun.lines.map(l=>[l.articleName,l.quantity,l.packName,l.packSize,l.code,l.priceNet,l.reviewed]),[['Spezi',6,'Kasten',24,'SP',10,false],['Pils 0,33 l',2,'Kasten',24,'P33',10,false]],'gleicher Artikel wird zusammengezählt');
 assert.equal(braun.deliveries.length,1);assert.deepEqual(braun.lines[0].schedule,{[braun.deliveries[0].id]:6});
 assert.deepEqual([wald.supplierId,wald.deliveryDate,wald.occasion],['wald',null,'Nachbestellung']);
 assert.throws(()=>buildOrders([confirmed({kind:'reorder',offerId:''})],s,scope()),/fehlen Lieferant und Gebinde/);
 assert.throws(()=>buildOrders([confirmed({kind:'reorder',offerId:'alt'})],s,scope()),/nicht mehr aktiv/);
 assert.throws(()=>buildOrders([confirmed({kind:'reorder',packs:0})],s,scope()),/Bestellmenge als ganze Zahl/);
 assert.throws(()=>buildOrders([confirmed({kind:'reorder',packs:1.5})],s,scope()),/Bestellmenge als ganze Zahl/);
 assert.throws(()=>buildOrders([confirmed({kind:'reorder',day:'2027-02-04'})],s,scope()),/Vergangenheit/);
 const text=reorderMessage(braun,s.suppliers[0].value);
 assert.equal(text,'Hallo, hier ist die Schelmenzunft Staufen, Küche.\nWir möchten nachbestellen für Sa., 06.02.2027:\n– 6 Kästen Spezi (SP), je 24 Flaschen\n– 2 Kästen Pils 0,33 l (P33), je 24 Flaschen\nKundennummer K-1\nBitte kurz bestätigen. Danke!');
 assert.doesNotMatch(reorderMessage(wald,s.suppliers[1].value),/für|Kundennummer/);
});
