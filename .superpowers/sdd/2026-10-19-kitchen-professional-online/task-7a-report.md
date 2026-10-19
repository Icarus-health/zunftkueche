# Task 7a — bounded product UX source freeze

Status: implementation and scoped source/render validation complete; independent source review and parent first-party IAB interaction/visual acceptance remain pending. Task 7 overall is NOT complete: activation, actual host/native rights/transactions, physical iPhone/camera/keyboard and restore acceptance remain separate Task 7b gates. No provider/auth/deployment/schema/license/role operations or subagents were used.

Task 6 approved source: `37acf47ff7450c696cc3f3c4156986fc5c73a180`; Task 7a base/report HEAD: `0d2e79a77d14e37fbf7a5998e256439b0545b02d`. Task 7a frozen production/test commit: **`0c8ac5a1086f5a28f67d54b57a2b58c2e9525e1f`**. Initial report/evidence commit: `f277886`. The following report-only clarification records raw-log whitespace; neither changes the source freeze.

## Boundaries and before/after rationale

- Previously closed events could still present editable prices, quantities and ordinary settings. `kitchenEditingDisabled` now disables culinary forms at their screen boundaries; App global saving state remains separate. A closure banner explains the state before inputs. Reopen, reports, event selection, original/draft reading and personal preferences retain their own controls. The existing domain/server rights remain authoritative and unchanged.
- Receiving previously selected a global order ID. The UI now derives supplier → saved delivery day → matching saved version every render; stale or foreign IDs resolve only within that context. All saved versions remain selectable, including missing-current-supplier cases, with per-version open-position counts. Historical supplier snapshots stay labelled as saved; current-name fallbacks explicitly say the historical name was not stored. Selected context is readable outside the select as well.
- Prepared versions and their count now filter by both supplier and day; switching day retains the selected planning/prepared view. Current status stays visible while all status evidence remains in expandable history. Historical-only suppliers stay reachable. No order or quantity semantics changed.
- One navigation tree serves desktop and phone. Phone navigation now has current-page text and a labelled disclosure button, expanded state, active-item focus on opening and Escape/close focus return. Navigation still goes through the existing draft guard. Parent must exercise this in the actual rendered page.
- Delivery work choice precedes the receiving rows. Sales tabs/input precede closure history; closure/reports have their own existing-content tab. A closed event opens that tab by default, including from the Home primary action. Open-point details, all economic evidence, closure records, experiences and price corrections remain accessible without long histories pushing daily input down the page.
- Friday/Saturday keep the original desktop table and single control tree. Scoped mobile day cells use two columns above 360 px and stack at narrower widths; quantities retain unique field names. Parent must check actual readability at 390 px and 200% zoom.
- Settings keep one atomic draft and guard. Ordinary fields have a save action before the collapsed location mapping section; that section still exposes every persisted historical mapping, including names not found in current transactions. Deactivation wording now says “Für neue Buchungen deaktivieren”. Compact mode reduces mobile card spacing while keeping input targets.
- Task 6 M1 is addressed through display-only supplier/date/money labels in both proposal and review evidence. Raw text quotations and stored integer cents are untouched. File limits moved to explicit details; buttons/checkboxes use the quiet turquoise treatment. Empty final-review clutter is absent; only an acknowledged, unchanged reviewed draft enters the final review step. The user may return through guarded “Angaben weiter bearbeiten”. Original view → manual comparison → saved draft → a separate final acceptance checkbox remains required. AcceptanceSession, pending-owner gate, fresh-source checks, exact replay and economic separation were not changed. No OCR/cloud recognition or new promise was introduced.

Files: App, EventClosure, ReceivingList, Analysis, Deliveries, Home, Masters, Orders, Planning, ReceiptIntake, ReceiptReview, Receipts, Settings, styles; UI helpers kitchen-editing, order-selection, receipt-display and receipt-intake-draft; eight meaningful regression cases in professional-ui.test.mjs; five full-App synthetic fixture files. See source commit for the exact 24-file diff.

## Exact validation and evidence

All commands below ran from `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app`. All final commands exited 0. Logs are in `task-7a-evidence/` next to this report.

1. Initial new regression set: `node --experimental-strip-types --test tests/professional-ui.test.mjs` → **8 pass, 0 fail** (`initial-professional-ui.log`). These are context-selection, history/quantity preservation, closure/reopen/editability, raw-draft review gating and display/provenance cases, not layout mirror snapshots.
2. Final amended-area suite (exact command):

```sh
node --experimental-strip-types --test tests/professional-ui.test.mjs tests/mobile-layout.test.mjs tests/receiving.test.mjs tests/order-context.test.mjs tests/order-status.test.mjs tests/settings.test.mjs tests/event-close.test.mjs tests/event-context.test.mjs tests/draft-guard.test.mjs tests/draft-save.test.mjs tests/discard-dialog.test.mjs tests/preferences.test.mjs tests/receipt-intake-draft.test.mjs tests/receipt-review.test.mjs tests/receipt-acceptance-pending.test.mjs tests/receipt-idempotence.test.mjs tests/receipt-parser.test.mjs tests/workflow-ui-integration.test.mjs
```

Result **92 pass, 0 fail, 0 skipped**, 2247.684708 ms (`focused-final.log`). These are runner executions: `receipt-idempotence.test.mjs` imports the five receipt-review cases, so five executions repeat those cases; do not call this 92 unique designs. SSR assertions prove rendered control attributes/content and one input tree, not browser layout, focus or device behavior. The 8-case initial run overlaps this final suite.

3. `npm run build` → TypeScript + production Vite build passed, 4665 modules, 399 ms Vite stage (`build-final.log`).
4. `npm run build -- --mode microsoft` → TypeScript + Microsoft-mode production build passed, 4665 modules, 258 ms Vite stage (`build-microsoft-final.log`). No deployment occurred. Current ignored dist is the latter build.
5. Strict source/fixture typecheck:

```sh
npx tsc --ignoreConfig --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --jsx react-jsx --allowImportingTsExtensions --skipLibCheck src/vite-env.d.ts tests/fixtures/professional-state.ts tests/fixtures/professional-repository.ts tests/fixtures/professional-app.tsx tests/fixtures/professional-vite.config.ts tests/fixtures/receipt-review-harness.tsx
```

Passed with empty output (`fixture-typecheck-final.log`). Development corrections: TS7 required `--ignoreConfig` and the Vite env declaration; the fixture upload return was corrected to DocumentRef; config uses URL without unavailable Node type imports. An implicit status-history entry type was made explicit. These initial compile errors were fixed before final builds.

6. `npx vite build --config tests/fixtures/professional-vite.config.ts` → isolated fixture build passed (`build-fixture-final.log`), output `.superpowers/probes/task7a-fixture-dist`. The test-only combined JS chunk emits the >500 kB warning; this is disclosed, not treated as a production build warning or device-speed proof. Source inspection found that the first fixture alias did not catch SaveController's `./repository.ts`; it was corrected before source freeze so both App and SaveController use the same fake repository/RejectedError. Vite resolver proof (createServer with this config, resolveId for the two imports, then close; never listen) is in `fixture-alias-proof.log`. The fixture has no local API middleware or Microsoft initialization. The production receipt screen contains its legacy local-original link; the isolated fixture has no handler for that route and does not prove that link/provider readability.
7. `node --experimental-strip-types .superpowers/sdd/2026-10-19-kitchen-professional-online/task-7a-evidence/fixture-adapter-smoke.mjs` → bounded in-memory adapter smoke passed: closed archived event reopened, eight versions retained, reviewed draft accepted, exact replay leaves one invoice, null identity (`fixture-adapter-smoke.log`). This is NOT a native transaction or browser test.
8. Production/test `git diff --check` and staged equivalent passed before source commit. Staging the report/evidence subsequently reported one trailing space in the unmodified Vite warning line `build-fixture-final.log:11`; the raw log is retained exactly, so the whole evidence diff is not whitespace-clean. Source guard compared 133 protected tracked files from the Task 6 base (server, tools, data/domain/hooks/generated, acceptance session and configuration) with **0 mismatches**. `.local-state/state.json` SHA-256 is still **09ac7edb02e899618bb6a802c33056d0460c5c428258e96739e4d4a26734d300**, matching Task 6 parent proof (`sourceguard.json`). Historical ignored tools were not edited or executed. No C# changed, so no server suite/build was rerun; prior CSSM limitation is not newly resolved.

## Parent first-party IAB handoff

Use an immutable copy/archive of source commit `0c8ac5a` plus current report if needed. The writer ran no browser, Playwright, CDP, browser install, Microsoft action or device test.

Full-App fixture startup (no local API middleware, no SDK/provider adapter, synthetic data only in memory):

```sh
npx vite --config tests/fixtures/professional-vite.config.ts
```

Open `http://127.0.0.1:4197/tests/fixtures/professional-app.html` through the parent's authorised IAB. The repository alias is TEST CONFIG ONLY; the production entrypoint/config has no fixture switch. HTML explicitly labels the in-memory fixture; reloading resets it. No confirmed identity is supplied, so production personal-preference functions do not read/write a user preference record. Synthetic document references are never fetched remotely; originals are supplied from the fixture Map. Upload testing in this fixture stores only in that Map. The initial image is a 1×1 PNG and establishes component flow only, not real original legibility.

Suggested bounded acceptance:

- 1280×720 and 390×844: initial event/page/first work action; all eight menu destinations, open focus, Escape return, guarded navigation with a dirty quantity/settings draft. Check 200% zoom and <360 px stacking. No full WCAG or physical keyboard claim from source tests.
- Planning and sales: Friday/Saturday visible together on desktop; compare both values in one phone card without duplicate inputs; try raw invalid value then guarded navigation and keep editing.
- Receiving: choose Testmarkt Nord → Freitag → Fassung 1: ordered 120, received 110, open 10. Switch Saturday and supplier, then return to the old Friday version; all eight versions stay reachable. Testbäckerei Süd/Samstag/Fassung 1 has no saved supplier-name snapshot, and must show the explicit current-name fallback. The newer snapshot remains labelled saved.
- Prepared versions: supplier/day count 2; switch day without losing the prepared tab; expand full status history and preview/export historical content.
- Select `TEST · Abgeschlossener Abend`: culinary fields disabled, originals/drafts readable, settings preference controls usable, owner “Mit Grund wieder öffnen” usable in Abschluss; reopen and confirm inputs become enabled. Closure history has nine records; experiences and current-event Friday sale-price history each have ten records to inspect in details.
- Settings: ordinary event save before mapping details; mapped historic names include `Alte Küche`, `Historischer Teststand`, `Früherer Außenstand`. Change a mapping and ordinary field, then save once/guard navigation; do not infer real provider persistence from fixture state.
- Belege → Foto/PDF → saved `TEST-7A` draft. Open its original, mark manually reviewed, review supplied-text display, check comparison, save. The long editing form is replaced by final review, and final confirmation still needs a separate checkbox. Return to editing uses the guard. Accepted review remains read-only. The open and closed events each have a synthetic draft/original.

For the already established held-original/rejected/lost-ack path use the unchanged `tests/fixtures/receipt-review-harness.html` with the same isolated Vite server. Its test controls remain available; collapse the test-only JSON panel to avoid its known pre overflow. After reviewed save the raw form is intentionally absent; assert that “Angaben weiter bearbeiten”, draft switching and new draft are locked during acceptance, with guarded external navigation still denied. After rejection return to edit and verify raw values. Release/retry through the actual fixture acknowledgement callback, then inspect one invoice and accepted draft. Do not infer a product bug from direct fake replay bypassing that callback.

Parent still must record page identity, meaningful rendered content, no framework overlay, relevant console health, screenshots and actual target interactions. The source gate and Task 6 pending/source protections are preserved; none of these source/fake checks replaces real Microsoft per-user access, transaction rollback, original/version availability, export/backup/restore, representative-real-receipt or physical iPhone acceptance.
