// 1.26.1: KI-Anbindung als Baustein (Claude direkt, OpenRouter) und die Probe-Seite unter Einstellungen.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {KitchenView} from '../src/kitchen/view.ts';
import {buildRequest,parseResponse,callModel,reachable,toBase64,AiError,DEFAULT_MODEL} from '../src/kitchen/ai/provider.ts';
import {BILL_SCHEMA,normalizeReading,checkReading,printedNumber,costUsd,readBill} from '../src/kitchen/ai/bill-reader.ts';
import {probeSummary,checkWords} from '../src/kitchen/ai/probe.ts';
import {fitPhoto,targetSize,needsFit,MAX_EDGE} from '../src/kitchen/ai/photo.ts';
import {settingsView} from '../src/kitchen/settings-view.ts';
import {workspace} from './support/kitchen-data.mjs';

const pdf={name:'beleg.pdf',mediaType:'application/pdf',bytes:new Uint8Array([37,80,68,70,45,49])};
const photo={name:'foto.jpg',mediaType:'image/jpeg',bytes:new Uint8Array([255,216,255,224])};
const base={key:'sk-test',system:'Regeln',text:'Lies ab',schema:{type:'object'},schemaName:'beleg'};

// ---------- Anfrage ----------
test('Claude direkt: Kopfzeilen für den Browser, PDF als Dokument, Schema als Ausgabeformat, keine Temperatur',()=>{
 const {url,init}=buildRequest({...base,provider:'anthropic',model:'claude-haiku-5-5',files:[pdf,photo]});
 assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(init.method,'POST');
 assert.deepEqual(init.headers,{'content-type':'application/json','anthropic-version':'2026-10-21','x-api-key':'sk-test','anthropic-dangerous-direct-browser-access':'true'});
 const body=JSON.parse(init.body);
 assert.equal(body.model,'claude-haiku-5-5');assert.equal(body.system,'Regeln');assert.ok(body.max_tokens>=8000);
 assert.deepEqual(body.messages[0].content[0],{type:'document',source:{type:'base64',media_type:'application/pdf',data:toBase64(pdf.bytes)}});
 assert.deepEqual(body.messages[0].content[1],{type:'image',source:{type:'base64',media_type:'image/jpeg',data:toBase64(photo.bytes)}});
 assert.deepEqual(body.messages[0].content[2],{type:'text',text:'Lies ab'});
 assert.deepEqual(body.output_config,{format:{type:'json_schema',schema:{type:'object'}}});
 for(const gone of ['temperature','top_p','top_k'])assert.ok(!(gone in body),gone+' ist in der API-Version 2026-10-21 nicht mehr erlaubt');
});
test('OpenRouter: Bearer-Schlüssel, PDF als Datei, Foto als Bild, strenges Schema, Europa-Adresse',()=>{
 const {url,init}=buildRequest({...base,provider:'openrouter',model:'anthropic/claude-haiku-5.5',files:[pdf,photo]});
 assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(init.headers.authorization,'Bearer sk-test');
 const body=JSON.parse(init.body);
 assert.deepEqual(body.messages[0],{role:'system',content:'Regeln'});
 assert.deepEqual(body.messages[1].content[1],{type:'file',file:{filename:'beleg.pdf',file_data:'data:application/pdf;base64,'+toBase64(pdf.bytes)}});
 assert.deepEqual(body.messages[1].content[2],{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+toBase64(photo.bytes)}});
 assert.deepEqual(body.response_format,{type:'json_schema',json_schema:{name:'beleg',strict:true,schema:{type:'object'}}});
 assert.deepEqual(body.provider,{require_parameters:true});
 assert.equal(buildRequest({...base,provider:'openrouter-eu',model:'x'}).url,'https://eu.openrouter.ai/api/v1/chat/completions');
 assert.throws(()=>buildRequest({...base,provider:'anthropic',model:'x',files:[{name:'a.docx',mediaType:'application/msword',bytes:new Uint8Array(1)}]}),/Nur PDF und Bilder/);
 assert.equal(toBase64(new Uint8Array(70000).fill(65)),Buffer.from(new Uint8Array(70000).fill(65)).toString('base64'),'große Dateien in Stücken');
});

// ---------- Antwort ----------
test('Antwort von Claude: Text nach dem Denkblock ist das JSON, abgeschnitten oder verweigert gilt als Fehler',()=>{
 const ok=JSON.stringify({model:'claude-haiku-5-5',stop_reason:'end_turn',usage:{input_tokens:7000,output_tokens:900},content:[{type:'thinking',thinking:'…'},{type:'text',text:'{"number":"455924"}'}]});
 const r=parseResponse('anthropic',200,ok,1234);
 assert.deepEqual(r.json,{number:'455924'});assert.deepEqual(r.usage,{input:7000,output:900});assert.equal(r.ms,1234);assert.equal(r.model,'claude-haiku-5-5');
 const cut=JSON.stringify({stop_reason:'max_tokens',content:[{type:'text',text:'{"number":"45'}]});
 assert.throws(()=>parseResponse('anthropic',200,cut),e=>e instanceof AiError&&e.kind==='answer'&&/abgeschnitten/.test(e.message));
 assert.throws(()=>parseResponse('anthropic',200,JSON.stringify({stop_reason:'refusal',content:[]})),e=>e.kind==='answer');
 assert.throws(()=>parseResponse('anthropic',200,JSON.stringify({stop_reason:'end_turn',content:[{type:'text',text:'kein JSON'}]})),e=>e.kind==='answer'&&/Format/.test(e.message));
 assert.throws(()=>parseResponse('anthropic',200,'<html>'),e=>e.kind==='answer');
});
test('Fehler der Anbieter werden zu verständlichen Meldungen, die Rohantwort bleibt für die Fehlersuche',()=>{
 const err=(status,message)=>{try{parseResponse('anthropic',status,JSON.stringify({type:'error',error:{type:'x',message}}));}catch(e){return e;}};
 assert.equal(err(401,'invalid x-api-key').kind,'key');assert.match(err(401,'invalid x-api-key').detail,/401 · invalid x-api-key/);
 assert.equal(err(400,'Your credit balance is too low').kind,'credit');
 assert.equal(err(429,'rate limit').kind,'busy');assert.equal(err(529,'overloaded').kind,'busy');
 assert.equal(err(413,'request_too_large').kind,'size');assert.equal(err(400,'schema too complex').kind,'request');
 // OpenRouter meldet Fehler auch mit Status 200 im Körper
 assert.throws(()=>parseResponse('openrouter',200,JSON.stringify({error:{code:402,message:'Insufficient credits'}})),e=>e.kind==='credit');
 const ok=parseResponse('openrouter',200,JSON.stringify({model:'anthropic/claude-haiku-5.5',choices:[{finish_reason:'stop',message:{content:'{"a":1}'}}],usage:{prompt_tokens:10,completion_tokens:5}}));
 assert.deepEqual([ok.json,ok.usage],[{a:1},{input:10,output:5}]);
 assert.throws(()=>parseResponse('openrouter',200,JSON.stringify({choices:[{finish_reason:'length',message:{content:'{'}}]})),/abgeschnitten/);
});
test('Aufruf: ohne Schlüssel kein Netzverkehr, Netzfehler wird benannt, Erreichbarkeit ohne Schlüssel',async()=>{
 let calls=0;const never=async()=>{calls++;throw new Error('darf nicht laufen');};
 await assert.rejects(callModel({...base,key:' ',provider:'anthropic',model:'m'},never),e=>e.kind==='key');assert.equal(calls,0);
 await assert.rejects(callModel({...base,provider:'anthropic',model:'m'},async()=>{throw new TypeError('Failed to fetch');}),e=>e.kind==='network'&&/Failed to fetch/.test(e.detail));
 const sent=[];const fake=async(url,init)=>{sent.push([url,init]);return new Response(JSON.stringify({stop_reason:'end_turn',content:[{type:'text',text:'{"ok":true}'}],usage:{}}),{status:200});};
 assert.deepEqual((await callModel({...base,provider:'anthropic',model:'m'},fake)).json,{ok:true});assert.equal(sent.length,1);
 // Anthropic antwortet ohne Schlüssel mit 401: das Gerät kommt durch
 const probe=[];
 assert.deepEqual(await reachable('anthropic',async(url,init)=>{probe.push(init);return new Response('{}',{status:401});}),{ok:true,detail:'erreichbar'});
 assert.ok(!('x-api-key' in probe[0].headers),'die Erreichbarkeit braucht keinen Schlüssel');
 assert.equal((await reachable('anthropic',async()=>new Response('{}',{status:200}))).ok,false);
 assert.equal((await reachable('openrouter',async url=>new Response('{}',{status:url.endsWith('/models')?200:500}))).ok,true);
 const blocked=await reachable('openrouter-eu',async()=>{throw new TypeError('blocked');});
 assert.equal(blocked.ok,false);assert.match(blocked.detail,/gesperrt oder kein Netz/);
});

// ---------- Beleg: Schema, Zahlen, Rechenprüfung ----------
test('Schema: jedes Objekt geschlossen und vollständig, keine Wahltypen, Zahlen als Text wie gedruckt',()=>{
 let objects=0;
 const walk=node=>{
  if(!node||typeof node!=='object')return;
  assert.ok(!('anyOf' in node)&&!Array.isArray(node.type),'keine Wahltypen: sie sind je Anfrage begrenzt');
  for(const gone of ['minimum','maximum','minLength','maxLength'])assert.ok(!(gone in node),gone);
  if(node.type==='object'){objects++;assert.equal(node.additionalProperties,false);assert.deepEqual(node.required,Object.keys(node.properties));Object.values(node.properties).forEach(walk);}
  if(node.type==='array')walk(node.items);
 };
 walk(BILL_SCHEMA);assert.equal(objects,3,'Beleg, Steuerzeile, Position');
 assert.equal(BILL_SCHEMA.properties.gross.type,'string');assert.equal(BILL_SCHEMA.properties.lines.items.properties.total.type,'string');
});
test('gedruckte Zahlen: Komma, Punkt, Tausender, Minus vorn oder hinten, „250,-“; Unklares bleibt unbekannt',()=>{
 for(const [raw,value] of [['1.192,10',1192.1],['1192.10',1192.1],['-4,13',-4.13],['4,13-',-4.13],['250,-',250],['19,00 %',19],['10%',10],['1.369,94 €',1369.94],['EUR 547,21',547.21],['12',12],['280,00 *',280]])
  assert.equal(printedNumber(raw),value,raw);
 for(const raw of ['','ohne Ber.','A617','12,5,3','1.2.3'])assert.equal(printedNumber(raw),null,raw);
});
const reading=()=>normalizeReading({documentType:'Invoice',supplier:'Getränke Muster',number:'455924',date:'2026-02-21',deliveryDate:'21.02.2026',place:'Belchenhalle allgemein',priceBasis:'NET',
 net:'993,91',tax:'188,84',gross:'1.182,75',
 taxGroups:[{label:'Ware',rate:'19,00 %',net:'1.369,94',tax:'260,29',gross:'1.630,23'},{label:'Pfand',rate:'19,00 %',net:'-376,03',tax:'-71,45',gross:'-447,48'}],
 lines:[
  {code:'107',name:'Pils 20x0,33l',quantity:'19,00',returned:'',unit:'KA',unitPrice:'16,30',discount:'10%',total:'278,73',taxRate:'',kind:'goods'},
  {code:'1002',name:'Classic 12x0,5l',quantity:'61,00',returned:'',unit:'KA',unitPrice:'6,25',discount:'5%',total:'362,19',taxRate:'',kind:'goods'},
  {code:'105',name:'Radler 20x0,33l',quantity:'-14,00',returned:'',unit:'KA',unitPrice:'16,30',discount:'10%',total:'-205,38',taxRate:'',kind:'RETURN'},
  {code:'2021',name:'Kühlcontainer Miete',quantity:'1,00',returned:'',unit:'ST',unitPrice:'280,00',discount:'',total:'280,00',taxRate:'',kind:'rent'},
  {code:'2199',name:'Pilspokale leihweise',quantity:'120,00',returned:'',unit:'ST',unitPrice:'',discount:'',total:'',taxRate:'',kind:'rent'},
  {code:'',name:'BIER KAST. 24x0,33',quantity:'12',returned:'36',unit:'',unitPrice:'3,42',discount:'',total:'-82,08',taxRate:'',kind:'deposit'}],
 unreadable:[]});
test('Antwort des Modells wird vollständig und typisiert, Groß- und Kleinschreibung der Auswahlwerte egal',()=>{
 const r=reading();
 assert.equal(r.documentType,'invoice');assert.equal(r.priceBasis,'net');assert.equal(r.lines[2].kind,'return');
 assert.equal(r.deliveryDate,'','ein Datum im falschen Format wird nicht übernommen');
 const empty=normalizeReading({lines:[{name:'x'}],taxGroups:'kaputt',unreadable:['Stempel',7]});
 assert.equal(empty.number,'');assert.equal(empty.documentType,'other');assert.deepEqual(empty.taxGroups,[]);assert.equal(empty.lines[0].total,'');assert.deepEqual(empty.unreadable,['Stempel']);
 assert.equal(normalizeReading(null).lines.length,0);
});
test('Rechenprüfung: Zeilen, Rückgaben und Pfand werden nachgerechnet, Leihe ohne Betrag stört die Summe nicht',()=>{
 const c=checkReading(reading());
 assert.equal(c.header,true);assert.equal(c.totals,'ok');assert.equal(c.groups,'ok');
 assert.deepEqual([c.lines,c.linesOk,c.linesOff,c.linesOpen],[6,5,0,1],'Pfand: (12 − 36) × 3,42 = −82,08');
 assert.equal(c.lineSum,633.46);assert.equal(c.lineSumMatches,'none','die Beispielzeilen sind nur ein Ausschnitt der Rechnung');
 // passt die Zeilensumme zum Netto, gilt der Beleg als bestätigt
 const whole=reading();whole.net='633,46';whole.tax='120,36';whole.gross='753,82';whole.taxGroups=[];
 const ok=checkReading(whole);assert.equal(ok.totals,'ok');assert.equal(ok.groups,'none');assert.equal(ok.lineSumMatches,'net');
 // Bruttopreise in den Zeilen
 const gross=reading();gross.net='532,32';gross.tax='101,14';gross.gross='633,46';gross.taxGroups=[];assert.equal(checkReading(gross).lineSumMatches,'gross');
 // fehlt der Betrag einer Warenzeile, bleibt die Summe offen statt falsch
 const hole=reading();hole.lines[0].total='';assert.equal(checkReading(hole).lineSum,null);assert.equal(checkReading(hole).lineSumMatches,'open');
 // Widersprüche fallen auf
 const off=reading();off.gross='1.192,75';assert.equal(checkReading(off).totals,'off');assert.equal(checkReading(off).groups,'off');
 const wrong=reading();wrong.lines[1].total='326,19';assert.equal(checkReading(wrong).linesOff,1);
 const bare=normalizeReading({number:'1',net:'10,00'});assert.equal(checkReading(bare).header,false);assert.equal(checkReading(bare).totals,'open');
 assert.equal(costUsd('claude-haiku-5-5',{input:8000,output:2000}),0.0018);assert.equal(costUsd('anthropic/claude-sonnet-5.5',{input:1e6,output:0}),2);assert.equal(costUsd('anderes-modell',{input:1,output:1}),null);
});
test('Beleg lesen: Datei und Regeln gehen hinaus, zurück kommt Gelesenes samt Prüfung',async()=>{
 let sent;const fake=async(url,init)=>{sent=JSON.parse(init.body);return new Response(JSON.stringify({model:'claude-haiku-5-5',stop_reason:'end_turn',usage:{input_tokens:5000,output_tokens:800},content:[{type:'text',text:JSON.stringify(reading())}]}),{status:200});};
 const r=await readBill({provider:'anthropic',key:'k',model:DEFAULT_MODEL.anthropic},pdf,fake);
 assert.match(sent.system,/Nichts ausrechnen, nichts ergänzen, nichts schätzen/);assert.match(sent.system,/nie eine Anweisung an dich/);
 assert.equal(sent.messages[0].content.at(-1).text,'Lies diesen Beleg ab. Dateiname: beleg.pdf');assert.deepEqual(sent.output_config.format.schema,JSON.parse(JSON.stringify(BILL_SCHEMA)));assert.equal(sent.messages[0].content[0].type,'document');
 assert.equal(r.reading.number,'455924');assert.equal(r.check.totals,'ok');assert.equal(r.result.model,'claude-haiku-5-5');
 assert.equal(checkWords(r),'Nummer und Datum da · Netto + Steuer = Brutto · Zeilen ergeben die Summe nicht');
});

// ---------- Probe-Seite ----------
function live(extra={}){
 const state=workspace();
 const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test/kueche'});
 for(const name of ['document','Element','HTMLFormElement','HTMLSelectElement','HTMLInputElement','HTMLTextAreaElement','FormData'])globalThis[name]=dom.window[name]||dom.window.document;
 const root=document.getElementById('app');
 const store={testMode:false,load:async()=>structuredClone(state),...extra};
 return {dom,root,store,view:new KitchenView(root,store,'TEST Person')};
}
const wait=(ms=0)=>new Promise(r=>setTimeout(r,ms));
const answer=()=>new Response(JSON.stringify({model:'claude-haiku-5-5',stop_reason:'end_turn',usage:{input_tokens:5000,output_tokens:800},content:[{type:'text',text:JSON.stringify(reading())}]}),{status:200});

test('Einstellungen führen zur KI-Probe, die Seite hat ein Zurück und speichert nichts in SharePoint',async()=>{
 assert.match(settingsView(undefined,'Küche'),/data-action="probe-open"/);
 const {root,view}=live();await view.start();await view.action('nav','management');
 await view.action('probe-open','');
 assert.equal(root.querySelector('h1').textContent,'KI-Probe');assert.match(root.querySelector('.back-link').textContent,/Einstellungen/);
 assert.deepEqual([...root.querySelectorAll('[data-probe] h2')].map(h=>h.textContent),['1 Foto','2 Diktat','3 Verbindung','4 Zugang zur KI','5 Einen Beleg lesen','6 Messlauf','Ergebnis der Probe']);
 const camera=root.querySelector('[name=probePhoto]');
 assert.equal(camera.type,'file');assert.equal(camera.getAttribute('capture'),'environment');assert.equal(camera.accept,'image/*');
 assert.equal(root.querySelector('[name=probeKey]').type,'password');
 assert.equal(root.querySelector('[data-action=probe-read]').disabled,true,'ohne Datei und Schlüssel kein Lesen');
 assert.equal(root.querySelector('[data-action=probe-run]').disabled,true);
 await view.action('back','');assert.equal(root.querySelector('h1').textContent,'Einstellungen');assert.equal(view.probe,undefined);
});
test('Diktat zählt beim Tippen mit, ohne die Seite neu zu zeichnen und ohne „ungespeichert“',async()=>{
 const {dom,root,view}=live();await view.start();await view.action('probe-open','');
 const box=root.querySelector('[name=probeDictation]');
 box.value='Pils noch drei Kästen, Spezi ist leer';box.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 assert.equal(root.querySelector('[name=probeDictation]'),box,'Feld bleibt, die Tastatur bleibt offen');
 assert.match(root.querySelector('[data-probe-dictation]').textContent,/geht 37 Zeichen angekommen/);
 assert.equal(view.dirty,false);assert.match(probeSummary(view),/Diktat: ok \(37 Zeichen\)/);
});
test('Schlüssel: nur auf dem Gerät gemerkt, nie im Ergebnistext, löschen räumt auf',async()=>{
 const {root,view}=live();await view.start();await view.action('probe-open','');
 root.querySelector('[name=probeKey]').value='sk-geheim-123';
 await view.action('probe-remember','');
 assert.deepEqual(view.local.read('ai'),{provider:'anthropic',model:'claude-haiku-5-5',key:'sk-geheim-123'});
 assert.match(root.textContent,/Auf diesem Gerät gemerkt/);assert.doesNotMatch(probeSummary(view),/sk-geheim/);
 // Anbieterwechsel zieht das Standardmodell nach
 const provider=root.querySelector('[name=probeProvider]');provider.value='openrouter';provider.dispatchEvent(new root.ownerDocument.defaultView.Event('change',{bubbles:true}));await wait();
 assert.equal(root.querySelector('[name=probeModel]').value,'anthropic/claude-haiku-5.5');assert.equal(root.querySelector('[name=probeKey]').value,'sk-geheim-123');
 await view.action('probe-forget','');
 assert.equal(view.local.read('ai'),undefined);assert.equal(root.querySelector('[name=probeKey]').value,'');
 await assert.rejects(view.action('probe-remember',''),/zuerst den Schlüssel/);
});
test('Foto wählen und lesen lassen: Ergebnis mit Rechenprüfung, Fehler mit Rohmeldung',async()=>{
 const {dom,root,view}=live();await view.start();await view.action('probe-open','');
 const input=root.querySelector('[name=probePhoto]');
 Object.defineProperty(input,'files',{value:[{name:'IMG_0042.jpg',type:'image/jpeg',arrayBuffer:async()=>new Uint8Array([255,216,255]).buffer}]});
 input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await wait(5);
 assert.match(root.querySelector('[data-probe-file]').textContent,/geht IMG_0042\.jpg · image\/jpeg · 1 KB · Kamera/);
 root.querySelector('[name=probeKey]').value='sk-test';
 const before=globalThis.fetch;const calls=[];
 try{
  globalThis.fetch=async(url,init)=>{calls.push([url,JSON.parse(init.body)]);return answer();};
  await view.action('probe-read','');
  assert.equal(calls[0][1].messages[0].content[0].type,'image');
  const facts=root.querySelector('.probe-facts').textContent;
  assert.match(facts,/Nummer455924/);assert.match(facts,/993,91\s*€ · 188,84\s*€ · 1\.182,75\s*€/);assert.match(facts,/Positionen6, davon 5 nachgerechnet/);
  assert.equal(root.querySelectorAll('.probe-table tbody tr').length,6);
  assert.match(probeSummary(view),/Foto: ok \(Kamera, image\/jpeg, 1 KB\)/);assert.match(probeSummary(view),/Beleg lesen: ok \(claude-haiku-5-5/);
  globalThis.fetch=async()=>new Response(JSON.stringify({type:'error',error:{message:'invalid x-api-key'}}),{status:401});
  await view.action('probe-read','');
  assert.match(root.querySelector('.probe-result [role=alert]').textContent,/Schlüssel wird nicht angenommen.*401 · invalid x-api-key/);
 }finally{globalThis.fetch=before;}
});
test('Messlauf: liest die PDF des Rechnungsordners der Reihe nach, bricht bei ungültigem Schlüssel ab, Ergebnis als Datei',async()=>{
 const files=[{id:'a',version:'1',name:'B.pdf',size:6,modifiedAt:'2026-02-21T10:00:00Z'},{id:'b',version:'1',name:'A.pdf',size:6,modifiedAt:'2026-02-22T10:00:00Z'},{id:'c',version:'1',name:'liste.xlsx',size:6,modifiedAt:'2026-02-22T10:00:00Z'}];
 const read=[];
 const inbox={list:async(kind,year)=>({path:'03_Rechnungen/'+year,href:'',exists:true,files}),read:async(kind,year,f)=>{read.push(f.name);return pdf.bytes;}};
 const {root,view}=live({inbox});await view.start();await view.action('probe-open','');
 root.querySelector('[name=probeKey]').value='sk-test';
 const before=globalThis.fetch,saved=[];const realCreate=URL.createObjectURL;
 try{
  URL.createObjectURL=blob=>{saved.push(blob);return 'blob:test';};
  globalThis.fetch=async()=>answer();
  await view.action('probe-run','');
  assert.deepEqual(read,['A.pdf','B.pdf'],'nur PDF, nach Namen');
  assert.match(root.querySelector('.probe-result [role=status]').textContent,/2 von 2 gelesen, 0 davon rechnerisch bestätigt/);
  assert.equal(root.querySelectorAll('.probe-table tbody tr').length,2);
  await view.action('probe-download','');
  const payload=JSON.parse(await saved[0].text());
  assert.equal(payload.year,2027);assert.equal(payload.entries.length,2);assert.equal(payload.entries[0].reading.number,'455924');assert.equal(payload.entries[0].check.totals,'ok');
  assert.doesNotMatch(JSON.stringify(payload),/sk-test/,'kein Schlüssel in der Ergebnisdatei');
  read.length=0;globalThis.fetch=async()=>new Response(JSON.stringify({error:{message:'invalid x-api-key'}}),{status:401});
  await view.action('probe-run','');
  assert.deepEqual(read,['A.pdf'],'nach dem ersten Schlüsselfehler ist Schluss');
  assert.match(root.querySelector('.probe-result [role=status]').textContent,/Abgebrochen: Der Schlüssel wird nicht angenommen/);
 }finally{globalThis.fetch=before;URL.createObjectURL=realCreate;}
});

// Foto passend machen
function fakeDoc(width,height,out=1200){
 const drawn=[];
 const doc={drawn,revoked:0,defaultView:{URL:{createObjectURL:()=>'blob:x',revokeObjectURL:()=>{doc.revoked++;}}},createElement(tag){
  if(tag==='img'){const image={naturalWidth:width,naturalHeight:height};Object.defineProperty(image,'src',{set(){queueMicrotask(()=>width?image.onload():image.onerror());}});return image;}
  return {width:0,height:0,getContext(){return {fillRect(){},drawImage:(_i,_x,_y,w,h)=>drawn.push([w,h])};},toBlob(done,type){done(new Blob([new Uint8Array(out)],{type}));}};
 }};
 return doc;
}
test('Fotogröße: lange Kante höchstens 2.576 Pixel, Seitenverhältnis bleibt, Kleines bleibt unberührt',()=>{
 assert.equal(MAX_EDGE,2576);
 assert.deepEqual(targetSize(4032,3024),{width:2576,height:1932});
 assert.deepEqual(targetSize(3024,4032),{width:1932,height:2576});
 assert.deepEqual(targetSize(8064,6048),{width:2576,height:1932});
 assert.deepEqual(targetSize(1600,1200),{width:1600,height:1200});
 assert.deepEqual(targetSize(2576,10),{width:2576,height:10});
 assert.equal(needsFit('image/jpeg',900000,1600,1200),false);
 assert.equal(needsFit('image/jpeg',900000,4032,3024),true,'zu groß in Pixeln');
 assert.equal(needsFit('image/jpeg',6*1024*1024,1600,1200),true,'zu groß in Bytes');
 assert.equal(needsFit('image/heic',900000,1600,1200),true,'Format, das der Anbieter nicht annimmt');
});
test('Telefonfoto wird vor dem Senden verkleinert und als JPEG gepackt, PDF und passende Bilder bleiben',async()=>{
 const big={name:'IMG_0042.HEIC',mediaType:'image/heic',bytes:new Uint8Array(4000)};
 const doc=fakeDoc(8064,6048);
 const fit=await fitPhoto(big,doc);
 assert.deepEqual([fit.file.name,fit.file.mediaType,fit.file.bytes.length],['IMG_0042.jpg','image/jpeg',1200]);
 assert.equal(fit.note,'verkleinert von 8064 × 6048 auf 2576 × 1932');
 assert.deepEqual(doc.drawn,[[2576,1932]]);
 assert.equal(doc.revoked,1,'Zwischenadresse wird wieder freigegeben');
 const small={name:'beleg.png',mediaType:'image/png',bytes:new Uint8Array(4000)};
 const same=await fitPhoto(small,fakeDoc(1200,1600));
 assert.equal(same.file,small);assert.equal(same.note,'');
 const repack=await fitPhoto({name:'scan.bmp',mediaType:'image/bmp',bytes:new Uint8Array(10)},fakeDoc(800,600));
 assert.deepEqual([repack.file.name,repack.file.mediaType,repack.note],['scan.jpg','image/jpeg','neu gepackt als JPEG']);
 const pdf={name:'rechnung.pdf',mediaType:'application/pdf',bytes:new Uint8Array(10)};
 assert.equal((await fitPhoto(pdf,fakeDoc(0,0))).file,pdf);
 // Lässt sich das Bild nicht öffnen, bleibt die Datei, wie sie ist: der Anbieter meldet dann den Grund.
 const broken=await fitPhoto(big,fakeDoc(0,0));
 assert.equal(broken.file,big);assert.equal(broken.note,'');
 // Browser ohne Zwischenadressen (z. B. der Testbrowser): unverändert, kein Absturz.
 assert.equal((await fitPhoto(big,{defaultView:{URL:{}}})).file,big);
});
test('Saisonwechsel lässt die KI-Probe offen: der Messlauf zeigt den Rechnungsordner der neuen Saison',async()=>{
 const state=workspace();state.seasons.push({itemId:2,etag:'"1"',operationId:'seed',value:{id:'s2026',name:'Fasnet 2026',year:2026,archived:true}});
 const {root,view,dom}=live({load:async()=>structuredClone(state)});await view.start();await view.action('nav','management');await view.action('probe-open','');
 assert.match(root.querySelector('[data-probe]').textContent,/Saison: Fasnet 2027 · Ordner 03_Rechnungen\/2027/);
 view.probe.run={season:'Fasnet 2027',year:2027,total:0,current:'',entries:[],stop:false,finished:true,note:'alt'};
 const season=root.querySelector('select[name=seasonContext]');season.value='s2026';season.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await wait(20);
 assert.equal(root.querySelector('h1').textContent,'KI-Probe');
 assert.match(root.querySelector('[data-probe]').textContent,/Saison: Fasnet 2026 · Ordner 03_Rechnungen\/2026/);
 assert.equal(view.probe.run,undefined,'das Ergebnis der alten Saison bleibt nicht stehen');
 // Ein Bereichswechsel schließt die Probe wie jede andere Unterseite.
 const area=root.querySelector('select[name=areaContext]');area.value='Zunftscheuer';area.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await wait(20);
 assert.equal(view.probe,undefined);
});

test('Schlüssel eintippen schaltet Lesen und Messlauf sofort frei, ohne die Seite neu zu zeichnen',async()=>{
 const {root,view,dom}=live({inbox:{list:async()=>({path:'',href:'',exists:true,files:[]}),read:async()=>new Uint8Array()}});await view.start();await view.action('nav','management');await view.action('probe-open','');
 view.probe.file=photo;view.render();
 const key=root.querySelector('[name=probeKey]');
 assert.equal(root.querySelector('[data-action=probe-read]').disabled,true);
 key.value='sk-test-1';key.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 assert.equal(root.querySelector('[name=probeKey]'),key,'das Feld bleibt dasselbe, der Cursor geht nicht verloren');
 assert.equal(root.querySelector('[data-action=probe-read]').disabled,false);
 assert.equal(root.querySelector('[data-action=probe-run]').disabled,false);
 assert.match(root.querySelector('[data-probe-kept]').textContent,/Nicht gemerkt/);
 key.value='';key.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 assert.equal(root.querySelector('[data-action=probe-read]').disabled,true);
 assert.equal(root.querySelector('[data-action=probe-run]').disabled,true);
});
