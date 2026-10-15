# Task 1 — local phased Dataverse console

Base: 05db45834ac60aea2aaf06399fc56adacc421876, feat/zunftkueche. Implementer performed only local file/build/test operations and read official documentation. No tenant authentication, OAuth request, provider API, browser, role grant, deployment or token-cache read occurred.

## Delivered

Separate net10.0 executable in server/Deploy; MSAL 4.83.0 + Newtonsoft.Json 13.0.3, pinned transitive lockfiles, official server/NuGet.Config. Default inspect, explicit tables/seed/backend/verify, entirely offline --dry-run. Public AUTH_URL emitted by MSAL's system browser callback; Root must open DuckDuckGo. Tenant-specific authority, user_impersonation scope, PKCE/loopback, in-memory cache only. Exact host/org/account/issuer/Entra-object identity plus German/EUR checks. All writes go through guarded create/readback logic; no update/delete/grant APIs. No response bodies/credentials in logs.

Table/attribute/relationship/key metadata, publisher + unmanaged solution, exact existing nupkg content and real package/type/privilege bindings, Custom API deep inserts and $metadata readback, message/filter-driven guard registrations and solution membership reads. Existing definitions are compared; duplicate canonical identities/drift stop. Ambiguous POST failures requery once without blind POST retry. Inactive keys and incomplete/disabled/filtered/impersonating guards block readiness.

Original-only seed hash d38bf0ac7c2bf34211c1df01af1869dd97522da24e2bde1a284e3e505844a15f. Schema-2 normalization is an in-memory copy using the actual server validator, all original fields preserved except localPath and schema metadata. Stable workspace 45deaf94-5661-4110-8f16-3d2678c09f04 is owned by authenticated Vorstand. Package hash 215fb97e2a374a4e621719c3c04cc9b21fc55686ca94fe67cc0d2a221c5bdf73 is enforced before auth. No package rebuild, source-data change or frontend/domain/import change.

## Exact verification

All commands run from /Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app. Build environment:

```sh
export DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home
export NUGET_PACKAGES=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/nuget
export DOTNET_GENERATE_ASPNET_CERTIFICATE=false DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 DOTNET_CLI_TELEMETRY_OPTOUT=1
../dotnet10/dotnet restore server/Deploy.Tests --configfile server/NuGet.Config
../dotnet10/dotnet restore server/Deploy.Tests --configfile server/NuGet.Config --locked-mode -p:NuGetAudit=false
../dotnet10/dotnet run --project server/Deploy.Tests --no-restore -p:UseSharedCompilation=false
../dotnet10/dotnet build server/Deploy --no-restore -p:UseSharedCompilation=false
../dotnet10/dotnet run --project server/Deploy --no-restore -p:UseSharedCompilation=false -- --dry-run
npm test
```

- Official dependency restore: succeeded (explicit tool approval for NuGet network). Locked restore: succeeded. Final build: 0 warnings, 0 errors, SDK 10.0.402.
- Initial red behavioral suite against compileable stubs: 0 passed / 14 failed. Seed stub produced a missing-field NullReferenceException; remaining failures were explicit unsafe-input/behavior assertions. After implementation: 14 passed. Two metadata tests were then observed failing against stubs before metadata implementation; 16 passed afterward. Additional boundary/integration checks brought final suite to 24 passed / 0 failed.
- Tests exercise exact URL/tenant/identity gates, wrong organization/no writes, missing target check, canonical reuse, drift/duplicates, ambiguous commit/readback and unresolved outcome, inactive key, unsafe guards, real source normalization and every field preservation, unsafe outgoing URL before token access, MSAL object-to-systemuser binding, unavailable and unguardable mutation gaps, exact supported guard creation/reuse and sanitized errors.
- Offline dry-run exit 0; no AUTH_URL. Normalized copy hash be8a39ba0ef8b95f60223860df6fa8d20187f63726b2e0cf209d2ccbdc449da5, original/package hashes match above.
- Entire existing npm test suite: 95 passed, 0 failed, 0 skipped.

Initial tooling corrections: first invocation mistakenly used relative NUGET_PACKAGES and failed before compilation; .NET10 also printed a first-run development certificate banner and macOS CSSM_ModuleLoad warning. All subsequent invocations use absolute home/cache paths and explicitly disable certificate generation. A generated server/dotnet-home directory was moved intact outside the repository to ../dotnet10-first-run-home-preserved, not staged/deleted. No auth credentials were present or read. A subsequent compilation caught MSAL OpenBrowserAsync receiving Uri rather than string; fixed before successful build. No such warnings in final compile/test output. No live authentication was attempted.

## Review boundaries / not yet proven

Official docs support metadata fields, package content field, SDK-message filter, steps and Custom API deep inserts (links in deployment usage). First package registration and actual tenant acceptance of these payloads remain untested. Fake tests cannot establish live SDK transaction behavior, dependency resolution, effective ordinary-user permissions or browser acceptance.

Missing bulk message/filter support is explicitly a runtime-confirmation gap; there is no skip/attestation switch. Thus metadataReady remains false if e.g. standard-table DeleteMultiple has no filter, until Root resolves that release evidence outside this local implementation. The console never guesses an unavailable path is uncallable. Any unsupported metadata field or unreadable package content stops rather than overwriting a definition. No polling/retry loop is present: inactive/pending keys or asynchronous package visibility require later read-only recheck. Inspect inventories are independent of missing publisher/solution; definition verification stops safely on drift.

Readiness output is metadata-only and always labels live runtime acceptance pending. Root's dedicated independent review precedes provider writes. Root may then run `bash server/Deploy/run.sh --phase inspect` and open the emitted public URL in DuckDuckGo; all implementation verification above was local/offline.

## Scoped fix round 1 — I1 persisted workspace verification

Review base b71979c. Fixed only Important I1 from task-1-review.md. Both read-only inspect and verify now call the same explicit VerifyWorkspace path before Backend. It queries the stable workspace with owner/state/revision, requires the authenticated owner, exact workspace ID, required nonnegative integer revision and JSON state, parses using the actual server parser's depth/size/duplicate-key bounds, and runs the actual StatePolicy against the reviewed normalized original. Persisted state revision must match the row revision. Revision zero additionally equals the reviewed normalized seed semantically (JSON object ordering/whitespace do not matter). Later revisions may contain legitimate edits under server invariants while retaining original source provenance, receipt economics and baseline history; this does not claim proof of every intermediate transaction, which remains live acceptance work. Missing table/row creates a blocking gap; mismatches throw sanitized errors, so Program emits metadataReady false.

Covering tests: server/Deploy.Tests/Program.cs, eight focused tests (including multi-case missing-field and invalid-state checks): wrong owner; missing state/revision; invalid JSON/schema; replaced initial seed; valid initial seed; valid later article-price edit; row/state revision mismatch; rewritten original economics in a later revision. The tests use a fake transport but execute the actual read-only verifier and server policy and assert zero writes.

Red evidence: with a compileable no-op VerifyWorkspace stub, suite output was `26 passed; 6 failed`; the six negative workspace cases failed as intended. Green after implementation: `32 passed; 0 failed`. Only the deployment suite and build were rerun; unchanged Node tests were not rerun.

Exact commands from the repository directory:

```sh
DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home DOTNET_GENERATE_ASPNET_CERTIFICATE=false ../dotnet10/dotnet run --project server/Deploy.Tests --no-restore -p:UseSharedCompilation=false
DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home DOTNET_GENERATE_ASPNET_CERTIFICATE=false ../dotnet10/dotnet build server/Deploy --no-restore -p:UseSharedCompilation=false
```

Results: tests exit 0, `32 passed; 0 failed`; build exit 0, `0 Warnung(en)`, `0 Fehler`. Self-review traced both Program branches through VerifyWorkspace and checked that all failures occur before metadataReady can be true; missing-resource gaps also block that flag. No new provider actions or package/contract/domain/import edits. Root's uncommitted docs/deployment.md and other files remain unstaged; deferred privilege inventory and separate bulk-pipeline integration issue were not changed. Fix commit changes only Program.cs, Provisioner.cs, the covering deployment tests and this report.

## Scoped fix round 2 — I1 valid multi-commit persisted snapshots

Review base 6b0dbb9. The rereview correctly identified that round 1's `StatePolicy.Validate(state, baseline)` treated an arbitrary persisted snapshot as a single commit. Its receipt transition rule permits exactly one appended correction, so two legitimate successive corrections were rejected. The round 1 general later-revision claim is superseded by this fix.

`SnapshotVerification` now applies the unchanged runtime policy to the snapshot with itself as previous state. Self-reference is necessary because a null previous state rejects the original imported Rewe duplicate labels. A separate explicit allowlist then requires every duplicate receipt's exact ID/key to exist in the original event, so snapshot mode cannot grandfather new duplicates. Seed-anchored checks separately preserve all original events, source records/provenance/local paths, original append-only orders/movements/lessons, recorded sales prices/identities and referenced article units/suppliers. Original receipt baseline/economics/status/provenance are checked across the current receipt and every recorded before-snapshot. Correction histories must begin at the exact reviewed receipt snapshot, retain its sourceBaseline, contain distinct consecutive snapshots, have strictly increasing revisions within the persisted revision, and bind each revision/operation to the operation history. This accepts multiple legitimate edits while refusing unanchored/replaced original facts. It verifies the stored chain and trusted seed invariants, not cryptographic proof of every intervening server transaction. Plugin runtime policy/package/registration were not modified.

Covering tests remain server/Deploy.Tests/Program.cs. The new fixture performs two successive corrections to r-rewe-list-1; **each individual transition is first validated with the actual unchanged `StatePolicy.Validate(next, previous)`**. The resulting second persisted snapshot then goes through the actual read-only deployment verifier. Before the fix this test failed with DeploymentException, yielding `35 passed; 1 failed`. After the fix it passes, alongside original provenance/economics tampering, replaced baseline, changed intermediate provenance and newly introduced duplicate-ID rejection. Earlier owner/required-field/initial-seed tests remain green.

Exact focused commands (repository directory; no restore/provider calls):

```sh
DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home DOTNET_GENERATE_ASPNET_CERTIFICATE=false ../dotnet10/dotnet run --project server/Deploy.Tests --no-restore -p:UseSharedCompilation=false
DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home DOTNET_GENERATE_ASPNET_CERTIFICATE=false ../dotnet10/dotnet build server/Deploy --no-restore -p:UseSharedCompilation=false
```

Final output: `37 passed; 0 failed`; build succeeded with `0 Warnung(en)` and `0 Fehler`, both exit 0. No unchanged Node suite rerun. Self-review matched the seed-anchored checks to the existing Event/source/history rules, explicitly preserved the imported duplicate exception, and verified that no direct baseline-to-current single-transition call remains. The owner/identity/row-state-revision and exact revision-zero comparison remain in VerifyWorkspace. Changed files: new server/Deploy/SnapshotVerification.cs, one verifier call/comment in Provisioner.cs, focused tests and this report. Root's docs changes are preserved and unstaged; no tenant/auth/browser/subagent activity or plugin/package/registration edits.
