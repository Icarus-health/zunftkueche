# Supplier Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver the approved simplified supplier-order workflow in the existing association app.
**Architecture:** Extend existing Order/OrderLine with delivery schedules and recipe contributions; retain canonical total quantity. Keep persistence versioned in the current lists and preserve legacy orders. Reuse production code in browser fixtures.
**Tech Stack:** SPFx 1.23.2, TypeScript, SCSS, Node 22, existing Node/jsdom tests.
**Spec:** ../specs/2026-10-26-supplier-workflow.md

## Global Constraints
- No additional paid services, no new permission grants, no deletion or automatic merging of existing records.
- SPFx 1.23.2; version 1.4.0; preserve solution/component IDs.
- Schema 3 fences scheduled orders from old clients; retain ETag, idempotency, readback and archive protection.
- Separate local/package evidence from cloud and Teams evidence.

## Review Focus
- Blank versus zero allocations and invalid/missing dates must never silently change ordered quantities.
- Retrying a multi-supplier plan application after a partially acknowledged save must not duplicate demand.
- Replanning or manual edits must preserve manual quantities and avoid double-counting existing stock.
- Receipts for Wednesday must not consume Friday's remaining allowance without an explicit date choice.
- Legacy documents and annual copies must preserve history without carrying old receipts or internal notes to supplier output.

### Task 1: Scheduled supplier orders, persistence and PDF
**Files:** src/kitchen/model.ts, domain.ts, operations.ts, sharepoint.ts; new supplier-orders.ts, supplier-pdf.ts; tests/supplier-orders.test.mjs, supplier-store.test.mjs.
**Interfaces:** `Delivery`, `Order.deliveries`, `OrderLine.schedule`, contribution metadata; `scheduledOrder`, `validateSchedule`, `copyScheduledOrder`, `deliveryRemaining`, `supplierPdf`.
- [ ] Add failing tests for schedule sums, unknown values, duplicate dates/IDs, per-date receipts, annual date reset/price snapshots, PDF contents and repeat/stale writes.
- [ ] Run targeted tests and observe RED; implement domain, persistence and local PDF generator.
- [ ] Run full probe tests, commit and record task completion.

### Task 2: Unified order workspace and year reuse
**Files:** src/kitchen/view.ts, forms.ts, workspace.ts, operation-forms.ts, KitchenWebPart.module.scss; new supplier-forms.ts; tests/supplier-ui.test.mjs.
**Interfaces:** one matrix editor for all order entry paths; date-specific receiving; copy editor for scheduled orders; existing legacy paths remain readable.
- [ ] Write failing behavioral UI tests for matrix edits, adding dates/articles, PDF, prior-year date confirmation, receiving and simplified navigation.
- [ ] Implement integrated matrix/detail/annual copy, contextual tools and stock notes.
- [ ] Run full probe tests, commit and record task completion.

### Task 3: Recipes, procurement and import/receipt transitions
**Files:** src/kitchen/ww/controller.ts, plan-procurement.ts, operations-view.ts, bills-view.ts, table-wizard.ts; tests/supplier-procurement.test.mjs and supplier-ui.test.mjs.
**Interfaces:** `mergePlanOrders` with explicit target order IDs and persisted contributions; live recipe costing and inline ingredient creation; consistent invoice context and profile-purpose behavior.
- [ ] Write failing tests for repeat/changed plan application, manual additions, competing stock allocation, two suppliers, inline recipe ingredients/cost, purpose override and filtered bill links.
- [ ] Implement and connect all transitions to the existing order and storage APIs; preserve retry payloads.
- [ ] Run full probe tests, commit and record task completion.

### Task 4: Release verification and delivery
**Files:** version/config files, browser fixture, usage and release notes; output package outside repo.
- [ ] Browser-check full annual-order/recipe/PDF/receipt/count flow and responsive layout; check console.
- [ ] Run production build and tests; inspect generated PDF and package.
- [ ] Obtain one final independent review, fix important findings with regression tests.
- [ ] Commit verified release, provide preview and app package; complete cloud update/Teams check only if the existing authorized connection permits it, otherwise state concrete remaining deployment boundary.
