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
