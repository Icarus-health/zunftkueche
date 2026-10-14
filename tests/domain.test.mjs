import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuantity, prepareOrder, recipeCost, stockBalance, salesRevenue } from '../src/domain/kitchen.ts';

test('Mengen akzeptieren deutsches Dezimalkomma und unterscheiden offen von null', () => {
  assert.equal(parseQuantity('2,5'), 2.5);
  assert.equal(parseQuantity(' 0 '), 0);
  assert.equal(parseQuantity(''), null);
  for (const input of ['-1', '1.200', '1,000.5', 'abc', 'Infinity', '2,12345']) {
    assert.throws(() => parseQuantity(input), /Menge/);
  }
});

test('Bestellversion enthält nur gewählten Lieferanten und Tag und friert Positionen ein', () => {
  const lines = [
    {id:'1', supplierId:'wiggen',day:'Freitag',articleId:'bock',name:'Bockwürste',quantity:200,unit:'Stück',time:'17:00',unitPriceCents:null},
    {id:'2', supplierId:'wiggen',day:'Freitag',articleId:'torte',name:'Gemüsetorte',quantity:6,unit:'Stück',time:'19:00',unitPriceCents:1200},
    {id:'3', supplierId:'faller',day:'Freitag',articleId:'brot',name:'Brot',quantity:10,unit:'Laib',time:null,unitPriceCents:400},
    {id:'4', supplierId:'wiggen',day:'Samstag',articleId:'bock',name:'Bockwürste',quantity:150,unit:'Stück',time:'17:00',unitPriceCents:null},
  ];
  const order = prepareOrder(lines, 'wiggen', 'Freitag');
  assert.equal(order.lines.length, 2);
  assert.deepEqual(order.groups.map(g => g.time), ['17:00','19:00']);
  assert.equal(order.totalCents, null);
  lines[0].quantity=250;
  assert.equal(order.lines[0].quantity,200);
  assert.ok(Object.isFrozen(order.lines[0]));
});

test('Unbekannte Portionsgrößen verhindern scheinbar vollständige Rezeptkosten', () => {
  assert.equal(recipeCost([{quantity:null,unitPriceCents:500}]).totalCents,null);
  assert.equal(recipeCost([{quantity:.15,unitPriceCents:1000},{quantity:.04,unitPriceCents:400}]).totalCents,166);
  assert.equal(recipeCost([]).totalCents,null);
});

test('Bestellungen sind kein Lagerzugang und fehlender Anfangsbestand bleibt offen', () => {
  const movements=[{type:'Bestellung',quantity:200},{type:'Lieferung',quantity:150},{type:'Verbrauch',quantity:100},{type:'Abfall',quantity:2}];
  assert.equal(stockBalance(0,movements),48);
  assert.equal(stockBalance(null,movements),null);
});

test('Verkaufszahlen bleiben von fehlenden Erfassungen unterscheidbar', () => {
  assert.equal(salesRevenue([{quantity:null,priceCents:500}]).totalCents,null);
  assert.equal(salesRevenue([{quantity:0,priceCents:500}]).totalCents,0);
  assert.equal(salesRevenue([{quantity:2,priceCents:500}]).totalCents,1000);
});
