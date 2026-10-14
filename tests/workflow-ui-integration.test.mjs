import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOperation } from "../src/domain/state.ts";
import { purchasingNeeds } from "../src/domain/workflow.ts";
let serial = 0;
const apply = (state, type, payload) =>
  applyOperation(state, {
    id: `ui-coupled-${++serial}`,
    baseRevision: state.revision,
    type,
    payload,
  }).state;
function weekend() {
  let state = {
    schemaVersion: 2,
    event: {
      id: "original",
      name: "Test",
      year: 2026,
      status: "Planung",
      dates: {},
    },
    suppliers: [],
    articles: [],
    menu: [],
    planLines: [],
    dishPlan: [],
    invoices: [],
    sales: [],
    movements: [],
    orders: [],
    lessons: [],
    sourceNotice: "",
    revision: 0,
    operationIds: [],
  };
  state = apply(state, "supplier.save", {
    id: "s",
    name: "Testlieferant",
    email: null,
  });
  state = apply(state, "article.save", {
    id: "a",
    name: "Testzutat",
    supplierId: "s",
    unit: "Stück",
    category: "Lebensmittel",
    packSize: 1,
    unitPriceCents: 100,
  });
  state = apply(state, "menu.save", {
    id: "m",
    name: "Testgericht",
    category: "Speise",
    priceCents: 500,
  });
  state = apply(state, "recipe.save", {
    menuId: "m",
    confirmed: true,
    lines: [{ articleId: "a", quantity: 1 }],
  });
  state = apply(state, "dish.quantity", {
    menuId: "m",
    day: "Freitag",
    quantity: 10,
  });
  state = apply(state, "dish.quantity", {
    menuId: "m",
    day: "Samstag",
    quantity: 0,
  });
  return apply(state, "stock.opening", { articleId: "a", quantity: 0 });
}
test("Wednesday delivery of explicitly derived weekend purchase remains coverage on re-adoption", () => {
  let state = apply(weekend(), "purchase.apply", { day: "Gesamt" });
  const id = state.planLines[0].id;
  state = apply(state, "plan.schedule", { id, day: "Mittwoch", time: "17:00" });
  const needs = purchasingNeeds(state, "Gesamt");
  assert.equal(needs.rows[0].required, 10);
  assert.equal(needs.rows[0].planned, 10);
  assert.equal(needs.rows[0].suggested, 0);
  state = apply(state, "purchase.apply", { day: "Gesamt" });
  assert.equal(
    state.planLines.reduce((sum, l) => sum + l.quantity, 0),
    10,
  );
  assert.equal(state.planLines.length, 1);
  assert.equal(state.planLines[0].time, "17:00");
});
test("unmarked imported Wednesday meal quantities are not inferred as weekend coverage from notes", () => {
  const state = weekend();
  state.planLines.push({
    id: "imported",
    articleId: "a",
    supplierId: "s",
    name: "Testzutat",
    quantity: 10,
    unit: "Stück",
    day: "Mittwoch",
    time: null,
    unitPriceCents: 100,
    location: "Küche",
    note: "Freitag und Samstag",
    source: {
      file: "test-source.xlsx",
      hash: "test",
      sheet: "Mittwoch",
      cells: "A1",
    },
  });
  const needs = purchasingNeeds(state, "Gesamt");
  assert.equal(needs.rows[0].planned, 0);
  assert.equal(needs.rows[0].suggested, 10);
});
test("Wednesday weekend coverage survives quantity ownership, archived restore and explicit plan copy", () => {
  let state = apply(weekend(), "purchase.apply", { day: "Gesamt" });
  const id = state.planLines[0].id;
  state = apply(state, "plan.schedule", { id, day: "Mittwoch", time: null });
  state = apply(state, "plan.quantity", { id, quantity: 8 });
  assert.equal(purchasingNeeds(state, "Gesamt").rows[0].planned, 8);
  assert.equal(purchasingNeeds(state, "Gesamt").rows[0].suggested, 2);
  state = apply(state, "event.create", {
    name: "Next",
    year: 2027,
    copyPlan: true,
  });
  state = apply(state, "stock.opening", { articleId: "a", quantity: 0 });
  assert.equal(purchasingNeeds(state, "Gesamt").rows[0].planned, 8);
  assert.equal(purchasingNeeds(state, "Gesamt").rows[0].suggested, 2);
  state = apply(state, "event.switch", { id: "original" });
  assert.equal(purchasingNeeds(state, "Gesamt").rows[0].planned, 8);
  assert.equal(purchasingNeeds(state, "Gesamt").rows[0].suggested, 2);
});
