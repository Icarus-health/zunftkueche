import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyOperation } from "../src/domain/state.ts";
const seed = {
  ...JSON.parse(readFileSync("import/2026.json", "utf8")),
  revision: 0,
  operationIds: [],
};
const run = (s, type, payload, id = type + s.revision) =>
  applyOperation(s, { id, baseRevision: s.revision, type, payload }).state;
test("manual order status follows prepared ordered confirmed and preserves snapshot", () => {
  let s = run(
    seed,
    "order.prepare",
    { supplierId: seed.planLines[0].supplierId, day: seed.planLines[0].day },
    "order",
  );
  const snapshot = structuredClone(s.orders[0]);
  assert.throws(() =>
    run(s, "order.mark", { orderId: "order", status: "bestaetigt", note: "" }),
  );
  assert.throws(() =>
    run(s, "order.mark", { orderId: "missing", status: "bestellt", note: "" }),
  );
  s = run(
    s,
    "order.mark",
    { orderId: "order", status: "bestellt", note: "Telefonisch" },
    "mark",
  );
  assert.deepEqual(s.orders[0].lines, snapshot.lines);
  assert.equal(s.orders[0].status, "bestellt");
  assert.equal(s.orders[0].statusHistory[0].note, "Telefonisch");
  assert.throws(() =>
    run(s, "order.mark", { orderId: "order", status: "bestellt", note: "" }),
  );
  s = run(s, "order.mark", {
    orderId: "order",
    status: "bestaetigt",
    note: "",
  });
  assert.equal(s.orders[0].statusHistory.length, 2);
});

test("changed live planning is detected without changing ordered snapshot", async () => {
  const { orderPlanningChanged } =
    await import("../src/domain/order-status.ts");
  let s = run(
    seed,
    "order.prepare",
    { supplierId: seed.planLines[0].supplierId, day: seed.planLines[0].day },
    "snapshot",
  );
  const order = structuredClone(s.orders[0]);
  assert.equal(orderPlanningChanged(s, order), false);
  s = run(s, "plan.quantity", { id: order.lines[0].id, quantity: 12 });
  assert.equal(orderPlanningChanged(s, order), true);
  assert.deepEqual(s.orders[0], order);
});
