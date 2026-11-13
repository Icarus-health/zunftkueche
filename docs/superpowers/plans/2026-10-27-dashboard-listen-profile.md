# Dashboard, Listen und Lieferantenprofile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** Improve the kitchen dashboard, compact article list and supplier profiles while retaining all production data.

**Architecture:** Extend the existing SPFx TypeScript views and SharePoint envelopes. New supplier fields are optional; use schema 4 on modified supplier records so an older client refuses to overwrite them. Preserve legacy notes and all identifiers.

**Tech Stack:** TypeScript, SCSS, SharePoint lists, Teams, existing Node tests.

**Spec:** docs/superpowers/specs/2026-10-27-dashboard-listen-lieferantenprofil.md

## Global Constraints

No paid services or destructive migration; retain existing data and CI. Provide usable desktop and narrow layouts.

## Review Focus

- Legacy supplier without new fields loads and edits without losing notes (profile tests).
- Older clients reject changed supplier envelopes instead of stripping new fields (storage tests).
- Multiple offers per article remain independently visible and editable (view tests).
- Missing prices and uncounted items are not presented as zero (view tests).
- Empty season and archived season remain safe (dashboard tests).

### Task 1: Supplier profiles and safe persistence

**Files:** `src/kitchen/model.ts`, `domain.ts`, `forms.ts`, `view.ts`, `sharepoint.ts`; tests in `tests/profile-dashboard.test.mjs`.

- [ ] Add failing tests for optional fields, retained notes, profile editing and schema 4.
- [ ] Implement validated optional contact/address fields, profile view and schema guard.
- [ ] Run focused tests and resolve failures.

### Task 2: Dashboard and compact list

**Files:** `src/kitchen/workspace.ts`, `view.ts`, `src/webparts/kitchen/KitchenWebPart.module.scss`; tests in `tests/profile-dashboard.test.mjs`.

- [ ] Add failing tests for dashboard figures, article search and multiple offers.
- [ ] Implement dashboard cards and searchable list with expandable offers.
- [ ] Run focused and full tests, then build production package.

### Task 3: Verify and release

- [ ] Verify local synthetic desktop and narrow-screen flows and console.
- [ ] Update existing app package only after data-preservation checks, then verify in Teams; report actual release state.
