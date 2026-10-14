import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyOperation } from "../src/domain/state.ts";
import * as facts from "../src/ui/facts.ts";
const supplierId = "s-wiggenhauser";
function fixture() {
  const state = JSON.parse(
    readFileSync(new URL("../import/2026.json", import.meta.url)),
  );
  return {
    ...state,
    revision: 0,
    operationIds: [],
    event: {
      ...state.event,
      name: "Testfest",
      year: 2099,
      dates: { Freitag: "2099-02-06" },
    },
  };
}
function apply(state, type, payload) {
  return applyOperation(state, {
    id: `test-${state.revision}`,
    baseRevision: state.revision,
    type,
    payload,
  }).state;
}
test("prepared headers retain supplier, event and date through later edits and archive roundtrip", () => {
  let state = fixture();
  const supplierName = state.suppliers.find((s) => s.id === supplierId).name;
  state = apply(state, "order.prepare", { supplierId, day: "Freitag" });
  assert.deepEqual(state.orders[0].context, {
    supplierName,
    eventName: "Testfest",
    eventYear: 2099,
    deliveryDate: "2099-02-06",
  });
  const original = structuredClone(state.orders[0]);
  state = apply(state, "event.dates", { dates: { Freitag: "2099-02-13" } });
  state = apply(state, "supplier.save", {
    id: supplierId,
    name: "Neuer Name",
    email: null,
  });
  const eventId = state.event.id;
  state = apply(state, "event.create", {
    name: "Folgefest",
    year: 2100,
    copyPlan: true,
  });
  state = apply(state, "event.switch", { id: eventId });
  assert.deepEqual(state.orders[0], original);
  const header = facts.orderPreviewHeader(state, state.orders[0]);
  assert.equal(header.supplierName, supplierName);
  assert.equal(header.eventName, "Testfest");
  assert.equal(header.eventYear, 2099);
  assert.equal(header.deliveryDate, "2099-02-06");
  assert.equal(header.notice, null);
  assert.deepEqual(state.orders[0].lines[0].source, original.lines[0].source);
});
test("unknown date stays unknown after a date is supplied later", () => {
  let state = fixture();
  state.event.dates.Freitag = null;
  state = apply(state, "order.prepare", { supplierId, day: "Freitag" });
  assert.equal(state.orders[0].context?.deliveryDate, null);
  state = apply(state, "event.dates", { dates: { Freitag: "2099-02-13" } });
  assert.equal(
    facts.orderPreviewHeader(state, state.orders[0]).deliveryDate,
    null,
  );
});
test("legacy prepared headers disclose current context; live drafts use current context without historical claim", () => {
  const state = fixture();
  assert.equal(typeof facts.orderPreviewHeader, "function");
  const legacy = { supplierId, day: "Freitag", status: "Vorbereitet" };
  const header = facts.orderPreviewHeader(state, legacy);
  assert.match(header.notice, /nicht gespeichert/);
  assert.match(header.notice, /aktuell/);
  assert.equal(header.deliveryDate, "2099-02-06");
  state.suppliers.find((s) => s.id === supplierId).name = "Aktueller Lieferant";
  state.event.name = "Aktuelles Fest";
  state.event.year = 2100;
  state.event.dates.Freitag = "2100-02-12";
  const draft = facts.orderPreviewHeader(state, {
    ...legacy,
    status: "Vorschau",
  });
  assert.deepEqual(draft, {
    supplierName: "Aktueller Lieferant",
    eventName: "Aktuelles Fest",
    eventYear: 2100,
    deliveryDate: "2100-02-12",
    notice: null,
  });
  assert.equal(legacy.context, undefined);
});
