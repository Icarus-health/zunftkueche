import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMoney,missingDishCells,receiptTotals,receiptOriginalLabel,deriveReadView} from '../src/ui/facts.ts';
const invoice=(grossCents,status='Erfasst')=>({id:'i',supplierId:'s',number:'1',date:null,grossCents,netCents:null,scope:'Küche',status,documentUrl:null,lines:[]});
const base=()=>({schemaVersion:2,event:{id:'live',name:'Küche',year:2027,status:'Planung',dates:{}},suppliers:[],articles:[],planLines:[],menu:[{id:'m1',name:'Test A'},{id:'m2',name:'Test B'}],invoices:[],sales:[],movements:[],orders:[],dishPlan:[{menuId:'m1',day:'Freitag',quantity:20},{menuId:'m1',day:'Samstag',quantity:0},{menuId:'m2',day:'Freitag',quantity:null}],lessons:[],sourceNotice:'',revision:9,operationIds:['op']});
test('invoice cents and precise purchase prices reject silent monetary truncation',()=>{
 assert.equal(parseMoney('12,34'),1234);assert.equal(parseMoney('0,0123',true),1.23);assert.equal(parseMoney('0.0123',true),1.23);assert.equal(parseMoney('0',true),0);assert.equal(parseMoney(''),null);
 assert.throws(()=>parseMoney('12,345'));assert.throws(()=>parseMoney('0,01234',true));assert.throws(()=>parseMoney('1.234,00'));assert.throws(()=>parseMoney('-1'));assert.throws(()=>parseMoney('1000000,0001',true));
});
test('conscious zero preview includes null and absent cells but never entered zero or positive dishes',()=>{
 assert.deepEqual(missingDishCells(base()),[{menuId:'m2',name:'Test B',day:'Freitag'},{menuId:'m2',name:'Test B',day:'Samstag'}]);
});
test('partial cost scope distinguishes unknown from explicit zero and keeps source status',()=>{
 assert.deepEqual(receiptTotals([invoice(0),invoice(null),invoice(1234)]),{knownCents:1234,known:2,missing:1,total:3});
 assert.equal(receiptOriginalLabel(invoice(1,'Original vorhanden'),'microsoft'),'Original lokal · hier nicht verfügbar');
 assert.equal(receiptOriginalLabel({...invoice(1,'Original fehlt'),documentUrl:'https://example.sharepoint.com/a'},'microsoft'),'SharePoint-Link · Originalstatus ungeprüft');
});
test('reader event browsing uses archived facts without changing active state or global ledger',()=>{
 const state=base(),{revision,operationIds,...archive}=base();archive.event={...archive.event,id:'old',year:2026};archive.menu=[{id:'oldMenu',name:'Vorjahr'}];state.archivedEvents=[archive];
 const view=deriveReadView(state,'old');assert.equal(view.event.year,2026);assert.equal(view.menu[0].name,'Vorjahr');assert.equal(view.revision,9);assert.deepEqual(view.operationIds,['op']);assert.equal(state.event.id,'live');assert.equal(deriveReadView(state,'unknown'),state);assert.equal(deriveReadView(state,null),state);
});
