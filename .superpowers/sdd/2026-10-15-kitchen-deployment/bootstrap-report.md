# Actual generated Microsoft client bootstrap

Base: `2f7651f` (`Record bounded failed Commit diagnostics without retry`).
Owned commit: the commit containing this report, titled `Connect generated Microsoft services before app mount`; exact SHA is returned in the implementer handoff. No amend is planned.

## Scope and behavior

- Kept the existing kitchen application and its layouts. Added a small pre-mount loading/error screen only.
- Production always selects Microsoft, including a build requested with another Vite mode. Explicit `npm run dev:microsoft` also requires Microsoft. Private standalone `npm run dev` retains the existing local repository/API.
- Before importing App or mounting its React root, Microsoft startup awaits the real SDK `getContext()`, requires environment `5684204c-3254-ec15-93f4-276ec50cc65b`, then imports the actual generated classes and calls `configureMicrosoftRuntime` for workspace `45deaf94-5661-4110-8f16-3d2678c09f04`.
- Host context has a 15-second bound because the installed default bridge can otherwise wait indefinitely outside its host. Rejection, mismatch, missing context, timeout, generated-module import failure or pending-store configuration failure leaves the application unmounted and shows generic German guidance plus `Erneut laden`. Raw provider details are not passed to this screen. Reload does not clear session storage.
- Runtime repository selection independently fails closed in Microsoft development and production. The production static guard also removes local load/commit implementations from the output. No local fallback is triggered by Microsoft startup failure.
- Existing required sessionStorage, pending-request bytes, replay and frozen-request semantics remain in the existing Microsoft runtime/repository; no persistence protocol or candidate logic changed.
- Existing App owns the initial KitchenLoad request after mount and retains its established load/error/retry behavior. Pre-mount validation covers host readiness, correct environment and runtime configuration; it does not claim that a successful host context proves provider data access.

## Actual SDK and generated artifacts

Read the installed SDK/package declarations and runtime implementations. `@microsoft/power-apps` is locked at **1.5.0**; its `/app` exports are **getContext, setConfig**. `IConfig` only supplies an optional logger. There is no `initialize` export and none was invented or used. `getContext()` creates/uses the official host bridge.

Read and included without manual edits:

- `src/generated/services/Zk_KitchenLoadService.ts`: static `zk_KitchenLoad(RequestJson: string)` returns `Promise<IOperationResult<Record<string, unknown>>>`.
- `src/generated/services/Zk_KitchenCommitService.ts`: static `zk_KitchenCommit(RequestJson: string)` has the same generated result shape.
- Both generated model files and generated index.
- `.power/schemas/appschemas/dataSourcesInfo.ts` and the two actual generated Dataverse schemas.
- Actual `power.config.json`: exact environment preserved, `appId: null`, actual database references preserved; no app ID, connector, metadata or API signature fabricated.

Generated service clients are created only after the validated host context. Both actual classes satisfy the existing optional `data.ResultJson` runtime contract, which still performs response validation.

## Development / package reconciliation

`npm run dev:microsoft` uses the installed official `powerApps()` Vite plugin, port **4182**, loopback host, strict port, and **no localKitchenApi**. This matches the pa-generated `localAppUrl` port and avoids the known unrelated listener on 4173. The official plugin prints its host Local Play URL. Standalone `npm run dev` retains port **4173** and its local API without the Microsoft plugin. Every Vite build uses the official plugin and relative asset base.

Root's pa-added duplicate CLI declaration was reconciled into exactly one devDependency, `@microsoft/power-apps-cli: 1.3.0`. Lockfile metadata and development flags were regenerated offline. All locked package versions remain unchanged, including SDK 1.5.0 / CLI 1.3.0 / Vite plugin 1.0.13. Existing ignore rules already cover dist, node_modules, `.env*`, local working state, QA and SDD scratch state; no new ignore is needed for actual generated metadata, which is included.

## Checks and results

Relevant React best-practices, frontend testing/debugging and verification-before-completion skills were read. Browser actions belong exclusively to Root for this task, so implementer checks are local code/build/DOM-unit evidence, not rendered acceptance.

Final commands:

1. `node --input-type=module -e 'import("@microsoft/power-apps/app").then(m=>console.log(Object.keys(m).sort().join(", ")))'` → `getContext, setConfig`.
2. `npm install --package-lock-only --ignore-scripts --offline` → exit 0, no package version upgrades; installed audit reported zero vulnerabilities.
3. `npm run test:bootstrap` → **10 passed, 0 failed**. Includes actual generated service classes/metadata via Vite resolution with only the SDK boundary replaced; verifies host-before-generated-client ordering, exact load/commit operation/RequestJson mapping and ResultJson use, bootstrap connection-before-mount, failed connection never mounts, mode decisions, wrong/malformed/rejected/timed-out context, friendly error/reload, actual Vite plugin/API isolation and 4182/4173 ports, actual Microsoft-dev repository fail-closed and private local repository flow.
4. `npm run test:microsoft` → **31 passed, 0 failed**, including storage requirement, ambiguous pending retention/retry, exact frozen bytes, rejection recovery and runtime identity.
5. `node --experimental-strip-types --test tests/repository.test.mjs tests/persistence.test.mjs` → **4 passed, 0 failed**, including local restart, concurrent versions and rejected edits.
6. `npm run build` → exit 0, TypeScript check succeeded; final Vite build **4631 modules**, **9 output files**, no source maps. Final build after the port alignment completed in 423 ms (warm build).
7. `git diff --check` → exit 0.

The production output and dependency-version scan was run with Python over every dist file. It asserted zero matches for `(source2026|import/2026|2026\\.json)`, `(/Users/|/Volumes/|/private/)`, `\\.local-state`, `(client_secret|access_token|refresh_token|BEGIN [A-Z ]*PRIVATE KEY)`, and exact local repository load/commit endpoint literals; asserted zero `*.map`; compared every lockfile package version against `git show HEAD:package-lock.json` for equality. All assertions passed. These are scoped marker checks, not a general secret scanner.

One existing dormant `/api/kitchen/receipt/` link remains in the unchanged receipt UI, guarded by repository mode `local`. There is no production local repository and no local load/commit fallback in the bundle. This existing conditional UI link was deliberately left within the agreed no-layout/no-UX-change scope.

Early generated-mapping test attempts failed because Vite externalized the SDK before the test stub could intercept it, and the first harness opened an unnecessary HMR listener. The harness was corrected to a pre-resolution SDK boundary, disabled HMR/WebSocket and dependency discovery, and explicitly awaited the context-start event. Final focused runs above have no listener error or asynchronous test failure. No application workaround or provider access was used to fix the harness.

## Ownership and remaining work

Only client bootstrap/main, repository mode guard/comment, tiny bootstrap-screen CSS, Vite config, focused bootstrap tests, package/lock reconciliation, real generated metadata/config and this report are in the owned commit. Root's README/status/preflight/spec/plan files remain untouched and unstaged. No server, Acceptance, Deploy, domain, source import, security grant, plugin registration, provider account, auth, browser, push, publish or share action occurred; no helpers were used.

Root must independently review the immutable owned commit before its private push. Root's actual Load success and failed Commit with unchanged revision zero are supplied context, not implementer verification. The provider Commit diagnosis and actual hosted browser startup/storage/reload acceptance remain open. This report does **not** claim publication, working live Commit, end-to-end acceptance or live readiness.
