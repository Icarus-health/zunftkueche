import {test} from 'node:test';import assert from 'node:assert/strict';
import {dashboard} from '../src/kitchen/workspace.ts';import {workspace,stored,order,season} from './support/kitchen-data.mjs';
test('review distinguishes issues of current orders from other master data',()=>{
 const s=workspace();s.orders=[stored({...order,status:'Entwurf',occasion:'Bestellung'} )];s.offers[0].value={...s.offers[0].value,priceNet:null,priceDate:null,note:''};
 const html=dashboard(s,season,'Küche');assert.match(html,/1 Bestellentwurf vorbereiten und prüfen/);assert.match(html,/data-action="dashboard-orders" data-id="current-drafts"/);assert.doesNotMatch(html,/Weitere Stammdaten|Preis fehlt/);
});
test('historical orders do not generate current purchase warnings',()=>{
 const s=workspace();s.orders=[stored({...order,status:'Entwurf',occasion:'Historische Bestellliste 2026 – PRÜFEN'})];s.offers[0].value={...s.offers[0].value,priceNet:null};const html=dashboard(s,season,'Küche');assert.doesNotMatch(html,/data-action="dashboard-orders"|Weitere Stammdaten/);
});
