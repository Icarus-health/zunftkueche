import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SharePointStore} from '../src/kitchen/sharepoint.ts';
import {Server} from './support/fake-sharepoint.mjs';
import {season,supplier,article,offer,order,receipt,inventory} from './support/kitchen-data.mjs';
async function setup(){const server=new Server();server.lists.set('ZK_V1_Inventuren',[]);const store=new SharePointStore('https://example.sharepoint.com/sites/kitchen',server.request);for(const[k,v]of [['seasons',season],['suppliers',supplier],['articles',article],['offers',offer]])await store.saveMaster(k,v,undefined,'seed-'+v.id);const saved=await store.saveOrder(order,undefined,'seed-order');return{server,store,saved};}
test('receipt persistence is idempotent after an acknowledged write response is lost',async()=>{
 const {server,store,saved}=await setup();assert.equal(typeof store.saveReceipt,'function');server.dropAfterCommit=true;
 await assert.rejects(store.saveReceipt(saved,receipt,'receive-op'));await store.saveReceipt(saved,receipt,'receive-op');
 const loaded=(await store.load()).orders[0];assert.equal(loaded.value.receipts.length,1);assert.equal(loaded.value.receipts[0].receivedAt,receipt.receivedAt);
 const raw=JSON.parse(server.lists.get('ZK_V1_Bestellungen')[0].ZKData);assert.equal(raw.schema,2,'older clients must reject a header with receipts');
});
test('competing receiving rejects a stale version without overreceiving',async()=>{
 const {store,saved}=await setup();assert.equal(typeof store.saveReceipt,'function');await store.saveReceipt(saved,{...receipt,lines:[{lineId:'line',quantity:6}]},'first');
 await assert.rejects(store.saveReceipt(saved,{...receipt,id:'other',lines:[{lineId:'line',quantity:6}]},'other'),/geändert/);
 assert.equal((await store.load()).orders[0].value.receipts.length,1);
});
test('existing sites without the optional inventory list remain readable',async()=>{
 const {server,store}=await setup();server.lists.delete('ZK_V1_Inventuren');const loaded=await store.load();assert.equal(loaded.inventoriesReady,false);assert.equal(loaded.orders.length,1);
});
test('saved counting drafts survive reload; completed sessions cannot be rewritten',async()=>{
 const {store}=await setup();assert.equal(typeof store.saveInventory,'function');const draft=await store.saveInventory(inventory,undefined,'draft');assert.equal((await store.load()).inventories[0].value.status,'Entwurf');
 const complete={...inventory,status:'Abgeschlossen',completedAt:'2026-10-26T14:00:00Z'};const saved=await store.saveInventory(complete,draft,'complete');await store.saveInventory(complete,draft,'complete');
 await assert.rejects(store.saveInventory({...complete,countedBy:'Andere Person'},saved,'rewrite'),/abgeschlossen|erhalten/);assert.equal((await store.load()).inventories.length,1);
});
test('archived seasons reject receiving and counting',async()=>{
 const {store,saved}=await setup();assert.equal(typeof store.saveReceipt,'function');const current=(await store.load()).seasons[0];await store.saveMaster('seasons',{...season,archived:true},current,'archive');
 await assert.rejects(store.saveReceipt(saved,receipt,'receive'),/aktive Saison|Archiv/);await assert.rejects(store.saveInventory(inventory,undefined,'count'),/aktive Saison|Archiv/);
});
test('permission errors on the optional inventory list are not silently treated as empty',async()=>{
 const {server}=await setup();const store=new SharePointStore('https://example.sharepoint.com/sites/kitchen',async(url,options)=>url.includes('Inventuren')?{status:403,ok:false,json:async()=>({})}:server.request(url,options));
 await assert.rejects(store.load(),/403|Rechte/);
});
