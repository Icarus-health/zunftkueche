import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMicrosoftRepository } from "../src/data/microsoft-repository.ts";
const workspaceId = "11111111-2222-4333-8444-555555555555";
const identity={organizationId:"22222222-2222-4333-8444-555555555555",userId:"33333333-2222-4333-8444-555555555555",workspaceId};
const seed = () => ({
  ...JSON.parse(readFileSync(new URL("../import/2026.json", import.meta.url))),
  schemaVersion: 2,
  revision: 0,
  operationIds: [],
  operationRequests: {},
});
const op = () => ({
  id: "change-price",
  targetEventId: seed().event.id,
  baseRevision: 0,
  type: "article.price",
  payload: { articleId: "a-1", priceCents: 12.34 },
});
const wrapped = (x) => ({
  success: true,
  data: { ResultJson: JSON.stringify({identity,canEdit:x.canWrite ?? true,canConfigure:false,canClose:false,targetEventId:seed().event.id,...x}) },
});
const loaded = (s = seed(), canWrite = true) =>
  wrapped({ protocolVersion: 2, workspaceId, state: s, canWrite });
const saved = (request) => {
  const q = JSON.parse(request);
  return wrapped({
    protocolVersion: 2,
    workspaceId,
    operationId: q.operationId,
    status: "saved",
    appliedRevision: 1,
    state: q.candidateState,
  });
};
test("timeout retry retains exact candidate bytes and fractional unit price", async () => {
  const sent = [];
  const repo = createMicrosoftRepository(
    {
      load: async () => loaded(),
      commit: async (q) => {
        sent.push(q);
        if (sent.length === 1) throw Error("timeout");
        return saved(q);
      },
    },
    workspaceId,
  );
  await repo.load();
  await assert.rejects(repo.commit(op()), /timeout/);
  const result = await repo.commit(op());
  assert.equal(sent[0], sent[1]);
  assert.equal(result.state.articles[0].unitPriceCents, 12.34);
});
test("pending operation rejects changed payload under same id", async () => {
  const repo = createMicrosoftRepository(
    {
      load: async () => loaded(),
      commit: async () => {
        throw Error("timeout");
      },
    },
    workspaceId,
  );
  await repo.load();
  await assert.rejects(repo.commit(op()));
  await assert.rejects(
    repo.commit({ ...op(), payload: { articleId: "a-1", priceCents: 42 } }),
    /Vorgangs-ID/,
  );
});
test("conflict returns latest server state without rebasing", async () => {
  let sent;
  const latest = seed();
  latest.revision = 7;
  const repo = createMicrosoftRepository(
    {
      load: async () => loaded(),
      commit: async (q) => {
        sent = JSON.parse(q);
        return wrapped({
          protocolVersion: 2,
        targetEventId:seed().event.id, identity,
          workspaceId,
          operationId: op().id,
          status: "conflict",
          appliedRevision: null,
          state: latest,
        });
      },
    },
    workspaceId,
  );
  await repo.load();
  const result = await repo.commit(op());
  assert.equal(result.status, "conflict");
  assert.equal(result.state.revision, 7);
  assert.equal(sent.expectedRevision, 0);
});
test("reader capability comes only from successful validated load", async () => {
  let calls = 0;
  const repo = createMicrosoftRepository(
    {
      load: async () => loaded(seed(), false),
      commit: async () => {
        calls++;
      },
    },
    workspaceId,
  );
  assert.equal(repo.canWrite, false);
  await repo.load();
  assert.equal(repo.canWrite, false);
  await assert.rejects(repo.commit(op()), /Schreibberechtigung/);
  assert.equal(calls, 0);
});
for (const [name, edit] of [
  ["wrong workspace", (x) => (x.workspaceId = "different")],
  ["wrong operation", (x) => (x.operationId = "different")],
  ["missing receipt", (x) => (x.appliedRevision = null)],
  ["revision mismatch", (x) => (x.appliedRevision = 9)],
  ["missing operation metadata", (x) => (x.state.operationIds = [])],
  ["malformed state", (x) => (x.state.articles = "bad")],
])
  test(`rejects ${name} acknowledgement`, async () => {
    const repo = createMicrosoftRepository(
      {
        load: async () => loaded(),
        commit: async (q) => {
          const value = JSON.parse(saved(q).data.ResultJson);
          edit(value);
          return wrapped(value);
        },
      },
      workspaceId,
    );
    await repo.load();
    await assert.rejects(repo.commit(op()));
  });
test("unsuccessful SDK result and missing canWrite fail closed", async () => {
  const repo = createMicrosoftRepository(
    {
      load: async () => ({ success: false, error: "denied" }),
      commit: async () => ({ success: false }),
    },
    workspaceId,
  );
  await assert.rejects(repo.load());
  assert.equal(repo.canWrite, false);
  const bad = createMicrosoftRepository(
    {
      load: async () =>
        wrapped({ protocolVersion: 2, workspaceId, state: seed(), canEdit:undefined }),
      commit: async () => ({ success: false }),
    },
    workspaceId,
  );
  await assert.rejects(bad.load());
});
test("saved replay permits current state newer than original receipt", async () => {
  const repo = createMicrosoftRepository(
    {
      load: async () => loaded(),
      commit: async (q) => {
        const value = JSON.parse(saved(q).data.ResultJson);
        value.state.revision = 4;
        return wrapped(value);
      },
    },
    workspaceId,
  );
  await repo.load();
  assert.equal((await repo.commit(op())).state.revision, 4);
});
test("pending envelope survives repository recreation and reload retries the original bytes", async () => {
  const values = new Map(),
    storage = {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => values.set(k, v),
      removeItem: (k) => values.delete(k),
    };
  let sent;
  const first = createMicrosoftRepository(
    {
      load: async () => loaded(),
      commit: async (q) => {
        sent = q;
        throw Error("timeout");
      },
    },
    workspaceId,
    storage,
  );
  await first.load();
  await assert.rejects(first.commit(op()));
  const second = createMicrosoftRepository(
    {
      load: async () => loaded(),
      commit: async (q) => {
        assert.equal(q, sent);
        return saved(q);
      },
    },
    workspaceId,
    storage,
  );
  const state = await second.load();
  assert.equal(state.revision, 1);
  assert.equal(values.size, 0);
});
test("load clones cached state so view mutation cannot change candidate base", async () => {
  const repo = createMicrosoftRepository(
    {
      load: async () => loaded(),
      commit: async (q) => {
        assert.notEqual(JSON.parse(q).candidateState.event.name, "tampered");
        return saved(q);
      },
    },
    workspaceId,
  );
  const state = await repo.load();
  state.event.name = "tampered";
  await repo.commit(op());
});
test("saved receipt must be for exactly the original resulting revision", async () => {
  const repo = createMicrosoftRepository(
    {
      load: async () => loaded(),
      commit: async (q) => {
        const value = JSON.parse(saved(q).data.ResultJson);
        value.appliedRevision = 2;
        value.state.revision = 4;
        return wrapped(value);
      },
    },
    workspaceId,
  );
  await repo.load();
  await assert.rejects(repo.commit(op()));
});
test("rejects response missing article identity and required recipe structure", async () => {
  for (const edit of [
    (s) => delete s.articles[0].id,
    (s) => (s.menu[0].recipe = "bad"),
  ]) {
    const s = seed();
    edit(s);
    const repo = createMicrosoftRepository(
      { load: async () => loaded(s), commit: async () => ({ success: false }) },
      workspaceId,
    );
    await assert.rejects(repo.load());
  }
});
test("failed reload revokes cached write capability and unsuccessful commits stay retryable", async () => {
  let loads = 0,
    calls = 0;
  const sent = [];
  const repo = createMicrosoftRepository(
    {
      load: async () => (++loads === 1 ? loaded() : { success: false }),
      commit: async (q) => {
        sent.push(q);
        if (++calls === 1)
          return { success: false, error: { message: "network" } };
        return saved(q);
      },
    },
    workspaceId,
  );
  await repo.load();
  await assert.rejects(repo.commit(op()));
  await repo.commit(op());
  assert.equal(sent[0], sent[1]);
  await assert.rejects(repo.load());
  assert.equal(repo.canWrite, false);
});
test("metadata-generated service wrapper returns one stable configured repository", async () => {
  const { configureMicrosoftRuntime, getMicrosoftRepository } =
    await import("../src/data/microsoft-runtime.ts");
  const { getRepository } = await import("../src/data/repository.ts");
  const instance = configureMicrosoftRuntime(
    workspaceId,
    {
      load: { zk_KitchenLoad: async () => loaded() },
      commit: { zk_KitchenCommit: async (q) => saved(q) },
    },
    { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  );
  assert.equal(getMicrosoftRepository(), instance);
  assert.equal(getRepository(), instance);
  await instance.load();
  assert.equal(instance.canWrite, true);
  assert.throws(
    () => configureMicrosoftRuntime(workspaceId, { load: {}, commit: {} }),
    /bereits/,
  );
});
