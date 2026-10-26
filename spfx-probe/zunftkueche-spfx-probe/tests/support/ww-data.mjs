import {workspace,stored,article,offer} from './kitchen-data.mjs';
export const base=(kind,id,scope='s2027')=>({kind,id,scope,at:'2026-10-26T12:00:00Z',by:'TEST Person',confirmed:false});
export const slot={...base('slot','mon'),name:'Zusatzlieferung',date:'2027-02-08',time:'09:00–11:00',place:'Küche'};
export const template={...base('template','tpl','global'),name:'Getränke',supplierId:'sup',area:'Küche',lines:[{offerId:'offer',quantity:2}],note:''};
export const recipe={...base('recipe','r1','global'),familyId:'meal',name:'Testgericht',category:'Speisen',yield:10,salePriceGross:7,ingredients:[{articleId:'water',quantity:2,unit:'Flasche'}],confirmed:true};
export const prices={...base('prices','p1','global'),supplierId:'sup',name:'Neue Liste',validFrom:'2027-01-01',confirmed:true,lines:[{offerId:'offer',priceNet:9,deposit:null}]};
export const state=()=>structuredClone(workspace());
export {stored,article,offer};
