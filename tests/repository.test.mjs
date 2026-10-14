import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createLocalRepository,
  RejectedError,
} from "../src/data/repository.ts";
test("Eine abgelehnte Eingabe darf korrigiert werden und wird nicht als ausstehende Buchung behandelt", async () => {
  const repo = createLocalRepository(
    async () =>
      new Response(
        JSON.stringify({ error: "Stückzahl muss ganzzahlig sein." }),
        { status: 400 },
      ),
  );
  await assert.rejects(
    repo.commit({
      id: "x",
      baseRevision: 0,
      type: "sales.quantity",
      payload: { quantity: 1.5 },
    }),
    RejectedError,
  );
});
test("Ein Versionskonflikt liefert den aktuellen Stand ohne erfolgreiche Speicherung vorzutäuschen", async () => {
  const repo = createLocalRepository(
    async () =>
      new Response(
        JSON.stringify({ status: "conflict", state: { revision: 2 } }),
        { status: 409 },
      ),
  );
  const result = await repo.commit({
    id: "x",
    baseRevision: 0,
    type: "plan.quantity",
    payload: {},
  });
  assert.equal(result.status, "conflict");
  assert.equal(result.state.revision, 2);
});
