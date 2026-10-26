// Local UI acceptance only. Production contains neither this provider nor browser storage.
import {Server} from './support/fake-sharepoint.mjs';
import {SharePointStore} from '../lib/kitchen/sharepoint.js';
import {KitchenView} from '../lib/kitchen/view.js';
const server=new Server(),storage='zunftkueche-v1.2-preview';
const request=async(url,options)=>{const saved=localStorage.getItem(storage);if(saved)server.lists=new Map(JSON.parse(saved));const result=await server.request(url,options);if(options.method==='POST')localStorage.setItem(storage,JSON.stringify([...server.lists]));return result;};
const store=new SharePointStore('https://example.sharepoint.com/sites/kitchen',request,false);
if(!localStorage.getItem(storage+'-ready')){
 await store.initialize();
 const articles=[
 {id:'water',name:'Mineralwasser',unit:'Flaschen',category:'Getränke',active:true},
 {id:'potato',name:'Kartoffelsalat',unit:'kg',category:'Küche',active:true},
 {id:'wine',name:'Rotwein',unit:'Flaschen',category:'Getränke',active:true}];
 const suppliers=[{id:'sup',name:'Getränkemarkt',phone:'01234 567890',email:'bestellung@example.invalid',method:'Telefon',customerNumber:'BEISPIEL',note:'Künstlicher Beispieldatensatz',active:true},{id:'butcher',name:'Metzgerei',phone:'',email:'',method:'Abholung',customerNumber:'',note:'Künstlicher Beispieldatensatz',active:true}];
 const offers=[
 {id:'water-off',articleId:'water',supplierId:'sup',code:'W12',packName:'Kisten',packSize:12,priceNet:8.5,priceDate:'2026-10-26',deposit:3.3,note:'',active:true},
 {id:'potato-off',articleId:'potato',supplierId:'butcher',code:'K5',packName:'Eimer',packSize:5,priceNet:18.5,priceDate:'2026-10-26',deposit:null,note:'',active:true},
 {id:'wine-off',articleId:'wine',supplierId:'sup',code:'R6',packName:'Kisten',packSize:6,priceNet:30,priceDate:'2026-10-26',deposit:null,note:'',active:true}];
 const masters=[['seasons',{id:'s2026',name:'Saison 2026',year:2026,archived:false}],['seasons',{id:'s2027',name:'Saison 2027',year:2027,archived:false}],...suppliers.map(x=>['suppliers',x]),...articles.map(x=>['articles',x]),...offers.map(x=>['offers',x])];
 for(const[kind,entity]of masters)await store.saveMaster(kind,entity,undefined,'seed-'+entity.id);
 const line=(article,offer,quantity)=>({id:'line-'+article.id,articleId:article.id,offerId:offer.id,articleName:article.name,code:offer.code,unit:article.unit,packName:offer.packName,packSize:offer.packSize,quantity,priceNet:offer.priceNet,priorPriceNet:null,priceYear:null,reviewed:true});
 const base={id:'historic',seasonId:'s2026',area:'Küche',supplierId:'sup',supplierName:'Getränkemarkt',status:'Bestellt',occasion:'Zunftabend · Beispiel',deliveryDate:'2026-02-13',method:'Telefon',note:'Künstliche Beispieldaten. Keine echte Bestellung.',sourceId:null,sourceYear:null,recordedBy:'Beispielperson',recordedAt:'2026-10-26T08:00:00Z',lines:[line(articles[0],offers[0],8),line(articles[2],offers[2],2)]};
 await store.saveOrder(base,undefined,'seed-historic');
 await store.saveOrder({...base,id:'current',seasonId:'s2027',deliveryDate:null},undefined,'seed-current');
 await store.saveOrder({...base,id:'draft',seasonId:'s2027',status:'Entwurf',recordedAt:null,recordedBy:null,deliveryDate:null,lines:[{...line(articles[1],offers[1],2),priceNet:null}],supplierId:'butcher',supplierName:'Metzgerei'},undefined,'seed-draft');
 for(const [index,a]of articles.entries())await store.saveMaster('counts',{id:'count-'+a.id,seasonId:'s2027',area:'Küche',articleId:a.id,articleName:a.name,unit:a.unit,quantity:[24,4,12][index],countedAt:'2026-10-26T09:00:00Z',countedBy:'Beispielperson',note:'Beispielzählung',reorder:index===0,surplus:index===2},undefined,'seed-count-'+a.id);
 localStorage.setItem(storage+'-ready','1');
}
const css=await (await fetch('/production.css')).text(),style=document.createElement('style');style.textContent=css;document.head.append(style);
const root=document.getElementById('kitchen-root');root.className='kitchen';
const view=new KitchenView(root,store,'Lokale Vorschau');await view.start();
