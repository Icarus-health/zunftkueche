import test from "node:test";
import assert from "node:assert/strict";
import { startApplication, usesMicrosoft, requireMicrosoftContext, MICROSOFT_ENVIRONMENT_ID } from "../src/bootstrap/start.ts";
import { showBootstrapScreen } from "../src/bootstrap/screen.ts";

test("every production mode and explicit Microsoft development require Microsoft", () => {
  for (const mode of ["production", "development", "local", "microsoft", ""]) {
    assert.equal(usesMicrosoft(false, mode), true);
  }
  assert.equal(usesMicrosoft(true, "microsoft"), true);
  assert.equal(usesMicrosoft(true, "development"), false);
});

test("mount waits for completed Microsoft connection", async () => {
  const calls = [];
  let finish;
  const pending = startApplication(true, {
    connectMicrosoft: () => new Promise((resolve) => { calls.push("connect"); finish = resolve; }),
    mount: async () => calls.push("mount"),
    showError: () => calls.push("error"),
  });
  assert.deepEqual(calls, ["connect"]);
  finish();
  await pending;
  assert.deepEqual(calls, ["connect", "mount"]);
});

test("failed Microsoft bootstrap never mounts or starts local data", async () => {
  const calls = [];
  await startApplication(true, {
    connectMicrosoft: async () => { throw Error("private provider detail"); },
    mount: async () => calls.push("mount/local"),
    showError: (...details) => { assert.deepEqual(details, []); calls.push("friendly error"); },
  });
  assert.deepEqual(calls, ["friendly error"]);
});

test("standalone development mounts without loading Microsoft SDK", async () => {
  const calls = [];
  await startApplication(false, {
    connectMicrosoft: async () => calls.push("Microsoft"),
    mount: async () => calls.push("local"),
    showError: () => calls.push("error"),
  });
  assert.deepEqual(calls, ["local"]);
});

test("host context accepts only the fixed environment and has a bounded wait", async () => {
  await requireMicrosoftContext(async () => ({ app: { environmentId: MICROSOFT_ENVIRONMENT_ID.toUpperCase() } }));
  for (const context of [undefined, {}, { app: {} }, { app: { environmentId: "other" } }]) {
    await assert.rejects(requireMicrosoftContext(async () => context), /Umgebung/);
  }
  await assert.rejects(requireMicrosoftContext(async () => { throw Error("denied"); }), /denied/);
  await assert.rejects(requireMicrosoftContext(() => new Promise(() => {}), 5), /Startzeit/);
});

test("bootstrap screen provides friendly status/error and working reload without clearing storage", () => {
  class Element {
    children = [];
    attributes = {};
    listeners = {};
    setAttribute(k, v) { this.attributes[k] = v; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(event, callback) { this.listeners[event] = callback; }
  }
  const oldDocument = globalThis.document, oldWindow = globalThis.window;
  let reloads = 0;
  globalThis.document = { createElement: () => new Element() };
  globalThis.window = { location: { reload: () => reloads++ } };
  try {
    const root = new Element();
    showBootstrapScreen(root);
    assert.equal(root.children[0].attributes.role, "status");
    assert.match(root.children[0].children[0].textContent, /wird gestartet/);
    showBootstrapScreen(root, true);
    const panel = root.children[0];
    assert.equal(panel.attributes.role, "alert");
    assert.match(panel.children[0].textContent, /konnte nicht starten/);
    assert.match(panel.children[1].textContent, /über Microsoft öffnen/);
    assert.equal(panel.children[2].textContent, "Erneut laden");
    panel.children[2].listeners.click();
    assert.equal(reloads, 1);
  } finally {
    globalThis.document = oldDocument;
    globalThis.window = oldWindow;
  }
});
