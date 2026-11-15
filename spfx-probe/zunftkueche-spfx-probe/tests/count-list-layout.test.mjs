// 1.19.0: the evening count is a compact list. One row per article, grouped by category, filter as a two-way switch.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {KitchenView} from '../src/kitchen/view.ts';
import {inventoryForm,countProgress,countShare} from '../src/kitchen/operation-forms.ts';
import {season,article,order,stored,workspace,inventory,inventoryLine} from './support/kitchen-data.mjs';

const line=(id,name,extra={})=>({...inventoryLine,articleId:id,articleName:name,packs:null,loose:null,...extra});
function page(html){return new JSDOM('<div id="app">'+html+'</div>').window.document.getElementById('app');}

test('count rows are grouped by category in alphabetical order, articles without category last',()=>{
 const lines=[line('w','Wasser'),line('b','Bockwurst',{packSize:1,unit:'Stk'}),line('t','Topf',{packSize:1,unit:'Stk'}),line('c','Cola')];
 const root=page(inventoryForm({...inventory,lines},[],{}, {w:'Getränk',c:'Getränk',b:'Speisen-Zutat'}));
 const groups=[...root.querySelectorAll('[data-count-group]')];
 assert.deepEqual(groups.map(g=>g.querySelector('h2').textContent),['Getränk 2','Speisen-Zutat 1','Ohne Kategorie 1']);
 assert.deepEqual([...groups[0].querySelectorAll('.count-name strong')].map(x=>x.textContent),['Wasser','Cola'],'order inside a group stays the order of the count list');
});

test('a count list without any category has no group headings',()=>{
 const root=page(inventoryForm({...inventory,lines:[line('w','Wasser'),line('c','Cola')]}));
 assert.equal(root.querySelectorAll('[data-count-group] h2').length,0);
 assert.equal(root.querySelectorAll('.count-line').length,2);
});

test('each row carries name, pack information, total and both quantity fields with spoken labels',()=>{
 const root=page(inventoryForm({...inventory,lines:[{...inventoryLine,packs:2,loose:5},line('b','Bockwurst',{packSize:1,unit:'Stk',packName:'Stück',loose:35})]}));
 const [water,sausage]=root.querySelectorAll('.count-line');
 assert.equal(water.querySelector('.count-name strong').textContent,'Mineralwasser');
 assert.match(water.querySelector('.count-name small').textContent,/^Kiste · 12 Flasche/);
 const total=water.querySelector('[data-count-total=water]');
 assert.equal(total.textContent,'29 Flasche');assert.equal(total.dataset.state,'counted');
 assert.equal(water.querySelector('[name=packs_water]').getAttribute('aria-label'),'Mineralwasser · volle Kiste');
 assert.equal(water.querySelector('[name=loose_water]').getAttribute('aria-label'),'Mineralwasser · Flasche einzeln');
 assert.ok(sausage.classList.contains('count-single'));
 assert.equal(sausage.querySelector('[name=packs_b]').type,'hidden');
 assert.equal(sausage.querySelector('[name=loose_b]').value,'35');
 assert.match(sausage.querySelector('.count-name small').textContent,/^Menge in Stk/);
});

test('uncounted rows say so for screen readers and keep the fields empty',()=>{
 const root=page(inventoryForm({...inventory,lines:[line('w','Wasser')]}));
 const total=root.querySelector('[data-count-total=w]');
 assert.equal(total.textContent,'Noch nicht gezählt');assert.equal(total.dataset.state,'open');
 assert.equal(root.querySelector('[name=packs_w]').value,'');assert.equal(root.querySelector('[name=loose_w]').value,'');
});

test('assessment and note sit behind the article name and open on their own when filled',()=>{
 const root=page(inventoryForm({...inventory,lines:[line('w','Wasser'),line('c','Cola',{assessment:'reorder'}),line('s','Saft',{note:'angebrochen'})]}));
 const [w,c,s]=[...root.querySelectorAll('details.count-extra')];
 assert.equal(w.open,false);assert.equal(c.open,true);assert.equal(s.open,true);
 assert.equal(w.querySelector('summary .count-name strong').textContent,'Wasser');
 assert.ok(w.querySelector('[name=assessment_w]'));assert.ok(w.querySelector('[name=countnote_w]'));
 assert.equal(c.querySelector('[data-count-badge]').textContent,'Nachbestellen');assert.equal(c.querySelector('[data-count-badge]').hidden,false);
 assert.equal(w.querySelector('[data-count-badge]').hidden,true);
 assert.deepEqual([w,c,s].map(d=>d.dataset.sectionKey),['count:w','count:c','count:s'],'open rows are remembered per article');
});

test('progress text and bar share one calculation',()=>{
 assert.equal(page(countProgress(3,17,20)).textContent,'3 von 17 angezeigten Artikeln gezählt · Gesamt: 20 Artikel');
 assert.equal(page(countProgress(3,20,20)).textContent,'3 von 20 Artikeln gezählt');
 assert.equal(countShare(3,17),18);assert.equal(countShare(0,0),0);assert.equal(countShare(5,5),100);
});

function live(){
 const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test/'});
 for(const name of ['document','Element','HTMLFormElement','HTMLSelectElement','FormData'])globalThis[name]=dom.window[name]||dom.window.document;
 const s=workspace();
 s.articles=[stored(article),stored({...article,id:'juice',name:'Apfelschorle'}),stored({...article,id:'pot',name:'Topf',unit:'Stk',category:'Ausstattung'})];
 s.orders=[stored(order)];s.ww={ready:true,records:[]};
 const root=document.getElementById('app');
 return {dom,root,view:new KitchenView(root,{testMode:false,load:async()=>s},'TEST Person')};
}
const fire=(dom,el,type)=>el.dispatchEvent(new dom.window.Event(type,{bubbles:true}));

test('switching the filter hides empty groups, updates their counts and the progress bar',async()=>{
 const {dom,root,view}=live();await view.start();await view.action('inventory-new','');
 const heads=()=>[...root.querySelectorAll('[data-count-group]')].filter(g=>!g.hidden).map(g=>g.querySelector('h2').textContent);
 assert.deepEqual(heads(),['Getränke 1'],'only the ordered article is listed at first');
 const all=root.querySelector('[name=inventoryFilter][value=all]');all.checked=true;fire(dom,all,'change');
 assert.deepEqual(heads(),['Ausstattung 1','Getränke 2']);
 const packs=root.querySelector('[name=packs_water]');packs.value='1';fire(dom,packs,'input');
 assert.equal(root.querySelector('[data-count-progress]').textContent,'1 von 3 Artikeln gezählt');
 assert.equal(root.querySelector('[data-count-bar]').style.width,'33%');
 assert.equal(root.querySelector('[data-count-total=water]').dataset.state,'counted');
});

test('choosing an assessment updates the badge without touching the article name',async()=>{
 const {dom,root,view}=live();await view.start();await view.action('inventory-new','');
 const row=root.querySelector('[data-count-total=water]').closest('.count-line'),choice=row.querySelector('[name=assessment_water]');
 choice.value='surplus';fire(dom,choice,'change');
 assert.equal(row.querySelector('[data-count-badge]').textContent,'Überhang');assert.equal(row.querySelector('[data-count-badge]').hidden,false);
 assert.equal(row.querySelector('.count-name strong').textContent,'Mineralwasser');
 choice.value='ok';fire(dom,choice,'change');
 assert.equal(row.querySelector('[data-count-badge]').hidden,true);
});

test('searching keeps group headings only for groups with a match',async()=>{
 const {dom,root,view}=live();await view.start();await view.action('inventory-new','');
 const all=root.querySelector('[name=inventoryFilter][value=all]');all.checked=true;fire(dom,all,'change');
 const search=root.querySelector('[name=workspaceSearch]');search.value='topf';fire(dom,search,'input');
 assert.deepEqual([...root.querySelectorAll('[data-count-group]')].filter(g=>!g.hidden).map(g=>g.querySelector('h2').textContent),['Ausstattung 1']);
});
