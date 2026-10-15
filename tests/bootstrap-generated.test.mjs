import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { MICROSOFT_ENVIRONMENT_ID, MICROSOFT_WORKSPACE_ID } from "../src/bootstrap/start.ts";

// Vite resolves the generator's extensionless metadata imports exactly as in the app.
// Only the SDK host boundary is replaced; generated services/runtime are the actual files.
test("actual generated classes configure before mount and preserve RequestJson/ResultJson mapping", async () => {
  const calls = [], requests = [];
  let finishContext, announceContext;
  const contextStarted = new Promise((resolve) => { announceContext = resolve; });
  const storage = new Map();
  const priorStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const priorBoundary = globalThis.__kitchenBootstrapTest;
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k),
  } });
  globalThis.__kitchenBootstrapTest = {
    getContext: () => new Promise((resolve) => { calls.push("context"); finishContext = resolve; announceContext(); }),
    getClient: (metadata) => {
      calls.push("generated client");
      assert.equal(metadata.zk_kitchenload.apis.zk_KitchenLoad.parameters[0].name, "RequestJson");
      assert.equal(metadata.zk_kitchencommit.apis.zk_KitchenCommit.parameters[0].name, "RequestJson");
      return { executeAsync: async (request) => {
        requests.push(request);
        return { success: true, data: { ResultJson: JSON.stringify({ protocolVersion: 1, workspaceId: MICROSOFT_WORKSPACE_ID, canWrite: false, state: {
          schemaVersion: 2, revision: 0, operationIds: [], operationRequests: {},
          event: { id: "synthetic", name: "Synthetischer Test", year: 2099, dates: {} },
          sourceNotice: "Synthetischer Test", suppliers: [], articles: [], planLines: [], menu: [], invoices: [], sales: [], movements: [], orders: [], dishPlan: [], lessons: [],
        } }) } };
      } };
    },
  };
  const server = await createServer({ configFile: false, ssr: { noExternal: ["@microsoft/power-apps"] }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, plugins: [{
    name: "test-sdk-boundary", enforce: "pre",
    resolveId(id) {
      if (["@microsoft/power-apps/app", "@microsoft/power-apps/data"].includes(id)) return `\0test:${id}`;
    },
    load(id) {
      if (id === "\0test:@microsoft/power-apps/app") return "export const getContext = () => globalThis.__kitchenBootstrapTest.getContext();";
      if (id === "\0test:@microsoft/power-apps/data") return "export const getClient = (metadata) => globalThis.__kitchenBootstrapTest.getClient(metadata);";
    },
  }] });
  try {
    const { connectMicrosoft } = await server.ssrLoadModule("/src/bootstrap/microsoft.ts");
    const { getMicrosoftRepository } = await server.ssrLoadModule("/src/data/microsoft-runtime.ts");
    const connecting = connectMicrosoft();
    await contextStarted;
    assert.deepEqual(calls, ["context"]);
    assert.equal(getMicrosoftRepository(), undefined);
    finishContext({ app: { environmentId: MICROSOFT_ENVIRONMENT_ID } });
    await connecting;
    assert.deepEqual(calls, ["context", "generated client", "generated client"]);
    const repository = getMicrosoftRepository();
    assert.equal(repository.mode, "microsoft");
    assert.equal((await repository.load()).event.id, "synthetic");
    assert.deepEqual(requests[0].dataverseRequest, {
      action: "customapi", parameters: { operationName: "zk_KitchenLoad", tableName: "zk_kitchenload", body: { RequestJson: JSON.stringify({ protocolVersion: 1, workspaceId: MICROSOFT_WORKSPACE_ID }) } },
    });
    const { Zk_KitchenCommitService } = await server.ssrLoadModule("/src/generated/services/Zk_KitchenCommitService.ts");
    const result = await Zk_KitchenCommitService.zk_KitchenCommit("exact frozen request bytes");
    assert.equal(requests[1].dataverseRequest.parameters.operationName, "zk_KitchenCommit");
    assert.equal(requests[1].dataverseRequest.parameters.tableName, "zk_kitchencommit");
    assert.deepEqual(requests[1].dataverseRequest.parameters.body, { RequestJson: "exact frozen request bytes" });
    assert.equal(typeof result.data.ResultJson, "string");
  } finally {
    await server.close();
    if (priorStorage) Object.defineProperty(globalThis, "sessionStorage", priorStorage);
    else delete globalThis.sessionStorage;
    globalThis.__kitchenBootstrapTest = priorBoundary;
  }
});
