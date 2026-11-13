import {test} from 'node:test';
import assert from 'node:assert/strict';
import {copyScheduledOrder} from '../src/kitchen/supplier-orders.ts';
import {supplierCopyForm} from '../src/kitchen/supplier-forms.ts';
import {inventoryForm} from '../src/kitchen/operation-forms.ts';
import {dashboard} from '../src/kitchen/workspace.ts';
import {workspace,stored,line,order,season,inventory,inventoryLine} from './support/kitchen-data.mjs';

test('copy lets users exclude an inactive historical article without changing the source',()=>{
 const s=workspace(); const target={id:'s2028',name:'2028',year:2028,archived:false}; s.seasons.push(stored(target));
 const inactive={...line,id:'old',articleId:'oldArticle',offerId:'oldOffer',articleName:'Gestrichen',schedule:{wed:2}};
 const source={...order,status:'Entwurf',recordedAt:null,recordedBy:null,deliveries:[{id:'wed',date:null,time:'Mittwoch 17 Uhr',place:'Küche'}],lines:[{...line,quantity:3,schedule:{wed:3}},inactive]};
 const copy=copyScheduledOrder(source,target,'Küche',s,{wed:'2028-02-23'},['line']);
 assert.deepEqual(copy.lines.map(l=>l.id),['line']); assert.equal(source.lines.length,2); assert.equal(copy.status,'Entwurf');
 assert.throws(()=>copyScheduledOrder(source,target,'Küche',s,{wed:'2028-02-23'},[]),/Position/);
});
test('annual copy displays previous time beside date and lets users deselect products',()=>{
 const s=workspace(); const source={...order,deliveries:[{id:'wed',date:null,time:'Mittwoch 17 Uhr',place:'Küche'}],lines:[{...line,quantity:3,schedule:{wed:3}}]};
 const html=supplierCopyForm(source,s); assert.match(html,/Mittwoch 17 Uhr/); assert.match(html,/name="copyline_line"/);
});
test('single unit inventory has one visible quantity and preserves unknown and existing quantities',()=>{
 const html=inventoryForm({...inventory,lines:[{...inventoryLine,packName:'Stück',unit:'Stk',packSize:1,packs:2,loose:3}]});
 assert.doesNotMatch(html,/name="packs_water"[^>]*type="text"/); assert.match(html,/name="loose_water"[^>]*value="5"/);
});
test('dashboard does not treat historical plans as current work or uncounted stock as zero demand',()=>{
 const s=workspace(); s.orders=[stored({...order,status:'Entwurf',occasion:'Historische Bestellliste 2026 – PRÜFEN'})];
 const html=dashboard(s,season,'Küche'); assert.doesNotMatch(html,/data-action="order-open"/); assert.match(html,/0 von 1 Artikeln zuletzt gezählt/);assert.doesNotMatch(html,/data-action="reorder-list"/);
});

test('inventory distinguishes planned items without losing other items',()=>{const html=inventoryForm({...inventory,lines:[{...inventoryLine,packs:null,loose:null}]},['other']);assert.match(html,/name="inventoryFilter"/);assert.match(html,/data-relevant="false"/);assert.match(html,/Alle aktiven Artikel/);});
