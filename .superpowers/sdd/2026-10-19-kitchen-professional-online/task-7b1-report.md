# Task7b.1 — frozen release foundation report

**Current correction freeze (supersedes the initial status and source gaps1–2 below): `2cf5d6ec752179e246b1dbe96c4eec79c4b45b9c`.** The requested exact-object and route prerequisite gaps are implemented and locally verified, including incremental partial-table checkpoint handling. Status: **DONE_WITH_CONCERNS for source delivery, pending independent review and native acceptance.** Fresh cloud-original acquisition remains explicitly unsupported/Incomplete. The initial report below is retained as historical evidence; the correction appendix contains current commands, counts and pins.

Status: **DONE_WITH_CONCERNS for the bounded source delivery; NOT activation-ready.** The source limitations below must be resolved/reviewed before a live mutation permit. No native release, complete live backup, access test, restore or publication was performed. Date: 20 October 2026.

## Source freeze and scope

- Repository: `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app`.
- BASE: `b77ee6396445f3fd8caaa2f8ef8abfe08e9a7faf` (Task7a source and bounded UI independently accepted).
- Source freeze: **`c11a5fea3d74c45b0e19c9b5dd5660e857942dcf`**, commit `Add fixed release foundation and tighten document guard mapping`.
- Review range: `b77ee6396445f3fd8caaa2f8ef8abfe08e9a7faf..c11a5fea3d74c45b0e19c9b5dd5660e857942dcf`. 36 files changed, 4981 insertions(+), 2 deletions(-).
- This report is committed separately after the source freeze. It does not change any source/build/client manifest entry.
- Requirements read: `task-7b1-brief.md`, `task-7b-implementation-input.md` sections1–7, `document-route-preparation.md`. Parent owns native/provider and visual acceptance. Rollback-supervisor addendum excluded.

## Material source limitations — distinct from absent evidence

1. **Separate exact-object readback is incomplete.** `SchemaPhase.Run` and `GuardPhase.Run` make two independently attempted bounded canonical-inventory reads, but both delegates select from collections. The fixed schema reader additionally compares the exact table object with its enclosing entity collection. It does not yet issue an independent exact column/relationship/solutioncomponent/guard-step object read for every additive target. This does **not** fully meet the brief's exact-object plus enclosing-collection requirement. The typed dispatch is implemented; a distinct fixed exact-object boundary and meaningful failure tests remain necessary.
2. **Route-disposition validator is not directly integrated into phase prerequisites.** The 26 minimum routes, mandatory legacy extras and every discovered filter/global-step message are modeled and tested in `DocumentGuards.Validate`. Runtime phase checkpoints bind fresh route metadata to independently pinned evidence; `PhaseDispatch` does not itself deserialize and call the full route-disposition validator. A literal route-evidence contract wired into applicable phase prerequisites remains necessary. No catalog entry should be added until this is fixed and reviewed.
3. **Fresh SharePoint version-byte acquisition is not implemented.** Local-import original bytes are verified and retained. The code refuses cloud-original claims in checkpoint/complete backup without a fresh fixed provider reader; an old retained copy is not fresh cloud evidence. Parent explicitly kept new SharePoint auth/scopes/provider integration out of this bounded task. Existing v2 frontend full-backup handling could be examined as a future source, but no such import bridge is implemented or inferred here.

These are source/integration limitations, not claims that a missing native pin alone would complete the tool. The present literal executable catalogs are empty, so none is reachable as an approved native mutation.

## Implemented behavior

`Program` has exactly seven separate modes, offline `plan` by default, and rejects unknown/combined arguments before constructing authentication or transport. Fixed typed schema, membership, guard and package operations have concrete dispatch. There is no generic URL/method/deploy-all surface. An empty reviewed phase/transition/binding catalog stops mutations before auth; final verification has an independent absent final-package pin. No future hash, new table ID, Schreiber identity or native success was invented.

The two-table metadata factory fixes UserOwned Standard tables, plural sets, primary event field, five ApplicationRequired attributes, string/memo/date/lookup metadata, exact candidate relationship and cascade settings. Reads distinguish Unknown, NotInstalled by authoritative native metadata, installed empty, and drift/duplicates. Eligibility uses fixed documented Actions/Functions in both directions, complete parent inspection and a fixed AddSolutionComponent payload with no expansion. New intrinsic/legacy/global routes are collected; individual-Target registration of bulk messages is forbidden. Existing API, assembly, six guard/filter identities and old52 intrinsic metadata checks are preserved.

The extended inventory reads raw current workspace state and receipts, both new stores when actually installed, metadata, roles, current caller access and routes; it requires bounded complete paging/counts and repeats source brackets to detect drift. Final pure policy runs on a separate parse/copy without Normalize, seeding or trimming. Raw responses and original bytes remain private. It does not fabricate server-issued sourceContract. A current-source visibility review is separately literal-pinned and must match fresh fingerprints and exact installed-store coverage. It can permit a pre-schema current-v1 backup when native evidence establishes both future tables NotInstalled; it does not require future document editor privileges. The visibility pin is presently absent, so full current-source completeness is not claimed. Parent's Maker UI count2 corroboration is not used as authoritative table absence.

The fixed package adapter writes existing package Content at most once. The reused core supports explicit strict ETag CAS or separately reviewed coordinated-writer mode, with no fallback/retry/rollback. Prior bytes are explicit per transition, permitting diagnostic→final without pretending that diagnostic is historicalv5. A private CreateNew intent marker is written and flushed, including directory fsync, before a transport write; every earlier marker blocks restart regardless of an old-looking observation. Write deadline90s, independent readback180s, per-read60s; cancellation and late completion do not authorize a second write. Package identity/content/checkpoint/type/API/solution reads remain separate. `verify-release` implements a fixed read-only final server-backup call and validates its server-issued contract; its absent final pin stops before auth today.

The sole existing product change is `server/Documents/DataverseDocuments.cs`: exact upload.begin/Create, upload.claim+link/Update, draft.save/Create-or-Update mapping; reject denial-only messages before Target parsing; ordinary updates require matching RowVersion and creates reject a source RowVersion. Strict immediate KitchenCommit ancestry, caller/transaction/payload/hash and receipt.draft.accept branch remain intact. No generic system-attribute exception or privileged proxy was added.

## Provenance and closure

`server/Release/provenance.json` records 15 original source paths/hashes for accepted inventory sources, fixed intrinsic resource, config/global/lock, activation helper, accepted tests/oldv5 package fixture, and round4 prelaunch. All **15 original hashes rechecked unchanged** at freeze. Copies received only the delta described above. Historical Deploy/Access/Acceptance/PackageUpdate tools and their pins were neither edited nor executed. Existing SDK/dependency locks remain unchanged; plugin stays net462.

Release compiles an explicit21-file set, including the current five Policy files, DocumentProtocol and ReceiptIntake, plus the intrinsic resource. Prelaunch checks source/build/.NET runtime/project/lock/resource/client/config/generated/dist closures before candidate code/auth loads. Explicit source scope contains50 files; published runtime7; pinned .NET host/framework186; client/config/generated/dist89. Runtime is existing SDK8.0.426/framework8.0.32, roll-forward disabled, no apphost and cleaned runtime injection environment.

The following are **locally generated candidate artifacts, not independent review authority**. Before native use, an independent reviewer must retain/verify the launcher literal hash outside its own execution, inspect the frozen source/build provenance, and approve every manifest pin. No candidate self-approval occurred.

| Candidate artifact | SHA-256 |
|---|---|
| launcher `server/Release/prelaunch.py` | `8770e91a8f58d044c5bef971eab85ae93cbb3ddda142a069ba92586ffc492b38` |
| source-manifest (50 files) | `6cf83ffd23c74d079937007e24449bb0ebb3d9810e00c517209df790057eca73` |
| build-manifest (7 files, source-manifest link) | `66d5a0d18825958a969fe81fbdafac1a6f66e355326219a3816af1df5d94320e` |
| host-manifest (186 files) | `52531b1179f7c925f05dcdeb87b4fc4ff74ef61344a259e448e714dc8a27d5b5` |
| client-manifest (89 files) | `492543275cd07eb9c1b529a6ba10277590ff39dfa005d2ea0d7fea56222a7968` |

Manifests remain private/ignored in `server/Release`; `candidate-pins.json` is under the private evidence folder. They identify the same bytes as source freeze, although their base field records the supplied BASE. The fixture prior-v5 hash is historical provenance only, not a fresh installed package measurement.

| Local artifact | Bytes | SHA-256 |
|---|---:|---|
| `server/Release/release/reviewed/Kitchen.Release.dll` | 415744 | `e8301e1066d37ba1ffd3ca3473722a50ad041f91172f8a12808c12af705a6c36` |
| `server/Release/release/reviewed/Kitchen.Release.pdb` | 66000 | `c6327ee803c42745da4ed11c56bcfb6f169c5b97210b6cdd952c7a282625b7bf` |
| `server/artifacts/task7b1/Zunftkueche.Dataverse.1.0.0.nupkg` | 316760 | `c9500518a9579d1e0e6b3097a3ed05bfec1165c226f1e178ca09a04a5e4ac34f` |
| `server/Release/Tests/bin/Debug/net8.0/Tests.dll` | 91648 | `679eb95a2a8104fcb121250e72f77d856e30623adfb07594b404d057fe77ee3b` |
| `server/Release/Tests/bin/Debug/net8.0/GuardHarness.dll` | 125440 | `9d2a09a5c3bd9f38961b079d99f8247ae9a1629e90a48eb9b65076ede73cd831` |

The local plugin package includes the amended guard and accepted current product sources. Its hash is **not** installed-native or independent final-transition evidence.

## Tests, exact commands and outcomes

Final results: **68 new C# cases passed, 0 failed; 56 reused accepted activation cases passed, 0 failed; 12 new Python gate cases passed.** Do not count repeated runs as new cases. No unaffected whole frontend or prior152-case guard suite was repeated. No mock is native evidence.

Every test source:

- `Tests/Program.cs`:37 new metadata/unknown-empty/paging/raw-policy/closure/original/journal/additive cases.
- `Tests/GuardMappingTests.cs`:20 new action-message/early-denial/RowVersion cases.
- `Tests/ActivationIntegrationTests.cs`:6 new explicit-prior, late completion, durable crash/restart, strict412/no-fallback and unreviewed-transition cases.
- `Tests/PhaseTests.cs`:5 new concrete typed schema dispatch/checkpoint/parent/eligibility/membership cases.
- `Tests/AcceptedActivationTests.cs`:56 accepted cases copied with injected short fake deadlines and fixture location adaptation only; counted as reused.
- `Tests/test_prelaunch.py`:12 new default-offline, closure/trust, pin/path/symlink and exact compile/input scope cases.
- `Tests/ContextProxy.cs`:test support; `Tests/GuardHarness/GuardHarness.csproj` compiles the exact amended plugin/pure files into a net8 test harness using existing locked SDK references. Production plugin was not retargeted.

Guard red/green: an isolated private harness compiled `git show b77ee6396445f3fd8caaa2f8ef8abfe08e9a7faf:server/Documents/DataverseDocuments.cs`; only the test output GuardHarness.dll was temporarily substituted then restored in finally. `dotnet Tests/bin/Debug/net8.0/Tests.dll --guard-only` yielded baseline **5 pass/15 fail, exit1** (`guard-red.log`), amended **20 pass/0 fail, exit0** (`guard-green.log`). The 15 failures were3 invalid action-message accepts,10 denial-before-Target parse failures and2 RowVersion gaps. Production source was never rolled back.

All final build/run commands below used cwd `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app/server/Release`. Dotnet environment: `DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home`, `NUGET_PACKAGES=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/nuget`, `MSBUILDDISABLENODEREUSE=1`, `DOTNET_CLI_DO_NOT_USE_MSBUILD_SERVER=1`, `DOTNET_CLI_TELEMETRY_OPTOUT=1`, `DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1`. Existing local package cache and cleared NuGet.Config; no dependency download/upgrade. Exact argv/cwd/exits are retained as corresponding `*-command.json` and `offline-command-results.json`.

- `restore-locked`: `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet/dotnet restore Tests/Tests.csproj --configfile NuGet.Config --locked-mode --disable-build-servers --disable-parallel -p:NuGetAudit=false -m:1` → exit **0**. Log: `task-7b1-evidence/restore-locked.log`.
- `build-freeze`: `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet/dotnet build Tests/Tests.csproj --no-restore --disable-build-servers -m:1 -p:UseSharedCompilation=false` → exit **0**. Log: `task-7b1-evidence/build-freeze.log`.
- `tests-freeze`: `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet/dotnet Tests/bin/Debug/net8.0/Tests.dll` → exit **0**. Log: `task-7b1-evidence/tests-freeze.log`.
- `gate-tests-freeze`: `python3 -I -B Tests/test_prelaunch.py` → exit **0**. Log: `task-7b1-evidence/gate-tests-freeze.log`.
- `publish-freeze`: `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet/dotnet publish Kitchen.Release.csproj --no-restore --no-self-contained -c Release -o release/reviewed --disable-build-servers -m:1 -p:UseSharedCompilation=false` → exit **0**. Log: `task-7b1-evidence/publish-freeze.log`.
- `plugin-pack-freeze`: `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet/dotnet pack ../Kitchen.Dataverse.csproj --no-restore -c Release -o ../artifacts/task7b1 --disable-build-servers -m:1 -p:UseSharedCompilation=false` → exit **0**. Log: `task-7b1-evidence/plugin-pack-freeze.log`.
- `default-offline`: `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet/dotnet /Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app/server/Release/release/reviewed/Kitchen.Release.dll` → exit **0** (expected 0). Log: `task-7b1-evidence/default-offline.log`.
- `unknown-refused`: `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet/dotnet /Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app/server/Release/release/reviewed/Kitchen.Release.dll unknown` → exit **2** (expected 2). Log: `task-7b1-evidence/unknown-refused.log`.
- `combined-refused`: `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet/dotnet /Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app/server/Release/release/reviewed/Kitchen.Release.dll inspect backup` → exit **2** (expected 2). Log: `task-7b1-evidence/combined-refused.log`.
- `prelaunch-plan`: `python3 -I -B /Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app/server/Release/prelaunch.py --source-sha256 6cf83ffd23c74d079937007e24449bb0ebb3d9810e00c517209df790057eca73 --build-sha256 66d5a0d18825958a969fe81fbdafac1a6f66e355326219a3816af1df5d94320e --host-sha256 52531b1179f7c925f05dcdeb87b4fc4ff74ef61344a259e448e714dc8a27d5b5 --client-sha256 492543275cd07eb9c1b529a6ba10277590ff39dfa005d2ea0d7fea56222a7968` → exit **0** (expected 0). Log: `task-7b1-evidence/prelaunch-plan.log`.
- `phase-unreviewed-no-auth`: `python3 -I -B /Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app/server/Release/prelaunch.py --source-sha256 6cf83ffd23c74d079937007e24449bb0ebb3d9810e00c517209df790057eca73 --build-sha256 66d5a0d18825958a969fe81fbdafac1a6f66e355326219a3816af1df5d94320e --host-sha256 52531b1179f7c925f05dcdeb87b4fc4ff74ef61344a259e448e714dc8a27d5b5 --client-sha256 492543275cd07eb9c1b529a6ba10277590ff39dfa005d2ea0d7fea56222a7968 --mode activate-package` → exit **2** (expected 2). Log: `task-7b1-evidence/phase-unreviewed-no-auth.log`.
- `verify-unpinned-no-auth`: `python3 -I -B /Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app/server/Release/prelaunch.py --source-sha256 6cf83ffd23c74d079937007e24449bb0ebb3d9810e00c517209df790057eca73 --build-sha256 66d5a0d18825958a969fe81fbdafac1a6f66e355326219a3816af1df5d94320e --host-sha256 52531b1179f7c925f05dcdeb87b4fc4ff74ef61344a259e448e714dc8a27d5b5 --client-sha256 492543275cd07eb9c1b529a6ba10277590ff39dfa005d2ea0d7fea56222a7968 --mode verify-release` → exit **2** (expected 2). Log: `task-7b1-evidence/verify-unpinned-no-auth.log`.
- `prelaunch-unit-final`: `python3 -I -B /Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app/server/Release/Tests/test_prelaunch.py` → exit **0** (expected 0). Log: `task-7b1-evidence/prelaunch-unit-final.log`.

Build output: `0 Warnung(en), 0 Fehler`, elapsed2.92s. Plugin pack confirms `server/bin/Release/net462/Kitchen.Dataverse.dll` and local nupkg creation. Full offline gate output: `PLAN_VERIFIED_OFFLINE: source/build/host/client closure; no candidate/authentication loaded. Native release gates remain open.` Direct default output states no authentication/transport constructed. Invalid/combined modes exit2. Empty activation catalog prints `STOPPED_BEFORE_AUTH`; missing final verify pin prints its separate `STOPPED_BEFORE_AUTH` reason. These executed paths performed zero auth/provider requests/mutations.

During development, two initial restore attempts without single-node completion stalled and were canceled; no third unchanged attempt or process kill occurred. The bounded single-node restore then exposed NU1004 from the test project's net8→net462 direct reference; a separate locked test harness corrected this without changing production target/dependencies. The successful restore retains the existing `CSSM_ModuleLoad` warning. No keychain repair, profile/auth change or online restore was attempted. Initial closure verification correctly rejected omitted existing Documents schema-proposal/README files; the fixed literal scope was corrected and includes server/README pack input. Only affected focused checks were repeated after source changes; final Python gate tests were repeated after the last scope correction. Final `git diff --check` and all15 original provenance hashes passed.

## Unproved external facts and handoffs

No native invocation or authentication was performed. No schemas, steps, roles, access grants, owners, environment/app/trial, private rows, originals or publication changed. No private real state or originals appear in tracked tests/report. Raw evidence is private under `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app/.superpowers/sdd/2026-10-19-kitchen-professional-online/task-7b1-evidence`; historical private data was preserved.

Before live use: fix/review the explicit source gaps; independently review launcher/source/build/runtime/client closure; retain a fresh authoritative current-source checkpoint and original versions; establish actual table absence or exact installed metadata; native shape/eligibility/cascade and complete26+extras route witnesses; actual Board/Schreiber identity plus reciprocal creator-owned row Read+Write/access proof; exact package/type/API/solution closure; separate diagnostic/final packages and reviewed literal phase transitions. Current-source backup acceptance and future final release acceptance remain distinct. A permission delta, if needed, must be concretely reviewed. Parent coordinates editor/all-tab pause and return to use. No reader identity/account was created. Native restore/rollback, physical iPhone acceptance, immutable synthetic audit retention decision and final same-app publication remain open. Outer rollback-supervisor implementation is excluded.

Only public primary request-contract research was performed, as explicitly authorized by parent: Microsoft Learn [CanBeReferenced](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/canbereferenced), [CanBeReferencing](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/canbereferencing), [GetValidReferencedEntities](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/getvalidreferencedentities), [GetValidReferencingEntities](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/getvalidreferencingentities), [AddSolutionComponent](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/addsolutioncomponent). These justify fixed request shapes, not tenant availability or success. No private data was placed in searches.

## Complete source diff file list

```text
server/Documents/DataverseDocuments.cs
server/Release/.gitignore
server/Release/ActivationContracts.cs
server/Release/ActivationCore.cs
server/Release/Authentication.cs
server/Release/Backup.cs
server/Release/Core.cs
server/Release/DocumentGuards.cs
server/Release/DocumentSchema.cs
server/Release/Inventory.cs
server/Release/Kitchen.Release.csproj
server/Release/Metadata.cs
server/Release/NuGet.Config
server/Release/PackageActivation.cs
server/Release/Program.cs
server/Release/README.md
server/Release/Reader.cs
server/Release/ReleaseContract.cs
server/Release/ReleaseInventory.cs
server/Release/Tests/AcceptedActivationTests.cs
server/Release/Tests/ActivationIntegrationTests.cs
server/Release/Tests/ContextProxy.cs
server/Release/Tests/GuardHarness/GuardHarness.csproj
server/Release/Tests/GuardHarness/packages.lock.json
server/Release/Tests/GuardMappingTests.cs
server/Release/Tests/PhaseTests.cs
server/Release/Tests/Program.cs
server/Release/Tests/Tests.csproj
server/Release/Tests/fixtures/prior-v5.nupkg
server/Release/Tests/packages.lock.json
server/Release/Tests/test_prelaunch.py
server/Release/contracts/platform-intrinsics.json
server/Release/global.json
server/Release/packages.lock.json
server/Release/prelaunch.py
server/Release/provenance.json
```


## Correction appendix — exact objects, live route prerequisites and incremental schema checkpoints

Date:20October2026. Parent explicitly required completion of initial source gaps1+2 before first independent review, then requested the bounded partial-table checkpoint check and the human-facing in-app-browser wording correction. No new provider/auth/native permissions or executable catalog entries were introduced.

- Correction starting HEAD: `bc46e829f29b3664a5e86aaa0fbd509c11889854`.
- New source freeze: **`2cf5d6ec752179e246b1dbe96c4eec79c4b45b9c`** (`Complete exact release readback and route prerequisite checks`).
- Review the complete production range **`b77ee6396445f3fd8caaa2f8ef8abfe08e9a7faf..2cf5d6ec752179e246b1dbe96c4eec79c4b45b9c`**; the intervening `bc46e829` commit contains only initial evidence.
- Correction source delta:11 files,377 insertions,53 deletions. This appendix is a subsequent separate evidence commit, with no source changes.

### Closed source gap1: distinct exact objects and enclosing collections

`IDocumentSchemaBoundary.ReadExactTarget` and `IDocumentGuardBoundary.ReadExactGuard` now expose actual distinct reads. Table/column LogicalName and relationship SchemaName URLs use fixed subtype casts. A table read also retrieves its exact primary-name column; relationship read also retrieves its exact workspace lookup. Solution-component and guard-step IDs are assigned by Dataverse: a separately bounded fixed target lookup resolves zero/one candidate, and an independent GUID GET reads an existing candidate. No ID is guessed. An empty exact target lookup is not a successful existing-object observation. A locator followed by missing/changed GUID object is Unknown.

`SchemaPhase`/`GuardPhase` independently run exact-object and enclosing-collection reads. Existing success requires matching complete returned rows, including IDs and otherwise unknown fields, plus primary/lookup companions. Comparisons operate on deep copies and remove only top-level OData context plus optional metadata type `#`; captured raw response bytes remain unaltered. Omitted provider fields, changed IDs, extra values, Unknown, duplicates and mismatched presence stop. Only404 at a fixed metadata object path can represent Missing, and a separate complete collection must agree before any write;403/429/500 remain Unknown. Failure bodies/statuses are retained. Late ignored-cancellation completion cannot overwrite the bounded Unknown result. An orphan workspace lookup cannot authorize another relationship deep insert.

Public primary documentation supplied the precise contract, so there is no remaining guessed exact-object URL in this correction: [metadata by name/MetadataId](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/retrieve-metadata-name-metadataid), [typed metadata operations](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/web-api-metadata-operations-sample), [solutioncomponent primary key](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/solutioncomponent), [sdkmessageprocessingstep primary key](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/sdkmessageprocessingstep). Lookup/read response behavior remains unproved in this tenant; no native read was performed.

### Closed source gap2: route validation directly in phase prerequisites

`ReviewedPhase.Routes` is an optional field that is mandatory for package activation and guard registration. It is a separately literal-pinned evidence file, not CLI configuration. `RouteReview` has schema `kitchen-document-route-review-v1`, the fixed organization/solution, and `PinnedRouteEvidence[]`; each entry carries the exact route disposition and separately hashed authoritative/native-witness files. Duplicate JSON members and unknown typed fields refuse. The files are checked before auth. `PhaseDispatch` validates the full reviewed route matrix against freshly collected filters and global steps before dispatch, and the fresh checkpoint revalidates it immediately before applicable writes. Preflight is bounded180s.

The complete minimum26 route matrix, mandatory legacy extras and all newly discovered routes must have exactly one disposition with matching retained witness hashes. Missing/duplicate/extra evidence, invalid table enums, unknown inventories, additional filter/global messages, unsafe bulk registrations and unavailable guard-bound routes refuse. C/U/D specifically require individual guard disposition. This path invokes `DocumentGuards.Validate`; it no longer relies only on a checkpoint fingerprint. Package activation uses the same prerequisite through its current checkpoint. Pre-schema operations deliberately require current-source completeness instead of impossible future-table route witnesses; final package/guard stages require installed exact schema and the route review.

### Incremental schema source gap found and corrected

The prior `NativeCheckpoint.Store`/`ReleaseInspector` filtered new rows using `_zk_workspace_value` even before that lookup could exist. This was a real next-phase bootstrap problem, not an absent external pin. Both now share `CurrentDocumentStore`: authoritative schema can be NotInstalled, Partial, or Exact. Partial requires exact present fixed metadata and primary name, no unknown custom/secured fields, unexpected keys, conflicting relationships, duplicate/wrong memberships or other drift. The capture issues a bounded **unfiltered all-table count query** using only the known primary-ID order; no missing payload/workspace column is referenced. Partial must be empty. Any nonempty/unknown/drift state refuses. Unknown rows are never admitted.

The partial state is explicitly `PartialInstalledEmptyVisibilityNotProvenComplete`; it never passes the exact-schema prerequisite for package/guard/final phases. Current-source completeness still needs separately reviewed complete-read coverage for every installed store, including partial tables; an observed zero count alone is not that proof. The targeted primary-name-only table → fresh empty current-store capture → next scalar-column phase test passes with one fake write. Seven negative tests cover nonempty, unknown, wrong primary metadata, secured field, extra custom field, unrelated custom field and partial-for-final refusal.

Operator lifecycle is documented in README: only one active reviewed operation per mode; after observation retain its journal, freshly capture/review current state, then prepare independently reviewed next literal operation/plan/checkpoint/source/build/launcher pins. Replacing the literal catalog entry is a new reviewed source change, never a runtime selector or permission to retry an earlier attempt. All executable catalogs remain empty. Old attempts are retained; duplicate entries for a mode fail closed.

### Copied authentication delta

Only the comment and `AUTH_HANDOFF` human-facing string now say **approved in-app browser** instead of DuckDuckGo, matching the user's browser allocation. OAuth, PKCE, account/tenant checks, cache behavior and handoff mechanics are unchanged. The historical source was not edited. All15 original `provenance.json` hashes were rechecked unchanged. This additional two-line copy delta is intentional.

### Focused verification and current closure

The final targeted run is **66 passed,0 failed**, using `Tests/Program.cs --phases-only` and `Tests/PhaseTests.cs` (five prior phase cases adapted/retained and61 additional focused cases). Do not count repeated interim runs as new cases. The old full124 C# cases and unaffected frontend suites were **not rerun**. The previous56 accepted activation cases remain historical reused results from the initial freeze, not freshly repeated evidence. The gate source was unchanged; its actual complete source/build/host/client closure was revalidated, without rerunning the12 unchanged unit cases.

Coverage includes actual fixed adapters behind a synthetic HttpMessageHandler (zero provider/auth), independent exact URLs/typed casts/GUID follow-up, differing/omitted/extra raw fields and IDs, read failure/404/403/429/500, uncertain post-write mismatch, partial metadata and full route witness checks before a fake write. The per-phase tests are synthetic; they do not establish tenant completeness or native success.

Same cwd/environment/SDK8.0.426 and no-server/single-node flags as the initial report. Every command was locally bounded by a90s subprocess timeout. No restore/dependency download was needed. Exact current commands:

- `repair-build-freeze`: `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet/dotnet build Tests/Tests.csproj --no-restore --disable-build-servers -m:1 -p:UseSharedCompilation=false` → exit **0**, log `task-7b1-evidence/repair-build-freeze.log`.
- `repair-tests-freeze`: `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet/dotnet Tests/bin/Debug/net8.0/Tests.dll --phases-only` → exit **0**, log `task-7b1-evidence/repair-tests-freeze.log`.
- `repair-publish-freeze`: `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet/dotnet publish Kitchen.Release.csproj --no-restore --no-self-contained -c Release -o release/reviewed --disable-build-servers -m:1 -p:UseSharedCompilation=false` → exit **0**, log `task-7b1-evidence/repair-publish-freeze.log`.
- `repair-prelaunch-plan`: `python3 -I -B /Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app/server/Release/prelaunch.py --source-sha256 2d3947e16664e07d44523f5a15cfae02d228c0f7835dc76ca1a5a23f1d9ebb9b --build-sha256 4046ddd6d240490df30c128baa47b489f8fd1a1ac753abc90d9d187472779098 --host-sha256 52531b1179f7c925f05dcdeb87b4fc4ff74ef61344a259e448e714dc8a27d5b5 --client-sha256 492543275cd07eb9c1b529a6ba10277590ff39dfa005d2ea0d7fea56222a7968` → exit **0**, log `task-7b1-evidence/repair-prelaunch-plan.log`.

Build output:0 warnings,0 errors,elapsed2.10s. Targeted output:`PHASES: 66 passed, 0 failed`. Publish output confirms `release/reviewed/`. Offline gate output:`PLAN_VERIFIED_OFFLINE: source/build/host/client closure; no candidate/authentication loaded. Native release gates remain open.` `git diff --check` passed. The plugin product source did not change in this correction; its previously successful net462 package was not needlessly rebuilt and its hash was rechecked unchanged.

Interim evidence is retained: the first expanded run passed56 cases; the first build reported five nullable warnings in route-file validation, corrected with explicit null guards. A test-source quoting error in newly added partial tests caused one bounded compile failure (`repair-build-syntax-failed.log`); it was corrected before execution. The final affected build/test/publish sequence was rerun after the last schema classification change. No unchanged failing restore loop, process kill or native/auth attempt occurred.

Current candidate pins replace the initial generated pins for these frozen bytes. They remain **candidate evidence, not independent approval**. Launcher/runtime/client bytes are unchanged; source/build manifest values changed. Independent pre-load review is still required.

| Candidate artifact | Files | SHA-256 |
|---|---:|---|
| source-manifest |50| `2d3947e16664e07d44523f5a15cfae02d228c0f7835dc76ca1a5a23f1d9ebb9b` |
| build-manifest |7| `4046ddd6d240490df30c128baa47b489f8fd1a1ac753abc90d9d187472779098` |
| host-manifest |186| `52531b1179f7c925f05dcdeb87b4fc4ff74ef61344a259e448e714dc8a27d5b5` |
| client-manifest |89| `492543275cd07eb9c1b529a6ba10277590ff39dfa005d2ea0d7fea56222a7968` |
| launcher |1| `8770e91a8f58d044c5bef971eab85ae93cbb3ddda142a069ba92586ffc492b38` |

| Current local artifact | Bytes | SHA-256 |
|---|---:|---|
| `server/Release/release/reviewed/Kitchen.Release.dll` | 441856 | `673998e1d4fd73bfaa17d68a362186d2c7353d3caac6cc5db45f774920d790ee` |
| `server/Release/release/reviewed/Kitchen.Release.pdb` | 70788 | `29a48404c91fe2376d508e355a8656c6236c974bc7825258ee7bbf3df24c31cc` |
| `server/Release/Tests/bin/Debug/net8.0/Tests.dll` | 146944 | `b14c7436f57881137f988efcd0831f82189e68654b9530351ab12281572dfafc` |
| `server/artifacts/task7b1/Zunftkueche.Dataverse.1.0.0.nupkg` | 316760 | `c9500518a9579d1e0e6b3097a3ed05bfec1165c226f1e178ca09a04a5e4ac34f` |

Private exact argv/cwd/exits/logs and `repair-candidate-pins.json` remain in `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app/.superpowers/sdd/2026-10-19-kitchen-professional-online/task-7b1-evidence`. Historical evidence is retained. No private state/original entered tracked source or report. No executable pins, permissions, native schemas/steps/data, roles, environment/app or publication changed. Fresh cloud-version bytes remain explicitly unsupported/Incomplete as agreed; no SharePoint auth/scope integration was added. Independent full-range review, authoritative current captures, native access/routes/cascade/restore, physical iPhone and final same-app publication remain open.

Corrected source files:

```text
server/Release/Authentication.cs
server/Release/DocumentGuards.cs
server/Release/DocumentSchema.cs
server/Release/PackageActivation.cs
server/Release/Program.cs
server/Release/README.md
server/Release/Reader.cs
server/Release/ReleaseContract.cs
server/Release/ReleaseInventory.cs
server/Release/Tests/PhaseTests.cs
server/Release/Tests/Program.cs
```
