# Task7b.1 — frozen release foundation report

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
