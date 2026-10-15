# Fixed package PATCH lexical facts

Base67ca86c. Root approved the scoped plan after inspecting the existing reviewed `Deploy/WebApiTransport.ClassifyPackageError` pattern. Root1840's actual400/0x80040265/unchanged_prior is still a generic refusal; this delta makes no causal diagnosis or package/payload change. No provider/auth/browser/helper action was performed.

Only updater source, its focused tests and this report change. `PatchDiagnostic` gains sorted unique source-defined `Flags` plus nullable Int32 `OperationStatus`/`SubErrorCode`. Scanning is restricted to direct `error.message` and one `error.innererror.message`. The original PackageWords list is preserved exactly, with approved additions: update,upgrade,existing,same,different,immutable,concurrency,rowversion,etag,precondition,match,support,unsupported. Existing fixed not_found/not_supported/not_allowed token pairs are retained. These are lexical observations, not proven causes.

Only the two exact CDS ErrorDetails numeric annotations are requested through the approved Prefer selector. Numbers require Int32 JSON values or canonical invariant Int32 strings. Duplicate relevant message, innererror or annotation fields suppress all additive facts while retaining the already-validated status/code. Existing duplicate root-error/code gates and8192+1-byte/depth16 bounds remain. No TraceText, deeper messages, arbitrary fields, remote hash, raw text, header/ETag values, URL, token or package content is emitted. Success responses and no-PATCH paths retain empty flags/null numeric details. One PATCH, exact ETag/body/identity checks, no retry and independent authoritative byte readback remain unchanged.

## Focused red/green

CWD `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app`; build environment `DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home`.

```
../dotnet10/dotnet build server/PackageUpdate.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet10/dotnet server/PackageUpdate.Tests/bin/Debug/net10.0/Kitchen.PackageUpdate.Tests.dll
../dotnet10/dotnet server/PackageUpdate/bin/Debug/net10.0/Kitchen.PackageUpdate.dll
```

Red against prior implementation:29 passed;3 failed (new lexical/header/numeric/duplicate-path groups). Final: **32 passed;0 failed**, build **0 warnings;0 errors**,1.62s. Offline console exit0: `{"mode":"offline_no_authentication_or_provider_calls"}`. No restore, stalled build, process termination, other suite or package rebuild.

Tests use the actual updater handler. They verify exact numeric-only Prefer selector, unchanged content/ETag PATCH, one mutation/two file reads, hostile message suppression, every added lexical category, sorted/deduplicated labels, ignored TraceText/deeper/unknown fields, canonical Int32 extremes, malformed/overflow/noncanonical/wrong-type numbers, duplicate relevant fields, success silence, and valid-code bodies rejected for excessive size/depth. Prior29 tests retain transport/status/code/readback coverage.

Python source comparison confirms the old reviewed allowlist is an exact prefix of the new list; only the13 approved additions follow it. Independent SHA/size reread:

- Original nupkg290280 bytes: `215fb97e2a374a4e621719c3c04cc9b21fc55686ca94fe67cc0d2a221c5bdf73`.
- Diagnostic nupkg290994 bytes: `1c6ea57c3c56922911d201fde6a7c2a862efa0619ac7f81e5fe42fcf2ede7d92`.
- Source manifest461 bytes: `5bffc2cf14f08132e77f903305a5863cafa45e39aaa2b4a14fd1a17e8f0a29b3`.

Self-review: all diagnostic capture remains after the sole fixed PATCH; no facts influence authorization, success, payload or retry; all parser failures still reach postread. Root README/docs/ledger/status remain outside the commit. Independent review is required before Root's next explicitly authorized attempt.

## Parked observation, not an implemented fix

Local code confirms original package POST adds `MSCRM.SolutionUniqueName=zk_Zunftkueche`, whereas the updater PATCH does not. Root supplied general solution-context references ([view customization](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/customize-entity-views), [metadata operations sample](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/web-api-metadata-operations-sample)); those do not establish a PluginPackage-specific cause for this refusal. Root64513 found no correlated Update/Create traces. This header difference remains an unproven hypothesis for later assessment against actual fixed facts. No SolutionUniqueName, package name, version, nupkg, guard, ETag or business-state change is made here.
