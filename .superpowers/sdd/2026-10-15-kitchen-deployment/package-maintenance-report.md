# Explicit fixed-package maintenance mode

Base `b21e325`; implementation follows Root's `package-maintenance-ruling.md`. No provider, authentication, browser, package rebuild or helper actions were performed. Root must obtain independent review before executing the new mode.

## Evidence and bounded decision

Root's actual attempts 90870/1840/73560 each left the independently read package at the exact prior bytes. Attempts 1840/73560 reported HTTP400/0x80040265; 73560 emitted only fixed flags `existing,match,rowversion,version`. Read-only 17609 confirmed exact package identity, ETags matching versionnumber, stable metadata reads and a stable ETag across the file GET. Refreshing an ETag after download therefore had no observed basis.

Earlier read-only inspection of the installed official PAC2.13.1 `bolt.dataverse.dll` (SHA256 `078de2975056b00e78d5b694426e925c187e1c8581be840907e961ead6a049ba`) showed its complete `ClientPrimitives.UpdatePackage` method setting only content on a pluginpackage Entity and sending UpdateRequest, without assigning RowVersion or ConcurrencyBehavior. This is evidence of the normal tooling path, not proof of a platform bug or universal lack of package CAS support. [Microsoft's conditional-operation guidance](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/perform-conditional-operations-using-web-api) documents `If-Match:*` as preventing creation during update; it does not compare a prior version.

Root explicitly authorized this separate package-only maintenance option for the private initial sandbox. Root must ensure a short controlled session with no concurrent package writer introduced by this work. This operational assumption does not exclude every external administrator. A writer racing after the last read could have its revision overwritten. Exact final bytes prove observed content, not exclusive authorship. Workspace CAS and all runtime guards remain untouched.

## Implementation

No arguments remains offline with local pin validation only. `--execute` still invokes the strict exact-ETag path. The sole new accepted invocation is `--execute-exclusive-package-content`; combined flags, arbitrary modes/targets and additional arguments fail closed before authentication. Two named updater methods share the existing one-use latch; no fallback or retry exists.

Maintenance validates the same local source/artifact pins, target/account/object/organization/German/EUR and concurrency capability. It reads exact immutable package metadata plus validated weak ETag and package-file GUID (snapshot A), downloads exact prior bytes, then immediately reads snapshot B. Both snapshots independently require the same fixed ID/name/uniquename/version/active state; ETag and file GUID must also match each other. Drift or absence stops before any PATCH. Already-current bytes still return read-only success.

Only this explicit mode sets `If-Match:*` using `EntityTagHeaderValue.Any`. The sole mutation remains one fixed-record, content-only PATCH with the same pinned new artifact. Existing bounded diagnostics and independent identity/file readback run after all attempted mutation outcomes. Output reports `concurrencyMode=exclusive_writer_no_atomic_cas`; strict execution reports `exact_etag`. There is no generic mutation API, automatic retry, header-context guess, package identity change or dependency addition.

## Focused red/green verification

Working directory: `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app`.
Build environment: `DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home`.

Commands:

```
../dotnet10/dotnet build server/PackageUpdate.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet10/dotnet server/PackageUpdate.Tests/bin/Debug/net10.0/Kitchen.PackageUpdate.Tests.dll
```

New API/parser tests first ran with stubbed behavior: **32 passed;4 failed**. Initial implementation reached **35 passed;1 failed**. The remaining failure was substantive: constructing the wildcard via `EntityTagHeaderValue.Parse("*")` prevented request dispatch, then the unchanged exception/readback path correctly returned unchanged_prior. The new actual-handler test observed zero PATCHes and `row,file,row,row,file`, instead of its required single mutation. Replacing wildcard parsing with the framework's `EntityTagHeaderValue.Any` fixed request construction; no test expectation was relaxed. The temporary diagnostic was removed.

Final serial build: **0 warnings,0 errors**,2.51s. The affected suite was then run once: **36 passed;0 failed**, exit0. No unrelated suites or package rebuilds were run for this change.

The four added groups cover exact invocation routing, maintenance success/already-current/refusal/ambiguous timeout/unconfirmed postread and original gates, second-snapshot ETag/file/ID/name/uniquename/version/state drift or absence, and strict412 refusal without fallback or a second call. Assertions inspect actual handler requests for fixed target, exact content-only body, exact appropriate If-Match value, one PATCH, metadata/file/metadata/PATCH ordering and independent postread. All prior32 checks remain green.

## Pins and self-review

Independent local SHA256 reread confirmed unchanged:

- Prior nupkg: `215fb97e2a374a4e621719c3c04cc9b21fc55686ca94fe67cc0d2a221c5bdf73`.
- Diagnostic nupkg: `1c6ea57c3c56922911d201fde6a7c2a862efa0619ac7f81e5fe42fcf2ede7d92`.
- Source manifest: `5bffc2cf14f08132e77f903305a5863cafa45e39aaa2b4a14fd1a17e8f0a29b3`.
- Registration: `08bd35ddbb43f12ee2c80eed9048630bebf25a899d012a327db3aa9f647baf47`.

The passing existing offline-pin test also validates artifact lengths and every source manifest entry. Self-review confirms the original strict request uses the original exact ETag, maintenance is explicit and fixed-purpose, snapshot failures occur before mutation, result semantics and suppressed diagnostics are unchanged, and only one mutation site exists. Root README/docs/status/ruling and all plugin/domain/workspace files are excluded from this commit. Provider acceptance remains unproven; this console change only makes the independently reviewable maintenance operation available.
