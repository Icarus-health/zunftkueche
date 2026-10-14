import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLocalStore } from "../dev/local-store.ts";
const seed = JSON.parse(
  await fs.readFile(new URL("../import/2026.json", import.meta.url), "utf8"),
);
test("Speicherung überlebt Neustart und dieselbe Lieferung wird nicht zweimal gebucht", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zunftkueche-persist-"));
  const file = path.join(dir, "state.json");
  const store = createLocalStore(file, seed);
  const op = {
    id: "persist-1",
    baseRevision: 0,
    type: "delivery.record",
    payload: { articleId: "a-3", day: "Freitag", quantity: 150 },
  };
  assert.equal((await store.commit(op)).status, "saved");
  const restarted = createLocalStore(file, seed);
  assert.equal((await restarted.load()).movements.length, 1);
  await restarted.commit(op);
  assert.equal((await restarted.load()).movements.length, 1);
});
test("Zwei gleichzeitige Bearbeitungen überschreiben sich nicht", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zunftkueche-conflict-"));
  const store = createLocalStore(path.join(dir, "state.json"), seed);
  const a = {
    id: "a",
    baseRevision: 0,
    type: "plan.quantity",
    payload: { id: "p-2026-12", quantity: 180 },
  };
  const b = {
    id: "b",
    baseRevision: 0,
    type: "plan.quantity",
    payload: { id: "p-2026-12", quantity: 170 },
  };
  const results = await Promise.all([store.commit(a), store.commit(b)]);
  assert.deepEqual(results.map((r) => r.status).sort(), ["conflict", "saved"]);
  assert.equal((await store.load()).revision, 1);
});
