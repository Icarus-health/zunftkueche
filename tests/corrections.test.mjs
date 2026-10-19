import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyOperation } from "../src/domain/state.ts";
import { stockSummary } from "../src/domain/workflow.ts";
const seed = {
  ...JSON.parse(readFileSync("import/2026.json", "utf8")),
  revision: 0,
  operationIds: [],
};
const run = (s, type, payload, id = type + s.revision) =>
  applyOperation(s, { id, baseRevision: s.revision, type, payload }).state;
test("correction replaces effective delivery 100 by 10 while preserving original and replay", () => {
  let s = run(
    seed,
    "delivery.record",
    { articleId: "a-1", day: "Freitag", quantity: 100, location: "Küche" },
    "delivery",
  );
  const op = {
    id: "fix",
    baseRevision: s.revision,
    type: "movement.correct",
    payload: {
      movementId: "delivery",
      replacementQuantity: 10,
      reason: "Zahlendreher",
    },
  };
  s = applyOperation(s, op).state;
  assert.equal(s.movements.at(-1).quantity, 100);
  assert.equal(stockSummary(s, "a-1").received, 10);
  assert.equal(s.movementCorrections[0].before, 100);
  assert.equal(s.movementCorrections[0].reason, "Zahlendreher");
  assert.deepEqual(applyOperation(s, op).state, s);
  s = run(s, "movement.correct", {
    movementId: "delivery",
    replacementQuantity: 12,
    reason: "Nachgezählt",
  });
  assert.equal(stockSummary(s, "a-1").received, 12);
  assert.throws(() =>
    run(s, "movement.correct", {
      movementId: "delivery",
      replacementQuantity: -1,
      reason: "X",
    }),
  );
  assert.throws(() =>
    run(s, "movement.correct", {
      movementId: "missing",
      replacementQuantity: 10,
      reason: "X",
    }),
  );
  assert.throws(() =>
    run(s, "movement.correct", {
      movementId: "delivery",
      replacementQuantity: 10,
      reason: " ",
    }),
  );
});
test("stored sale price correction preserves original and survives later master price", () => {
  let s = run(seed, "menu.price", { menuId: "m-1", priceCents: 50 });
  s = run(
    s,
    "sales.quantity",
    { menuId: "m-1", day: "Freitag", quantity: 2 },
    "sale",
  );
  s = run(s, "sales.correctPrice", {
    saleId: "sale",
    priceCents: 500,
    reason: "Kommafehler",
  });
  s = run(s, "menu.price", { menuId: "m-1", priceCents: 900 });
  assert.equal(s.sales[0].priceCents, 50);
  assert.equal(s.salePriceCorrections[0].after, 500);
});
test("manual receipt first confirmed baseline and every before/after remain source-free", () => {
  let s = run(
    seed,
    "invoice.save",
    {
      supplierId: seed.suppliers[0].id,
      number: "TEST-MANUAL",
      grossCents: 100,
      netCents: 90,
      scope: "Küche",
      documentUrl: null,
      lines: [],
    },
    "manual",
  );
  s = run(s, "invoice.correct", {
    invoiceId: "manual",
    changes: { grossCents: 200 },
    reason: "Betrag abgelesen",
  });
  const r = s.invoices.at(-1);
  assert.equal(r.source, undefined);
  assert.equal(r.sourceBaseline.grossCents, 100);
  assert.equal(r.corrections[0].before.grossCents, 100);
  assert.equal(r.corrections[0].after.grossCents, 200);
  assert.equal(r.corrections[0].reason, "Betrag abgelesen");
  assert.throws(() =>
    run(s, "invoice.correct", {
      invoiceId: "manual",
      changes: { source: { file: "invented" } },
      reason: "X",
    }),
  );
});

test("all sales totals use effective corrected price, not later master", async () => {
  const { effectiveSales } = await import("../src/domain/corrections.ts");
  const { summarizeSales } = await import("../src/domain/kitchen.ts");
  let s = run(seed, "menu.price", { menuId: "m-1", priceCents: 50 });
  s = run(
    s,
    "sales.quantity",
    { menuId: "m-1", day: "Freitag", quantity: 2 },
    "sale",
  );
  s = run(s, "sales.correctPrice", {
    saleId: "sale",
    priceCents: 500,
    reason: "Kommafehler",
  });
  s = run(s, "menu.price", { menuId: "m-1", priceCents: 900 });
  assert.equal(summarizeSales(effectiveSales(s)).knownCents, 1000);
});
test("historic source-less receipt protects first available baseline and every later correction", () => {
  let s = structuredClone(seed);
  s.invoices.push({
    id: "legacy",
    supplierId: seed.suppliers[0].id,
    number: "TEST-LEGACY",
    grossCents: 100,
    netCents: 90,
    scope: "Küche",
    documentUrl: null,
    lines: [],
    status: "Erfasst",
  });
  s = run(s, "invoice.correct", {
    invoiceId: "legacy",
    changes: { grossCents: 200 },
    reason: "Abgelesen",
  });
  s = run(s, "invoice.correct", {
    invoiceId: "legacy",
    changes: { grossCents: 300 },
    reason: "Nachgeprüft",
  });
  const r = s.invoices.at(-1);
  assert.equal(r.sourceBaseline.grossCents, 100);
  assert.equal(r.sourceBaseline.source, undefined);
  assert.equal(r.corrections[1].before.grossCents, 200);
  assert.equal(r.corrections[1].after.grossCents, 300);
  assert.throws(
    () => run(s, "invoice.update", { ...r, grossCents: 400 }),
    /Korrekturgrund/,
  );
});
test("original receipt may be corrected explicitly while source and original economics remain in baseline", () => {
  const original = seed.invoices.find((r) => r.status === "Original vorhanden");
  const s = run(seed, "invoice.correct", {
    invoiceId: original.id,
    changes: { grossCents: 9999999 },
    reason: "Übertragungsfehler",
  });
  const r = s.invoices.find((r) => r.id === original.id);
  assert.deepEqual(r.source, original.source);
  assert.equal(r.sourceBaseline.grossCents, original.grossCents);
  assert.equal(r.corrections[0].after.grossCents, 9999999);
  assert.equal(r.corrections[0].before.grossCents, original.grossCents);
});
test("legacy nullable field normalization also records a before/after correction", () => {
  const s = structuredClone(seed);
  const original = structuredClone(
    s.invoices.find((i) => i.status === "Original fehlt"),
  );
  delete original.date;
  s.invoices = [original];
  const next = run(s, "invoice.correct", {
    invoiceId: original.id,
    changes: {},
    reason: "Fehlendes Datum ausdrücklich offen",
  });
  assert.equal(next.invoices[0].corrections.length, 1);
  assert.equal(
    Object.hasOwn(next.invoices[0].corrections[0].before, "date"),
    false,
  );
  assert.equal(next.invoices[0].corrections[0].after.date, null);
});
