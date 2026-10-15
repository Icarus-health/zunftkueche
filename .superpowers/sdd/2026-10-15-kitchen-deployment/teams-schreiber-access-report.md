# Schreiber access helper — implementation report

Base: `9fb46d5`. Scope: new `server/Access/**`, `docs/Schreiber-access.md`, this report. Root brief is `.superpowers/sdd/2026-10-15-kitchen-deployment/teams-schreiber-access-brief.md`. User explicitly authorized Schreiber as kitchen editor. No provider/auth/browser operations were performed by this implementer; no subagents.

## Implemented contract

Offline default; only exact `--inspect` and `--execute` modes. Reuses unchanged Deploy MSAL auth, fixed Target, WhoAmI/account/OID/org/language/currency proof, safe transport and ResourceEngine read helpers. Exact active real Schreiber with nonempty AAD ID, ReadWrite accessmode, no applicationid, matching enabled business unit. No auto-user creation. Fixed workspace remains Vorstand-owned, revision >=2 and stable across steps; no state column reads or writes.

Reads direct roles, team memberships and actual role privileges (avoids documented RetrieveUserPrivileges team-depth limitation), effective privileges and record access before any mutation. Own role is exact name + actual business unit, unmanaged/no template, exactly six unique metadata-resolved IDs/depths. Existing empty/overbroad/duplicate/drifted role stops. API execute names must equal actual workspace Read/Write privilege names. Broader existing kitchen-table or workspace access stops rather than modifying prior grants.

At most four POSTs: create empty dedicated role; add six privileges; associate only Schreiber; GrantAccess only fixed workspace Read/Write/AppendTo. New platform baseline stops before any privilege addition/assignment. Canonical role definition, membership, effective access and owner/revision are read after successful consequential steps. Every ambiguous response is independently read back, never retried; only exact confirmed outcomes can continue. No revoke/delete/PATCH, assignment/owner transfer, generic endpoints/identity arguments, new API or plugin changes. App Opener/platform opening rights explicitly separate and never silently granted; Root handles app share and Teams policy.

## Focused verification

Working directory `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app`.

An initial restore without DOTNET_CLI_HOME failed before restore because the sandbox forbids creating `/Users/sorenkube/.dotnet`. Corrected to existing workspace CLI home. No global setting changed.

```sh
DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home ../dotnet10/dotnet restore server/Access/Tests --ignore-failed-sources
```

Exit 0; existing package cache used. Three NU1900 warnings: NuGet vulnerability feed inaccessible in sandbox, plus platform CSSM_ModuleLoad diagnostic. Dependency versions remain inherited MSAL4.83.0/Newtonsoft13.0.3/IdentityModel.Abstractions8.14.0; new lockfiles included. No audit-disable config change. No package/runtime business source rebuilt.

Tests were authored against a compileable no-op scaffold. Process deviation: initial RED execution was delayed until after the first implementation compile; implementation was then saved outside source and the original no-op scaffold restored for the actual RED run. This is recorded rather than claiming strict red-before-implementation execution. RED was **1 passed, 31 failed**, exit1; failures were missing behavior, not compile errors. The one vacuous privacy check passed on the no-op scaffold; it was subsequently strengthened to require the real successful outcome before examining safe facts. A test nullable warning was corrected. Restoring implementation produced **32 passed, 0 failed**. Nine focused inventory/depth/identity/readback tests then produced **41 passed, 0 failed**. A final explicit preexisting-role-preservation test and strengthened privacy assertion produced **42 passed, 0 failed**.

Final commands:

```sh
DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home ../dotnet10/dotnet build server/Access/Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home ../dotnet10/dotnet server/Access/Tests/bin/Debug/net10.0/Kitchen.Access.Tests.dll
DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home ../dotnet10/dotnet server/Access/bin/Debug/net10.0/Kitchen.Access.dll
```

Build exit0, **0 errors / 3 NU1900 warnings**, no compiler warnings. Suite exit0 **42 passed / 0 failed**. Actual default executable exit0, JSON `mode=offline_plan, providerCalls=0, writes=0, ready=false` and fixed role/recipient/privilege plan. No authentication attempted. No stalls/hydration issue or running build remains. No unchanged Deploy/Acceptance/Updater/Node/server-policy suites rerun.

Tests cover target/auth/recipient uniqueness/enabled-human/BU/owner/revision, metadata/API drift, role duplicates/depth/extra/empty/platform baseline, exact six payload IDs/depths, exact association and GrantAccess targets, existing exact reuse, all four committed and uncommitted ambiguous outcomes, absence of retry, readback ordering, team-role privilege breadth, extra/unknown access enums, preservation of preexisting role assignments, changed workspace stopping subsequent writes, safe facts and omission of state reads.

## Self-review and remaining provider gates

Only new helper/docs/report files staged; Root decisions/status files left untouched. No plugin, source-manifest, nupkg, registry, frontend, business model or existing updater edits. Existing reviewed admin auth remains fixed to Vorstand. The helper does not prove real Schreiber UI acceptance, app licensing or platform App Opener sufficiency. If needed, Root must inspect actual App Opener identity/rights and obtain separate bounded review before any additional baseline grant; no speculative broader role added here.

Role operations are not an atomic multi-step transaction. Root needs a controlled one-writer window; post-readbacks detect visible drift but cannot exclude an external administrator race. An unconfirmed write stops without retry. A partial-created role is preserved and a subsequent run refuses an incomplete existing definition, requiring explicit diagnosis instead of automatic repair. Receipt privileges necessarily apply globally because the receipt table is organization-owned. `RetrieveUserPrivileges` output is not used to claim full inherited depth; each actual team role is read separately. Record payload content is never retrieved or logged; only stable revision/owner is checked, not a new business-state hash.

Official API references and exact usage are linked in `docs/Schreiber-access.md`. Provider acceptance of new-role defaults and the six-right role remains untested; unexpected defaults fail closed. Independent scoped review required before Root's first live inspect/execute.
