import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseQuantity,
  prepareOrder,
  recipeCost,
  stockBalance,
  salesRevenue,
  formatOrderHint,
} from "../src/domain/kitchen.ts";

test("Mengen akzeptieren deutsches Dezimalkomma und unterscheiden offen von null", () => {
  assert.equal(parseQuantity("2,5"), 2.5);
  assert.equal(parseQuantity(" 0 "), 0);
  assert.equal(parseQuantity(""), null);
  for (const input of [
    "-1",
    "1.200",
    "1,000.5",
    "abc",
    "Infinity",
    "2,12345",
  ]) {
    assert.throws(() => parseQuantity(input), /Menge/);
  }
});

test("Bestellversion enthält nur gewählten Lieferanten und Tag und friert Positionen ein", () => {
  const lines = [
    {
      id: "1",
      supplierId: "wiggen",
      day: "Freitag",
      articleId: "bock",
      name: "Bockwürste",
      quantity: 200,
      unit: "Stück",
      time: "17:00",
      unitPriceCents: null,
    },
    {
      id: "2",
      supplierId: "wiggen",
      day: "Freitag",
      articleId: "torte",
      name: "Gemüsetorte",
      quantity: 6,
      unit: "Stück",
      time: "19:00",
      unitPriceCents: 1200,
    },
    {
      id: "3",
      supplierId: "faller",
      day: "Freitag",
      articleId: "brot",
      name: "Brot",
      quantity: 10,
      unit: "Laib",
      time: null,
      unitPriceCents: 400,
    },
    {
      id: "4",
      supplierId: "wiggen",
      day: "Samstag",
      articleId: "bock",
      name: "Bockwürste",
      quantity: 150,
      unit: "Stück",
      time: "17:00",
      unitPriceCents: null,
    },
  ];
  const order = prepareOrder(lines, "wiggen", "Freitag");
  assert.equal(order.lines.length, 2);
  assert.deepEqual(
    order.groups.map((g) => g.time),
    ["17:00", "19:00"],
  );
  assert.equal(order.totalCents, null);
  lines[0].quantity = 250;
  assert.equal(order.lines[0].quantity, 200);
  assert.ok(Object.isFrozen(order.lines[0]));
});

test("Unbekannte Portionsgrößen verhindern scheinbar vollständige Rezeptkosten", () => {
  assert.equal(
    recipeCost([{ quantity: null, unitPriceCents: 500 }]).totalCents,
    null,
  );
  assert.equal(
    recipeCost([
      { quantity: 0.15, unitPriceCents: 1000 },
      { quantity: 0.04, unitPriceCents: 400 },
    ]).totalCents,
    166,
  );
  assert.equal(recipeCost([]).totalCents, null);
});

// Both consumers must preserve decimal input precision and round only the total.
const costConsumers = {
  Rezeptkosten: (lines) => recipeCost(lines).totalCents,
  Bestellwert: (lines) =>
    prepareOrder(
      lines.map((line, index) => ({
        id: String(index),
        supplierId: "supplier",
        articleId: String(index),
        name: "Testartikel",
        unit: "Stück",
        day: "Freitag",
        time: null,
        ...line,
      })),
      "supplier",
      "Freitag",
    ).totalCents,
};

for (const [name, total] of Object.entries(costConsumers)) {
  test(`${name}: exakte halbe Cent werden aufgerundet`, () => {
    assert.equal(total([{ quantity: 50, unitPriceCents: 0.29 }]), 15);
    assert.equal(total([{ quantity: 50, unitPriceCents: 1.15 }]), 58);
    assert.equal(total([{ quantity: 0.0001, unitPriceCents: 5000 }]), 1);
  });

  test(`${name}: nur die Summe wird gerundet, mit voller Mengen- und Preispräzision`, () => {
    assert.equal(
      total(
        Array.from({ length: 50 }, () => ({
          quantity: 1,
          unitPriceCents: 0.29,
        })),
      ),
      15,
    );
    assert.equal(total([{ quantity: 0.0001, unitPriceCents: 4999.99 }]), 0);
    assert.equal(total([{ quantity: 0.0001, unitPriceCents: 5000.01 }]), 1);
    assert.equal(
      total([
        { quantity: 1, unitPriceCents: 0.5 },
        { quantity: 1, unitPriceCents: 0.5 },
      ]),
      1,
    );
    assert.equal(
      total([{ quantity: 9999999.9999, unitPriceCents: 99999999.99 }]),
      999999999890000,
    );
  });

  test(`${name}: offene Werte bleiben offen, ausdrücklich null bleibt null Cent`, () => {
    assert.equal(total([]), null);
    assert.equal(
      total([
        { quantity: 50, unitPriceCents: 0.29 },
        { quantity: null, unitPriceCents: 1 },
      ]),
      null,
    );
    assert.equal(
      total([
        { quantity: 50, unitPriceCents: 0.29 },
        { quantity: 1, unitPriceCents: null },
      ]),
      null,
    );
    assert.equal(total([{ quantity: 0, unitPriceCents: 0.29 }]), 0);
    assert.equal(total([{ quantity: 50, unitPriceCents: 0 }]), 0);
  });

  test(`${name}: nicht sicher darstellbare Cent-Summen bleiben unverfügbar`, () => {
    const maximumLine = { quantity: 10000000, unitPriceCents: 100000000 };
    assert.equal(
      total(Array.from({ length: 9 }, () => maximumLine)),
      9000000000000000,
    );
    assert.equal(total(Array.from({ length: 10 }, () => maximumLine)), null);
  });
}

test("Rezeptkosten bewahren die Anzahl fehlender Angaben", () => {
  assert.deepEqual(
    recipeCost([
      { quantity: 50, unitPriceCents: 0.29 },
      { quantity: null, unitPriceCents: 1 },
      { quantity: 1, unitPriceCents: null },
      { quantity: null, unitPriceCents: null },
    ]),
    { totalCents: null, missing: 3 },
  );
  assert.deepEqual(recipeCost([{ quantity: 0, unitPriceCents: 0 }]), {
    totalCents: 0,
    missing: 0,
  });
});

test("Bestellungen sind kein Lagerzugang und fehlender Anfangsbestand bleibt offen", () => {
  const movements = [
    { type: "Bestellung", quantity: 200 },
    { type: "Lieferung", quantity: 150 },
    { type: "Verbrauch", quantity: 100 },
    { type: "Abfall", quantity: 2 },
  ];
  assert.equal(stockBalance(0, movements), 48);
  assert.equal(stockBalance(null, movements), null);
});

test("Verkaufszahlen bleiben von fehlenden Erfassungen unterscheidbar", () => {
  assert.equal(
    salesRevenue([{ quantity: null, priceCents: 500 }]).totalCents,
    null,
  );
  assert.equal(salesRevenue([{ quantity: 0, priceCents: 500 }]).totalCents, 0);
  assert.equal(
    salesRevenue([{ quantity: 2, priceCents: 500 }]).totalCents,
    1000,
  );
});
test("Bestellvorschau bewahrt eine Lieferzeit zusätzlich zu einem eigenen Hinweis", () => {
  assert.equal(
    formatOrderHint({ time: "19:00", note: "Bitte warm liefern" }),
    "19:00 Uhr · Bitte warm liefern",
  );
  assert.equal(
    formatOrderHint({ time: "17:00", note: "10x1kg, 17:00 Uhr" }),
    "10x1kg, 17:00 Uhr",
  );
});
