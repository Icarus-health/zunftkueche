import{test}from'node:test';import assert from'node:assert/strict';import{reconcileBill}from'../src/kitchen/ww/reconciliation.ts';import{state,base}from'./support/ww-data.mjs';
test('reconciliation compares invoice packs to ordered and actually received base quantities',()=>{const s=state(),o=s.orders[0].value;o.receipts=[{id:'r',receivedAt:'2027-02-01T10:00:00Z',receivedBy:'TEST',note:'',lines:[{lineId:o.lines[0].id,quantity:1}]}];const bill={...base('bill','bill'),supplierId:o.supplierId,area:o.area,orderIds:[o.id],lines:[{id:'l',articleId:o.lines[0].articleId,name:'Wasser',quantity:2,unit:o.lines[0].packName,unitNet:9,totalNet:18,taxRate:19}]};const row=reconcileBill(bill,s)[0];assert.equal(row.invoiced,24);assert.equal(row.received,12);assert.equal(row.quantityDifference,12);assert.equal(row.priceDifference,1);});

test('credits and deposit changes keep signed accounting amounts and stock returns separate',async()=>{
 const {purchaseTotals,linkedBill}=await import('../src/kitchen/ww/bill-accounting.ts');
 const {validateDocument}=await import('../src/kitchen/ww/domain.ts');
 const {invoicePriceProposals}=await import('../src/kitchen/ww/invoice-prices.ts');
 const {WwStore}=await import('../src/kitchen/ww/store.ts');
 const {Server}=await import('./support/fake-sharepoint.mjs');
 const {wwReport}=await import('../src/kitchen/ww/reports.ts');
 const s=state(),server=new Server(),store=new WwStore('https://example.sharepoint.com/sites/kitchen',server.request);
 await store.initialize();
 const baseBill={...base('bill','original'),confirmed:true,billType:'invoice',name:'Einkauf',number:'INV-1',date:'2027-02-05',
  area:'Küche',supplierId:'sup',orderIds:['order'],net:100,tax:19,gross:119,note:'',fileHash:'',fileName:'',attachment:'',adjustmentNet:0};
 const goods={id:'goods',role:'goods',articleId:'water',name:'Mineralwasser',quantity:8,unit:'Kiste',unitNet:11.25,totalNet:90,taxRate:19};
 const deposit={id:'pfand',role:'deposit',articleId:null,name:'Kistenpfand',quantity:null,unit:'',unitNet:null,totalNet:10,taxRate:19};
 const invoice={...baseBill,lines:[goods,deposit]};
 const ret={...base('movement','ret'),confirmed:true,type:'return',area:'Küche',articleId:'water',quantity:24,unit:'Flasche',place:'',toArea:null,toPlace:'',note:'abgeholt'};
 const credit={...baseBill,id:'credit',billType:'credit',name:'Retoure',number:'G-1',net:-15.6,tax:-2.96,gross:-18.56,
  creditForId:invoice.id,lines:[{...goods,role:'return',quantity:2,unitNet:6,totalNet:-12},{...deposit,quantity:-2,unitNet:1.8,totalNet:-3.6}]};
 assert.doesNotThrow(()=>validateDocument(credit));
 assert.throws(()=>validateDocument({...credit,gross:18.56,net:15.6,tax:2.96,lines:[goods]}),/Positionen ergeben zusammen|Bruttobetrag/);
 await store.save(invoice,undefined,'invoice');
 await store.save(ret,undefined,'return');
 await store.save(credit,undefined,'credit');
 await assert.rejects(store.save({...base('billLink','invalid'),confirmed:true,area:'Küche',billId:credit.id,orderIds:[],returnIds:['missing'],reason:'Fremde Rückgabe'},undefined,'invalid'),/Warenrückgabe/);
 await store.save({...base('billLink','match'),confirmed:true,area:'Küche',billId:credit.id,orderIds:['order'],returnIds:[ret.id],reason:'Abholbeleg geprüft'},undefined,'match');
 s.ww=await store.load('s2027');
 const docs=s.ww.records.map(r=>r.value),original=docs.find(r=>r.id===credit.id);
 assert.equal(original.returnIds,undefined);
 assert.deepEqual(linkedBill(original,s).returnIds,[ret.id]);
 assert.equal(docs.filter(r=>r.kind==='movement').length,1);
 assert.deepEqual(reconcileBill(credit,s),[]);
 assert.deepEqual(invoicePriceProposals(credit,s),[]);
 assert.equal(reconcileBill(invoice,s).length,1);
 assert.deepEqual(purchaseTotals([invoice,credit]),{invoices:119,credits:-18.56,legacy:0,gross:100.44,lines:{
  goods:{charged:90,credited:0,unknown:0},deposit:{charged:10,credited:-3.6,unknown:0},return:{charged:0,credited:-12,unknown:0}
 }});
 assert.match(wwReport(s,'s2027','Küche'),/Belegsaldo brutto.*100,44.*Pfand, Rückgaben/);
});

test('a mixed invoice keeps the original gross total while listing negative deposit and goods positions separately',async()=>{
 const {purchaseTotals}=await import('../src/kitchen/ww/bill-accounting.ts');
 const {validateDocument}=await import('../src/kitchen/ww/domain.ts');
 const line={id:'1',name:'Ware',role:'goods',articleId:null,quantity:2,unit:'Stück',unitNet:10,totalNet:20,taxRate:19};
 const mixed={...base('bill','mixed'),confirmed:true,billType:'invoice',supplierId:'sup',number:'TEST-113',name:'Gemischter Beleg',
  date:'2027-02-07',area:'Küche',orderIds:[],note:'',fileHash:'',fileName:'',attachment:'',adjustmentNet:0,net:12,tax:2.28,gross:14.28,lines:[
   line,{...line,id:'2',name:'Warenrückgabe',role:'return',quantity:-1,unitNet:6,totalNet:-6},
   {...line,id:'3',name:'Pfand',role:'deposit',quantity:-1,unitNet:2,totalNet:-2}
  ]};
 validateDocument(mixed);
 const totals=purchaseTotals([mixed]);
 assert.equal(totals.gross,14.28);
 assert.equal(totals.credits,0);
 assert.equal(totals.lines.return.credited,-6);
 assert.equal(totals.lines.deposit.credited,-2);
});

test('an open mixed invoice stays out of area totals until an exact gross split is audited',async()=>{
 const {billGrossForArea,linkedBill}=await import('../src/kitchen/ww/bill-accounting.ts');
 const {validateDocument}=await import('../src/kitchen/ww/domain.ts');
 const {WwStore}=await import('../src/kitchen/ww/store.ts');
 const {Server}=await import('./support/fake-sharepoint.mjs');
 const {wwReport,exportBusinessRows}=await import('../src/kitchen/ww/reports.ts');
 const store=new WwStore('https://example.sharepoint.com/sites/kitchen',new Server().request);
 await store.initialize();
 const invoice={...base('bill','test-mixed-cost'),confirmed:true,billType:'invoice',supplierId:'sup',number:'TEST-COST',name:'Gemischter Einkauf',
  date:'2027-02-05',area:'Küche',orderIds:[],note:'',fileHash:'',fileName:'',attachment:'',adjustmentNet:0,
  net:null,tax:null,gross:171.11,costAssignment:{mode:'open'},
  lines:[{id:'one',role:'open',articleId:null,name:'Sammelposition',quantity:null,unit:'',unitNet:null,totalNet:null,taxRate:null}]};
 await store.save(invoice,undefined,'cost-open');
 assert.throws(()=>validateDocument({...invoice,needsSeparateFiles:true}),/Einzelbelege/);
 let s=state();s.ww=await store.load('s2027');
 assert.match(wwReport(s,'s2027','Küche'),/1 Beleg mit offener Kostenstelle/);
 assert.doesNotMatch(wwReport(s,'s2027','Küche'),/171,11/);
 assert.doesNotMatch(exportBusinessRows(s,'s2027','Küche'),/171,11/);
 const link={...base('billLink','test-cost-link'),confirmed:true,billId:invoice.id,area:'Küche',orderIds:[],reason:'Zuordnung am Original geprüft'};
 await assert.rejects(store.save({...link,costAssignment:{mode:'split',kitchen:90,scheuer:60,other:21}},undefined,'cost-invalid'),/Bruttobetrag/);
 await assert.rejects(store.save({...link,costAssignment:{mode:'split',kitchen:190,scheuer:-40,other:21.11}},undefined,'cost-wrong-sign'),/Vorzeichen/);
 await store.save({...link,costAssignment:{mode:'split',kitchen:90,scheuer:60,other:21.11}},undefined,'cost-valid');
 s.ww=await store.load('s2027');
 const raw=s.ww.records.find(row=>row.value.id===invoice.id).value;
 assert.deepEqual(raw,invoice);
 assert.equal(billGrossForArea(linkedBill(raw,s),'Küche'),90);
 assert.equal(billGrossForArea(linkedBill(raw,s),'Zunftscheuer'),60);
 assert.match(wwReport(s,'s2027','Küche'),/Belegsaldo brutto.*90,00/);
 assert.match(wwReport(s,'s2027','Zunftscheuer'),/Belegsaldo brutto.*60,00/);
 assert.doesNotMatch(wwReport(s,'s2027','Küche'),/171,11|21,11/);
 assert.match(exportBusinessRows(s,'s2027','Zunftscheuer'),/"60";"gross";"EUR";"bestätigter Bereichsanteil"/);
});
