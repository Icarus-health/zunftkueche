import {seed} from './task4-fixture.mjs';
export function completeFixture() {
 const s=structuredClone(seed);
 s.schemaVersion=2;s.planLines=[];s.orders=[];s.dishPlan=[];s.lessons=[];s.archivedEvents=[];
 s.articles=[s.articles[0],{...s.articles[0],id:'article-b',name:'Article B'}];
 s.menu=[{id:'meal',name:'Meal',category:'Speisen',priceCents:500,recipe:[{articleId:s.articles[0].id,quantity:1}],recipeStatus:'Bestätigt'}];
 s.sales=['Freitag','Samstag'].map(day=>({id:day,menuId:'meal',day,quantity:1,priceCents:500}));
 s.invoices=[{id:'invoice',supplierId:s.articles[0].supplierId,number:'complete',date:null,grossCents:500,netCents:400,scope:'Küche',status:'Erfasst',documentUrl:null,lines:[{articleId:s.articles[0].id,name:'Article A',quantity:1,unit:s.articles[0].unit,netCents:400}]}];
 s.movements=['Anfangsbestand','Zählung'].map((type,i)=>({id:`stock-${i}`,articleId:s.articles[0].id,day:'Freitag',type,quantity:0,location:'Küche'}));
 return s;
}
