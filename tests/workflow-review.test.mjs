import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { applyOperation } from "../src/domain/state.ts";
import { purchasingNeeds, stockSummary } from "../src/domain/workflow.ts";
const seed = JSON.parse(
  fs.readFileSync(new URL("../import/2026.json", import.meta.url), "utf8"),
);
let serial = 0;
const apply = (state, type, payload) =>
  applyOperation(state, {
    id: `review-${++serial}`,
    baseRevision: state.revision ?? 0,
    type,
    payload,
  }).state;
function setup() {
  let state = {
    schemaVersion: 2,
    event: {
      id: "review",
      name: "Test",
      year: 2026,
      status: "Planung",
      dates: {},
    },
    suppliers: [
      { id: "s", name: "Lieferant", email: null },
      { id: "s2", name: "Anderer", email: null },
    ],
    articles: [
      {
        id: "a",
        name: "Zutat",
        supplierId: "s",
        unit: "kg",
        category: "Speise",
        unitPriceCents: null,
        packSize: 1,
      },
    ],
    menu: [
      {
        id: "m",
        name: "Speise",
        priceCents: null,
        category: "Speise",
        recipe: [{ articleId: "a", quantity: 0.2 }],
        recipeStatus: "Bestätigt",
      },
    ],
    dishPlan: [],
    planLines: [],
    invoices: [],
    movements: [],
    orders: [],
    sales: [],
    lessons: [],
    sourceNotice: "",
    revision: 0,
    operationIds: [],
  };
  return apply(state, "stock.opening", { articleId: "a", quantity: 0 });
}
test("Fehlende Speisen/Tag-Matrix bleibt unbekannt; neue Menüs sind nicht unsichtbar", () => {
  let s = apply(setup(), "dish.quantity", {
    menuId: "m",
    day: "Freitag",
    quantity: 10,
  });
  assert.equal(purchasingNeeds(s, "Freitag").complete, true);
  assert.equal(purchasingNeeds(s, "Gesamt").complete, false);
  assert.match(purchasingNeeds(s, "Gesamt").missing.join(" "), /Samstag/);
  assert.throws(() => apply(s, "purchase.apply", { day: "Gesamt" }), /offen/);
  s = apply(s, "dish.quantity", { menuId: "m", day: "Samstag", quantity: 0 });
  assert.equal(purchasingNeeds(s, "Gesamt").complete, true);
  s = apply(s, "menu.save", {
    id: "unused",
    name: "Neue Speise",
    category: "Speise",
    priceCents: null,
  });
  assert.equal(purchasingNeeds(s, "Gesamt").complete, false);
});
test("Ausdrückliche Nullportionen brauchen keine Rezeptur; null bleibt offen", () => {
  let s = setup();
  s.menu[0].recipe = [];
  s.menu[0].recipeStatus = "Entwurf";
  for (const day of ["Freitag", "Samstag"])
    s = apply(s, "dish.quantity", { menuId: "m", day, quantity: 0 });
  const needs = purchasingNeeds(s, "Gesamt");
  assert.equal(needs.complete, true);
  assert.deepEqual(needs.rows, []);
  s = apply(s, "dish.quantity", {
    menuId: "m",
    day: "Samstag",
    quantity: null,
  });
  assert.equal(purchasingNeeds(s, "Gesamt").complete, false);
});
test("Bewusstes Auffüllen mit 0 erfasst nur fehlende/offene Paare und bewahrt positive Mengen", () => {
  let s = apply(setup(), "dish.quantity", {
    menuId: "m",
    day: "Freitag",
    quantity: 10,
  });
  s = apply(s, "menu.save", {
    id: "unused",
    name: "Nicht angeboten",
    category: "Speise",
    priceCents: null,
  });
  s = apply(s, "dish.quantity", {
    menuId: "unused",
    day: "Freitag",
    quantity: null,
  });
  assert.throws(() => apply(s, "dish.fillMissing", { quantity: 1 }), /0/);
  const op = {
    id: "fill-explicit",
    baseRevision: s.revision,
    type: "dish.fillMissing",
    payload: { quantity: 0 },
  };
  s = applyOperation(s, op).state;
  assert.equal(s.dishPlan.length, 4);
  assert.equal(
    s.dishPlan.find((d) => d.menuId === "m" && d.day === "Freitag").quantity,
    10,
  );
  assert.equal(s.dishPlan.filter((d) => d.quantity === 0).length, 3);
  assert.equal(purchasingNeeds(s, "Gesamt").complete, true);
  assert.equal(applyOperation(s, op).state, s);
});
test("Referenzierte Artikel dürfen Einheit oder Lieferant nicht rückwirkend umdeuten", () => {
  let s = setup();
  const article = s.articles[0];
  assert.throws(
    () => apply(s, "article.save", { ...article, unit: "g" }),
    /neuen Artikel/,
  );
  assert.throws(
    () => apply(s, "article.save", { ...article, supplierId: "s2" }),
    /neuen Artikel/,
  );
  for (const reference of ["planLines", "movements", "invoices", "orders"]) {
    const x = setup();
    x.menu[0].recipe = [];
    x.movements = [];
    if (reference === "planLines")
      x.planLines = [
        {
          id: "p",
          articleId: "a",
          supplierId: "s",
          quantity: 2,
          unit: "kg",
          name: "Zutat",
          day: "Freitag",
          time: null,
          unitPriceCents: null,
        },
      ];
    if (reference === "movements")
      x.movements = [
        {
          id: "v",
          articleId: "a",
          quantity: 2,
          day: "Freitag",
          type: "Lieferung",
          location: "Küche",
        },
      ];
    if (reference === "invoices")
      x.invoices = [
        {
          id: "i",
          supplierId: "s",
          number: "1",
          grossCents: null,
          netCents: null,
          scope: "Küche",
          status: "Erfasst",
          documentUrl: null,
          lines: [
            {
              articleId: "a",
              name: "Zutat",
              quantity: 2,
              unit: "kg",
              netCents: null,
            },
          ],
        },
      ];
    if (reference === "orders")
      x.orders = [
        {
          id: "o",
          supplierId: "s",
          lines: [{ articleId: "a", quantity: 2, unit: "kg" }],
        },
      ];
    assert.throws(
      () => apply(x, "article.save", { ...x.articles[0], unit: "g" }),
      /neuen Artikel/,
    );
    assert.throws(
      () => apply(x, "article.save", { ...x.articles[0], supplierId: "s2" }),
      /neuen Artikel/,
    );
  }
  s = apply(s, "article.save", { ...article, name: "Neuer Name", packSize: 2 });
  assert.equal(s.articles[0].name, "Neuer Name");
});
test("Originalbelegbeträge bleiben unveränderbar, Ergänzungen bewahren Originalsnapshot", () => {
  let s = structuredClone(seed);
  const original = structuredClone(
    s.invoices.find((i) => i.id === "r-RG2026020"),
  );
  assert.throws(
    () =>
      apply(s, "invoice.update", { reason: "Testkorrektur laut Beleg",  ...original, grossCents: 1, netCents: 1 }),
    /Originalbeleg/,
  );
  s = apply(s, "invoice.update", { reason: "Testkorrektur laut Beleg",
    ...original,
    scope: "Küche",
    documentUrl: "https://test.sharepoint.com/sites/kueche/beleg.pdf",
  });
  const updated = s.invoices.find((i) => i.id === original.id);
  assert.equal(updated.grossCents, original.grossCents);
  assert.deepEqual(updated.source, original.source);
  assert.equal(updated.status, "Original vorhanden");
  assert.deepEqual(updated.sourceBaseline, original);
  assert.equal(updated.corrected, true);
  assert.equal(updated.corrections.length, 1);
  assert.deepEqual(updated.corrections[0].before, original);
  const linked = apply(structuredClone(seed), "invoice.link", { reason: "Testkorrektur laut Beleg",
    id: original.id,
    url: "https://test.sharepoint.com/sites/kueche/original.pdf",
  }).invoices.find((i) => i.id === original.id);
  assert.deepEqual(linked.sourceBaseline, original);
  assert.equal(linked.corrections.length, 1);
});
test("Korrektur einer Listenangabe ohne Original bewahrt Ausgangswerte und alle Zwischenstände", () => {
  let s = structuredClone(seed);
  const original = structuredClone(
    s.invoices.find((i) => i.id === "r-rewe-list-1"),
  );
  s = apply(s, "invoice.update", { reason: "Testkorrektur laut Beleg",
    ...original,
    grossCents: 2000,
    netCents: 1000,
  });
  let updated = s.invoices.find((i) => i.id === original.id);
  assert.deepEqual(updated.sourceBaseline, original);
  assert.equal(updated.corrected, true);
  s = apply(s, "invoice.update", { reason: "Testkorrektur laut Beleg",  ...updated, grossCents: 3000 });
  updated = s.invoices.find((i) => i.id === original.id);
  assert.equal(updated.grossCents, 3000);
  assert.deepEqual(updated.sourceBaseline, original);
  assert.equal(updated.corrections.length, 2);
  assert.equal(updated.corrections[1].before.grossCents, 2000);
  assert.ok(!("corrections" in updated.corrections[1].before));
});
test("Kleinster positiver Bedarf mit größtem Gebinde wird immer auf ein Gebinde aufgerundet", () => {
  let s = setup();
  s.articles[0].packSize = 10000000;
  s.menu[0].recipe[0].quantity = 0.0001;
  s = apply(s, "dish.quantity", { menuId: "m", day: "Freitag", quantity: 1 });
  s = apply(s, "dish.quantity", { menuId: "m", day: "Samstag", quantity: 0 });
  assert.equal(purchasingNeeds(s, "Gesamt").rows[0].suggested, 10000000);
  s = apply(s, "purchase.apply", { day: "Gesamt" });
  assert.equal(s.planLines[0].quantity, 10000000);
  const precise = setup();
  precise.menu[0].recipe[0].quantity = 0.1;
  precise.articles[0].packSize = 0.1;
  const planned = apply(
    apply(precise, "dish.quantity", {
      menuId: "m",
      day: "Freitag",
      quantity: 3,
    }),
    "dish.quantity",
    { menuId: "m", day: "Samstag", quantity: 0 },
  );
  assert.equal(purchasingNeeds(planned, "Gesamt").rows[0].suggested, 0.3);
  const tooLarge = setup();
  tooLarge.menu[0].recipe[0].quantity = 10000000;
  const huge = apply(
    apply(tooLarge, "dish.quantity", {
      menuId: "m",
      day: "Freitag",
      quantity: 10000000,
    }),
    "dish.quantity",
    { menuId: "m", day: "Samstag", quantity: 0 },
  );
  assert.equal(purchasingNeeds(huge, "Gesamt").rows[0].suggested, null);
  assert.equal(purchasingNeeds(huge, "Gesamt").complete, false);
  assert.throws(
    () => apply(huge, "purchase.apply", { day: "Gesamt" }),
    /offen/,
  );
});
test("Küchenbestände werden je Ort getrennt geführt", () => {
  let s = apply(setup(), "delivery.record", {
    articleId: "a",
    day: "Freitag",
    quantity: 5,
    location: "Halle",
  });
  s = apply(s, "stock.opening", {
    articleId: "a",
    quantity: 100,
    location: "Halle",
  });
  s = apply(s, "stock.waste", {
    articleId: "a",
    day: "Freitag",
    quantity: 2,
    location: "Halle",
  });
  assert.equal(stockSummary(s, "a").balance, 0);
  assert.equal(stockSummary(s, "a", "Halle").balance, 103);
});
test("Artikelstammpreis aktualisiert lebende Einkaufszeilen, nicht vorbereitete Bestellungen", () => {
  let s = apply(setup(), "plan.add", {
    articleId: "a",
    supplierId: "s",
    day: "Freitag",
    quantity: 2,
  });
  s = apply(s, "order.prepare", { supplierId: "s", day: "Freitag" });
  s = apply(s, "article.save", { ...s.articles[0], unitPriceCents: 123.45 });
  assert.equal(s.planLines[0].unitPriceCents, 123.45);
  assert.equal(s.orders[0].lines[0].unitPriceCents, null);
});
