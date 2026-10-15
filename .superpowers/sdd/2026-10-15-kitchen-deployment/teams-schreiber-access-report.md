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

## Review fix round 1 — enforce independent effective privileges

Review I1 (Important) confirmed: the former effective-privilege readback parsed GUIDs but did not enforce the kitchen subset. This could report ready despite missing effective receipt rights or a contradictory extra effective kitchen privilege.

The focused correction rejects every metadata-resolved kitchen privilege outside the six allowed IDs on **every** inventory read. Inventory now records whether all six desired IDs are effective. Partial sets remain valid non-ready pre-provisioning inventory, but inspect cannot report ready with a partial set. Execute requires completeness immediately after confirmed role assignment, before GrantAccess, after GrantAccess and at final readiness. No retry or broader grant is introduced. Actual direct/team role definitions still determine depth; normalized Basic depths in RetrieveUserPrivileges are not mistaken for the actual team-role depths. Unrelated existing platform privilege IDs remain preserved and are not granted by this helper.

Independent effective-response fixtures cover forbidden receipt Delete at initial inspection and after each of four writes; missing receipt Append under an existing assignment, after new assignment and after sharing; inspect non-readiness; actual role Global depth with normalized effective Basic; and unrelated existing platform privilege preservation. The original no-retry, drift, target, role and readback tests remain in the focused suite.

Both RED and GREEN used these exact commands from the repository directory:

```sh
DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home ../dotnet10/dotnet build server/Access/Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home ../dotnet10/dotnet server/Access/Tests/bin/Debug/net10.0/Kitchen.Access.Tests.dll
```

Tests were added and actually executed before changing production code for this fix. RED: **44 passed, 9 failed**, exit1; failures were the nine missing effective-enforcement behaviors. GREEN: **53 passed, 0 failed**, exit0. Both builds exit0, **0 errors / 3 existing NU1900 feed warnings / no compiler warnings**. No restore, broad suites, provider, authentication, browser or package operations. No build remains active.

Self-review: both inspect and execute readiness require the six effective IDs; every call to InspectAccess rejects forbidden kitchen IDs; missing post-assignment rights stop before further grants; missing uncommitted assignment still retains the original unconfirmed-write stop. No effective-depth inference added. Only FixedAccess.cs, its focused tests and this report are included in this corrective commit. Root's newly observed Schreiber AAD ID is left for Root's read-only identity cross-check rather than expanding this review fix. All original target, workspace/owner/revision, role/depth, additive-only, no-retry and package contracts remain unchanged. Ready for scoped rereview; no provider execution has occurred.

## One-shot preparation of the observed unassigned role (base 40b17d7)

Root's explicit ruling follows actual inspect96431, stopped execute70969 and read-only diagnostic70897. The exact unassigned role `660a97b9-a8c8-f111-a05c-7ced8d5f6c91` contains nine defaults. Their IDs/names match Microsoft's [Web API functions/actions sample](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/web-api-functions-actions-sample#section-8-bound-action-addprivilegesrole); this establishes observed defaults, not that they are necessary or harmless. The documented [ReplacePrivilegesRole](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/replaceprivilegesrole) action supplies the separately approved one-shot replacement.

Added isolated `RolePreparation` and exact `--prepare-existing-role` routing. The original `FixedAccess` implementation remains byte-identical from its class declaration onward, including strict six-right `--execute` behavior. The new mode pins Schreiber AAD/DV/BU and exact existing role, authenticates the unchanged target/admin, requires owner Vorstand/exact revision2, empty direct/team role assignments, effective privileges and workspace rights. Exact role identity, nine IDs/names/depths/BU/unfiltered definitions, reverse user/team assignments and derived roles are checked. Desired six privileges come from actual fixed-table metadata; API execute privilege names must match workspace Read/Write.

Only one fixed bound Replace POST is available. No create, association, sharing, delete, retry or fallback. After any response or exception, canonical privilege readback plus repeated identity/workspace/assignment checks must confirm exactly six and zero assignments. Unchanged/readded defaults, partial/filtered/wrong-depth/wrong-BU outcomes stop. An already-six initial state also stops without rewriting. Success explicitly says rolePrepared only and kitchenAccessReady=false. The subsequent inspect/execute remains a separate Root operation after review.

### Focused red/green evidence

New tests are in `server/Access/Tests/PreparationTests.cs`; the existing runner includes them. Against a compileable no-op preparation scaffold, actual RED was **53 passed / 51 failed**, exit1. Before that behavioral RED, an initial tests-only no-dependencies build failed because the new class was not yet in Access.dll; corrected by building Access first. That compile error is not counted as RED. The first real implementation build then found one JsonNode/ContainsKey type error; fixed by requiring/casting the canonical row to JsonObject, without weakening any assertion.

Final serial commands (repository cwd; no restore or dependency rebuild):

```sh
DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home ../dotnet10/dotnet build server/Access --no-restore --no-dependencies --disable-build-servers -p:UseSharedCompilation=false -m:1
DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home ../dotnet10/dotnet build server/Access/Tests --no-restore --no-dependencies --disable-build-servers -p:UseSharedCompilation=false -m:1
DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home ../dotnet10/dotnet server/Access/Tests/bin/Debug/net10.0/Kitchen.Access.Tests.dll
DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home ../dotnet10/dotnet server/Access/bin/Debug/net10.0/Kitchen.Access.dll
```

Final builds: exit0, 0 errors, respectively 2/3 existing NU1900 inaccessible audit-feed warnings, no compiler warnings. GREEN: **104 passed / 0 failed**, exit0 (53 existing +51 new). Offline executable exit0, mode=offline_plan, providerCalls=0, writes=0, ready=false. No authentication/provider/browser action or build stall. No unrelated tests, package/source-manifest/updater/registry/frontend changes.

Tests cover exact payload/route/metadata resolution, explicit mode isolation, recipient/role/workspace/organization drift, direct/team/effective/record/reverse assignments and child roles, every baseline component including name/filter/duplicates, committed ambiguous writes, unchanged/readded/partial/drifted postreads, postwrite assignment/owner changes, repeated-instance refusal and before/after read ordering. The original 53 tests remain unchanged in behavior.

### Self-review, hashes and limitation

The new class contains one mutation dispatch only; all other operations use existing bounded read helpers. Facts contain own labels, fixed role ID and counts, no remote errors or workspace state. Original FixedAccess class and Deploy source are unchanged. Builds explicitly skipped dependencies: copied Deploy.dll SHA256 remains `63ea6476534bc59273c1d1a94ccf47c534b1c62e7414476ae053b1884fe8b41d`, PDB `82e3493e1d839be7f922ecdd2256975a459bcb2deb37e6b8fdc42ca7459ab973`.

Built Access.dll SHA256 `ad7c2ce0be8dffe443b7082b180b27677744c497938f5c38d4a3afbaa7496cdf`; RolePreparation.cs SHA256 `7eac9740ccd8d913291dad376fa2bd2c59c53ef3d4747ae4e86b3fd085ab34fa`; PreparationTests.cs SHA256 `e35d214e286cf25241199ce4452bbf22fa368c5cc3fe3192a54d2c2229c62043`. SDK informational version embeds precommit source revision; no postcommit rebuild is claimed. Root should freeze these reviewed bytes with sources before provider use.

Role preparation is not atomic CAS and cannot exclude an external administrator racing between reads and POST. Root's controlled sole-writer window is a prerequisite; any visible postread drift fails. If Dataverse re-adds defaults, the exact-six proof fails and nobody receives the role. No claim of successful provider preparation or Schreiber app acceptance is made. Only Access code/tests, this report and docs/Schreiber-access.md belong to this commit; Root-owned documents remain unstaged.
