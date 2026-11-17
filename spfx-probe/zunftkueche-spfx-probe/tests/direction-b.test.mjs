// 1.20.0: Richtung B nach Apples Human Interface Guidelines. Prüft das Verhalten, nicht das Aussehen.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {KitchenView} from '../src/kitchen/view.ts';
import {sidebar,stockOverview,contextSwitch} from '../src/kitchen/workspace.ts';
import {dashboard} from '../src/kitchen/home.ts';
import {receiptForm,inventoryForm} from '../src/kitchen/operation-forms.ts';
import {dayChoice} from '../src/kitchen/order-sheet.ts';
import {icon} from '../src/kitchen/icons.ts';
import {season,article,order,stored,workspace,inventory,inventoryLine} from './support/kitchen-data.mjs';

const page=html=>new JSDOM('<div id="app">'+html+'</div>').window.document.getElementById('app');
const fire=(dom,el,type)=>el.dispatchEvent(new dom.window.Event(type,{bubbles:true}));
const settle=dom=>new Promise(resolve=>dom.window.setTimeout(resolve,20));
function live(state){
 const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test/kueche'});
 for(const name of ['document','Element','HTMLFormElement','HTMLSelectElement','HTMLInputElement','FormData','Event'])globalThis[name]=dom.window[name]||dom.window.document;
 const root=document.getElementById('app');
 return {dom,root,view:new KitchenView(root,{testMode:false,load:async()=>state},'TEST Person')};
}
const line=(id,name,extra={})=>({...inventoryLine,articleId:id,articleName:name,packs:null,loose:null,...extra});
const delivery=(id,date)=>({id,date,time:'',place:'Küche'});

test('symbols are drawn inline, without an icon font, and the navigation has a filled form for the chosen area',()=>{
 const svg=page(icon('home')).querySelector('svg');
 assert.equal(svg.getAttribute('aria-hidden'),'true');
 assert.ok(svg.querySelector('.zk-line')&&svg.querySelector('.zk-solid'),'line and filled form');
 assert.equal(page(icon('check')).querySelector('.zk-solid'),null,'small symbols only need the line form');
 const css=readFileSync(new URL('../src/webparts/kitchen/KitchenWebPart.module.scss',import.meta.url),'utf8').replace(/\s+/g,' ').replace(/\s*([{};:,>])\s*/g,'$1').replace(/\s*!important/g,'!important');
 assert.doesNotMatch(css,/ui-icons|Montserrat/,'old fonts are no longer bundled');
 assert.doesNotMatch(css,/@font-face|Archivo/,'no bundled font any more, the system font is used');
 assert.match(css,/font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',system-ui/);
});

test('the crest appears on the overview only, the sidebar keeps the name',()=>{
 const s=workspace();
 assert.ok(page(dashboard(s,season,'Küche','2027-02-01')).querySelector('.home-brand .brand-mark'));
 assert.equal(page(sidebar(season,'heute')).querySelector('.brand-mark'),null);
 assert.equal(page(stockOverview(s,season,'Küche','')).querySelector('.brand-mark'),null);
 assert.match(page(sidebar(season,'heute')).querySelector('.brand').textContent,/^Zunftküche/);
});

test('area and season sit behind one capsule that names both, the fields keep their names',()=>{
 const s=workspace();const root=page(contextSwitch(s,season,'Küche',season.id));
 assert.equal(root.querySelector('.context-switch>summary').textContent.trim(),'Bereich und Saison: Küche · '+season.name);
 assert.ok(root.querySelector('.context-sheet select[name=areaContext]'));
 assert.equal(root.querySelector('.context-sheet select[name=seasonContext]').value,season.id);
 assert.equal(root.querySelector('.work-context').textContent,'Küche · '+season.name,'quiet line for tasks');
});

test('the capsule sits top right in the same first row on every page and closes with Escape',async()=>{
 const {dom,root,view}=live(workspace());await view.start();
 assert.ok(root.querySelector('.calm-home-heading>.context-switch'),'the overview keeps brand left and capsule right');
 await view.action('nav','stock');
 const sheet=root.querySelector('main>.topbar>.context-switch');assert.ok(sheet,'in the top bar above the page heading');
 assert.equal(root.querySelector('.page-heading .context-switch'),null,'never between title and buttons');
 sheet.open=true;root.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(sheet.open,false);
});

test('the overview shows each workflow as one tile button, with a count only where something waits',()=>{
 const s=workspace();s.orders=[stored({...order,id:'a',status:'Entwurf'})];
 const root=page(dashboard(s,season,'Küche','2027-02-01'));
 const tiles=[...root.querySelectorAll('button.workflow-start')];
 assert.deepEqual(tiles.map(t=>t.dataset.action),['order-round','delivery-list','inventory-new']);
 assert.equal(tiles[0].querySelector('.count-pill').textContent,'1 Entwurf');
 assert.equal(tiles[2].querySelector('.count-pill'),null);
 assert.equal(root.querySelector('.next-step .next-step-detail').textContent,order.supplierName,'the next step names the supplier');
});

test('stock is grouped by category and every status is a word with a mark, never colour alone',()=>{
 const s=workspace();
 s.articles=[stored(article),stored({...article,id:'pot',name:'Topf',unit:'Stk',category:'Ausstattung'}),stored({...article,id:'juice',name:'Saft'})];
 s.counts=[stored({id:'c1',seasonId:season.id,area:'Küche',articleId:'water',articleName:article.name,unit:article.unit,quantity:5,countedAt:'2027-02-03T20:00:00Z',countedBy:'T',note:'',reorder:true}),stored({id:'c2',seasonId:season.id,area:'Küche',articleId:'pot',articleName:'Topf',unit:'Stk',quantity:1,countedAt:'2027-02-03T20:00:00Z',countedBy:'T',note:'',reorder:false})];
 const root=page(stockOverview(s,season,'Küche',''));
 const groups=[...root.querySelectorAll('.stock-group>h2')].map(h=>h.textContent);
 assert.equal(groups[0],'Ausstattung');
 const status=name=>[...root.querySelectorAll('.inventory-overview-row')].find(r=>r.querySelector('strong').textContent===name).querySelector('.stock-status').textContent;
 assert.equal(status(article.name),'Nachbestellen');assert.equal(status('Topf'),'Gezählt');assert.equal(status('Saft'),'Noch nicht gezählt');
 const link=root.querySelector('button.list-link[data-action=reorder-list]');
 assert.equal(link.querySelector('.count-pill').textContent,'1 Artikel');
});

test('plus and minus change the visible value, start from empty and never go below zero',async()=>{
 const s=workspace();s.orders=[];s.inventories=[];
 const {root,view}=live(s);await view.start();await view.action('inventory-new','');
 const field=root.querySelector('[name=packs_water]');assert.equal(field.value,'');
 await view.action('count-step','packs_water|1');assert.equal(field.value,'1');
 await view.action('count-step','packs_water|1');assert.equal(field.value,'2');
 await view.action('count-step','packs_water|-1');await view.action('count-step','packs_water|-1');await view.action('count-step','packs_water|-1');
 assert.equal(field.value,'0','zero means nothing there, not uncounted');
 assert.equal(root.querySelector('[data-count-total=water]').dataset.state,'counted');
 const minus=root.querySelector('[data-action=count-step][data-id="packs_water|-1"]');
 assert.equal(minus.getAttribute('aria-label'),'Mineralwasser · volle Kisten · eins weniger');
});

test('"Nächster Artikel" closes the open article and opens the next uncounted one',async()=>{
 const s=workspace();s.orders=[];s.inventories=[];
 s.articles=[stored(article),stored({...article,id:'juice',name:'Apfelschorle'}),stored({...article,id:'cola',name:'Cola'})];
 const {dom,root,view}=live(s);await view.start();await view.action('inventory-new','');
 const items=()=>[...root.querySelectorAll('details.count-item')];
 const [first,second,third]=items();
 const id=d=>d.querySelector('[data-count-total]').dataset.countTotal;
 const input=second.querySelector('input[name^=loose_]');input.value='4';fire(dom,input,'input');
 first.open=true;await view.action('count-next',id(first));
 assert.equal(first.open,false);assert.equal(second.open,false,'already counted, skipped');assert.equal(third.open,true);
 assert.equal(dom.window.document.activeElement,third.querySelector('.count-field input'));
 await view.action('count-next',id(third));
 assert.equal(first.open,true,'wraps round to the first open article');
});

test('goods receipt counts entered lines, ticks complete ones and names the rest that stays open',async()=>{
 const two={...order.lines[0],id:'line2',articleId:'juice',articleName:'Saft',quantity:10};
 const s=workspace();s.orders=[stored({...order,lines:[{...order.lines[0],quantity:6},two]})];
 const {dom,root,view}=live(s);await view.start();await view.action('receipt-new',order.id);
 const progress=()=>root.querySelector('[data-receipt-progress]').textContent;
 assert.equal(progress(),'0 von 2 eingetragen');
 const [a,b]=[...root.querySelectorAll('[data-receipt-line]')];
 a.querySelector('input').value='6';fire(dom,a.querySelector('input'),'input');
 b.querySelector('input').value='7';fire(dom,b.querySelector('input'),'input');
 assert.equal(progress(),'2 von 2 eingetragen');
 assert.equal(a.dataset.state,'complete');assert.equal(b.dataset.state,'partial');
 assert.equal(b.querySelector('[data-receipt-rest]').textContent,'3 bleiben offen');
 assert.equal(a.querySelector('[data-receipt-rest]').hidden,true);
});

test('up to five delivery days are a switch, more become a pop-up list that still filters',()=>{
 const five=[1,2,3,4,5].map(i=>delivery('d'+i,'2027-02-0'+i));
 assert.ok(page(dayChoice(five)).querySelector('fieldset.segmented'));
 const six=[...five,delivery('d6','2027-02-06')];
 const list=page(dayChoice(six)).querySelector('select[name=deliveryView]');
 assert.ok(list,'six segments would be too narrow on a phone');
 assert.equal(list.options.length,7);assert.equal(list.options[0].value,'all');
});

test('"Mehr" is a page of its own and the back gesture closes it first',async()=>{
 const {dom,root,view}=live(workspace());await view.start();
 const more=root.querySelector('nav button.nav-more');
 await view.action('mobile-menu','',more);
 assert.equal(root.querySelector('.sidebar').dataset.menuOpen,'true');
 assert.equal(root.querySelector('nav .more-title').textContent,'Mehr');
 assert.equal(dom.window.history.state?.zunftkueche,true,'opening it counts as one step deeper');
 dom.window.history.back();await settle(dom);
 assert.equal(root.querySelector('.sidebar').dataset.menuOpen,'false');
 assert.equal(root.querySelector('main h1').textContent,'Übersicht');
});

test('the count sheet has one filled button per open article and a tinted step to review',()=>{
 const root=page(inventoryForm({...inventory,lines:[line('w','Wasser'),line('c','Cola')]}));
 assert.equal(root.querySelector('.calm-actions .primary'),null,'the bottom bar has no filled button');
 assert.ok(root.querySelector('.calm-actions [data-action=inventory-finish].tinted'));
 assert.equal(root.querySelectorAll('.count-item').length,2);
 assert.ok([...root.querySelectorAll('.count-item')].every(d=>d.querySelectorAll('button.primary').length===1));
});

test('receipt form keeps every field the save logic reads',()=>{
 const html=receiptForm({...order,deliveries:[delivery('t','2027-02-03')],lines:[{...order.lines[0],schedule:{t:4}}]},'t',true);
 const root=page(html);
 for(const name of ['receiptDelivery','receivedAt','deviation','note','deliverySlipFile','received_'+order.lines[0].id])assert.ok(root.querySelector('[name="'+name+'"]'),name);
});
