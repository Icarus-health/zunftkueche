# First-gate instrumentation and fixed package content updater

Base: `009233e806d975bc4eece7b2a06e35ba4327dee8`. Implemented only the authorized refusal instrumentation and isolated updater. No provider, authentication, browser, tenant, runtime acceptance or helper-agent action was performed. No claim that Commit is fixed; an actual failed-bit observation is still required.

## Scope and invariants

`server/Plugins.cs` retains the original complete first `if` predicate byte-for-byte and the existing denial prefix. Only its already-denied branch appends `[zk_guard_v1;m=<mask>;p=<kind>]`. The 15 bits and 0..10 parent mapping are exactly those in `instrumentation-plan.md`. Parent-dependent checks are skipped when the parent is absent; missing versus wrong-type marker/Target bits are exclusive. Diagnostic exceptions yield mask0/kind0 while still denying. All subsequent guard checks, Protocol, StatePolicy, business data, API/guard registration and import files are unchanged.

Acceptance retains existing 8192-byte/depth16 bounds and denial/release behavior. Facts require HTTP400/500, exact code0x80040265, guard_context and an exact canonical message with one version1 suffix. Unknown versions, duplicates, prefixes/suffixes, noncanonical numbers, overflow and out-of-range values produce null facts. Only nullable numeric GuardMask/ParentKind enter failed-commit evidence; remote text is never retained or printed.

`server/PackageUpdate` is a separate console. No arguments means offline local artifact/source validation; only `--execute` enables the existing ephemeral MSAL flow. No URL/ID/path/hash/size/field mutation arguments exist. Its sole possible mutation is one PATCH of `pluginpackages(70a54daa-73c8-f111-a05c-7ced8d5f6e0d)`, with exactly one `content` property. The updater cannot POST, create, delete, register or disable anything. Every instance is one-shot even after an exception.

Before authentication the console validates old/new artifacts and a pinned source manifest. Before mutation the updater repeats local validation, then reuses ResourceEngine WhoAmI and exact account/object/organization/German-language/EUR checks. It requires exact package ID/name/uniquename/version/Active state plus a nonempty file GUID. Root34117's superseding ruling is implemented: PluginPackage metadata must report optimistic concurrency=true and the row must supply a valid numeric weak ETag; the exact observed ETag is sent in If-Match. False/missing concurrency or malformed/missing ETag blocks, with no `*` fallback. The old-byte read is followed by this conditional PATCH, not claimed as a standalone atomic hash CAS.

The fixed file reader is bounded by max(290280,290994)+1 and accepts only the two exact lengths, HTTP200 and no redirect. Exact current bytes yield read-only `already_current`; exact prior bytes are eligible; all others block. Regardless of PATCH success, refusal or exception, an independent fixed-row/file read classifies `updated_exact`, `unchanged_prior` or `unconfirmed`, without retry. The latter two return CLI exit2; successful classifications return0. All other failures return1 with a fixed suppressed error. No HTTP response body, ETag, token, state or arbitrary remote text is printed. Root must run its existing read-only verification of package/types/APIs/six guards before and after the update; no duplicate metadata framework was added.

## Measured artifact and source pins

Original preserved byte-for-byte, unmodified at `server/artifacts/Zunftkueche.Dataverse.1.0.0.nupkg`:

- 290280 bytes; SHA256 `215fb97e2a374a4e621719c3c04cc9b21fc55686ca94fe67cc0d2a221c5bdf73`.

New SDK-built package at `server/artifacts/guard-diagnostic-v1/Zunftkueche.Dataverse.1.0.0.nupkg`:

- 290994 bytes; SHA256 `1c6ea57c3c56922911d201fde6a7c2a862efa0619ac7f81e5fe42fcf2ede7d92`.
- Kitchen.Dataverse.dll SHA256 `fcc729c90f95b9fff07cc89a310c3158ca0f0db67c79c781e2cb9f053cdb4c38`.
- Newtonsoft.Json.dll SHA256 `e1e27af7b07eeedf5ce71a9255f0422816a6fc5849a483c6714e1b472044fa9d`, byte-identical to original.
- Source manifest SHA256 `5bffc2cf14f08132e77f903305a5863cafa45e39aaa2b4a14fd1a17e8f0a29b3`; manifest includes Plugins.cs, both Policy files, package csproj and package lockfile. Per-file hashes are in the adjacent `source-manifest.sha256`.
- Original import SHA unchanged: `d38bf0ac7c2bf34211c1df01af1869dd97522da24e2bde1a284e3e505844a15f`.
- Registration contract SHA unchanged: `08bd35ddbb43f12ee2c80eed9048630bebf25a899d012a327db3aa9f647baf47`.

Seed.PackageHash, Deploy/Acceptance default package paths and normal package-file length pin now require the new revision only. The old hash/length are isolated in the updater. Its new artifact and source manifest are included explicitly for immutable review; the existing original remains in its pre-existing ignored location and must accompany Root's execution copy.

ZIP inventory contains only `_rels/.rels`, nuspec, the two `lib/net462` DLLs, README, Content_Types and NuGet core properties. Only Kitchen.dll changed among runtime DLLs. SDK packaging also changed the nuspec repository.commit from a2bc2c3 to base009233e, incorporated the already-approved six-guard server README, and regenerated ZIP relationships/core-properties identity. Package ID/version/authors/dependency group are unchanged. Root explicitly accepted these benign packaging/documentation differences; no repack for metadata byte-equality was performed. No Deploy, Acceptance or updater code is in the nupkg.

## Exact commands and results

Working directory for all commands: `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app`.
For SDK commands the environment was `DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home` and `DOTNET_GENERATE_ASPNET_CERTIFICATE=false` where supplied. Builds were sequential, never concurrent.

1. Guard red: compiled the new tests against original Plugins.cs. An initial `dotnet run` invocation omitted the required seed argument and exited134; corrected direct execution below established the meaningful red: **45 passed, 1 failed** (`guard diagnostic reports each failed first-gate condition without remote values`).
   `../dotnet/dotnet server/Tests/bin/Debug/net8.0/Kitchen.Policy.Tests.dll import/2026.json`
2. Acceptance red: compiled the new assertion against saved base Acceptance source, then restored the instrumented source. Build succeeded; direct test result **29 passed, 1 failed**, specifically missing GuardMask/ParentKind facts.
   `../dotnet10/dotnet build server/Acceptance.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1`
   `../dotnet10/dotnet server/Acceptance.Tests/bin/Debug/net10.0/Kitchen.Acceptance.Tests.dll`
3. The earlier implicit `dotnet run --project server/Acceptance.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1` stalled without output. Own PID83765 was identified after93s and terminated with exact `kill -TERM 83765`; session76096 closed. No global shutdown/pkill was used. Subsequent explicit serial builds completed normally. No passing test claim is derived from this cancelled run.
4. Package build (original path was not the output directory):
   `../dotnet/dotnet pack server/Kitchen.Dataverse.csproj --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1 -o server/artifacts/guard-diagnostic-v1`
   Succeeded, net462 DLL and new nupkg produced. Existing package lockfile unchanged. ZIP/hash/source-manifest checks used Python hashlib/zipfile; exact output recorded above.
5. New updater dependency restore:
   `../dotnet10/dotnet restore server/PackageUpdate.Tests --configfile server/NuGet.Config -p:NuGetAudit=false`
   Sandbox attempt failed NU1301/DNS. Approved same official NuGet restore succeeded for Deploy/PackageUpdate/PackageUpdate.Tests. No dependency versions changed. New lockfiles were generated, then verified with:
   `../dotnet10/dotnet restore server/PackageUpdate.Tests --configfile server/NuGet.Config --locked-mode -p:NuGetAudit=false`
   All three restored successfully. A platform CSSM warning appeared during the sandbox restore; final builds below had zero warnings/errors.
6. Updater red against NotImplemented stubs: **15 passed, 6 failed**, including local validation, old→new, already-new, ambiguous→new, refused-old and unconfirmed. The rejecting cases already passed because the stub failed closed. Stub build emitted three unused-parameter warnings, absent from final implementation.
7. Final server build and full existing corpus suite:
   `../dotnet/dotnet build server/Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1`
   `../dotnet/dotnet server/Tests/bin/Debug/net8.0/Kitchen.Policy.Tests.dll import/2026.json server/Tests/obj/reducer-corpus.json`
   **66 passed, 0 failed**, build0 warnings/0 errors. An earlier seed-only run was46/0;66 is the full corpus result. New cases exercise all15 bits, parent-null suppression, parent kinds, missing/wrong types, combinations, exact safe messages and diagnostic fallback, while existing allow/deny cases stay intact.
8. Deploy:
   `../dotnet10/dotnet build server/Deploy.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1`
   `../dotnet10/dotnet server/Deploy.Tests/bin/Debug/net10.0/Kitchen.Deploy.Tests.dll`
   **74 passed, 0 failed**, build0 warnings/0 errors. First run73/1 identified one test's remaining old hardcoded bound290281; updated it to current expected-length+1 and reran this suite. Production bound was already correct.
9. Acceptance:
   `../dotnet10/dotnet build server/Acceptance.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1`
   `../dotnet10/dotnet server/Acceptance.Tests/bin/Debug/net10.0/Kitchen.Acceptance.Tests.dll`
   **30 passed, 0 failed**, build0 warnings/0 errors. The new test covers valid facts, malformed/duplicate/unknown/overflow/status/code cases and propagation into an unchanged-persistence failed commit without retry.
10. Updater:
   `../dotnet10/dotnet build server/PackageUpdate.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1`
   `../dotnet10/dotnet server/PackageUpdate.Tests/bin/Debug/net10.0/Kitchen.PackageUpdate.Tests.dll`
   **26 passed, 0 failed**, build0 warnings/0 errors. Actual HTTP handler tests cover one exact Content PATCH/ETag, already-current0writes, bad identity/object/language/currency/package fields/hash/concurrency/ETag, missing package/file, redirect/oversize (with and without length), timeout/refusal independent readback, unconfirmed/missing-after, same-instance repeat rejection, forbidden paths/methods before token acquisition, and altered local artifacts/source before any network call.
11. Offline smoke commands, all exit0 and no authentication/provider calls:
   `../dotnet10/dotnet server/PackageUpdate/bin/Debug/net10.0/Kitchen.PackageUpdate.dll`
   → `{"mode":"offline_no_authentication_or_provider_calls"}`
   `../dotnet10/dotnet server/Deploy/bin/Debug/net10.0/Kitchen.Deploy.dll --dry-run`
   → current package SHA1c6ea57…, unchanged import SHA,6guards/10coverage records, not_live_verified.
   `../dotnet10/dotnet server/Acceptance/bin/Debug/net10.0/Kitchen.Acceptance.dll`
   → offline=true, providerCalls=0, writes=0, rootReleaseAllowed=false.

No Node/UI tests were rerun. No original data or local working state was seeded or modified.

## Self-review and Root invocation

Reviewed exact original predicate comparison, denial-only diff, full bounded diagnostic parsing, updater's sole PATCH site and fixed path/body, conditional exact ETag, closed unknown outcomes/no retry, all current/prior pins and ZIP contents. Root README/client/status/spec/plan edits remain outside this commit. No new generic deployment framework, permission changes or relaxed guard exists.

After independent review, Root alone may run from its verified immutable repository copy (with both pinned package files, current source manifest and source files):

`../dotnet10/dotnet server/PackageUpdate/bin/Debug/net10.0/Kitchen.PackageUpdate.dll --execute`

The existing public AUTH_URL flow is unchanged; Root opens it in DuckDuckGo. A result of updated_exact verifies bytes and immutable package metadata only. Root must independently verify current package/types/APIs/six guards and then explicitly run the diagnostic acceptance attempt with independent persistence readback. The actual failed bit and runtime success remain unknown.
