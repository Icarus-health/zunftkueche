// 1.22.0 Karte: Auswahl, Reihenfolge, Speicherformat, Word und PDF im Aufbau der Vorlage.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {card2025,emptyMenu,readMenu,moveLine,proposeFromRecipes,sectionFor,lineFromRecipe,numberLines,menuEditor} from '../src/kitchen/menu-card.ts';
import {menuDocx,menuPdf} from '../src/kitchen/menu-export.ts';
import {validateDocument} from '../src/kitchen/ww/domain.ts';
import {crc32} from '../src/kitchen/zip.ts';
const season={id:'s27',name:'Fasnet 2027',year:2027,archived:false};
let n=0;const uuid=()=>'id-'+(n++);
const recipe=(id,name,category,price,articleId)=>({value:{id,kind:'recipe',scope:'global',at:'2026-11-16T10:00:00Z',by:'x',confirmed:true,familyId:id,name,category,yield:1,salePriceGross:price,ingredients:[{articleId,quantity:1,unit:'Fl'}]}});
const state={articles:[{value:{id:'a1',name:'Wiesler Gutedel trocken 0,75 l',unit:'Fl',active:true}},{value:{id:'a2',name:'Landmann Dr. Faustus Sekt brut 0,2 l',unit:'Fl',active:true}}],offers:[{value:{articleId:'a1',supplierId:'w',active:true}},{value:{articleId:'a2',supplierId:'l',active:true}}],suppliers:[{value:{id:'w',name:'Wiesler'}},{value:{id:'l',name:'Landmann'}}],
 ww:{ready:true,records:[recipe('r1','Gutedel 0,75 l','Getränk',15,'a1'),recipe('r2','Piccolo Dr. Faustus 0,2 l','Getränk',6,'a2'),recipe('r3','Paradies-Prickler 0,2 l','Getränk',4.5,'x'),recipe('r4','Käsewürfel','Speise',6.5,'x'),recipe('r5','Intern: Verpflegung','Intern',null,'x')]}};
test('Rubrik, Größe und Weingut aus dem Rezept',()=>{
 const lines=proposeFromRecipes(state,uuid);
 assert.deepEqual(lines.map(l=>[l.section,l.number,l.label,l.size,l.producer,l.priceGross]),[
  ['wine','1','Gutedel','0,75 l','Weingut Wiesler',15],['sparkling','2','Piccolo Dr. Faustus','0,2 l','Weinhaus Landmann',6],
  ['drinks','','Paradies-Prickler','0,2 l','',4.5],['food','','Käsewürfel','','',6.5]]);
 assert.equal(sectionFor({name:'Winzersekt Pinot Rosé 0,75 l',category:'Getränk'}),'sparkling');
});
test('Karte 2025 als Startpunkt ist gültig und vollständig',()=>{
 const card={...emptyMenu(season,'Test','2026-11-16T10:00:00Z'),lines:card2025(uuid)};
 validateDocument(card);
 assert.equal(card.lines.length,29);assert.equal(card.title,'-Staufener Zunftabend 2027-');assert.match(card.footer,/eingesehen/);
 assert.equal(card.lines.filter(l=>l.section==='wine').length,8);
});
test('Eingaben lesen, Preise prüfen, Reihenfolge nur innerhalb der Rubrik',()=>{
 const card={...emptyMenu(season,'Test'),lines:card2025(uuid).slice(0,3)};
 const f=new FormData();const [a,b]=card.lines;
 f.set('price_'+a.id,'15,50');f.set('label_'+a.id,' Roter Gutedel ');f.set('title','-Zunftabend 2027-');
 const read=readMenu(f,card);assert.equal(read.lines[0].priceGross,15.5);assert.equal(read.lines[0].label,'Roter Gutedel');assert.equal(read.title,'-Zunftabend 2027-');
 f.set('price_'+b.id,'abc');assert.throws(()=>readMenu(f,card),/Preis/);
 const moved=moveLine(card.lines,b.id,-1);assert.equal(moved[0].id,b.id);
 assert.equal(moveLine(card.lines,a.id,-1)[0].id,a.id);
 const lines=[...card2025(uuid)];const lastWine=lines.filter(l=>l.section==='wine').at(-1);const firstSekt=lines.find(l=>l.section==='sparkling');
 assert.equal(moveLine(lines,lastWine.id,1).indexOf(lastWine),lines.indexOf(lastWine));
 assert.ok(firstSekt);
});
test('Nummern nur für Wein und Sekt, vorhandene bleiben',()=>{
 const l=(s,num)=>({id:uuid(),section:s,recipeId:null,number:num,label:'x',detail:'',size:'',producer:'',priceGross:null});
 assert.deepEqual(numberLines([l('wine','2'),l('wine',''),l('drinks',''),l('sparkling','')]).map(x=>x.number),['2','1','','3']);
});
test('Editor zeigt Rubriken, Auswahl und Ausgabe',()=>{
 const card={...emptyMenu(season,'Test'),lines:card2025(uuid)};
 const html=menuEditor(card,state,false);
 for(const t of ['Wein','Sekt + Secco','Bier und alkoholfreie Getränke','Speisen','Als PDF','Als Word','Karte speichern','Eigener Eintrag ohne Rezept','Gutedel 0,75 l · 15,00 €'])assert.ok(html.includes(t),t);
 assert.doesNotMatch(html,/Intern: Verpflegung/);
});
function unzip(bytes){const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);const out={};let p=0;const dec=new TextDecoder();
 while(v.getUint32(p,true)===0x04034b50){const crc=v.getUint32(p+14,true),size=v.getUint32(p+18,true),nl=v.getUint16(p+26,true),el=v.getUint16(p+28,true);const name=dec.decode(bytes.slice(p+30,p+30+nl));const data=bytes.slice(p+30+nl+el,p+30+nl+el+size);assert.equal(crc32(data),crc,name);out[name]=data;p+=30+nl+el+size;}
 return out;}
test('Word-Datei: gültiges Paket mit Tabelle, Kopfbild und Hinweis',()=>{
 const card={...emptyMenu(season,'Test'),lines:card2025(uuid)};
 const png=new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]);
 const files=unzip(menuDocx(card,{bytes:png,width:1200,height:292}));
 assert.deepEqual(Object.keys(files).sort(),['[Content_Types].xml','_rels/.rels','docProps/core.xml','word/_rels/document.xml.rels','word/document.xml','word/media/kopf.png','word/styles.xml']);
 const doc=new TextDecoder().decode(files['word/document.xml']);
 assert.match(doc,/w:fill="A6C9EC"/);assert.match(doc,/Roter Gutedel QbA - feinherb/);assert.match(doc,/16,50/);assert.match(doc,/Weinhaus Landmann/);assert.match(doc,/rIdKopf/);assert.match(doc,/eingesehen/);
 assert.equal((doc.match(/<w:tr>/g)||[]).length,29+4+4+3);
 // Sonderzeichen werden maskiert
 const tricky={...card,lines:[{...card.lines[0],label:'Wein & <Sekt>'}]};
 assert.match(new TextDecoder().decode(unzip(menuDocx(tricky,null))['word/document.xml']),/Wein &amp; &lt;Sekt&gt;/);
});
test('PDF: eine Seite A4 mit allen Einträgen',()=>{
 const card={...emptyMenu(season,'Test'),lines:card2025(uuid)};
 const text=new TextDecoder('latin1').decode(menuPdf(card,null));
 assert.match(text,/^%PDF-1\.4/);assert.match(text,/\/Count 1 /);assert.match(text,/Helvetica-Oblique/);
 assert.match(text,/Pikanter Wurstsalat mit Brot/);assert.match(text,/\(25,00\)/);
 const jpeg=new Uint8Array([0xff,0xd8,0xff,0xd9]);
 const withImage=new TextDecoder('latin1').decode(menuPdf(card,{bytes:jpeg,width:1200,height:292}));
 assert.match(withImage,/\/Subtype \/Image \/Width 1200 \/Height 292/);assert.match(withImage,/\/Kopf Do/);
});
