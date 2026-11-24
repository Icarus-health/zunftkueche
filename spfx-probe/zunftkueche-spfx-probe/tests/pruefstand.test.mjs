// Prüfstand: das Urteil über eine gelesene Meldung und einen gelesenen Beleg. Entscheidend ist „falsch ohne Hinweis“.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {judgeDictation,judgeBill,lineValue} from '../tools/pruefstand/judge.ts';
import {checkIntake,normalizeIntake} from '../src/kitchen/ai/intake.ts';
import {normalizeReading,checkReading} from '../src/kitchen/ai/bill-reader.ts';
import {intakeContext} from '../src/kitchen/intake-records.ts';
import {kitchen} from './support/eingang-data.mjs';

const ctx=intakeContext(kitchen(),'s2027','Küche','2027-02-05');
const entry=(o={})=>({kind:'count',spoken:'',articleId:'',alternatives:[],quantity:'',quantityUnit:'unknown',quantityWord:'',loose:'',state:'none',supplierId:'',day:'',...o});
const lines=(...entries)=>checkIntake(normalizeIntake({entries,other:[],documentType:'none',question:''}),ctx);
const judge=(expect,...entries)=>judgeDictation({id:'T',text:'',expect},lines(...entries),ctx);
test('Wert einer Kartenzeile: Gebinde mal Größe plus Einzelmenge, bei Bestellungen Gebinde und Lieferant',()=>{
 const [count,order]=lines(entry({spoken:'Spezi 3 Kästen und 5',articleId:'spezi',quantity:'3',quantityUnit:'pack',loose:'5'}),entry({kind:'reorder',spoken:'5 Kästen Spezi',articleId:'spezi',quantity:'5',quantityUnit:'pack'}));
 assert.deepEqual(lineValue(count,ctx),{total:77,supplierId:''});assert.deepEqual(lineValue(order,ctx),{packs:5,supplierId:'braun'});
});
test('Diktat: richtig, richtig mit Rückfrage, abgefangen, falsch ohne Hinweis',()=>{
 const spezi=entry({spoken:'Spezi noch drei Kästen',articleId:'spezi',quantity:'3',quantityUnit:'pack'});
 assert.deepEqual(judge([{kind:'count',articleId:'spezi',total:72}],spezi),{verdict:'richtig',reasons:[]});
 assert.equal(judge([{kind:'count',articleId:'spezi',total:72}],entry({...spezi,quantityUnit:'unknown'})).verdict,'richtig mit Rückfrage');
 const wrong=judge([{kind:'count',articleId:'spezi',total:72}],entry({...spezi,quantity:'13'}));
 assert.equal(wrong.verdict,'falsch ohne Hinweis');assert.match(wrong.reasons[0],/Menge 312 statt 72 \(NICHT markiert\)/);
 const caught=judge([{kind:'count',articleId:'spezi',total:72}],entry({...spezi,quantity:'300'}));
 assert.equal(caught.verdict,'abgefangen','die große Menge ist markiert');
 assert.equal(judge([{kind:'count',articleId:'spezi',total:72}]).verdict,'falsch ohne Hinweis','ein fehlender Eintrag zählt als falsch');
 assert.match(judge([],spezi).reasons[0],/Zusätzlicher Eintrag: Spezi \(NICHT markiert\)/);
 assert.equal(judge([]).verdict,'richtig','Meldung ohne Vorgang: nichts vorschlagen ist richtig');
 // absichtlich mehrdeutig: nur die Nachfrage ist richtig
 assert.equal(judge([{kind:'count',articleId:''}],entry({spoken:'Pils noch 3 Kästen',alternatives:['pils33','pils50'],quantity:'3',quantityUnit:'pack'})).verdict,'richtig mit Rückfrage');
 assert.equal(judge([{kind:'count',articleId:''}],spezi).verdict,'falsch ohne Hinweis');
 // anderer Artikel: schlimm nur ohne Markierung
 assert.equal(judge([{kind:'count',articleId:'pils50',total:60}],entry({spoken:'Pils noch 3 Kästen',articleId:'pils33',quantity:'3',quantityUnit:'pack'})).verdict,'abgefangen');
 // Nachbestellung: Gebinde, Lieferant, Tag; „ask“ verlangt die Nachfrage
 const order=entry({kind:'reorder',spoken:'5 Kästen Spezi für morgen',articleId:'spezi',quantity:'5',quantityUnit:'pack',day:'morgen'});
 assert.equal(judge([{kind:'reorder',articleId:'spezi',packs:5,supplierId:'braun',day:'2027-02-06'}],order).verdict,'richtig');
 assert.equal(judge([{kind:'reorder',articleId:'spezi',packs:5,supplierId:'braun',day:'2027-02-07'}],order).verdict,'falsch ohne Hinweis');
 assert.equal(judge([{kind:'reorder',articleId:'cola',packs:2,ask:true}],entry({kind:'reorder',spoken:'2 Kästen Cola',articleId:'cola',quantity:'2',quantityUnit:'pack'})).verdict,'richtig mit Rückfrage');
 assert.equal(judge([{kind:'reorder',articleId:'spezi',packs:5,ask:true}],order).verdict,'falsch ohne Hinweis');
});
test('Beleg: stimmt der Kopf nicht und rechnet er trotzdem auf, wäre das ein falscher Eintrag ohne Hinweis',()=>{
 const read=o=>{const reading=normalizeReading({documentType:'invoice',supplier:'X',number:'4711',date:'2026-02-21',deliveryDate:'',place:'',priceBasis:'net',net:'100,00',tax:'19,00',gross:'119,00',taxGroups:[],lines:[{code:'',name:'Ware',quantity:'2',returned:'',unit:'Stk',unitPrice:'50,00',discount:'',total:'100,00',taxRate:'19',kind:'goods'}],unreadable:[],...o});return {reading,check:checkReading(reading),result:{ms:1,usage:{input:1,output:1},model:'m',stop:'end_turn'}};};
 assert.deepEqual(judgeBill(['4711','2026-02-21',100,19,119],read({})),{verdict:'richtig',reasons:[]});
 assert.equal(judgeBill(['*','2026-02-21',null,null,119],read({number:'egal'})).verdict,'richtig');
 const wrong=judgeBill(['4712','2026-02-21',100,19,119],read({}));assert.equal(wrong.verdict,'falsch ohne Hinweis');assert.match(wrong.reasons[0],/Nummer „4711“ statt „4712“/);
 assert.equal(judgeBill(['4711','2026-02-21',100,19,119],read({gross:'191,00'})).verdict,'abgefangen','Summen gehen nicht auf: die App legt den Beleg ohnehin vor');
 assert.equal(judgeBill(['4711','2026-02-21',100,19,119],read({lines:[]})).verdict,'richtig mit Rückfrage','ohne Positionen ist der Beleg nicht rechnerisch bestätigt');
});
