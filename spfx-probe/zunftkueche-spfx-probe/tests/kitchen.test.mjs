import {test} from 'node:test';
import assert from 'node:assert/strict';
import {copyOrder, validateOrder, validateEntity, orderTotal, parseDecimal} from '../src/kitchen/domain.ts';

const season={id:'s2026',name:'Fasnet 2026',year:2026,archived:false};
const next={id:'s2027',name:'Fasnet 2027',year:2027,archived:false};
const supplier={id:'supplier',name:'Getränke',active:true,phone:'',email:'',method:'Telefon',customerNumber:'',note:''};
const article={id:'article',name:'Wasser',unit:'Flasche',category:'Getränke',active:true};
const offer={id:'offer',articleId:'article',supplierId:'supplier',code:'W1',packName:'Kiste',packSize:12,priceNet:8.5,priceDate:'2026-10-23',deposit:null,active:true,note:''};
const state={seasons:[season,next],suppliers:[supplier],articles:[article],offers:[offer]};
const line={id:'l1',articleId:'article',offerId:'offer',articleName:'Wasser',code:'W1',unit:'Flasche',packName:'Kiste',packSize:12,quantity:8,priceNet:8.5,priorPriceNet:null,priceYear:null,reviewed:true};
const order={id:'o1',seasonId:'s2026',area:'Küche',supplierId:'supplier',supplierName:'Getränke',status:'Bestellt',occasion:'Zunftabend',deliveryDate:'2026-02-13',method:'Telefon',note:'Vorjahr',sourceId:null,sourceYear:null,recordedBy:'Testperson',recordedAt:'2026-02-10T12:00:00Z',lines:[line]};

test('copy preserves the source but resets live dates prices and status',()=>{
 const before=structuredClone(order);const copied=copyOrder(order,next,'Küche',state,{'l1':10});
 assert.deepEqual(order,before);assert.equal(copied.status,'Entwurf');assert.equal(copied.deliveryDate,null);assert.equal(copied.lines[0].priceNet,null);assert.equal(copied.lines[0].priorPriceNet,8.5);assert.equal(copied.lines[0].priceYear,2026);assert.equal(copied.lines[0].quantity,10);assert.equal(copied.recordedAt,null);assert.equal(copied.sourceId,'o1');assert.equal(copied.lines[0].reviewed,false);
});
test('copy uses a stable identity so double clicks cannot create two copies',()=>{
 assert.equal(copyOrder(order,next,'Küche',state,{'l1':8}).id,copyOrder(order,next,'Küche',state,{'l1':10}).id);
});
test('copy rejects the same season and inactive supplier',()=>{
 assert.throws(()=>copyOrder(order,season,'Küche',state,{'l1':8}),/andere Saison/);
 assert.throws(()=>copyOrder(order,next,'Küche',{...state,suppliers:[{...supplier,active:false}]},{'l1':8}),/Lieferant/);
});
test('copy of an old historic order uses current pack details and keeps a review requirement',()=>{
 const changed={...state,offers:[{...offer,packSize:6}]};const copied=copyOrder(order,next,'Küche',changed,{'l1':8});
 assert.equal(copied.lines[0].packSize,6);assert.equal(copied.lines[0].reviewed,false);assert.equal(order.lines[0].packSize,12);
});
test('unknown quantity differs from zero and unknown prices prevent a complete total',()=>{
 assert.equal(parseDecimal(''),null);assert.equal(parseDecimal('0'),0);assert.equal(parseDecimal('1,5'),1.5);assert.throws(()=>parseDecimal('-1'));
 assert.equal(orderTotal({...order,lines:[{...line,priceNet:null}]}),null);assert.equal(orderTotal(order),68);
});
test('draft validation rejects wrong supplier offers and missing articles',()=>{
 assert.throws(()=>validateOrder({...order,status:'Entwurf',supplierId:'other'},state),/Lieferant/);
 assert.throws(()=>validateOrder({...order,status:'Entwurf',lines:[{...line,articleId:'missing'}]},state),/Artikel/);
});
test('ordered copies require reviewed lines and named ordering evidence',()=>{
 assert.throws(()=>validateOrder({...order,recordedBy:''},state),/Person/);
 assert.throws(()=>validateOrder({...order,lines:[{...line,reviewed:false}]},state),/geprüft/);
});
test('master validation rejects invalid packing and invalid dates',()=>{
 assert.throws(()=>validateEntity('offers',{...offer,packSize:0}),/Gebinde/);
 assert.throws(()=>validateEntity('offers',{...offer,priceDate:'2026-02-31'}),/Datum/);
 assert.throws(()=>validateEntity('suppliers',{...supplier,email:'kein-mail'}),/E-Mail/);
});
