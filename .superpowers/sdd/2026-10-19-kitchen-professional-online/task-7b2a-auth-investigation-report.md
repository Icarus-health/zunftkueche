# Task 7b.2a — offline authentication failure diagnosis

Base: `408c960175dbb6ed4a8776eb1b2db2f7668c28ee`. Scope: bounded diagnostic evidence only. No browser, authentication, provider, network, CLI credential cache, token or callback was used in this task.

## What is known

The parent-observed second read-only inspect started the reviewed MSAL 4.83.0 interactive PKCE handoff, printed a public authorization URL, then exited 2. Its retained private capture has `failure-status.json` with `NotStarted/OperationFailed` and no native API or capture files. The earlier network-restricted run also ended 2 before an authorization URL. The later localhost connection refusal followed the process exit; it does not establish the first failure.

Current `server/Release/Program.cs` previously recorded every non-`Stop` exception as `OperationFailed` and its outer catch printed only `RELEASE_STOPPED`. `FailureStage.NotStarted` persisted until `ReleaseInspector.Inspect` entered. Thus the evidence does **not** establish whether interactive MSAL, callback/token exchange, claims checks, Reader construction, object-ID access, or native inspection failed. Sign-in success, token issuance, permission state, consent state and any Dataverse result remain unknown. The accepted historical inventory `Authentication.cs` and `server/Release/Authentication.cs` use the same client, authority, redirect, scope, interactive request, in-memory cache, tenant/account/issuer/oid checks and token-expiry rule; the owned Release copy has the reviewed URL shape checks and IAB wording. All 15 copied provenance sources and the derived historical source hash still match `server/Release/provenance.json`.

## Minimal diagnostic delta

Owned Release code now marks fixed progress boundaries: `Construction`, `Interactive`, `AuthorizationHandoff`, `AwaitingCallbackOrToken`, `Claims`, `NativePreparation`, `Native`. `AwaitingCallbackOrToken` means the public handoff returned and MSAL is waiting; it does **not** claim a callback arrived. `NativePreparation` means sign-in validation returned but Reader/object-ID preparation may still fail; `Native` begins just before inspector work. The independent `FailureStage` remains the actual inventory stage.

On failure, the existing exit-2 and fail-closed behavior remains. Console and private `failure-status.json` receive only those fixed stage labels, a fixed exception class label, and a fixed allowlisted MSAL code label or `Unrecognized`/`NotApplicable`. The diagnostic never serializes exception messages, inner exceptions, stack traces, raw MSAL code, provider response, claims, account value, URL, authorization code or token. No authentication mode, permission, certificate, scope, account/tenant/issuer check, network handling or retry changed. This is **not an authentication fix** and does not authorize rerunning the blocked browser path.

## Focused local verification

All .NET commands used `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet/dotnet` with `DOTNET_CLI_HOME=/private/tmp/kitchen-auth-dotnet`, `DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1`, `DOTNET_CLI_TELEMETRY_OPTOUT=1`, `DOTNET_GENERATE_ASPNET_CERTIFICATE=false`, and `DOTNET_ROOT=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet`. Working directory was the repository root. The first build without the isolated CLI home failed before compilation because the sandbox denied `/Users/sorenkube/.dotnet`; the corrected build passed. One synthetic test first used `/tmp`, which `Backup` correctly rejected as a symlink; the test now uses `/private/tmp`.

| Exact command after the environment above | Result |
| --- | --- |
| `dotnet build server/Release/Tests/Tests.csproj -c Release --no-restore -v minimal -m:1 -nr:false` | exit 0; Release, GuardHarness and Tests built; 0 warnings, 0 errors |
| `dotnet server/Release/Tests/bin/Release/net8.0/Tests.dll --auth-diagnostics-only` | exit 0; **4 passed, 0 failed**, synthetic only; adversarial message/URL/user/token-like data and arbitrary MSAL error code suppressed in console JSON and private failure status; status remains incomplete |
| `dotnet publish server/Release/Kitchen.Release.csproj -c Release --no-restore -o server/Release/release/reviewed -v minimal -m:1 -nr:false` | exit 0; refreshed local candidate binary |
| `dotnet server/Release/release/reviewed/Kitchen.Release.dll` | exit 0; `PLAN_OFFLINE`, no authentication/transport constructed |
| `dotnet server/Release/release/reviewed/Kitchen.Release.dll unknown-mode` | exit 2; fixed `RELEASE_STOPPED`, no auth diagnostic |
| `python3 -I -B server/Release/prelaunch.py --source-sha256 0d5ff61525010fd27f63b60f846b84406e89114692c7c0ee3810312a5c582d35 --build-sha256 1c423cfa451f0d60bf9e86f9796fe7b5fe22209cde215a258f56d9d3c3ffc275 --host-sha256 52531b1179f7c925f05dcdeb87b4fc4ff74ef61344a259e448e714dc8a27d5b5 --client-sha256 492543275cd07eb9c1b529a6ba10277590ff39dfa005d2ea0d7fea56222a7968` | exit 0; offline closure only, no candidate/authentication loaded |

The source manifest contains 52 checked files; build manifest contains 7; all 16 historical provenance entries match. Candidate pins: source `0d5ff61525010fd27f63b60f846b84406e89114692c7c0ee3810312a5c582d35`, build `1c423cfa451f0d60bf9e86f9796fe7b5fe22209cde215a258f56d9d3c3ffc275`, host `52531b1179f7c925f05dcdeb87b4fc4ff74ef61344a259e448e714dc8a27d5b5`, client `492543275cd07eb9c1b529a6ba10277590ff39dfa005d2ea0d7fea56222a7968`, launcher `afa7a1f2e459b5bda4b9e767ee920aa2edf0ba814eee93a632231ace6baa40cd`. Generated manifest bytes and command/results are retained under `task-7b2a-evidence/`. These are local candidate identities, **not independent approval**.

The next root-cause evidence would be a separately reviewed diagnostic build in a permitted normal user login: its fixed stage/type/code plus the existing incomplete status. The parent owns that interaction and any browser policy decision. No cause or authentication success can be claimed from these offline tests.
