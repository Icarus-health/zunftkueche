import {test} from 'node:test';import assert from 'node:assert/strict';
import {masterForm} from '../src/kitchen/forms.ts';import {validateEntity} from '../src/kitchen/domain.ts';import {workspace} from './support/kitchen-data.mjs';
test('supplier offer shows a review status and rejects invalid status values',()=>{
 const s=workspace(),offer={...s.offers[0].value,priceStatus:'angefragt'};const html=masterForm({kind:'offers',id:offer.id,value:offer},s);assert.match(html,/Angebot angefragt/);assert.match(html,/value="angefragt" selected/);validateEntity('offers',offer);assert.throws(()=>validateEntity('offers',{...offer,priceStatus:'unknown'}));
});
test('review status survives sharepoint save and reload',async()=>{
 const {SharePointStore}=await import('../src/kitchen/sharepoint.ts');const {Server}=await import('./support/fake-sharepoint.mjs');const {article,supplier,offer}=await import('./support/kitchen-data.mjs');const server=new Server(),store=new SharePointStore('https://example.sharepoint.com/sites/test',server.request,true);await store.initialize();for(const[k,v]of [['articles',article],['suppliers',supplier],['offers',offer]])await store.saveMaster(k,v,undefined,'seed-'+v.id);const original=(await store.load()).offers[0];await store.saveMaster('offers',{...original.value,priceStatus:'angefragt'},original,'asked');assert.equal((await store.load()).offers[0].value.priceStatus,'angefragt');
});
