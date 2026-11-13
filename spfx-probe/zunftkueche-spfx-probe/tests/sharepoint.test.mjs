import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SharePointStore} from '../src/kitchen/sharepoint.ts';

import {Server} from './support/fake-sharepoint.mjs';

async function prepared(){const server=new Server();const store=new SharePointStore('https://example.sharepoint.com/sites/kitchen',server.request,false);
 const season={id:'s2026',name:'2026',year:2026,archived:false};const supplier={id:'sup',name:'Getränke',phone:'',email:'',method:'Telefon',customerNumber:'',note:'',active:true};const article={id:'a',name:'Wasser',unit:'Flasche',category:'Getränke',active:true};const offer={id:'off',articleId:'a',supplierId:'sup',code:'',packName:'Kiste',packSize:12,priceNet:null,priceDate:null,deposit:null,note:'',active:true};
 for(const[k,v]of [['seasons',season],['suppliers',supplier],['articles',article],['offers',offer]])await store.saveMaster(k,v,undefined,'op-'+k);
 const order={id:'order',seasonId:'s2026',area:'Küche',supplierId:'sup',supplierName:'Getränke',status:'Entwurf',occasion:'Test',deliveryDate:null,method:'Telefon',note:'',sourceId:null,sourceYear:null,recordedBy:null,recordedAt:null,lines:[{id:'line',articleId:'a',offerId:'off',articleName:'Wasser',code:'',unit:'Flasche',packName:'Kiste',packSize:12,quantity:8,priceNet:null,priorPriceNet:null,priceYear:null,reviewed:false}]};return {server,store,order};}

test('partial order writes stay invisible and the same operation can safely complete',async()=>{
 const {server,store,order}=await prepared();server.failHeader=true;await assert.rejects(store.saveOrder(order,undefined,'order-op'));
 assert.equal((await store.load()).orders.length,0);assert.equal(server.lists.get('ZK_V1_Bestellpositionen').length,1);
 server.failHeader=false;await store.saveOrder(order,undefined,'order-op');assert.equal((await store.load()).orders[0].value.lines[0].quantity,8);assert.equal(server.lists.get('ZK_V1_Bestellpositionen').length,1);
});
test('a competing update rejects the stale order without changing its winning value',async()=>{
 const {store,order}=await prepared();const old=await store.saveOrder(order,undefined,'first');await store.saveOrder({...order,lines:[{...order.lines[0],quantity:9}]},old,'second');
 await assert.rejects(store.saveOrder({...order,lines:[{...order.lines[0],quantity:11}]},old,'third'),/geändert/);assert.equal((await store.load()).orders[0].value.lines[0].quantity,9);
});
test('a lost response after header commit can be recovered without duplicate orders',async()=>{
 const {server,store,order}=await prepared();server.dropAfterCommit=true;await assert.rejects(store.saveOrder(order,undefined,'same-op'));
 const recovered=await store.saveOrder(order,undefined,'same-op');assert.equal(recovered.value.id,'order');assert.equal((await store.load()).orders.length,1);
});
test('all paged masters load and a failed later page never returns a partial workspace',async()=>{
 const {server,store}=await prepared();for(let n=0;n<4;n++)await store.saveMaster('articles',{id:'extra'+n,name:'Extra '+n,unit:'Stück',category:'',active:true},undefined,'op'+n);
 assert.equal((await store.load()).articles.length,5);server.failPage=true;await assert.rejects(store.load(),/403/);
});
test('a master ETag conflict does not overwrite the newer supplier',async()=>{
 const {store}=await prepared();const before=(await store.load()).suppliers[0];await store.saveMaster('suppliers',{...before.value,name:'Neu'},before,'new');await assert.rejects(store.saveMaster('suppliers',{...before.value,name:'Alt'},before,'old'),/geändert/);assert.equal((await store.load()).suppliers[0].value.name,'Neu');
});
test('ordered history stays frozen after master changes',async()=>{
 const {store,order}=await prepared();const sent={...order,status:'Bestellt',recordedBy:'Testperson',recordedAt:'2026-10-23T12:00:00Z',lines:[{...order.lines[0],reviewed:true}]};const stored=await store.saveOrder(sent,undefined,'sent');
 const article=(await store.load()).articles[0];await store.saveMaster('articles',{...article.value,name:'Anders'},article,'rename');assert.equal((await store.load()).orders[0].value.lines[0].articleName,'Wasser');
 await assert.rejects(store.saveOrder({...sent,lines:[{...sent.lines[0],quantity:100}]},stored,'rewrite'),/Nachbestellung/);
});

test('current reference checks reject stale counts, offers and used-unit changes',async()=>{
 const {store}=await prepared();let state=await store.load();const season=state.seasons[0];await store.saveMaster('seasons',{...season.value,archived:true},season,'archive');
 const count={id:'count',seasonId:'s2026',area:'Küche',articleId:'a',articleName:'Wasser',unit:'Flasche',quantity:0,countedAt:'2026-10-23T12:00:00Z',countedBy:'Test',note:'',reorder:false};
 await assert.rejects(store.saveMaster('counts',count,undefined,'count-op'),/Saison/);
 await assert.rejects(store.saveMaster('counts',{...count,articleId:'absent'},undefined,'missing-op'),/Saison|Artikel/);
 const article=state.articles[0];await assert.rejects(store.saveMaster('articles',{...article.value,unit:'kg'},article,'unit-change'),/Einheit/);
 const supplier=state.suppliers[0];await store.saveMaster('suppliers',{...supplier.value,active:false},supplier,'disable');
 await assert.rejects(store.saveMaster('offers',{...state.offers[0].value,id:'new-offer'},undefined,'offer-op'),/Lieferant/);
});
test('schema initialization requires an indexed unique key',async()=>{
 const {store,server}=await prepared();server.keyUnique=false;await assert.rejects(store.initialize(),/Listenschema|eindeutig/);
});
test('a stale draft cannot reinterpret a changed supplier pack',async()=>{
 const {store,order}=await prepared();const offer=(await store.load()).offers[0];await store.saveMaster('offers',{...offer.value,packSize:6},offer,'resize');
 await assert.rejects(store.saveOrder(order,undefined,'stale-pack'),/Gebinde|Einheit/);
});

test('a missed delivery records a note without receiving stock, survives retries and protects concurrent changes',async()=>{
 const {store,order,server}=await prepared();
 const sent={...order,status:'Bestellt',recordedBy:'Test',recordedAt:'2026-10-23T12:00:00Z',lines:[{...order.lines[0],reviewed:true}]};
 const before=await store.saveOrder(sent,undefined,'submitted-note');
 const note={id:'missed',recordedAt:'2026-10-25T10:00:00Z',recordedBy:'Test',note:'Lieferung ausgefallen'};
 await assert.rejects(()=>store.saveDeliveryNote(before,{...note,note:''},'empty-op'),/Hinweis/);
 const after=await store.saveDeliveryNote(before,note,'missing-op');
 assert.equal(after.value.receipts?.length||0,0);assert.equal(after.value.deliveryNotes[0].note,note.note);
 assert.equal((await store.saveDeliveryNote(before,note,'missing-op')).value.deliveryNotes.length,1);
 await assert.rejects(()=>store.saveDeliveryNote(before,{...note,note:'Anders'},'missing-op'),/andere Eingaben/);
 await assert.rejects(()=>store.saveDeliveryNote(before,{...note,id:'second'},'other-op'),/geändert/);
 assert.equal((await store.load()).orders[0].value.deliveryNotes.length,1);
 assert.equal(JSON.parse(server.lists.get('ZK_V1_Bestellungen')[0].ZKData).schema,7);
 const delivered=await store.saveReceipt(after,{id:'later',receivedAt:'2026-10-26T10:00:00Z',receivedBy:'Test',note:'',lines:[{lineId:'line',quantity:2}]},'delivered-later');assert.equal(delivered.value.deliveryNotes.length,1);assert.equal(delivered.value.receipts[0].lines[0].quantity,2);
 const completed=await store.saveOrder({...delivered.value,status:'Abgeschlossen'},delivered,'close-note');assert.equal(completed.value.deliveryNotes.length,1);
});

test('schema initialization rejects rich text storage rather than corrupting JSON',async()=>{
 const {store,server}=await prepared();server.richText=true;await assert.rejects(store.initialize(),/Listenschema/);
});
