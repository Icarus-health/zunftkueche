# Kitchen Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement selected visual direction with reliable purchasing, partial receipts and a resumable counting list on the existing SPFx app.
**Architecture:** Preserve existing model/store/forms. Add small operations domain and form modules, version-safe receipt storage, one optional inventory-session list, and a new workspace layout. Reuse the production code in the local fixture.
**Tech Stack:** SPFx 1.23.2, TypeScript, SCSS, Node 22, Node test runner/jsdom.
**Spec:** ../specs/2026-10-26-kitchen-workspace-design.md

## Global Constraints
- No additional paid services; no Excel import; preserve existing solution/component IDs and data.
- New version 1.2.0. Existing envelope schema 1 remains readable; receipts use schema 2 to fence old clients.
- Preserve ETag checks, idempotency, readback and synthetic-data separation.
- No production publication or permission changes as an unannounced side effect.

## Review Focus
- Two users receiving the same remaining quantity must not overreceive or overwrite each other.
- Retrying a committed-but-unacknowledged operation must not change timestamp or duplicate quantities.
- A blank count must not become zero; drafts must not appear as observed stock.
- Older clients must not strip recorded deliveries, and copied orders must start without deliveries.
- Existing sites without the extra inventory list must remain readable; denied reads must not look like empty data.

### Task 1: Reliable receipt and inventory domain/storage
**Files:** src/kitchen/model.ts, domain.ts, sharepoint.ts; new operations.ts; tests/operations.test.mjs and operations-store.test.mjs; support/fake-sharepoint.mjs.
**Interfaces:** Receipt on Order; InventorySession/InventoryLine; Workspace.inventories/inventoriesReady optional; `receivedQuantity`, `deliveryState`, `validateReceipt`, `countQuantity`, `validateInventory`, `observedCounts`; `SharePointStore.saveReceipt` and `saveInventory`.
- [ ] Write tests for partial/excess/duplicate receipts, reset on copy, blank/zero/pack counts, archive and draft visibility.
- [ ] Run new tests and observe failures from missing behavior.
- [ ] Implement domain/storage with version/readback guarantees.
- [ ] Run full test suite and commit a verified change.

### Task 2: Functional workspace UI matching selected image
**Files:** src/kitchen/view.ts, forms.ts, markup.ts; new workspace.ts and operation-forms.ts; KitchenWebPart.module.scss; tests/view.test.mjs; browser-fixture.mjs.
**Interfaces:** Real dashboard/receipt/count data; nav Heute/Einkauf/Bestand/Planung/Auswertung/Verwaltung; existing article/supplier actions remain supported.
- [ ] Add behavioral UI tests for task navigation, receipt and counting draft workflows, filtering and stable retry payload.
- [ ] Observe new tests fail, then implement UI and styles.
- [ ] Update the fixture with realistic synthetic scenarios, using no external services or real records.
- [ ] Run full tests and production build; commit.

### Task 3: Browser and visual acceptance, package and handoff
**Files:** design-qa.md, README/usage notes, package version/config, local output artifacts.
- [ ] Open the selected image and run the existing local fixture against current compiled production code.
- [ ] Exercise key paths at desktop and narrow viewports; check console errors.
- [ ] Compare the selected target and implementation in one comparison view; fix important mismatches and recapture.
- [ ] Run full tests and final production packaging, obtain one fresh whole-change review, address material findings.
- [ ] Save the working preview, package and usage notes; state local versus published evidence explicitly.
