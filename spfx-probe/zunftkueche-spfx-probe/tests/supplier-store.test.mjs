import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SharePointStore} from '../src/kitchen/sharepoint.ts';
import {Server} from './support/fake-sharepoint.mjs';
import {season,supplier,article,offer,line} from './support/kitchen-data.mjs';
const value=()=>({id:'weekly',seasonId:season.id,area:'Küche',supplierId:'sup',supplierName:supplier.name,status:'Entwurf',occasion:'Fasnet',deliveryDate:'2027-02-03',method:'Telefon',note:'',supplierNote:'Seiteneingang',sourceId:null,sourceYear:null,recordedBy:null,recordedAt:null,deliveries:[{id:'wed',date:'2027-02-03',time:'',place:'Küche'},{id:'fri',date:'2027-02-05',time:'',place:'Küche'}],lines:[{...line,quantity:8,schedule:{wed:3,fri:5}}]});
test('scheduled order roundtrip preserves delivery split and fences legacy writers on header and positions',async()=>{
 const server=new Server();const store=new SharePointStore('https://example.sharepoint.com/sites/kitchen',server.request);for(const[k,v]of [['seasons',season],['suppliers',supplier],['articles',article],['offers',offer]])await store.saveMaster(k,v,undefined,'seed-'+v.id);
 const saved=await store.saveOrder(value(),undefined,'weekly-op');assert.equal(saved.value.deliveries.length,2);assert.equal(saved.value.lines[0].schedule.fri,5);assert.equal(saved.value.supplierNote,'Seiteneingang');assert.equal((await store.load()).orders[0].value.deliveries[0].date,'2027-02-03');
 for(const kind of ['ZK_V1_Bestellungen','ZK_V1_Bestellpositionen'])assert.equal(JSON.parse(server.lists.get(kind)[0].ZKData).schema,3);
 const changed=value();changed.lines[0].schedule.fri=6;changed.lines[0].quantity=9;server.dropAfterCommit=true;await assert.rejects(store.saveOrder(changed,saved,'weekly-update'));await store.saveOrder(changed,saved,'weekly-update');assert.equal((await store.load()).orders[0].value.lines[0].quantity,9);
 await assert.rejects(store.saveOrder(value(),saved,'stale-update'),/geändert/);
});
test('competing stock allocations share a version gate and a lost response is safely retried',async()=>{
 const server=new Server();let lose=false;const request=async(url,options)=>{const response=await server.request(url,options);if(lose&&options.method==='POST'&&typeof options.body==='string'&&options.body.includes('allocation:s2027:kitchen')){lose=false;throw new Error('Antwort verloren');}return response;};const store=new SharePointStore('https://example.sharepoint.com/sites/kitchen',request);await store.saveMaster('seasons',season,undefined,'season');await store.ww.initialize();const ledger={id:'allocation:s2027:kitchen',kind:'allocation',scope:'s2027',area:'Küche',at:'2026-10-26T12:00:00Z',by:'TEST',confirmed:false,entries:[{planId:'a',articleId:'water',date:'2027-02-12',stockUse:8,incomingUse:0}]};lose=true;await assert.rejects(store.ww.save(ledger,undefined,'first-allocation'));await store.ww.save(ledger,undefined,'first-allocation');await assert.rejects(store.ww.save({...ledger,entries:[{...ledger.entries[0],planId:'b'}]},undefined,'competing'),/vorhanden|geändert/);const saved=await store.ww.get(ledger.id);assert.equal(saved.value.entries[0].planId,'a');
});
