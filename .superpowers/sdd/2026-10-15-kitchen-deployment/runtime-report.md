# Task3 local runtime acceptance helper report

Status: implemented locally; no OAuth, browser, Dataverse API, application commit, role/grant, or provider mutation was executed by this worker. Root alone controls provider execution and authorization. Independent review is required before either explicit online write phase. Live runtime acceptance remains pending; this report does not authorize release.

Owned deliverables: `server/Acceptance/` and `server/Acceptance.Tests/`, including pinned transitive lock files and the operator README. They reference the reviewed Deploy project instead of editing it. The sibling d570202 metadata correction is inherited through this reference. No frontend, domain, plugin, Deploy, Deploy.Tests, registration, source import, or Root document was edited by this worker.

Implemented phases:

- Default/offline, even for `--phase runtime`, unless Root supplies `--execute`. Local pinned contract/source/package validation precedes authentication. Online `inspect` is provider read-only.
- `prepare-canaries`: exact target/MSAL ObjectId/German/EUR verification, exact existing table/key metadata and both Standard tables, then absence of all kitchen table processing steps, named guards, and any KitchenWriteGuard handler registration. Creates at most two fixed synthetic workspace rows and two fixed synthetic operation rows. Each canonical fixed-ID GET either validates/reuses exact contents or permits one POST followed by independent GET. Ambiguous results stop even if the row is visible. No upsert, cleanup, or real application workspace creation occurs here.
- `runtime`: repeats target and full metadata/backend/source-anchored workspace verification, requires exactly the ten known pending runtime gaps, strict six active C/U/D guards and no extra kitchen-table steps, the direct built-in System Administrator template GUID, exact canaries, and fixed absent IDs. Uses actual KitchenLoad and the reviewed Protocol. One event.switch commit preserves current business data, increments revision once, and creates one matching actor/hash/revision receipt. The confirmed request is replayed byte-for-byte in memory to prove idempotence; a different fixed operation with the old expected revision must conflict unchanged.
- Direct denial coverage comprises 13 named probes per table, 26 total: Create/Update/Delete; existing/missing Upsert; one/two-row CreateMultiple; one/two-row UpdateMultiple; existing singleton, missing singleton, mixed two-row UpsertMultiple; and two-canary DeleteMultiple. Snapshot fingerprints/counts/revisions bracket every attempt. Guard rejection requires known plugin text in bounded memory plus unchanged persistence. Generic404, ACL403, unknown responses, timeouts, and unexpected success cannot pass. Standard DeleteMultiple requires explicit provider refusal, including Microsoft's documented exact “DeleteMultiple has not yet been implemented.” text. Routes and Targets use the documented collection-bound Microsoft.Dynamics.CRM namespace and per-row @odata.type.

Every mutation uses fixed synthetic IDs except the single legitimate application commit/repeat/conflict. No real workspace or real receipt is ever a Delete target. Canary updates change only zk_name. Preparation marker state contains no copied event data. Both fake receipt canaries attach to the first fake workspace with the authenticated actor, fake64hex hash, appliedrevision1, and fixed timestamp. IDs and operator sequence are fully documented in `server/Acceptance/README.md`.

Evidence is limited to local check names/booleans, numeric HTTP status/validated Dataverse codes, hashes/counts/revisions. No row, provider body, API ResultJson/state, token, or provider URL is printed. The reused reviewed public MSAL PKCE/loopback authentication intentionally emits only the required public AUTH_URL. No auth cache or pending raw request is persisted. Runtime must not be rerun after an ambiguous result until Root resolves it independently; a persisted acceptance operation blocks a new invocation before a second application commit. Any unconfirmed/fault/malformed response triggers independent readback and stops, without automatic repeat.

Verification completed:

- New Acceptance/Acceptance.Tests .NET10 build: succeeded, 0 warnings and 0 errors.
- Focused offline suite: **19 passed, 0 failed**. Covers wrong target/ObjectId/language/currency without writes; prep guard/Standard gates; exact create/readback/reuse; ambiguous/missing readback stops; canary drift; strict missing/extra/inactive/impersonating/duplicate/bulk guard rejection; full bounded route plans; known guard denial + unchanged snapshot; ACL/unknown/success/changed-state stops; timeout readback; Standard DeleteMultiple versus absent/ACL; actual Protocol no-business-change save/idempotence/conflict with exact request bytes and receipt hash; fault/ambiguity/malformed result no-repeat; route safety before token acquisition; If-Match update-only wire behavior; and error-body bounds/redaction.
- Observed test-red evidence: documented Standard DeleteMultiple text recognition failed with 15 tests passing/1 failing before the classifier correction. Subsequent full focused suite passed19/19.
- Actual offline CLI `--phase runtime` execution returned offline=true, providerCalls=0, writes=0, denialRoutes=26, rootReleaseAllowed=false.
- Existing Deploy.Tests build: 0 warnings/errors; **54 passed, 0 failed**.
- Existing npm test suite: **95 passed, 0 failed**. A broader frontend build was started but was still running when Root requested the owned commit, so it is not claimed as verified here.
- Existing unchanged server policy binary executed against actual import/corpus: **65 passed, 0 failed**. A fresh .NET10 build targeting net8 initially reported NETSDK1127 (net8 targeting pack absent from dotnet10); a retargeting-pack diagnostic build was still running at handoff. No new policy build success is claimed.

Local self-review checked target-before-write gating, fixed scope, guards/backend prerequisites, request freezing, independent readbacks, redacted output, no retries/cleanup, and commit ownership. It tightened runtime step inventory to reject any extra step on either kitchen table, moved persisted readback before semantic saved-response acceptance, and retained both before and after denial fingerprints. Independent Root review is still required.

Material limits: only the authorized administrator's scoped runtime behavior is covered. No ordinary-user/team acceptance, user provisioning/grants, rollback fault injection, browser acceptance, deployment, or real runtime result is claimed. `rootReleaseAllowed` can become true only after all scoped runtime checks complete; it does not substitute for these other acceptance areas.

Primary documents checked live on 2026-10-15:

- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/bulk-operations
- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/update-delete-entities-using-web-api
- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/deletemultiple?view=dataverse-latest
