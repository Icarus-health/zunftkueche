import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sidebar, dashboard, stockOverview } from '../src/kitchen/workspace.ts';
import { season, article, supplier } from './support/kitchen-data.mjs';
const stored = value => ({itemId:1, etag:'"1"', operationId:'x', value});
const state = {seasons:[stored(season)],suppliers:[stored(supplier)],articles:[stored(article)],offers:[],orders:[],counts:[]};
test('primary navigation exposes master data and identifies the active page', () => {
 const html = sidebar(state,season,'Küche',season.id,'articles');
 assert.match(html,/data-id="articles" aria-current="page"/);
 assert.match(html,/data-id="suppliers"/);
});
test('stock overview labels its columns and leaves uncounted stock open', () => {
 const html=stockOverview(state,season,'Küche','');
 assert.match(html,/Zuletzt gezählt/);
 assert.match(html,/Noch nicht gezählt/);
 assert.match(html,/>Offen</);
});
test('dashboard does not repeat the draft as a generic preparation task', () => {
 const order={id:'o',seasonId:season.id,area:'Küche',supplierId:supplier.id,supplierName:supplier.name,occasion:'Fastnacht',status:'Entwurf',deliveryDate:'',lines:[]};
 const html=dashboard({...state,orders:[stored(order)]},season,'Küche');
 assert.match(html,/1 Bestellentwurf vorbereiten und prüfen/);assert.equal((html.match(/1 Bestellentwurf/g)||[]).length,1);
 assert.doesNotMatch(html,/<strong>Bestellung vorbereiten<\/strong>/);
});
