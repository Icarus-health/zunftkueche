# Bounded package PATCH response diagnostics

Base `3764110476462e49b999931932332a090030198f`; requirements and Root ruling: `package-update-diagnostic-brief.md`. Root90870 returned unchanged_prior/exit2. This delta supplies missing response facts; it does not infer a cause or modify the package/update request. No provider/auth/browser actions, plugin rebuild or helper agents were used.

## Change

Only `server/PackageUpdate/FixedPackageUpdater.cs`, its console output, focused tests and this report changed. The updater exposes nullable `PatchDiagnostic.HttpStatus`, `DataverseCode` and `TransportFailure`. It captures HTTP status immediately upon receiving the PATCH response. On non-success only, it reads at most8193 bytes in memory and parses at most8192 bytes/depth16. Code must be exactly `0x` plus8 hex digits; duplicate relevant root `error` or nested `code` keys are rejected. Unknown/malformed/oversized/deep bodies retain the numeric status and null code. Success bodies are ignored.

The only transport labels are own fixed strings `timeout`, `network_error`, `response_read_failed`; unrecognized exceptions provide no invented label. No remote message, response body, ETag, header, URL, token or content enters output. The console adds `patchDiagnostic` beside its existing result/runtimeReady fields. Diagnostic failures cannot bypass the existing independent package readback. Result strings and exit semantics, exact ETag CAS, one Content PATCH, all metadata/identity/source guards, pins and no-retry behavior are unchanged.

## Red/green verification

Working directory: `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app`.
Build environment: `DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home`.

Commands:

```
../dotnet10/dotnet build server/PackageUpdate.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet10/dotnet server/PackageUpdate.Tests/bin/Debug/net10.0/Kitchen.PackageUpdate.Tests.dll
../dotnet10/dotnet server/PackageUpdate/bin/Debug/net10.0/Kitchen.PackageUpdate.dll
```

New tests first ran against base implementation: **26 passed;3 failed**, the three new groups specifically lacked response diagnostics. Final serial build: **0 warnings,0 errors**,1.64s. Final actual updater-handler suite: **29 passed;0 failed**. Offline console: `{"mode":"offline_no_authentication_or_provider_calls"}`, exit0. No build stalled; no restore or process termination was needed.

New coverage: HTTP400/412/500 numeric code with hostile private message,204 with ignored body, invalid JSON/type/code, duplicate envelope keys, depth>16, size>8192 with and without Content-Length, response-stream IOException, pre-response cancellation/network failure, already-current/no PATCH. Tests assert unchanged_prior authoritative readback, two file reads after every attempted mutation, one exact content/ETag PATCH, no remote string escape, and absent status/code when no response exists. Existing26 checks remain green. Only the affected updater suite/build ran; no unrelated server/Node/UI suites or package builds.

Independent local SHA/size reread confirmed unchanged:

- Prior nupkg:290280 bytes, `215fb97e2a374a4e621719c3c04cc9b21fc55686ca94fe67cc0d2a221c5bdf73`.
- Diagnostic nupkg:290994 bytes, `1c6ea57c3c56922911d201fde6a7c2a862efa0619ac7f81e5fe42fcf2ede7d92`.
- Plugin source manifest:461 bytes, `5bffc2cf14f08132e77f903305a5863cafa45e39aaa2b4a14fd1a17e8f0a29b3`.

Self-review verified one unchanged mutation site/path/body/ETag, no diagnosis-dependent branch into success/retry, strict numeric-only remote output, bounded parser/read, and mandatory independent postread after response/transport/diagnostic failures. Root README/docs/ledger/status remain unstaged. Independent scoped review is required before Root's next explicitly authorized attempt. The actual provider refusal reason remains unknown until then.
