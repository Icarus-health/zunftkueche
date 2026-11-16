// 1.23.0: Pläne mit ungeprüften Rezepten bleiben bearbeitbar, Bedarf und Einkauf rechnen damit.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {planDemand} from '../src/kitchen/ww/domain.ts';
import {operationForm,demandView} from '../src/kitchen/ww/operations-view.ts';
const base=(kind,id,extra)=>({id,kind,scope:'s27',at:'2026-11-16T10:00:00Z',by:'x',confirmed:false,...extra});
const recipe=(id,name,confirmed,ingredients)=>({value:{...base('recipe',id,{scope:'global',confirmed,familyId:id,name,category:'Speise',yield:1,salePriceGross:5,ingredients})}});
const state=()=>({seasons:[{value:{id:'s27',name:'Fasnet 2027',year:2027,archived:false}}],suppliers:[],offers:[],orders:[],counts:[],inventories:[],
 articles:[{value:{id:'wurst',name:'Bockwurst',unit:'Stk',active:true,category:'Speisen-Zutat'}},{value:{id:'wein',name:'Gutedel 1,0 l',unit:'Fl',active:true,category:'Getränk'}}],
 ww:{ready:true,records:[recipe('r1','Bockwurst mit Brot',false,[{articleId:'wurst',quantity:1,unit:'Stk'}]),recipe('r2','Gutedel offen',true,[{articleId:'wein',quantity:0.25,unit:'Fl'}]),recipe('r3','Neu ohne Zutaten',false,[])]}});
const plan=base('plan','p',{area:'Küche',name:'Freitag',date:'2027-02-05',note:'',lines:[{recipeId:'r1',portions:80},{recipeId:'r2',portions:186},{recipeId:'r3',portions:10}]});
test('Bedarf rechnet mit ungeprüften Rezepten und nennt sie beim Namen',()=>{
 const d=planDemand(plan,state());
 assert.deepEqual(d.issues,[]);
 assert.deepEqual(d.rows.map(r=>[r.name,r.quantity]),[['Bockwurst',80],['Gutedel 1,0 l',46.5]]);
 assert.match(d.notes[0],/2 Rezepte noch ungeprüft: Bockwurst mit Brot, Neu ohne Zutaten/);
 assert.match(d.notes[1],/Ohne Zutaten.*Neu ohne Zutaten/);
});
test('Fehlt ein Rezept ganz, sagt die Meldung, was zu tun ist',()=>{
 const d=planDemand({...plan,lines:[{recipeId:'weg',portions:5}]},state());
 assert.match(d.issues[0],/gibt es nicht mehr.*Portionen ändern/);
});
test('Plan bearbeiten: jede Zeile zeigt ihr Gericht, auch ungeprüft',()=>{
 const html=operationForm(plan,state());
 assert.equal((html.match(/<option value="r1" selected>/g)||[]).length,1,html.slice(0,400));
 assert.match(html,/Bockwurst mit Brot \(ungeprüft\)/);
 assert.match(html,/plan-lines-head/);
});
test('Bedarf zeigt ganze Flaschen und den Rechenwert daneben',()=>{
 const html=demandView(plan,state());
 assert.match(html,/47 Flaschen<small> · rechnerisch 46,5<\/small>/);assert.match(html,/80 Stück/);
 assert.match(html,/Einkauf vorbereiten/,'Hinweise blockieren den Einkauf nicht');
});
test('Rezeptformular: Kategorie als Auswahl, Häkchen neben Speichern',()=>{
 const html=operationForm(state().ww.records[0].value,state());
 assert.match(html,/<select name="category"/);assert.match(html,/sticky-actions"><label class="check"><input type="checkbox" name="confirmed"/);
});
