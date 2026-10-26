# Zunft Warenwirtschaft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Integrate the approved complete kitchen workflow and association CI into the existing SPFx app.
**Architecture:** Preserve existing articles, suppliers, orders, counts and their storage. Add typed business documents in a separate app-owned scoped SharePoint journal. Complete bounded documents are atomic commit units; confirmed documents are immutable. Domain, file readers, storage and UI remain separate.
**Tech Stack:** Existing SPFx 1.23.2, TypeScript, SCSS, Node22, JSZip, locally bundled PDF reader and CI assets.
**Spec:** ../specs/2026-10-26-zunft-warenwirtschaft-design.md and neutral-system-import.md in this plan directory.

## Global Constraints
- Existing accounts, existing SharePoint access; no paid services/new permissions.
- Preserve originals and legacy data. No real migration, public push or production publication during development.
- Six primary navigation areas; every visible action must work.
- Real dates, menu orders as planning, sales as actuals, recipe consumption as estimate, counts as dated observations.
- Preserve unknown/zero distinction, source/version snapshots, ETags, stable retry identity and readback.
- No runtime CDN, external font request or vendor login.

## Review Focus
- Bill and delivery cannot double stock; refund does not return physical goods automatically.
- Concurrent users/retries cannot silently overwrite or duplicate documents.
- Changes to prices, recipes and mappings cannot rewrite old values.
- Menu/POS data and weekly/daily reports cannot double demand/revenue/consumption.
- Counts are observation anchors, not additive receipts; late posting of earlier events must preserve them.

### Task 1: Business domain and snapshots
**Files:** new src/kitchen/ww/model.ts, domain.ts; tests/ww-domain.test.mjs and support/ww-data.mjs.
**Interfaces:** WwDocument discriminated union for slots/rules, templates, prices, recipes/plans, bills, movements and system profiles/imports. validateDocument, effectiveOffer, templateOrders, recipeDemand, stockProjection, importEffects.
- [ ] Write tests for arbitrary dates, template copies, price history, recipe yield/missing units, count ordering, transfers and menu/sales separation.
- [ ] Observe RED for missing APIs; implement pure functions and immutable snapshots.
- [ ] Run full suite, compare expected values, commit and ledger result.

### Task 2: Neutral table reader and preview
**Files:** src/kitchen/imports/model.ts, csv-reader.ts, xlsx-reader.ts, preview.ts, identity.ts; system-file-reader.test.mjs and system-import-preview.test.mjs.
**Interfaces:** readCsv, listWorkbookSheets, readWorkbookSheet, previewSystemImport and canonicalImportKey; retain signatures from neutral-system-import.md.
- [ ] Failing tests: BOM, delimiters/quotes, sheets/shared strings/formulas, headers, decimals/dates, unknown mapping, bounds.
- [ ] Observe RED; implement isolated reader without changing old master CSV behavior.
- [ ] Test canonical IDs on renamed/reordered files, overlap, status/refund, gross/net; implement, full suite, commit.

### Task 3: Scoped, versioned business storage
**Files:** src/kitchen/ww/store.ts; compose into SharePointStore; ww-store.test.mjs and fake provider.
**Interfaces:** WwStore.initialize(), load(seasonId), save(document, previous, operationId), attachOriginal; indexed scope/key, ownership marker, stable original filename.
- [ ] Tests RED: missing/forbidden/foreign list, paging/filter scope, stale writes, immutable confirmation, lost response and duplicate bill/import.
- [ ] Implement confirmed bounded documents as single commits, scope metadata, ETags and readback; no partially confirmed lines.
- [ ] Test size and archive rejection before write; full suite, commit.

### Task 4: Purchasing UI and CI
**Files:** ww/procurement-view.ts, controller.ts; existing view/workspace/forms/SCSS; local logo/fonts; ww-view.test.mjs.
**Interfaces:** Inline scoped views in existing main, mutations through WwStore with frozen retry payload. Real slot dates feed old order editor; price versions create snapshots.
- [ ] Tests RED for any weekday, supplier rules, editable templates, multi-date quantities, price review.
- [ ] Implement concrete forms/actions and price application while preserving old order/receipt/count flows.
- [ ] Bundle association logo and licensed Montserrat, blue/white tokens and responsive large controls. Full suite/build/commit.

### Task 5: Recipes, planning, stock
**Files:** ww/recipes-view.ts, stock-view.ts, controller.ts; ww-workflows.test.mjs.
**Interfaces:** Confirmed recipe versions and per-date plans produce reviewed demand; movements incoming/return/waste/internal/transfer. Legacy receipts derive once by receipt ID; counts remain anchors.
- [ ] Tests RED for recipe creation/yield, missing conversion/price, transfer conservation and count chronology.
- [ ] Implement actual forms, demand-to-order draft and source-labelled stock projections; no separate production booking.
- [ ] Full suite/build/commit.

### Task 6: Bills and neutral system UI
**Files:** ww/bill-view.ts, system-view.ts, pdf-reader.ts, controller.ts; ww-bills.test.mjs, system-import-view.test.mjs.
**Interfaces:** PDF text to editable proposal/original attachment; bill matching has no stock effect. Neutral table preview/profiles/mappings and immutable import rows.
- [ ] Tests RED for invoice proposals/sums/matching, number/hash duplicates and optional price update; implement locally bundled reader/worker.
- [ ] Tests RED for file→sheet→columns→product→review→commit, menu separation/overlap/frozen retry; implement.
- [ ] Scan without text offers manual review, not false recognition. Read-only original-PDF check, synthetic browser files, full suite/build/commit.

### Task 7: Report, export and acceptance
**Files:** ww/reports.ts; README/design-qa.md, fixture/server and output package.
**Interfaces:** Source-backed quantities, labelled price basis, missing-input warnings; CSV export escapes formulas; backup keeps versions/origins distinct from file backup.
- [ ] Tests RED for reports/export, implement, run full suite.
- [ ] Browser full synthetic procurement→delivery→bill→sales/recipe→count path, save/reload, narrow layout and console.
- [ ] Full production build/package, one independent whole-change review, TDD fix important findings.
- [ ] Save working preview, source/package/evidence; distinguish local acceptance from Teams publication.
