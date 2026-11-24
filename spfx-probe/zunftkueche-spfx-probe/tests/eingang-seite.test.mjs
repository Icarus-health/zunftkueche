// Eingang in der App: Übersicht, Einrichtung nur für Besitzer, Meldung senden, Karte prüfen, speichern.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {KitchenView} from '../src/kitchen/view.ts';
import {kitchen} from './support/eingang-data.mjs';

const KEY='sk-ant-test-0123456789abcdefWXYZ';
const row=(extra={})=>({itemId:9,etag:'"1"',operationId:'seed',value:{id:'ki',provider:'anthropic',model:'claude-haiku-5-5',key:KEY,updatedAt:'2026-11-24T10:00:00.000Z',updatedBy:'Chef · chef@example.test',...extra}});
function live({settings=row(),ready=true,manager=false,canManage=false}={}){
 const state=kitchen();const calls={counts:[],orders:[],settings:[],initialize:0};
 const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test/kueche'});
 for(const name of ['document','Element','HTMLFormElement','HTMLSelectElement','HTMLInputElement','HTMLTextAreaElement','FormData'])globalThis[name]=dom.window[name]||dom.window.document;
 const root=document.getElementById('app');
 const box={ready,settings};
 const store={testMode:false,load:async()=>structuredClone(state),
  aiSettings:async()=>({ready:box.ready,row:box.ready?box.settings:null}),canManage:async()=>canManage,
  initialize:async()=>{calls.initialize++;box.ready=true;},
  saveAiSettings:async(value,previous,op)=>{calls.settings.push([value,previous?.etag,op]);box.settings={itemId:9,etag:'"2"',operationId:op,value};return box.settings;},
  saveMaster:async(kind,value,previous,op)=>{calls.counts.push([kind,value,op]);state.counts.push({itemId:1,etag:'"1"',operationId:op,value});},
  saveOrder:async(value,previous,op)=>{calls.orders.push([value,op]);state.orders.push({itemId:1,etag:'"1"',operationId:op,value});}};
 return {dom,root,store,calls,state,view:new KitchenView(root,store,'TEST Person · test@example.test',{manager})};
}
const wait=(ms=0)=>new Promise(r=>setTimeout(r,ms));
const entry=(o={})=>({kind:'count',spoken:'',articleId:'',alternatives:[],quantity:'',quantityUnit:'unknown',quantityWord:'',loose:'',state:'none',supplierId:'',day:'',...o});
const answer=(entries,extra={})=>new Response(JSON.stringify({model:'claude-haiku-5-5',stop_reason:'end_turn',usage:{input_tokens:900,output_tokens:150},content:[{type:'text',text:JSON.stringify({entries,other:[],documentType:'none',question:'',...extra})}]}),{status:200});
async function withFetch(handler,work){const old=globalThis.fetch;globalThis.fetch=handler;try{await work();}finally{globalThis.fetch=old;}}
async function send(t,text){const box=t.root.querySelector('[name=intakeText]');box.value=text;box.dispatchEvent(new t.dom.window.Event('input',{bubbles:true}));await t.view.action('intake-send','');}
const set=(t,name,value)=>{const el=t.root.querySelector('[name="'+name+'"]');if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new t.dom.window.Event(el.tagName==='SELECT'||el.type==='checkbox'?'change':'input',{bubbles:true}));};
const names=(t,prefix)=>[...t.root.querySelectorAll('[name^="'+prefix+':"]')].map(e=>e.name);

test('Übersicht: Helfer sehen den Eingang erst, wenn er eingerichtet ist; Besitzer sehen den Weg zur Einrichtung',async()=>{
 const helper=live({settings:null});await helper.view.start();await wait(5);
 assert.equal(helper.root.querySelector('.intake-entry'),null);
 await helper.view.action('nav','management');await wait(5);assert.doesNotMatch(helper.root.textContent,/KI für den Eingang/);
 await assert.rejects(helper.view.action('ai-list',''),/nur Besitzer/);await assert.rejects(helper.view.action('ai-save',''),/nur Besitzer/);
 const owner=live({settings:null,manager:true});await owner.view.start();await wait(5);
 assert.match(owner.root.querySelector('.intake-entry').textContent,/Noch nicht eingerichtet/);assert.ok(owner.root.querySelector('.intake-entry [data-action=ai-setup]'));
 const byRest=live({settings:null,canManage:true});await byRest.view.start();await wait(5);
 assert.ok(byRest.root.querySelector('.intake-entry [data-action=ai-setup]'),'ohne Meldung des Rahmens fragt die App selbst bei SharePoint nach');
 const ready=live();await ready.view.start();await wait(5);
 assert.ok(ready.root.querySelector('.intake-entry [data-action=intake-open].primary'));
 await ready.view.action('nav','management');await wait(5);assert.doesNotMatch(ready.root.textContent,/KI für den Eingang/,'Helfer sehen die Einstellung auch dann nicht');
 assert.ok(!ready.root.innerHTML.includes(KEY));
});
test('Einrichtung durch einen Besitzer: Liste anlegen, Zugang speichern, Schlüssel erscheint nie auf der Seite',async()=>{
 const t=live({settings:null,ready:false,manager:true});await t.view.start();await wait(5);
 await t.view.action('nav','management');await t.view.action('ai-setup','');
 assert.equal(t.root.querySelector('h1').textContent,'KI für den Eingang');assert.match(t.root.querySelector('.back-link').textContent,/Einstellungen/);
 assert.match(t.root.textContent,/ZK_V1_Einstellungen/);assert.equal(t.root.querySelector('[name=aiKey]'),null,'erst die Liste, dann der Schlüssel');
 await t.view.action('ai-list','');assert.equal(t.calls.initialize,1);
 assert.equal(t.root.querySelector('[name=aiKey]').type,'password');assert.equal(t.root.querySelector('[name=aiModel]').value,'claude-haiku-5-5');
 await assert.rejects(t.view.action('ai-save',''),/Schlüssel eintragen/);assert.equal(t.calls.settings.length,0);
 t.root.querySelector('[name=aiKey]').value=KEY;await t.view.action('ai-save','');
 assert.equal(t.calls.settings.length,1);const [value,previous]=t.calls.settings[0];
 assert.deepEqual([value.id,value.provider,value.model,value.key,value.updatedBy,previous],['ki','anthropic','claude-haiku-5-5',KEY,'TEST Person · test@example.test',undefined]);
 assert.equal(t.root.querySelector('h1').textContent,'KI für den Eingang');
 assert.ok(!t.root.innerHTML.includes(KEY),'der Schlüssel wird nie gezeichnet');assert.match(t.root.textContent,/der auf WXYZ endet/);
 assert.equal(t.root.querySelector('[name=aiKey]').value,'');
 // Modell ändern, Schlüssel leer lassen: der gespeicherte bleibt
 t.root.querySelector('[name=aiModel]').value='claude-sonnet-5-5';await t.view.action('ai-save','');
 assert.deepEqual([t.calls.settings[1][0].model,t.calls.settings[1][0].key,t.calls.settings[1][1]],['claude-sonnet-5-5',KEY,'"2"']);
 assert.notEqual(t.calls.settings[0][2],t.calls.settings[1][2],'jede Speicherung hat ihre eigene Vorgangskennung');
 // Verbindung prüfen: erfundene Meldung, keine Vereinsdaten
 const sent=[];
 await withFetch(async(url,init)=>{sent.push(JSON.parse(init.body));return answer([entry({spoken:'Pils noch drei Kisten',articleId:'a1',quantity:'3',quantityUnit:'pack'}),entry({spoken:'Spezi ist leer',articleId:'a2',state:'empty'})]);},async()=>{await t.view.action('ai-test','');});
 assert.equal(sent.length,2);assert.doesNotMatch(sent[0].messages[0].content[0].text,/Getränke Braun|Gutedel/,'die Probe schickt keine Vereinsdaten');
 assert.match(t.root.querySelector('.intake-ok').textContent,/Verbindung steht\. Die Probemeldung wurde richtig verstanden \(claude-haiku-5-5/);
 await withFetch(async()=>new Response(JSON.stringify({error:{message:'invalid x-api-key'}}),{status:401}),async()=>{await t.view.action('ai-test','');});
 assert.match(t.root.querySelector('.intake-bad').textContent,/Schlüssel wird nicht angenommen/);assert.match(t.root.textContent,/401 · invalid x-api-key/);
});
test('Bestand melden: Meldung, zwei Lesungen, Karte, Speichern als Bestandsmeldungen',async()=>{
 const t=live();await t.view.start();await wait(5);await t.view.action('intake-open','');
 assert.equal(t.root.querySelector('h1').textContent,'Eingang');assert.match(t.root.querySelector('.back-link').textContent,/Übersicht/);
 const sent=[];
 await withFetch(async(url,init)=>{sent.push([url,JSON.parse(init.body),init.headers]);return answer([entry({spoken:'Spezi noch drei Kästen und fünf Flaschen',articleId:'spezi',quantity:'3',quantityUnit:'pack',loose:'5'}),entry({spoken:'Fassbier ist leer',articleId:'fass',state:'empty'})]);},async()=>{await send(t,'Spezi noch drei Kästen und fünf Flaschen, Fassbier ist leer');});
 assert.equal(sent.length,2,'zwei unabhängige Lesungen');assert.equal(sent[0][0],'https://api.anthropic.com/v1/messages');assert.equal(sent[0][2]['x-api-key'],KEY);
 assert.match(sent[0][1].messages[0].content[0].text,/spezi \| Spezi \| Flasche \| Kasten zu 24 \(Getränke Braun\)/);
 assert.equal(t.root.querySelector('.intake-said').textContent,'Spezi noch drei Kästen und fünf Flaschen, Fassbier ist leer');
 assert.equal(t.root.querySelector('[name=intakeText]').value,'','das Feld ist wieder frei');
 assert.deepEqual([...t.root.querySelectorAll('.intake-card h3')].map(h=>h.textContent),['Bestand melden']);
 const lines=[...t.root.querySelectorAll('.intake-line')];assert.equal(lines.length,2);
 const [a,b]=names(t,'a').map(x=>x.slice(2));
 assert.equal(t.root.querySelector('[name="a:'+a+'"]').value,'spezi');assert.equal(t.root.querySelector('[name="p:'+a+'"]').value,'3');assert.equal(t.root.querySelector('[name="l:'+a+'"]').value,'5');
 assert.equal(t.root.querySelector('[data-total="'+a+'"]').textContent,'Zusammen 77 Flaschen');
 assert.equal(t.root.querySelector('[name="l:'+b+'"]').value,'0');assert.equal(t.root.querySelector('[name="r:'+b+'"]').checked,true,'leer merkt Nachbestellen vor');
 assert.equal(t.root.querySelector('.intake-line.flagged'),null);assert.equal(t.calls.counts.length,0,'vor dem Speichern steht nichts in SharePoint');
 assert.equal(t.view.dirty,true,'eine offene Karte gilt als ungespeichert');
 // Menge korrigieren: die Summe rechnet sofort mit
 set(t,'p:'+a,'4');assert.equal(t.root.querySelector('[data-total="'+a+'"]').textContent,'Zusammen 101 Flaschen');
 await t.view.action('intake-save',t.view.intake.turns[0].id);
 assert.equal(t.calls.counts.length,2);
 const [kind,first,op]=t.calls.counts[0];assert.equal(kind,'counts');
 assert.deepEqual([first.articleId,first.quantity,first.unit,first.area,first.seasonId,first.countedBy,first.note,first.reorder],['spezi',101,'Flasche','Küche','s2027','TEST Person · test@example.test','Eingang: „Spezi noch drei Kästen und fünf Flaschen“',false]);
 assert.deepEqual([t.calls.counts[1][1].articleId,t.calls.counts[1][1].quantity,t.calls.counts[1][1].reorder],['fass',0,true]);
 assert.notEqual(op,t.calls.counts[1][2]);
 assert.equal(t.root.querySelector('h1').textContent,'Eingang','nach dem Speichern bleibt der Eingang offen');
 assert.match(t.root.querySelector('.intake-ok').textContent,/Gespeichert: 2 Bestandsmeldungen\./);assert.equal(t.root.querySelector('.intake-card'),null);
 assert.equal(t.view.dirty,false);
});
test('Markierte Zeilen müssen geprüft und abgehakt sein, vorher wird nichts gespeichert',async()=>{
 const t=live();await t.view.start();await wait(5);await t.view.action('intake-open','');
 let call=0;
 await withFetch(async()=>answer([entry({spoken:'Pils noch drei Kästen',alternatives:['pils33','pils50'],quantity:call++?'8':'3',quantityUnit:'pack'})]),async()=>{await send(t,'Pils noch drei Kästen');});
 const id=names(t,'a')[0].slice(2),turn=t.view.intake.turns[0].id;
 assert.ok(t.root.querySelector('.intake-line.flagged'));
 const flags=[...t.root.querySelectorAll('.intake-flags li')].map(l=>l.textContent);
 assert.ok(flags.some(f=>/Mehrere Artikel passen/.test(f)));assert.ok(flags.some(f=>/Zwei Lesungen, zwei Mengen: 3 Gebinde .* gegen 8/.test(f)),flags.join('|'));
 assert.equal(t.root.querySelector('[name="a:'+id+'"]').value,'','kein Artikel vorgewählt');
 assert.deepEqual([...t.root.querySelectorAll('[name="a:'+id+'"] optgroup')].map(g=>g.label),['Passt zur Meldung','Alle Artikel']);
 assert.match(t.root.querySelector('[data-open]').textContent,/1 Zeile braucht noch euren Blick/);
 await assert.rejects(t.view.action('intake-save',turn),/markierte Zeile ist noch nicht abgehakt/);assert.equal(t.calls.counts.length,0);
 set(t,'c:'+id,true);assert.match(t.root.querySelector('[data-open]').textContent,/Bitte Artikel und Mengen ansehen/);
 await assert.rejects(t.view.action('intake-save',turn),/fehlt der Artikel/,'abhaken allein reicht nicht: ohne Artikel kein Datensatz');assert.equal(t.calls.counts.length,0);
 set(t,'a:'+id,'pils50');
 assert.equal(t.root.querySelector('[name="c:'+id+'"]').checked,true,'Eingaben bleiben beim Neuzeichnen stehen');assert.equal(t.root.querySelector('[name="p:'+id+'"]').value,'3');
 await t.view.action('intake-save',turn);
 assert.deepEqual([t.calls.counts[0][1].articleId,t.calls.counts[0][1].quantity],['pils50',60]);
});
test('Nachbestellen: Entwurf je Lieferant, Text für Anruf oder Nachricht, Bestellung öffnen',async()=>{
 const t=live();await t.view.start();await wait(5);await t.view.action('intake-open','');
 await withFetch(async()=>answer([entry({kind:'reorder',spoken:'bestell fünf Kästen Spezi',articleId:'spezi',quantity:'5',quantityUnit:'pack'}),entry({kind:'reorder',spoken:'und ein Fass',articleId:'fass',quantity:'1',quantityUnit:'pack'}),entry({spoken:'Salz noch 2 Kilo',articleId:'salz',quantity:'2',quantityUnit:'piece'})],{other:['Wer schließt heute ab?'],question:'Für wann soll geliefert werden?'}),async()=>{await send(t,'bestell fünf Kästen Spezi und ein Fass, Salz noch 2 Kilo. Wer schließt heute ab?');});
 assert.deepEqual([...t.root.querySelectorAll('.intake-card h3')].map(h=>h.textContent),['Bestand melden','Nachbestellen']);
 const notes=[...t.root.querySelectorAll('.intake-note')].map(p=>p.textContent);
 assert.deepEqual(notes,['Rückfrage: Für wann soll geliefert werden?','Nicht übernommen: „Wer schließt heute ab?“']);
 const turn=t.view.intake.turns[0].id;
 await t.view.action('intake-save',turn);
 assert.equal(t.calls.counts.length,1);assert.equal(t.calls.orders.length,2);
 const [braun]=t.calls.orders[0];
 assert.deepEqual([braun.supplierName,braun.status,braun.occasion,braun.deliveryDate,braun.lines.length,braun.lines[0].articleName,braun.lines[0].quantity],['Getränke Braun','Entwurf','Nachbestellung',null,1,'Spezi',5]);
 assert.match(t.root.querySelector('.intake-ok').textContent,/Gespeichert: 1 Bestandsmeldung und 2 Bestellentwürfe\./);
 const messages=[...t.root.querySelectorAll('.intake-message')];assert.equal(messages.length,2);
 assert.equal(messages[0].querySelector('h3').textContent,'Text für Getränke Braun');
 assert.equal(messages[0].querySelector('pre').textContent,'Hallo, hier ist die Schelmenzunft Staufen, Küche.\nWir möchten nachbestellen:\n– 5 Kästen Spezi (SP), je 24 Flaschen\nKundennummer K-1\nBitte kurz bestätigen. Danke!');
 assert.match(messages[0].textContent,/gilt erst als aufgegeben, wenn ihr sie dort so markiert/);
 assert.equal(messages[0].querySelector('[data-action=order-open]').dataset.id,braun.id);
 assert.equal(messages[0].querySelector('[data-action=intake-share]'),null,'Teilen nur, wenn das Gerät es kann');
 let copied='';Object.defineProperty(t.dom.window.navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copied=text;}}});
 await t.view.action('intake-copy',turn+'|0');assert.match(copied,/^Hallo, hier ist die Schelmenzunft Staufen/);
 assert.equal(t.root.querySelector('[data-action=intake-copy]').textContent,'Kopiert');
});
test('Fehler und Sonderfälle: Wortlaut bleibt erhalten, Belege werden weitergewiesen, Verwerfen speichert nichts, Zurück fragt nach',async()=>{
 const t=live();await t.view.start();await wait(5);await t.view.action('intake-open','');
 await assert.rejects(t.view.action('intake-send',''),/erst etwas sagen, schreiben oder ein Foto/);
 await withFetch(async()=>{throw new TypeError('Failed to fetch');},async()=>{await send(t,'Spezi ist leer');});
 assert.match(t.root.querySelector('.intake-bad').textContent,/Keine Verbindung zum Anbieter/);
 assert.equal(t.root.querySelector('[name=intakeText]').value,'Spezi ist leer','nach einem Fehler steht die Meldung wieder im Feld');
 await withFetch(async()=>answer([],{documentType:'invoice'}),async()=>{await send(t,'Spezi ist leer');});
 assert.match([...t.root.querySelectorAll('.intake-note')].at(-1).textContent,/sieht nach einer Rechnung aus/);
 await withFetch(async()=>answer([]),async()=>{await send(t,'Guten Abend');});
 assert.match([...t.root.querySelectorAll('.intake-note')].at(-1).textContent,/Keine Bestandsmeldung und keine Nachbestellung erkannt/);
 assert.equal(t.view.dirty,false);
 await withFetch(async()=>answer([entry({spoken:'Spezi ist leer',articleId:'spezi',state:'empty'})]),async()=>{await send(t,'Spezi ist leer');});
 assert.equal(t.view.dirty,true);
 t.root.querySelector('.back-link').click();await wait(5);
 // jsdom kennt kein showModal: dann steht die Frage in der Statuszeile; im Browser fragt ein Dialog.
 assert.ok(t.root.querySelector('dialog.leave-dialog')?.open||/Ungespeicherte Eingaben/.test(t.root.textContent),'Zurück mit offener Karte fragt nach');
 assert.equal(t.root.querySelector('h1').textContent,'Eingang');assert.ok(t.view.intake.turns.at(-1).card,'die Karte ist noch da');
 const turn=t.view.intake.turns.at(-1).id;
 await t.view.action('intake-discard',turn);
 assert.match(t.root.textContent,/Verworfen\. Nichts gespeichert\./);assert.equal(t.calls.counts.length,0);assert.equal(t.view.dirty,false);
 await t.view.action('cancel','');assert.equal(t.root.querySelector('h1').textContent,'Übersicht');assert.equal(t.view.intake,undefined);
});
test('Ohne Einrichtung und im Archiv bleibt der Eingang zu',async()=>{
 const none=live({settings:null});await none.view.start();await wait(5);await none.view.action('intake-open','');
 assert.match(none.root.textContent,/noch nicht eingerichtet\. Das macht ein Besitzer der Seite/);assert.equal(none.root.querySelector('[name=intakeText]'),null);
 const archived=live();archived.state.seasons[0].value.archived=true;await archived.view.start();await wait(5);await archived.view.action('intake-open','');
 assert.match(archived.root.textContent,/Diese Saison ist archiviert/);assert.equal(archived.root.querySelector('[name=intakeText]'),null);
});
