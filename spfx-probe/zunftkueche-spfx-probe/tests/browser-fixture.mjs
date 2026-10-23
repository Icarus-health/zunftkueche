// Local UI acceptance only. Production contains neither this provider nor browser storage.
import {Server} from './support/fake-sharepoint.mjs';
import {SharePointStore} from '../lib/kitchen/sharepoint.js';
import {KitchenView} from '../lib/kitchen/view.js';
const server=new Server();
const storage='zunftkueche-v1-local-acceptance';
const request=async(url,options)=>{const saved=localStorage.getItem(storage);if(saved)server.lists=new Map(JSON.parse(saved));const result=await server.request(url,options);if(options.method==='POST')localStorage.setItem(storage,JSON.stringify([...server.lists]));return result;};
const store=new SharePointStore('https://example.sharepoint.com/sites/kitchen',request,false);
if(!localStorage.getItem(storage)){
 const masters=[['seasons',{id:'s2026',name:'TEST Fasnet 2026',year:2026,archived:false}],['seasons',{id:'s2027',name:'TEST Fasnet 2027',year:2027,archived:false}],['suppliers',{id:'sup',name:'TEST Getränkemarkt',phone:'',email:'',method:'Telefon',customerNumber:'',note:'Fiktiver Datensatz für lokale Abnahme',active:true}],['articles',{id:'a',name:'TEST Mineralwasser',unit:'Flasche',category:'Getränke',active:true}],['offers',{id:'off',articleId:'a',supplierId:'sup',code:'W1',packName:'Kiste',packSize:12,priceNet:8.5,priceDate:'2026-01-01',deposit:null,note:'',active:true}]];
 for(const[kind,entity]of masters)await store.saveMaster(kind,entity,undefined,'seed-'+entity.id);
 await store.saveOrder({id:'historic',seasonId:'s2026',area:'Küche',supplierId:'sup',supplierName:'TEST Getränkemarkt',status:'Bestellt',occasion:'TEST Vorjahresbestellung',deliveryDate:'2026-02-13',method:'Telefon',note:'Reine Testdaten',sourceId:null,sourceYear:null,recordedBy:'TEST Abnahme',recordedAt:'2026-02-01T12:00:00Z',lines:[{id:'line',articleId:'a',offerId:'off',articleName:'TEST Mineralwasser',code:'W1',unit:'Flasche',packName:'Kiste',packSize:12,quantity:8,priceNet:8.5,priorPriceNet:null,priceYear:null,reviewed:true}]},undefined,'seed-order');
}
const root=document.getElementById('kitchen-root');
const css=await (await fetch('/production.css')).text();
const style=document.createElement('style');style.textContent=css;document.head.append(style);
const className=css.match(/\.(kitchen_[a-zA-Z0-9]+)/)?.[1]||'kitchen';root.className=className;
const view=new KitchenView(root,store,'TEST Lokale Abnahme');
await view.start();
