// 1.18.5: overview, stock page, stock movements and count list use one rule for "articles of the season".
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {KitchenView} from '../src/kitchen/view.ts';
import {dashboard,stockOverview} from '../src/kitchen/workspace.ts';
import {operationOverview,seasonStockRows} from '../src/kitchen/ww/operations-view.ts';
import {stockProjection} from '../src/kitchen/ww/domain.ts';
import {season,article,supplier,offer,order,stored,workspace} from './support/kitchen-data.mjs';

const other={...article,id:'braten',name:'Schweinerei heiß',unit:'Portion',unavailableSeasons:[season.id]};
const juice={...article,id:'juice',name:'Apfelschorle'};
const retired={...article,id:'old',name:'Altartikel',active:false};
function state(){
 const s=workspace();
 s.articles=[stored(article),stored(juice),stored(other),stored(retired)];
 s.orders=[stored(order)];
 s.ww={ready:true,records:[]};
 return s;
}
const names=html=>[...html.matchAll(/<strong>([^<]+)<\/strong><small>(?:Zählgrundlage|Noch keine Zählgrundlage)/g)].map(m=>m[1]);

test('overview, stock page and stock movements list the same articles of the season',()=>{
 const s=state();
 assert.match(dashboard(s,season,'Küche','2027-02-01'),/0 von 2 Artikeln zuletzt gezählt/);
 const stock=stockOverview(s,season,'Küche','');
 assert.equal((stock.match(/class="inventory-overview-row" data-search/g)||[]).length,2);
 assert.deepEqual(names(operationOverview('journal',s,'Küche',season.id,'')),['Mineralwasser','Apfelschorle']);
});
test('an article outside the season stays in the stock movements while stock is recorded for it',()=>{
 const s=state();
 s.counts=[stored({id:'c1',seasonId:season.id,area:'Küche',articleId:other.id,articleName:other.name,unit:other.unit,quantity:4,countedAt:'2027-02-05T20:00:00Z',countedBy:'TEST',note:'',reorder:false})];
 const rows=seasonStockRows(s,stockProjection(s,[],season.id,'Küche',''),season.id);
 assert.deepEqual(rows.map(r=>r.name),['Mineralwasser','Apfelschorle','Schweinerei heiß']);
 assert.equal(rows.find(r=>r.articleId===other.id).quantity,4);
 assert.match(operationOverview('journal',s,'Küche',season.id,''),/Schweinerei heiß/);
});
test('the projection itself still covers every active article for purchasing',()=>{
 const s=state();
 assert.deepEqual(stockProjection(s,[],season.id,'Küche','').map(r=>r.articleId),['water','juice','braten']);
});
test('the count list names its filter and states the size of the whole list',async()=>{
 const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test/'});
 for(const name of ['document','Element','HTMLFormElement','HTMLSelectElement','FormData'])globalThis[name]=dom.window[name]||dom.window.document;
 const s=state(),root=document.getElementById('app');
 const view=new KitchenView(root,{testMode:false,load:async()=>s},'TEST Person');
 await view.start();await view.action('inventory-new','');
 const choices=[...root.querySelectorAll('[name=inventoryFilter]')];
 assert.deepEqual(choices.map(o=>o.closest('label').textContent),['In dieser Saison bestellt','Alle Artikel der Saison']);
 const progress=()=>root.querySelector('[data-count-progress]').textContent;
 assert.equal(progress(),'0 von 1 angezeigten Artikeln gezählt · Zählliste gesamt: 2 Artikel');
 choices[1].checked=true;choices[1].dispatchEvent(new dom.window.Event('change',{bubbles:true}));
 assert.equal(progress(),'0 von 2 Artikeln gezählt');
 assert.equal(root.querySelectorAll('.count-line').length,2,'the list holds the same two articles as the overview');
});
