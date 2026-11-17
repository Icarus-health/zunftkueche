// Local UI acceptance only. Production contains neither this provider nor browser storage.
import {Server} from './support/fake-sharepoint.mjs';
import {SharePointStore} from '../lib/kitchen/sharepoint.js';
import {KitchenView} from '../lib/kitchen/view.js';
import {LocalState} from '../lib/kitchen/local-state.js';
const trial=new URLSearchParams(location.search).get('trial')||'';
const server=new Server(),storage='zunftkueche-v1.6-preview'+(/^[a-z0-9-]{1,40}$/.test(trial)?'-'+trial:'');
const request=async(url,options)=>{const saved=localStorage.getItem(storage);if(saved){const parsed=JSON.parse(saved);server.lists=new Map(parsed.lists);server.descriptions=new Map(parsed.descriptions);server.attachments=new Map((parsed.attachments||[]).map(([key,files])=>[key,new Map(files.map(([name,bytes])=>[name,new Uint8Array(bytes)]))]));}const result=await server.request(url,options);if(options.method==='POST')localStorage.setItem(storage,JSON.stringify({lists:[...server.lists],descriptions:[...server.descriptions],attachments:[...server.attachments].map(([key,files])=>[key,[...files].map(([name,bytes])=>[name,[...bytes]])])}));return result;};
if(['fasnet-inbox','fasnet-payments','fasnet-review'].includes(trial)){
 const root='/sites/kitchen/Shared Documents';
 for(const path of ['/03_Rechnungen','/03_Rechnungen/2027','/01_Zunftjahr','/01_Zunftjahr/2027','/01_Zunftjahr/2027/Kasse'])
  server.inboxFolders.add(root+path);
 const pdf=new Uint8Array(await (await fetch('/tests/fixtures/acceptance/rechnung-beispiel.pdf')).arrayBuffer());
 const csv=new TextEncoder().encode('ID;Artikel;Bezeichnung;Menge;Datum;Betrag\n1;WASSER;Mineralwasser 0,2 l;4;05.02.2027;8,00\n');
 const files=[['03_Rechnungen/2027','Rechnung #107.pdf',pdf],['03_Rechnungen/2027','Rechnung #107 Kopie.pdf',pdf],
  ['03_Rechnungen/2027','Notiz.txt',new TextEncoder().encode('Testnotiz')],['01_Zunftjahr/2027/Kasse','Kasse Freitag.csv',csv]];
 if(trial==='fasnet-payments'){
  const {default:JSZip}=await import('jszip');
  const workbook=new JSZip();
  workbook.file('xl/workbook.xml','<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Zahlungen" r:id="r1"/></sheets></workbook>');
  workbook.file('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="r1" Target="worksheets/a.xml"/></Relationships>');
  const rows=[['Zahlart','Betrag','Status'],['Bar',125.5,'bezahlt'],['Karte',50,'bezahlt'],['Karte',9.5,'erstattet']];
  const sheet=rows.map((cells,index)=>'<row r="'+(index+1)+'">'+cells.map((value,col)=>{
   const cell=' r="'+String.fromCharCode(65+col)+(index+1)+'"';
   return typeof value==='number'?'<c'+cell+'><v>'+value+'</v></c>':'<c'+cell+' t="inlineStr"><is><t>'+value+'</t></is></c>';
  }).join('')+'</row>').join('');
  workbook.file('xl/worksheets/a.xml','<worksheet><sheetData>'+sheet+'</sheetData></worksheet>');
  files.push(['01_Zunftjahr/2027/Kasse','Zahlungen Zunftabend.xlsx',await workbook.generateAsync({type:'uint8array'})]);
 }
 if(trial==='fasnet-review'){
  const makePdf=pages=>{
   const objects=['<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((_,i)=>(4+2*i)+' 0 R').join(' ')+'] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
   for(const [i,lines] of pages.entries()){
    const content='BT /F1 12 Tf 16 TL 50 700 Td '+lines.map(line=>'('+line+') Tj T*').join(' ')+' ET';
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents '+(5+2*i)+' 0 R >>',
     '<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream');
   }
   let file='%PDF-1.4\n';const offsets=[0];
   for(const [i,obj] of objects.entries()){offsets.push(file.length);file+=(i+1)+' 0 obj\n'+obj+'\nendobj\n';}
   const xref=file.length;
   return new TextEncoder().encode(file+'xref\n0 '+offsets.length+'\n0000000000 65535 f \n'
    +offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')
    +'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF');
  };
  files.push(['03_Rechnungen/2027','Sammelmappe.pdf',makePdf([
   ['Rechnungsnummer: TEST-S-01','Belegdatum: 05.02.2027','Gesamtbetrag: 153,00'],
   ['Gutschrift Nr. TEST-S-02','Gesamtbetrag: -8,00']
  ])],['03_Rechnungen/2027','Gemischte Lieferung.pdf',makePdf([
   ['Rechnungsnummer: TEST-MIXED','Rechnungsdatum: 05.02.2027','Lieferung Zunftabend Bar:',
    'Lieferung Zunftabend K\\374che:','Lieferung Zunftabend Zunftscheuer:','Gesamtbetrag: 171,11']
  ])]);
 }
 for(const [i,[path,name,bytes]] of files.entries()){
  const metadata={UniqueId:'00000000-0000-0000-0000-00000000000'+(i+1),ETag:'"1"',Name:name,Length:String(bytes.length),TimeLastModified:'2026-11-04T09:00:00Z'};
  server.inboxFiles.set(root+'/'+path+'/'+name,{metadata,bytes});
 }
}
const store=new SharePointStore('https://example.sharepoint.com/sites/kitchen',request,false);
if(!localStorage.getItem(storage+'-ready')){
 if(trial==='fasnet-2026'){
  const response=await fetch('/historical-preview.json');
  if(!response.ok)throw new Error('Lokale Fasnet-2026-Kopie fehlt.');
  const snapshot=await response.json();
  localStorage.setItem(storage,JSON.stringify({lists:snapshot.lists,descriptions:snapshot.descriptions}));
  new LocalState(document.getElementById('kitchen-root'),store.storageScope,'Lokale Vorschau').write('context',{area:'Küche',seasonId:snapshot.seasonId});
 }else{
 await store.initialize();await store.ww.initialize();
 const articles=[
 {id:'water',name:'Mineralwasser',unit:'Flaschen',category:'Getränke',active:true},
 {id:'potato',name:'Kartoffelsalat',unit:'kg',category:'Küche',active:true},
 {id:'wine',name:'Rotwein',unit:'Flaschen',category:'Getränke',active:true}];
 const suppliers=[{id:'sup',name:'Getränkemarkt',phone:'01234 567890',email:'bestellung@example.invalid',method:'Telefon',customerNumber:'BEISPIEL',note:'Künstlicher Beispieldatensatz',active:true},{id:'butcher',name:'Metzgerei',phone:'',email:'',method:'Abholung',customerNumber:'',note:'Künstlicher Beispieldatensatz',active:true}];
 const offers=[
 {id:'water-off',articleId:'water',supplierId:'sup',code:'W12',packName:'Kisten',packSize:12,priceNet:8.5,priceDate:'2026-10-26',deposit:3.3,note:'',active:true},
 {id:'potato-off',articleId:'potato',supplierId:'butcher',code:'K5',packName:'Eimer',packSize:5,priceNet:18.5,priceDate:'2026-10-26',deposit:null,note:'',active:true},
 {id:'wine-off',articleId:'wine',supplierId:'sup',code:'R6',packName:'Kisten',packSize:6,priceNet:30,priceDate:'2026-10-26',deposit:null,note:'',active:true}];
 const masters=[['seasons',{id:'s2026',name:'Saison 2026',year:2026,archived:false}],['seasons',{id:'s2027',name:'Saison 2027',year:2027,archived:false}],...suppliers.map(x=>['suppliers',x]),...articles.map(x=>['articles',x]),...offers.map(x=>['offers',x])];
 for(const[kind,entity]of masters)await store.saveMaster(kind,entity,undefined,'seed-'+entity.id);
 const line=(article,offer,quantity)=>({id:'line-'+article.id,articleId:article.id,offerId:offer.id,articleName:article.name,code:offer.code,unit:article.unit,packName:offer.packName,packSize:offer.packSize,quantity,priceNet:offer.priceNet,priorPriceNet:null,priceYear:null,reviewed:true});
 const base={id:'historic',seasonId:'s2026',area:'Küche',supplierId:'sup',supplierName:'Getränkemarkt',status:'Bestellt',occasion:'Zunftabend · Beispiel',deliveryDate:'2026-02-11',method:'Telefon',note:'Künstliche Beispieldaten. Keine echte Bestellung.',sourceId:null,sourceYear:null,recordedBy:'Beispielperson',recordedAt:'2026-10-26T08:00:00Z',deliveries:[{id:'wed',date:'2026-02-11',time:'09–11 Uhr',place:'Küche'},{id:'fri',date:'2026-02-13',time:'Vormittag',place:'Küche'}],supplierNote:'Bitte am Kücheneingang liefern.',lines:[{...line(articles[0],offers[0],8),schedule:{wed:3,fri:5}},{...line(articles[2],offers[2],2),schedule:{wed:1,fri:1}}]};
 await store.saveOrder(base,undefined,'seed-historic');
 await store.saveOrder({...base,id:'current',seasonId:'s2027',deliveryDate:'2027-02-03',deliveries:base.deliveries.map(d=>({...d,date:d.id==='wed'?'2027-02-03':'2027-02-05'}))},undefined,'seed-current');
 await store.saveOrder({...base,id:'draft',seasonId:'s2027',status:'Entwurf',recordedAt:null,recordedBy:null,deliveryDate:'2027-02-03',deliveries:base.deliveries.map(d=>({...d,date:d.id==='wed'?'2027-02-03':'2027-02-05'})),lines:[{...line(articles[1],offers[1],2),priceNet:null,schedule:{wed:0,fri:2}}],supplierId:'butcher',supplierName:'Metzgerei'},undefined,'seed-draft');
 for(const [index,a]of articles.entries())await store.saveMaster('counts',{id:'count-'+a.id,seasonId:'s2027',area:'Küche',articleId:a.id,articleName:a.name,unit:a.unit,quantity:[24,4,12][index],countedAt:'2026-10-26T09:00:00Z',countedBy:'Beispielperson',note:'Beispielzählung',reorder:index===0,surplus:index===2},undefined,'seed-count-'+a.id);
 const common={scope:'global',at:'2026-10-26T10:00:00Z',by:'Beispielperson',confirmed:false};
 const records=[
 {...common,id:'example-recipe',kind:'recipe',familyId:'water-glass',name:'Mineralwasser 0,2 l · Beispiel',category:'Getränke',yield:5,salePriceGross:2,ingredients:[{articleId:'water',quantity:1,unit:'Flaschen'}],confirmed:true},
 {...common,id:'example-slot-wed',kind:'slot',scope:'s2027',name:'Mittwoch Vorbereitung · Beispiel',date:'2027-02-03',time:'09:00–11:00',place:'Küche'},
 {...common,id:'example-slot-fri',kind:'slot',scope:'s2027',name:'Freitag Zunftabend · Beispiel',date:'2027-02-05',time:'Vormittag',place:'Küche'},
 {...common,id:'example-template',kind:'template',name:'Getränke Grundbestellung · Beispiel',supplierId:'sup',area:'Küche',lines:[{offerId:'water-off',quantity:4},{offerId:'wine-off',quantity:2}],note:'Künstlicher Ordersatz. Mengen vor jedem Einsatz prüfen.'},
 {...common,id:'example-rule',kind:'rule',supplierId:'sup',weekdays:[3,5,6,0],leadDays:2,cutoff:'12 Uhr telefonisch',minNet:null,feeNet:null,note:'Beispiel – tatsächliche Absprache prüfen.'},
 {...common,id:'example-plan',kind:'plan',scope:'s2027',name:'Freitag · Beispielplanung',date:'2027-02-05',area:'Küche',lines:[{recipeId:'example-recipe',portions:150}],note:'Künstliche Portionsplanung.'}];
 for(const doc of records)await store.ww.save(doc,undefined,'seed-'+doc.id);
 if(trial==='fasnet-next-use'){
  const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'});
  const next=new Date(Date.parse(today+'T12:00Z')+86400000).toISOString().slice(0,10);
  const nextSlot={...common,id:'next-delivery',kind:'slot',scope:'s2027',name:'Kinderfest',date:next,time:'10:00',place:'Küche'};
  const nextPlan={...common,id:'next-plan',kind:'plan',scope:'s2027',name:'Kinderfest',date:next,area:'Küche',lines:[{recipeId:'example-recipe',portions:150}],note:'Künstliche Testplanung.'};
  for(const doc of [nextSlot,nextPlan])await store.ww.save(doc,undefined,'seed-'+doc.id);
  const order={...base,id:'next-main-order',seasonId:'s2027',occasion:'Kinderfest · Hauptbestellung',deliveryDate:next,
   recordedAt:new Date(Date.now()-86400000).toISOString(),deliveries:[{id:nextSlot.id,date:next,time:nextSlot.time,place:nextSlot.place}],
   lines:[{...line(articles[0],offers[0],3),schedule:{[nextSlot.id]:3},sources:[{planId:nextPlan.id,deliveryId:nextSlot.id,quantity:3}]}]};
  const saved=await store.saveOrder(order,undefined,'seed-next-order');
  await store.saveReceipt(saved,{id:'next-partial',deliveryId:nextSlot.id,receivedAt:new Date(Date.now()-60000).toISOString(),
   receivedBy:'Beispielperson',note:'Eine Kiste ist noch unterwegs.',lines:[{lineId:order.lines[0].id,quantity:2}]},'seed-next-partial');
 }
 if(trial==='fasnet-credits'){
  const origin={...common,kind:'bill',id:'test-original-invoice',scope:'s2027',area:'Küche',confirmed:true,billType:'invoice',
   name:'Einkauf Zunftabend',number:'TEST-R-130',supplierId:'sup',date:'2027-02-05',orderIds:['current'],
   net:100,tax:19,gross:119,note:'',fileHash:'',fileName:'',attachment:'',adjustmentNet:0,
   lines:[{id:'water',role:'goods',articleId:'water',name:'Mineralwasser',quantity:8,unit:'Kisten',unitNet:11.25,totalNet:90,taxRate:19},
    {id:'deposit',role:'deposit',articleId:null,name:'Kistenpfand',quantity:null,unit:'',unitNet:null,totalNet:10,taxRate:19}]};
  const returned={...common,kind:'movement',id:'test-return',scope:'s2027',at:'2027-02-07T08:00:00Z',confirmed:true,type:'return',area:'Küche',
   articleId:'water',quantity:24,unit:'Flaschen',place:'',toArea:null,toPlace:'',note:'Künstlicher Abholbeleg'};
  await store.ww.save(origin,undefined,'seed-original-credit');
  await store.ww.save(returned,undefined,'seed-movement-credit');
 }
 }
 localStorage.setItem(storage+'-ready','1');
}
const css=await (await fetch('/production.css')).text(),style=document.createElement('style');style.textContent=css;document.head.append(style);
const root=document.getElementById('kitchen-root');root.className='kitchen';if(new URLSearchParams(location.search).get('dark')==='1'){root.dataset.dark='true';document.body.style.background='#1b1a19';}
const view=new KitchenView(root,store,'Lokale Vorschau');await view.start();
