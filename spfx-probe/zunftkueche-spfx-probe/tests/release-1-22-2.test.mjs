// 1.22.2: Nutzertest-Befunde. Offene Rechnungen auf der Übersicht, Auswertung ohne Scheinverlust, Versionsanzeige.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dashboard} from '../src/kitchen/home.ts';
import {openBillFiles} from '../src/kitchen/ww/inbox-view.ts';
import {fasnetReport} from '../src/kitchen/fasnet-report.ts';
import {APP_VERSION} from '../src/kitchen/release.ts';
const s26={id:'s26',name:'Fasnet 2026',year:2026,archived:false},s27={id:'s27',name:'Fasnet 2027',year:2027,archived:false};
const base=()=>({seasons:[{value:s26},{value:s27}],suppliers:[],articles:[],offers:[],counts:[],inventories:[],orders:[],bills:[],ww:{ready:true,records:[]}});
test('Versionsanzeige entspricht package.json',()=>{
 assert.equal(APP_VERSION,JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).version);
});
test('Ungeprüfte Rechnungen zählen, bestätigte im gleichen Dateistand nicht',()=>{
 const file=(id,name,version='1')=>({id,name,version,size:1000,modifiedAt:'2026-03-01T10:00:00Z'});
 const folder={exists:true,path:'x',href:'x',files:[file('a','A.pdf'),file('b','B.pdf'),file('c','C.pdf','2'),file('d','notiz.txt')]};
 const st=base();
 st.ww.records=[{value:{kind:'bill',id:'b1',scope:'s26',confirmed:true,sourceFile:{id:'a',version:'1'}}},{value:{kind:'bill',id:'b2',scope:'s26',confirmed:true,sourceFile:{id:'c',version:'1'}}},{value:{kind:'bill',id:'b3',scope:'s26',confirmed:false,sourceFile:{id:'b',version:'1'}}}];
 assert.equal(openBillFiles(folder,st,'s26'),2);
 assert.equal(openBillFiles({...folder,exists:false},st,'s26'),0);
});
test('Übersicht nennt offene Rechnungen der Vorsaison',()=>{
 const st=base();
 const html=dashboard(st,s26,'Küche','2026-11-16',[{seasonId:'s26',name:'Fasnet 2026',count:15}]);
 assert.match(html,/Nächster Schritt/);assert.match(html,/15 Rechnungen im Eingang prüfen · Fasnet 2026/);assert.match(html,/data-action="inbox-season" data-id="s26"/);
 assert.match(html,/<h2>15 Rechnungen im Eingang prüfen · Fasnet 2026<\/h2>/);
 const none=dashboard(st,s27,'Küche','2026-11-16',[{seasonId:'s26',name:'Fasnet 2026',count:0}]);
 assert.doesNotMatch(none,/im Eingang prüfen/);
});
test('Ohne Kassendaten keine Minuszahl als Ergebnis',()=>{
 const html=fasnetReport(base(),'s26','Fasnet 2026');
 assert.match(html,/Verkäufe minus Einkauf<\/dt><dd><span class="figure-open">offen<\/span><small>erst mit Kassendaten/);
});
