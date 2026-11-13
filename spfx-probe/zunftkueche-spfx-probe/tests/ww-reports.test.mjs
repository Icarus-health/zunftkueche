import{test}from'node:test';import assert from'node:assert/strict';import{wwReport,exportBusinessRows}from'../src/kitchen/ww/reports.ts';import{state,base,recipe,stored}from'./support/ww-data.mjs';
const system=(purpose,basis='gross')=>({...base('system',purpose+basis),confirmed:true,area:'Küche',purpose,sourceId:'profile',name:'Import',from:'2027-02-01',to:'2027-02-01',fileHash:'a'.repeat(64),canonicalKey:'b'.repeat(64),basis,currency:'EUR',recipes:[recipe],rows:[{externalId:'1',productId:recipe.id,name:'Testgericht',quantity:5,date:'2027-02-01',status:'active',amount:35}]});
test('report separates actual sales, menu demand and net/gross values',()=>{const s=state();s.ww={ready:true,records:[system('sales'),system('menuOrders'),system('sales','net'),{...system('sales'),id:'draft',confirmed:false}].map(stored)};const html=wwReport(s,'s2027','Küche');assert.match(html,/35.*EUR.*brutto/);assert.match(html,/35.*EUR.*netto/);assert.match(html,/Menüvorbestellungen/);assert.doesNotMatch(html,/Deckungsbeitrag:/);});
test('CSV export escapes formula-like user names and preserves German decimal values',()=>{const s=state(),imp=system('sales');imp.rows[0].name='=cmd()';s.ww={ready:true,records:[stored(imp)]};const csv=exportBusinessRows(s,'s2027','Küche');assert.ok(csv.includes("'=cmd()"));assert.match(csv,/35/);});

test('payment totals and returns remain separate from gross sales and recipe consumption',()=>{
 const s=state(),sales=system('sales'),payment={...system('payments','unknown'),recipes:[],rows:[
  {externalId:'cash',paymentMethod:'Bar',date:null,status:'active',amount:125.5},
  {externalId:'card',paymentMethod:'Karte',date:null,status:'active',amount:50},
  {externalId:'refund',paymentMethod:'Karte',date:null,status:'refund',amount:-9.5},
  {externalId:'cancel',paymentMethod:'Karte',date:null,status:'cancelled',amount:999}
 ]};
 s.ww={ready:true,records:[sales,payment,{...payment,id:'draft',confirmed:false}].map(stored)};
 const html=wwReport(s,'s2027','Küche');
 assert.match(html,/Zahlungsabrechnung.*Gesamt · EUR<\/th><td>175,50<\/td><td>9,50<\/td><td><strong>166,00<\/strong>/);
 assert.match(html,/Artikelverkäufe.*35 EUR · brutto/);
 assert.match(html,/Rezeptverbrauch.*1 Flasche/);
 assert.doesNotMatch(html,/999|201 EUR/);
 const csv=exportBusinessRows(s,'s2027','Küche');
 assert.match(csv,/"Zahlung";"Import";"2027-02-01";"2027-02-01";"";"";"";"-9,5";"";"EUR";"refund";"Karte"/);
});
