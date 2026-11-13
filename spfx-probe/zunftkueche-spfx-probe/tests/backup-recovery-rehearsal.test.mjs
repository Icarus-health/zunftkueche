import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SharePointStore} from '../src/kitchen/sharepoint.ts';
import {stockProjection} from '../src/kitchen/ww/domain.ts';
import {createBackup,verifyBackup} from '../src/kitchen/ww/backup.ts';
import {sha256} from '../src/kitchen/imports/identity.ts';
import {Server} from './support/fake-sharepoint.mjs';
import {season,supplier,article,offer,line} from './support/kitchen-data.mjs';
import {base,recipe} from './support/ww-data.mjs';

async function site(name) {const server=new Server(),store=new SharePointStore('https://example.test/sites/'+name,server.request,true);await store.initialize();await store.ww.initialize();return store;}
const seed=async s=>{for(const [group,value] of [['seasons',season],['suppliers',supplier],['articles',article],['offers',offer]]) await s.saveMaster(group,value,undefined,'seed-'+value.id);};
const projection=(w,j)=>stockProjection(w,j.filter(x=>x.value.kind!=='index').map(x=>x.value),'s2027','Küche','').find(x=>x.articleId==='water').quantity;

test('isolated recovery rehearsal preserves receipts, journal, sales index and invoice original without duplicate stock',async()=>{
 const source=await site('source');await seed(source);
 const count={id:'c',seasonId:'s2027',area:'Küche',articleId:'water',articleName:'Mineralwasser',unit:'Flasche',quantity:10,countedAt:'2027-02-01T09:00:00Z',countedBy:'TEST',note:'',reorder:false};
 await source.saveMaster('counts',count,undefined,'count');
 const order={id:'o',seasonId:'s2027',area:'Küche',supplierId:'sup',supplierName:supplier.name,status:'Entwurf',occasion:'Test',deliveryDate:'2027-02-02',method:'Telefon',note:'',sourceId:null,sourceYear:null,recordedBy:null,recordedAt:null,deliveries:[{id:'d',date:'2027-02-02',time:'09:00',place:'Küche'}],lines:[{...line,quantity:2,schedule:{d:2}}]};
 let o=await source.saveOrder(order,undefined,'order');o=await source.saveOrder({...o.value,status:'Bestellt',recordedAt:'2027-02-01T12:00:00Z',recordedBy:'TEST'},o,'submit');
 const receipt={id:'r',deliveryId:'d',receivedAt:'2027-02-02T10:00:00Z',receivedBy:'TEST',note:'Teilmenge',lines:[{lineId:'line',quantity:1}]};o=await source.saveReceipt(o,receipt,'receipt');
 const movement={...base('movement','waste'),at:'2027-02-02T12:00:00Z',confirmed:true,area:'Küche',articleId:'water',quantity:2,unit:'Flasche',type:'waste',place:'',toArea:null,toPlace:'',note:''};
 await source.ww.save(movement,undefined,'movement');await source.ww.save(recipe,undefined,'recipe');
 const system={...base('system','sale'),at:'2027-02-02T13:00:00Z',confirmed:true,area:'Küche',purpose:'sales',sourceId:'profile',name:'Testkasse',from:'2027-02-02',to:'2027-02-02',fileHash:'a'.repeat(64),canonicalKey:'b'.repeat(64),basis:'gross',currency:'EUR',recipes:[recipe],rows:[{externalId:'x',productId:'r1',name:'Testgericht',quantity:5,date:'2027-02-02',status:'active',amount:35}]};await source.ww.save(system,undefined,'sale');
 const bytes=new TextEncoder().encode('%PDF-1.7\nsynthetic-original'),hash=await sha256(bytes);
 const bill={...base('bill','bill'),name:'Testbeleg',supplierId:'sup',number:'TEST-1',date:'2027-02-02',area:'Küche',orderIds:['o'],fileHash:hash,fileName:'test.pdf',attachment:'',net:10,tax:1.9,gross:11.9,adjustmentNet:0,lines:[{id:'l',articleId:'water',name:'Mineralwasser',quantity:1,unit:'Flasche',unitNet:10,totalNet:10,taxRate:19}],note:''};
 let b=await source.ww.save(bill,undefined,'bill-draft');const attachment=await source.ww.attachOriginal(b,bytes,hash,'pdf');b=await source.ww.save({...bill,attachment,confirmed:true},b,'bill-confirm');
 const read=await verifyBackup(await createBackup(await source.load(),source.ww));const target=await site('target');await seed(target);await target.saveMaster('counts',read.workspace.counts[0].value,undefined,'recover-count');
 const original=read.workspace.orders[0].value;const {receipts,deliveryNotes,...head}=original;
 let restored=await target.saveOrder({...head,status:'Entwurf',recordedBy:null,recordedAt:null},undefined,'recover-draft');restored=await target.saveOrder({...head,status:'Bestellt'},restored,'recover-submitted');
 for(const r of receipts||[]) restored=await target.saveReceipt(restored,r,'recover-'+r.id);
 for(const d of deliveryNotes||[]) restored=await target.saveDeliveryNote(restored,d,'recover-'+d.id);
 for(const row of read.journal.filter(r=>r.value.kind!=='index'&&r.value.kind!=='bill')) await target.ww.save(row.value,undefined,'recover-'+row.value.id);
 const savedBill=read.journal.find(r=>r.value.kind==='bill').value;let staged=await target.ww.save({...savedBill,confirmed:false,attachment:''},undefined,'recover-bill-draft');const file=await target.ww.attachOriginal(staged,read.originals[savedBill.id],savedBill.fileHash,'pdf');await target.ww.save({...savedBill,attachment:file},staged,'recover-bill');
 const after=await target.load(),journal=await target.ww.loadAll();assert.deepEqual(after.orders[0].value,original);assert.deepEqual(await target.ww.readOriginal(await target.ww.get('bill')),bytes);
 const values=j=>j.map(x=>x.value).sort((a,b)=>a.id.localeCompare(b.id));assert.deepEqual(values(journal),values(read.journal));
 assert.equal(projection(read.workspace,read.journal),19);assert.equal(projection(after,journal),19);
 await target.saveReceipt(restored,receipt,'recover-r');assert.equal((await target.load()).orders[0].value.receipts.length,1);
 await assert.rejects(target.ww.save({...system,id:'duplicate',canonicalKey:'c'.repeat(64)},undefined,'duplicate'),/bereits|Datei|Import/);
});

test('backup restores a partial evening count to a separate synthetic site without turning blank into zero',async()=>{
 const {inventory,inventoryLine}=await import('./support/kitchen-data.mjs');const source=await site('count-source');await seed(source);const second={...article,id:'juice',name:'Saft'};await source.saveMaster('articles',second,undefined,'seed-juice');const count={...inventory,id:'count-restore',status:'Abgeschlossen',completedAt:'2027-02-03T21:00:00Z',lines:[{...inventoryLine,packs:0,loose:null,assessment:'reorder'},{...inventoryLine,articleId:'juice',articleName:'Saft',packs:null,loose:null}]};await source.saveInventory(count,undefined,'count-op');const backup=await verifyBackup(await createBackup(await source.load(),source.ww,()=>source.load()));const target=await site('count-target');await seed(target);await target.saveMaster('articles',second,undefined,'target-juice');const saved=await target.saveInventory(backup.workspace.inventories[0].value,undefined,'restored-count');const reloaded=(await target.load()).inventories.find(x=>x.value.id==='count-restore').value;assert.deepEqual(reloaded,saved.value);assert.equal(reloaded.lines[0].packs,0);assert.equal(reloaded.lines[1].packs,null);assert.equal(reloaded.lines[1].loose,null);assert.equal(reloaded.lines[0].assessment,'reorder');
});
test('backup refuses a workspace changed while creating the archive',async()=>{const source=await site('changing-source');await seed(source);const before=await source.load();await assert.rejects(createBackup(before,source.ww,async()=>({...before,articles:[]})),/während der Sicherung geändert/);});
test('backup integrity rejects a changed JSON even when the ZIP itself is valid',async()=>{const JSZip=(await import('jszip')).default;const source=await site('tamper-source');await seed(source);const bytes=await createBackup(await source.load(),source.ww,()=>source.load());const zip=await JSZip.loadAsync(bytes);zip.file('workspace.json','{}');const edited=await zip.generateAsync({type:'uint8array'});await assert.rejects(verifyBackup(edited),/Prüfsumme/);});
