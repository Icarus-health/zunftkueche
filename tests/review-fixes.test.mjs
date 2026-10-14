import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SaveController } from "../src/data/save-controller.ts";
import { createLocalStore } from "../dev/local-store.ts";
import { applyOperation } from "../src/domain/state.ts";
import { summarizeSales } from "../src/domain/kitchen.ts";
const seed = JSON.parse(
  await fs.readFile(new URL("../import/2026.json", import.meta.url), "utf8"),
);
test("Navigation erhält offenen Vorgang und sichtbare Fehlermeldung", async () => {
  const controller = new SaveController(
    () => ({
      commit: async () => {
        throw new Error("Verbindung unterbrochen");
      },
    }),
    () => {},
    () => {},
  );
  const saving = controller.save({
    id: "nav",
    baseRevision: 0,
    type: "delivery.record",
    payload: {},
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(controller.status.pending?.id, "nav");
  controller.clearNotice();
  assert.match(controller.status.error, /Verbindung/);
});
test("Retry bestätigt den ursprünglichen Formularvorgang und dieselbe Lieferung bleibt einmal gebucht", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zunftkueche-retry-"));
  const store = createLocalStore(path.join(dir, "state.json"), seed);
  let first = true,
    callbackCount = 0;
  const repo = {
    mode: "local",
    load: store.load,
    commit: async (op) => {
      const result = await store.commit(op);
      if (first) {
        first = false;
        throw new Error("Antwort verloren");
      }
      return result;
    },
  };
  const controller = new SaveController(
    () => repo,
    () => {},
    () => {},
  );
  const completed = controller
    .save({
      id: "stable-id",
      baseRevision: 0,
      type: "delivery.record",
      payload: { articleId: "a-3", day: "Freitag", quantity: 150 },
    })
    .then((ok) => {
      if (ok) callbackCount++;
      return ok;
    });
  while (controller.status.busy) await new Promise((r) => setImmediate(r));
  assert.equal(controller.status.pending?.id, "stable-id");
  assert.equal(callbackCount, 0);
  await controller.retry();
  assert.equal(await completed, true);
  assert.equal(callbackCount, 1);
  assert.equal(controller.status.pending, null);
  assert.equal((await store.load()).movements.length, 1);
});
test("Fehlende Verkaufspreise bleiben offen und lassen sich ausdrücklich nachbestätigen", () => {
  const state = { ...structuredClone(seed), revision: 0, operationIds: [] };
  const unknown = applyOperation(state, {
    id: "price-offen",
    baseRevision: 0,
    type: "menu.price",
    payload: { menuId: "m-1", priceCents: null },
  });
  const sold = applyOperation(unknown.state, {
    id: "sale",
    baseRevision: 1,
    type: "sales.quantity",
    payload: { menuId: "m-1", day: "Freitag", quantity: 2 },
  });
  assert.equal(summarizeSales(sold.state.sales).totalCents, null);
  assert.equal(summarizeSales(sold.state.sales).missingPrices, 1);
  const known = applyOperation(sold.state, {
    id: "confirm",
    baseRevision: 2,
    type: "sales.price",
    payload: { menuId: "m-1", day: "Freitag", priceCents: 500 },
  });
  assert.equal(summarizeSales(known.state.sales).totalCents, 1000);
});
