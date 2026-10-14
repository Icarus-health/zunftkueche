# Zunftküche Ausbau Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Tasks have independent reviews; implementers run sequentially.

**Goal:** Complete the usable kitchen cycle while preserving source history and preparing real Power Apps deployment.

**Architecture:** Extend the backward-compatible KitchenState and validated operation reducer; feature helpers produce needs/costs without mutating imported plans. React screens use the existing SaveController, persistence adapter boundary remains separate.

**Tech Stack:** TypeScript, React, Vite, Microsoft Power Apps SDK, Node test runner.

**Spec:** docs/superpowers/specs/2026-10-14-kitchen-complete.md

## Global Constraints
Originals unchanged; null != 0; drafts not facts; no supplier sends; no cloud mutations; stable operation IDs, revision conflicts; deployment fails closed until real Microsoft service.

## Review Focus
Unknown recipes and stock must never silently produce a complete shopping list. Generated requirements must not duplicate or overwrite imported orders. Year switching must not carry sales/receipts. Net unit prices need fractional cents. Every screen/form must preserve useful empty/error states and pending writes.

### Task 1: Validated full kitchen domain
**Files:** src/domain/state.ts; src/domain/kitchen.ts; create src/domain/workflow.ts and tests/workflow.test.mjs (split tests/modules if sensible).
**Interfaces:** Keep existing KitchenState fields/operations. Add optional Article.packSize, typed dishPlan, optional archived events, typed receipt lines. Export purchasingNeeds(state,day) returning {rows:[{articleId,required:number|null,opening:number|null,packSize:number|null,suggested:number|null,planned:number|null,missing:string[]}],complete:boolean}; stockSummary(state,articleId) returning {opening:number|null,received:number,waste:number,returned:number,consumed:number,balance:number|null}; recipeCost rounds only after summing.
Operations: dish.quantity {menuId,day,quantity}; article.save {id?,name,supplierId,unit,category,packSize,unitPriceCents}; supplier.save {id?,name,email}; menu.save {id?,name,category,priceCents}; event.create {name,year,copyPlan:boolean}; event.switch {id}; event.dates {dates}; stock.opening {articleId,quantity}; stock.return/stock.consume same payload as stock.waste; purchase.apply {day}; invoice.save {id?,supplierId,number,date?,grossCents,netCents,scope,documentUrl?,lines:[{articleId?,name,quantity,unit,netCents}]}; invoice.update {id,...same}; avoid deleting historical data, generated IDs use operation id.
- [ ] Write and run failing tests for full workflow, precision, event copy/switch, validation, idempotency/conflicts.
- [ ] Implement operations/helpers. Old schema2 seed remains readable; empty state safe; names/text lengths bounded; whole quantities for sales/dishes, positive pack sizes; net<=gross when both present.
- [ ] Show per-day requirements without using initial stock twice: Friday uses explicitly entered opening; Saturday demand remains separately shown with stock credit only when explicitly assigned, or joint purchase view; document chosen conservative semantics. No automatic sales-as-consumption. purchase.apply refuses incomplete inputs and merges only generated per-day lines, preserves manual/source lines; don't silently double buy manual coverage.
- [ ] Run all tests/build, self-review; commit only owned files; write task report.

### Task 2: Complete visible workflows
**Files:** src/App.tsx, src/screens/*.tsx, src/components/shared.tsx, src/styles.css, create feature UI modules as needed.
**Interfaces:** Consume Task1 actual operations/helper signatures. Keep SaveController semantics and no local success guesses.
- [ ] Make event selector/new-year/date forms, dynamic labels, master-data screen (suppliers/articles/menu), safe empty lists.
- [ ] Planning defaults to speise counts Fri/Sat; tabs Einkaufbedarf, existing Einkaufmengen, Rezepturen; show precise missing facts and preview before purchase.apply.
- [ ] Add editable package sizes/net unit prices precision, remove recipe ingredients in draft, make receiving/stock summary and opening/return/consume flows usable.
- [ ] Add incoming receipt form and update missing original records without duplicating; header original status/source truth; scope filtering; totals explicitly partial. Existing local originals available only in local mode, SharePoint linked records via HTTPS.
- [ ] Home dynamic actionable cards, reports day plan-vs-sales and recorded cost scope, clean print, responsiveness/accessibility. Maintain all old functionality.
- [ ] Tests appropriate for meaningful UI logic, build/self-review, commit only UI files; write report.

### Task 3: Microsoft adapter and final acceptance
**Files:** src/data/* Microsoft implementation as feasible per official SDK evidence, deployment docs/config; tests for adapter policy/conflicts/errors. No provider writes.
**Interfaces:** Existing Repository, KitchenState, Operation/CommitResult.
- [ ] Use research exact SDK APIs to implement honest deployable client boundary for real server-authorized commits; do not substitute insecure client-only permissions or fake adapter as production.
- [ ] Document exact required Dataverse resources and unresolved live setup; fail closed if unavailable. Include no credentials or private seed in build.
- [ ] Task review after each task, fix findings with implementing agent and scoped re-review.
- [ ] Full suite/build, browser workflow and responsive checks, independent whole change review and scoped fixes; preserve original hashes; package current source and concise German usage guide in outputs.
