import {test} from 'node:test';import assert from 'node:assert/strict';
import {priceSuggestion} from '../src/kitchen/order-guidance.ts';
import {workspace,line,order,stored} from './support/kitchen-data.mjs';import {prices} from './support/ww-data.mjs';
const setup=()=>{const s=workspace();s.ww={ready:true,records:[stored(prices)]};const o={...order,status:'Entwurf',deliveries:[{id:'wed',date:'2027-02-03',time:'',place:'Küche'},{id:'fri',date:'2027-02-05',time:'',place:'Küche'}],lines:[{...line,schedule:{wed:3,fri:5}}]};return{s,o};};
test('confirmed price list for delivery dates yields a reviewable proposal',()=>{const {s,o}=setup();assert.equal(priceSuggestion(o,o.lines[0],s).price,9);});
test('unknown dates or different prices across deliveries cannot be adopted blindly',()=>{let {s,o}=setup();o.deliveries[0].date=null;assert.equal(priceSuggestion(o,o.lines[0],s).price,null);({s,o}=setup());o.deliveries[0].date='2026-12-30';assert.equal(priceSuggestion(o,o.lines[0],s).price,null);});
test('price review lists each delivery and the applicable source even when prices differ',()=>{const{s,o}=setup();o.deliveries[0].date='2026-12-30';const result=priceSuggestion(o,o.lines[0],s);assert.deepEqual(result.quotes.map(q=>q.price),[8.5,9]);assert.equal(result.quotes[1].source,'Neue Liste');assert.equal(result.quotes[0].source,'Lieferangebot');});
