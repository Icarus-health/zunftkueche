// 1.22.0 Karte: Auswahl, Reihenfolge, Speicherformat, Word und PDF im Aufbau der Vorlage.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {card2025,emptyMenu,readMenu,moveLine,proposeFromRecipes,sectionFor,lineFromRecipe,numberLines,menuEditor,reorderSection} from '../src/kitchen/menu-card.ts';
import {menuDocx,menuPdf,obfuscateFont} from '../src/kitchen/menu-export.ts';
import {menuPreview} from '../src/kitchen/menu-preview.ts';
import {layoutMenu,measure,displayTitle} from '../src/kitchen/menu-layout.ts';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const page=html=>new JSDOM('<main>'+html+'</main>').window.document;
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
 assert.equal(card.lines.length,29);assert.equal(card.title,'Staufener Zunftabend 2027');assert.match(card.footer,/eingesehen/);
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
const fontFile=w=>new Uint8Array(readFileSync(new URL(`../src/kitchen/menu-assets/montserrat-${w}.ttf`,import.meta.url)));
const assets={fonts:{200:fontFile(200),300:fontFile(300),400:fontFile(400)},
 wappenPng:{bytes:new Uint8Array(readFileSync(new URL('../src/kitchen/menu-assets/wappen-blau.png',import.meta.url))),width:186,height:420},
 wappenJpeg:{bytes:new Uint8Array(readFileSync(new URL('../src/kitchen/menu-assets/wappen-blau.jpg',import.meta.url))),width:186,height:420}};
test('Word-Datei nach Zunft-System: Wappen, Montserrat eingebettet, Rubriken gesperrt, feine Linien',()=>{
 const card={...emptyMenu(season,'Test'),lines:card2025(uuid)};
 const files=unzip(menuDocx(card,assets));
 assert.deepEqual(Object.keys(files).sort(),['[Content_Types].xml','_rels/.rels','docProps/core.xml','word/_rels/document.xml.rels','word/_rels/fontTable.xml.rels','word/document.xml','word/fontTable.xml','word/fonts/montserrat-200.odttf','word/fonts/montserrat-300.odttf','word/fonts/montserrat-400.odttf','word/media/wappen.png','word/settings.xml','word/styles.xml']);
 const doc=new TextDecoder().decode(files['word/document.xml']);
 assert.doesNotMatch(doc,/w:fill=|A6C9EC|Arial/,'keine Farbflächen, keine Arial mehr');
 assert.match(doc,/SCHELMENZUNFT STAUFEN/);assert.match(doc,/w:spacing w:val="48"/,'Name gesperrt');
 assert.match(doc,/>WEIN</);assert.match(doc,/>BIER UND ALKOHOLFREIE GETRÄNKE</);assert.match(doc,/w:color w:val="3F4695"/);
 assert.match(doc,/w:bottom w:val="single" w:sz="4" w:space="0" w:color="CFD1E5"/);
 assert.match(doc,/Roter Gutedel QbA - feinherb/);assert.match(doc,/16,50 €/);assert.match(doc,/Weinhaus Landmann/);assert.match(doc,/rIdWappen/);assert.match(doc,/eingesehen/);
 assert.match(doc,/w:rFonts w:ascii="Montserrat ExtraLight"[^>]*\/><w:color w:val="20234B"\/><w:sz w:val="46"\/>[^]*?Staufener Zunftabend 2027</,'Titel ExtraLight');
 assert.equal((doc.match(/<w:tr>/g)||[]).length,29+2,'29 Zeilen plus zwei kurze Linien');
 const table=new TextDecoder().decode(files['word/fontTable.xml']);
 for(const f of ['Montserrat ExtraLight','Montserrat Light','Montserrat'])assert.match(table,new RegExp(`w:name="${f}"><w:altName w:val="Arial"/>[^]*?<w:embedRegular`));
 assert.match(new TextDecoder().decode(files['word/settings.xml']),/<w:embedTrueTypeFonts\/>/);
 // Verschleierung ist umkehrbar und betrifft nur die ersten 32 Byte
 const key='{5A4B3C2D-1E0F-4A1B-8C2D-3E4F5A6B7C03}';
 assert.deepEqual(obfuscateFont(files['word/fonts/montserrat-300.odttf'],key),assets.fonts[300]);
 assert.deepEqual(files['word/fonts/montserrat-300.odttf'].slice(32,64),assets.fonts[300].slice(32,64));
 // Ohne mitgelieferte Dateien bleibt ein gültiges Paket, Sonderzeichen werden maskiert
 const tricky={...card,lines:[{...card.lines[0],label:'Wein & <Sekt>'}]};
 const bare=unzip(menuDocx(tricky,null));
 assert.match(new TextDecoder().decode(bare['word/document.xml']),/Wein &amp; &lt;Sekt&gt;/);
 assert.equal(Object.keys(bare).some(n=>n.endsWith('.odttf')||n.endsWith('.png')),false);
});
test('PDF nach Zunft-System: eine Seite A4, Montserrat eingebettet, Wappen, Farben aus dem System',()=>{
 const card={...emptyMenu(season,'Test'),lines:card2025(uuid)};
 const text=new TextDecoder('latin1').decode(menuPdf(card,assets));
 assert.match(text,/^%PDF-1\.4/);assert.match(text,/\/Count 1 /);
 for(const f of ['ExtraLight','Light','Regular'])assert.match(text,new RegExp(`/BaseFont /ZKAAAA\\+Montserrat-${f} /FirstChar 32 /LastChar 255`));
 assert.equal((text.match(/\/FontFile2 /g)||[]).length,3);assert.doesNotMatch(text,/Helvetica-Oblique/);
 assert.match(text,/Pikanter Wurstsalat mit Brot/);assert.match(text,/\(25,00 €\)/);assert.match(text,/\(SCHELMENZUNFT STAUFEN\)/);assert.match(text,/2\.40 Tc/);
 assert.match(text,/0\.247 0\.275 0\.584 rg/,'Rubrik in Zunftblau');assert.match(text,/0\.812 0\.820 0\.898 RG/,'Linie in Nebel');
 assert.match(text,/\/Subtype \/Image \/Width 186 \/Height 420/);assert.match(text,/\/Wappen Do/);
 assert.match(text,/\(Staufener Zunftabend 2027\)/);
 // Ohne Dateien: Schrift nur benannt, gleiche Breiten, kein Bild
 const bare=new TextDecoder('latin1').decode(menuPdf(card,null));
 assert.doesNotMatch(bare,/FontFile2|\/Image/);assert.match(bare,/\/BaseFont \/Montserrat-Light/);
});
test('Vorschau zeigt denselben Satz wie das PDF',()=>{
 const card={...emptyMenu(season,'Test'),lines:card2025(uuid),title:'-Staufener Zunftabend 2026-'};
 const svg=page(menuPreview(card,{href:'wappen.png',width:186,height:420}));
 const pages=svg.querySelectorAll('svg.menu-page');assert.equal(pages.length,1);
 assert.equal(pages[0].getAttribute('viewBox'),'0 0 595 842');
 const ops=layoutMenu(card,186/420)[0];
 const texts=[...pages[0].querySelectorAll('text')];
 assert.deepEqual(texts.map(t=>t.textContent),ops.filter(o=>o.t==='text').map(o=>o.value),'gleiche Texte in gleicher Reihenfolge');
 assert.deepEqual(texts.map(t=>Number(t.getAttribute('x'))),ops.filter(o=>o.t==='text').map(o=>Math.round(o.x*100)/100),'gleiche Lage');
 assert.ok(texts.some(t=>t.textContent==='Staufener Zunftabend 2026'),'Striche der alten Vorlage fallen weg');
 assert.equal(pages[0].querySelector('image').getAttribute('href'),'wappen.png');
 assert.match(menuPreview({...card,lines:[{...card.lines[0],label:'<b>&'}]},null),/&lt;b&gt;&amp;/);
});
test('Lange Karte: Rubrikkopf wandert mit seiner ersten Zeile, Seitenzahlen, Hinweis auf der letzten Seite',()=>{
 const base=card2025(uuid);const many=[...base,...base.map(l=>({...l,id:l.id+'b'})),...base.map(l=>({...l,id:l.id+'c'}))];
 const pages=layoutMenu({...emptyMenu(season,'Test'),lines:many},186/420);
 assert.ok(pages.length>1);
 const texts=p=>p.filter(o=>o.t==='text');
 pages.forEach((p,i)=>{assert.ok(texts(p).some(o=>o.value===`${i+1} / ${pages.length}`));assert.ok(Math.max(...p.map(o=>o.t==='text'?o.y:o.t==='line'?o.y1:o.y+o.height))<=842-10,'nichts unter dem Rand');
  const last=texts(p).filter(o=>o.value!==`${i+1} / ${pages.length}`&&!/Allergene|Liste an/.test(o.value)).at(-1);
  assert.ok(!/^[A-ZÄÖÜ +]{4,}$/.test(last.value),'keine Rubrik allein am Seitenende: '+last.value);});
 assert.ok(texts(pages.at(-1)).some(o=>/eingesehen/.test(o.value)));assert.ok(!texts(pages[0]).some(o=>/eingesehen/.test(o.value)));
});
test('Textbreiten aus Montserrat: Sperrung nur zwischen den Zeichen',()=>{
 assert.equal(measure('',9,300),0);
 assert.ok(Math.abs(measure('AB',10,400,2)-(measure('AB',10,400)+2))<1e-9);
 assert.ok(measure('Wurstsalat',9,300)>measure('Wurstsalat',9,200),'Light breiter als ExtraLight');
 assert.equal(displayTitle(' – Zunftabend 2027 - '),'Zunftabend 2027');
});
test('Ziehen und Ablegen ordnet nur die eigene Rubrik neu',()=>{
 const lines=card2025(uuid);
 const wine=lines.filter(l=>l.section==='wine').map(l=>l.id);
 const wanted=[wine[3],...wine.filter((_,i)=>i!==3)];
 const out=reorderSection(lines,'wine',wanted);
 assert.deepEqual(out.filter(l=>l.section==='wine').map(l=>l.id),wanted);
 assert.deepEqual(out.filter(l=>l.section!=='wine'),lines.filter(l=>l.section!=='wine'));
 assert.deepEqual(out.map(l=>l.section),lines.map(l=>l.section));
 assert.equal(out.length,lines.length);
 const partial=reorderSection(lines,'wine',[wine[2]]);
 assert.deepEqual(partial.filter(l=>l.section==='wine').map(l=>l.id),[wine[2],...wine.filter((_,i)=>i!==2)]);
 const html=menuEditor({...emptyMenu(season,'Test','2026-11-16T10:00:00Z'),lines},state,true);
 assert.equal((html.match(/data-menu-drag=/g)||[]).length,29);
});
