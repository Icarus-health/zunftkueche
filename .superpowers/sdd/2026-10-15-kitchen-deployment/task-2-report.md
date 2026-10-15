# Task 2 implementation report — Standard-table merged pipeline registration

Status: local implementation and focused verification complete; independent review and Root runtime acceptance remain pending. Base: `3436c31` on `feat/zunftkueche`.

## Scope and decisions

Changed only the seven assigned registration/provisioner/report-count/transport/test/documentation files plus this report. The transport diagnosis was explicitly added to the task brief by Root before commit for the concrete read-only HTTP 403 blocker; `Core.cs` needed no change. Root's existing `docs/deployment.md` heading, top environment/license/owner paragraph, and steps 3/6/7 are preserved and included under the explicit authorization to commit the current whole file. Root's README/status/preflight/spec/plan files are left unstaged.

- Contract version 2 contains six required dedicated single-message pairs: Create/Update/Delete on each of `zk_kitchenworkspace` and `zk_kitchenoperation`. All retain Stage 20, synchronous mode 0, rank 1, Calling User, no filtering attributes, the unchanged strict guard, and exact filter/message/handler readback.
- Ten separate coverage records document Upsert, CreateMultiple, UpdateMultiple, UpsertMultiple and DeleteMultiple for both tables. No dedicated Upsert or Multiple step is posted, even when a corresponding filter exists.
- Standard-table Upsert requires both exact active Create and Update protection. CreateMultiple/UpdateMultiple inherit their individual guard through the documented merged pipelines.
- UpsertMultiple is `potentially_supported` when its own filter exists OR both CreateMultiple and UpdateMultiple filters exist. Its own missing filter never implies that the API is unavailable. Actual traversal remains `requires_root_pipeline_confirmation`.
- DeleteMultiple is `documented_unsupported_standard_table` only after fresh Standard table metadata. Missing or Elastic/unknown type produces `unverified_table_type` with a blocking gap. Missing bulk filters remain `availability_unconfirmed`.
- Existing named/handler guard steps are read before any guard POST. Extra Upsert/Multiple/unknown registrations, disabled/wrong handler/settings, or canonical filter/message drift stop for review. No disabling, updating, deletion or live repair is implemented.
- Coverage records separate `availability`, `metadataCoverage`, and `runtimeAcceptance: pending_root_live_check`. Every one adds a `root_runtime_check_required:<table>:<message>` gap. Thus even a fully registered backend returns code 2 and `metadataReady:false` until Root handles the separate release gates. The tool does not persist runtime attestations or include an override switch.
- HTTP refusals now retain only own HTTP status plus `error.code` when it is exactly `0x` plus eight ASCII hex digits, e.g. `http_403_dataverse_0x80040220`. Parsing is capped at 8192 bytes (one extra sentinel byte detects oversize) and JSON depth 16, with response-header streaming to avoid prebuffering an unbounded error body. Missing, malformed, non-string, oversized and unreadable diagnostic data retain only `http_<status>`. Remote message/body/URL/header/token values never enter the error string. A local injectable HTTP handler supplies synthetic responses in tests; production defaults retain redirect/cookie disabling.
- Offline report counts are now `requiredDedicatedGuardPairs:6` and `coverageRecords:10`, replacing the misleading sixteen possible dedicated pairs.

The strict immediate-parent/transaction/identity/marker/runtime guard implementation is unchanged. No arbitrary singleton `Targets`, ancestor marker search, or package rebuild was introduced. `Backend(packageBytes, create)` remains callable.

## Red / green evidence

All commands ran locally under .NET 10 with absolute environment paths:

```sh
export DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home
export NUGET_PACKAGES=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/nuget
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 DOTNET_GENERATE_ASPNET_CERTIFICATE=false
/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet10/dotnet run --project server/Deploy.Tests --no-restore -p:UseSharedCompilation=false
/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet10/dotnet build server/Deploy --no-restore -p:UseSharedCompilation=false
/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet10/dotnet server/Deploy/bin/Debug/net10.0/Kitchen.Deploy.dll --phase inspect --dry-run
```

1. After adding behavioral regression tests but before implementation: **37 passed, 8 failed**, exit 1. Expected failures: known bulk filters wrongly posted dedicated Multiple steps; absent coverage records for Standard Upsert, missing C/U prerequisites, UpsertMultiple inference, Standard DeleteMultiple, ten Root runtime gates, absent-filter uncertainty; unexpected pre-existing dedicated registrations were accepted. The inactive-guard regression passed already, confirming the existing strict readback was retained.
2. First implementation run: 42 passed, 3 failed. Two existing narrow transport fixtures lacked the newly required `primaryobjecttypecode`; fixed to match real metadata. One new assertion extracted the message from the wrong underscore-separated name segment; corrected independently. No production safety check was weakened.
3. Green run: 45 passed, 0 failed. Added existing-behavior checks for preflight disabled/wrong-handler/filter drift and mandatory Delete gap, and strengthened all-six payload assertions.
4. Merged-registration focused suite: **47 passed, 0 failed**, exit 0. Covers exact six payloads, no extra Upsert/Multiple POSTs, Standard Upsert without standalone filter, missing/inactive Create/Update, missing Delete, bulk availability uncertainty, Standard-only DeleteMultiple, UpsertMultiple inference, ten pending Root gates, unsupported and drifted existing registration refusal, plus unchanged deployment safety and snapshot tests.
5. Root then added the bounded numeric diagnosis requirement. After introducing only a behavior-preserving synthetic HTTP-handler test seam, the red run produced **48 passed, 1 failed** for the numeric code. Adding the bounded unknown-length stream regression produced **48 passed, 2 failed**: numeric code absent and the old default HttpClient buffering read over the limit. After implementation, the final complete focused suite produced **50 passed, 0 failed**, exit 0. It exercises real `WebApiTransport.SendAsync` with local synthetic HTTP responses, accepting lower/mixed-case ASCII hex and rejecting missing/wrong-type/malformed/oversized codes, wrong prefix/length/nonhex/Unicode/trailing whitespace and embedded secrets. The unknown-length stream proves no more than 8193 error-body bytes are consumed.
6. .NET 10 Deploy build: **0 warnings, 0 errors**, exit 0.
7. Offline dry-run: exit 0; actual frozen contract loads with six dedicated pairs, ten coverage records, expected fixed target/account/workspace and `readiness:not_live_verified`. No authentication or provider calls occur on this path.
8. `git diff --check`: clean. Search across `tests/*.mjs` found no registration/guardSteps/UpsertMultiple contract consumers. No unchanged Node suite was rerun, per task scope. Server runtime/plugin source was not changed or rebuilt.

## Preservation evidence

SHA-256 before and after is identical:

| Artifact | SHA-256 |
| --- | --- |
| `server/Plugins.cs` | `e3e5d8e7799f94cf52e6fae835a235e8941f0856021b0ed0bbd30318cb698c1a` |
| `server/artifacts/Zunftkueche.Dataverse.1.0.0.nupkg` | `215fb97e2a374a4e621719c3c04cc9b21fc55686ca94fe67cc0d2a221c5bdf73` |
| `import/2026.json` | `d38bf0ac7c2bf34211c1df01af1869dd97522da24e2bde1a284e3e505844a15f` |

Reviewed registration contract SHA-256: `46e7fe2b0a71763318bd713df028c3e57ed7d8a7fae380566622a44f94017207`; the pre-authentication contract pin was updated to this exact file. Seed and package pins were not changed.

## Self-review and remaining gates

Self-review checked the complete assigned diff, metadata-only output semantics, all six required guards, no Multiple/Upsert POST path from the frozen contract, existing-step stop behavior, exact runtime guard preservation, untouched source/package hashes, Root documentation preservation, bounded real-transport error-body reads and exact numeric-only diagnostic output. No known local test/build failures remain.

Independent review is still required before Root activation. Root must verify a legitimate ordinary Custom API Commit succeeds with exactly one workspace revision and one receipt; direct Create/Update/Delete/Upsert, singleton and multirow CreateMultiple/UpdateMultiple, both UpsertMultiple branches, and DeleteMultiple response behavior must preserve state/receipts on denial. This includes the permitted actor so missing basic rights cannot disguise an unguarded route. Expanded guard-step navigation query acceptance, real pipeline ParentContext/transaction shape and resource registration payload acceptance remain live provider facts, not established by these local tests. No claim of live metadata readiness, tenant modification, ordinary-user acceptance or app release is made.

No provider/auth/browser/network tenant actions, subagents, role/group/user/app-registration/plan changes, private cache reads, secret logging, source mutation or deletion were performed by this task.
