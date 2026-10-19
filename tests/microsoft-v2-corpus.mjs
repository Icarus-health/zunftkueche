// New protocol evidence only; historical import/corpus/evidence files stay unchanged.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {applyEventOperation} from '../src/domain/event-context.ts';
let state={...JSON.parse(readFileSync('import/2026.json')),schemaVersion:2,revision:0,operationIds:[],operationRequests:{}};
const identity={organizationId:'00000000-0000-0000-0000-000000000000',userId:'00000000-0000-0000-0000-000000000000',workspaceId:'11111111-2222-4333-8444-555555555555'};
const corpus={initial:structuredClone(state),requests:[]},original=state.event.id;
function apply(targetEventId,type,payload){const op={id:`v2-${corpus.requests.length}`,baseRevision:state.revision,targetEventId,type,payload};const next=applyEventOperation(state,targetEventId,op).state;corpus.requests.push({protocolVersion:2,workspaceId:identity.workspaceId,identity,targetEventId,operationId:op.id,expectedRevision:op.baseRevision,operation:{type,payload},candidateState:next});state=next;}
apply(original,'event.settings',{name:state.event.name,year:2026,dates:{Mittwoch:'2026-02-11'},deliveryAddress:'Synthetic address',contact:'Synthetic contact',locations:[]});
apply(original,'article.price',{articleId:'a-1',priceCents:123.45});
apply(original,'order.prepare',{supplierId:'s-wiggenhauser',day:'Mittwoch'});
apply(original,'event.create',{name:'Synthetic next',year:2027,copyPlan:true});
apply(original,'article.price',{articleId:'a-1',priceCents:234.56});
apply(original,'order.prepare',{supplierId:'s-wiggenhauser',day:'Mittwoch'});
apply(original,'event.create',{name:'Synthetic from archive',year:2028,copyPlan:false});
apply(original,'event.settings',{name:corpus.initial.event.name,year:2026,dates:{Mittwoch:'2026-02-11'},deliveryAddress:'Synthetic address',contact:'Synthetic contact',locations:[{name:'Bar',historicalNames:[]},{name:'Halle Küche',historicalNames:['Küche']}],purchasingLocation:'Halle Küche'});
apply(original,'stock.opening',{articleId:'a-1',quantity:0,location:'Halle Küche'});
apply(original,'plan.add',{articleId:'a-1',supplierId:'s-wiggenhauser',day:'Freitag',quantity:10,time:'',note:''});
apply(original,'invoice.save',{supplierId:'s-wiggenhauser',number:'synthetic-location',date:null,grossCents:100,netCents:90,scope:'Halle Küche',documentUrl:null,lines:[]});
apply(original,'event.settings',{name:corpus.initial.event.name,year:2026,dates:{Mittwoch:'2026-02-11'},deliveryAddress:'Synthetic address',contact:'Synthetic contact',locations:[],purchasingLocation:null});
apply(original,'movement.correct',{movementId:'v2-8',replacementQuantity:100,reason:'Synthetic opening correction'});
apply(original,'movement.correct',{movementId:'v2-8',replacementQuantity:10,reason:'Synthetic recount'});
apply(original,'menu.price',{menuId:'m-1',priceCents:50});
const saleId=`v2-${corpus.requests.length}`;
apply(original,'sales.quantity',{menuId:'m-1',day:'Freitag',quantity:2});
apply(original,'sales.correctPrice',{saleId,priceCents:500,reason:'Synthetic decimal correction'});
apply(original,'menu.price',{menuId:'m-1',priceCents:900});
apply(original,'invoice.correct',{invoiceId:'v2-10',changes:{grossCents:200},reason:'Synthetic receipt correction'});
apply(original,'invoice.correct',{invoiceId:state.archivedEvents.find(e=>e.event.id===original).invoices[0].id,changes:{grossCents:9999999},reason:'Synthetic imported receipt economic correction'});
apply(original,'order.mark',{orderId:'v2-2',status:'bestellt',note:'Synthetic manual order'});
apply(original,'order.mark',{orderId:'v2-2',status:'bestaetigt',note:'Synthetic confirmation'});

apply(original,'event.settings',{name:corpus.initial.event.name,year:2026,dates:{Mittwoch:'2026-02-11'},deliveryAddress:'Synthetic address',contact:'Synthetic contact',locations:[{name:'Halle Küche',historicalNames:['Küche']}],purchasingLocation:'Halle Küche'});
const selected=state.archivedEvents.find(e=>e.event.id===original);
const receivingOperation=`v2-${corpus.requests.length}`;
apply(original,'delivery.accept',{orderId:'v2-2',day:'Freitag',location:'Halle Küche',lines:[{lineId:selected.orders[0].lines[0].id,articleId:selected.orders[0].lines[0].articleId,quantity:110}],note:'Synthetic partial delivery'});
apply(original,'movement.correct',{movementId:receivingOperation+':0',replacementQuantity:100,reason:'Synthetic receiving recount'});
apply(original,'plan.allocate',{id:selected.planLines[0].id,allocations:[{day:'Freitag',time:'18:00',quantity:10},{day:'Samstag',time:'19:00',quantity:20}]});
apply(original,'plan.allocationQuantity',{id:selected.planLines[0].id+':allocation:0',quantity:12});
apply(original,'drink.configure',{menuId:'m-1',mode:'direct',lines:[{articleId:'a-1',quantity:1}]});
apply(original,'drink.configure',{menuId:'m-1',mode:'variants',lines:[{articleId:'a-1',quantity:.7},{articleId:selected.articles[1].id,quantity:.3}]});
apply(original,'event.economics',{eventId:original,revision:state.revision,scope:'Halle Küche',netRevenueCents:1000,netConsumptionCents:400,sourceReason:'Synthetic net revenues',valuationReason:'Synthetic net consumption'});
apply(original,'event.close',{eventId:original,revision:state.revision,confirmedScope:'Halle Küche',note:'Synthetic checked with open values'});
apply(original,'event.reopen',{eventId:original,reason:'Synthetic later correction'});
apply(original,'lesson.add',{eventId:original,text:'Synthetic receiving lesson'});
mkdirSync('server/Tests/obj' ,{recursive:true});writeFileSync('server/Tests/obj/protocol-v2-corpus.json',JSON.stringify(corpus));

import {completeFixture} from './task4-complete-fixture.mjs';
state=completeFixture();const economics={initial:structuredClone(state),requests:[]};corpus.requests=economics.requests;
apply(state.event.id,'event.economics',{eventId:state.event.id,revision:state.revision,scope:'Küche',netRevenueCents:1000,netConsumptionCents:400,sourceReason:'Net source',valuationReason:'Net valuation'});
apply(state.event.id,'event.close',{eventId:state.event.id,revision:state.revision,confirmedScope:'Küche',note:'Complete synthetic economics'});
writeFileSync('server/Tests/obj/economics-corpus.json',JSON.stringify(economics));

state=completeFixture();state.invoices[0].lines[0].articleId='article-b';
const stock={initial:structuredClone(state),requests:[]};corpus.requests=stock.requests;
apply(state.event.id,'event.economics',{eventId:state.event.id,revision:state.revision,scope:'Küche',netRevenueCents:1000,netConsumptionCents:400,sourceReason:'Net source',valuationReason:'Net valuation'});
apply(state.event.id,'event.close',{eventId:state.event.id,revision:state.revision,confirmedScope:'Küche',note:'Stock evidence still missing'});
writeFileSync('server/Tests/obj/stock-corpus.json',JSON.stringify(stock));
