import test from "node:test";
import assert from "node:assert/strict";
import { createServer, loadConfigFromFile } from "vite";

test("actual Vite config isolates private local API and Microsoft host plugin", async () => {
  for (const [command, mode, local, microsoft] of [
    ["serve", "development", true, false],
    ["serve", "microsoft", false, true],
    ["build", "development", false, true],
    ["build", "production", false, true],
  ]) {
    const { config } = await loadConfigFromFile({ command, mode });
    const names = config.plugins.flat(Infinity).filter(Boolean).map((p) => p.name);
    assert.equal(names.includes("local-kitchen-api"), local, `${command}/${mode} local API`);
    assert.equal(names.includes("powerApps"), microsoft, `${command}/${mode} host plugin`);
    assert.equal(config.server.port, mode === "microsoft" ? 4182 : 4173);
  }
});

for (const mode of ["microsoft", "development"]) {
  test(`actual repository selection in ${mode} development has no silent fallback`, async () => {
    const server = await createServer({ configFile: false, mode, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false } });
    const priorFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url) => { calls.push(url); return new Response(JSON.stringify({ state: { revision: 9 } })); };
    try {
      const { getRepository } = await server.ssrLoadModule("/src/data/repository.ts");
      if (mode === "microsoft") {
        assert.throws(getRepository, /Microsoft-Datenverbindung/);
        assert.deepEqual(calls, []);
      } else {
        const local = getRepository();
        assert.equal(local.mode, "local");
        assert.deepEqual(await local.load(), { revision: 9 });
        assert.deepEqual(calls, ["/api/kitchen"]);
      }
    } finally {
      globalThis.fetch = priorFetch;
      await server.close();
    }
  });
}
