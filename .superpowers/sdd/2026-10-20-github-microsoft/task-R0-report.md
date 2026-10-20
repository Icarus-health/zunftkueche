# R0 — bounded SDK-step inventory query correction

Status: DONE_WITH_CONCERNS (local correction complete; native use pending parent review).
Base: `8d9ae37`. Source freeze: `b8bb4ab1d94941840f6967297f0339befe6aa9c4`.
Owned production/test delta: `server/Release/ReleaseInventory.cs`, `server/Release/Tests/Program.cs` only. No browser, auth, provider call, network, credential-cache inspection, grants or live rerun occurred. No historical source was edited. Parent owns GitHub/docs and the next regular native read.

## Evidence and cause

Privately parsed the existing `server/Release/backups/20261020T100646Z-1721dba0fb6e4dfe84ce797f30bfd09d/response-0066.bin` (221 bytes). Its safe technical facts are HTTP 400, code `0x80041102`, and failure to find logical entity `zk_kitchendocument` in the metadata cache. No private business/identity/credential content is reproduced here. The request is the old fixed SDK-step query filtering through `sdkmessagefilterid/primaryobjecttypecode` by the two new table names, OR global-null filter. The observed error establishes name resolution fails despite that OR branch. Inference: server metadata resolution of logical table names prevents this query from serving the absent-table case; this is downstream of the successful authentication already observed by the parent. A 400 is never interpreted as absent-table evidence; fresh schema evidence remains mandatory.

## Minimal correction and retained boundaries

The existing literal Steps endpoint is now `sdkmessageprocessingsteps?$expand=sdkmessageid,sdkmessagefilterid,eventhandler_plugintype&$count=true`. It collects an SDK registration metadata superset without resolving new-table names in a filter. It captures global, target-table and unrelated-table steps with their existing expanded message/filter/plugin metadata, including subsequent pages. This is not an arbitrary URL/filter/action interface. No Reader, schema, rights, metadata, completeness, route-validation or auth code was changed.

Both existing production callers still cap SDK rows at 10000. Reader still enforces count agreement, same-origin/path/query continuation, duplicate-ID and duplicate-page refusal, 500-page limit, per-response and total byte caps and fixed initial-path allowlisting. Metadata only is read by this endpoint; it does not read business rows. All-table registrations can produce more discovered-route obligations in the unchanged guard validator; that is conservative and may require separate future evidence. A native inventory above existing bounds fails closed rather than truncating. The two schema-progress reads still determine whether target stores are installed.

## Focused verification and commands

Cwd throughout: `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app`.

Build/publish environment on every successful build:

```sh
DOTNET_CLI_HOME=/private/tmp/kitchen-release-dotnet
DOTNET_CLI_TELEMETRY_OPTOUT=1
DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1
DOTNET_GENERATE_ASPNET_CERTIFICATE=false
DOTNET_ROOT=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet
NUGET_PACKAGES=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/nuget
```

Each was prefixed inline to the commands below (not a package/runtime upgrade). The existing SDK is 8.0.426, pinned runtime 8.0.32, with restore disabled.

| Exact command after environment | Result |
| --- | --- |
| `../dotnet/dotnet build server/Release/Tests/Tests.csproj -c Release --no-restore -v minimal -m:1 -nr:false -p:UseSharedCompilation=false` | exit 0, 0 warnings/errors. Final test-source RED build 3.05 s; GREEN build 3.22 s. |
| `../dotnet/dotnet server/Release/Tests/bin/Release/net8.0/Tests.dll --inventory-query-only` with original query | final RED: exit 1, 8 passed/2 failed. Both complete-capture cases (absent/present target tables) fail with Stop at the synthetic 400 boundary. Earlier first-draft RED was 8/1. |
| same test command with corrected query | final GREEN: exit 0, **10 passed/0 failed**. Earlier first-draft GREEN was 9/0; these are reused cases, not 19 unique tests. |
| `../dotnet/dotnet publish server/Release/Kitchen.Release.csproj -c Release --no-restore -o server/Release/release/reviewed -v minimal -m:1 -nr:false -p:UseSharedCompilation=false` | exit 0; published after source-freeze commit. |
| `../dotnet/dotnet server/Release/release/reviewed/Kitchen.Release.dll` | exit 0; `PLAN_OFFLINE`, contracts valid, no auth/transport constructed; release remains incomplete. |
| `git diff --check` | exit 0, no whitespace errors. |

Tests use real Reader plus an in-memory HttpMessageHandler boundary; no network. Two synthetic provider inventories separately cover absent tables (global and unrelated registrations retained across two pages) and installed tables (document, draft, global, unrelated retained with expansions). Eight refusal cases cover missing count, changed count, truncated collection, duplicate ID, changed-query continuation, foreign-origin continuation, row-bound overflow, and arbitrary query rejection before token acquisition. No unaffected 124/full frontend suite was rerun, per task and AGENTS scope.

Initial attempted `../dotnet/dotnet run --project server/Release/Tests/Tests.csproj --no-restore -- --inventory-query-only` used isolated CLI home and cache but stalled with no compiler result. Cancellation was requested; session 93100 remained pending at last check. It did not produce test evidence. The initial CLI run reported a first-use certificate attempt with `CSSM_ModuleLoad` invalid-parameter warning. Subsequent builds explicitly disabled certificate generation and shared compilation, and ran serially without node reuse; every such build returned cleanly. Read-only process-list diagnostics (`ps`/`pgrep`) were denied by the environment. No escalation was requested.

## Refreshed local closure, not independent approval

Refreshed only file lengths/hashes in existing ignored source/build manifests and their source-to-build hash link; historical base/provenance fields remain historical. Host/client manifests and launcher bytes were retained unchanged. Python stdlib verified all 16 historical source/derived-input hashes from provenance. The closure gate verified 52 source files, 7 built files, 186 host files, 89 client files. No new gate path or compile input was needed.

The exact refresh transformation was:

```python
import json, hashlib
from pathlib import Path
root=Path('.')
r=root/'server/Release'
for name in ('source-manifest.json','build-manifest.json'):
    p=r/name; doc=json.loads(p.read_bytes())
    for row in doc['files']:
        raw=(root/row['path']).read_bytes()
        row['bytes']=len(raw); row['sha256']=hashlib.sha256(raw).hexdigest()
    if name=='build-manifest.json':
        doc['sourceManifestSha256']=hashlib.sha256((r/'source-manifest.json').read_bytes()).hexdigest()
    p.write_text(json.dumps(doc,indent=2)+'\n')
```

| Artifact | SHA-256 |
| --- | --- |
| `source-manifest.json` | `257a2fb1e3dad98d233d77ff08e534a54dc77d1fb2b36459a5ffa7dfc5a8ba76` |
| `build-manifest.json` | `ee63a15b68f8883ef8da49a8bd3eb6dd61b4b47ade8803f6eae7ddf8b4e93a36` |
| `host-manifest.json` | `52531b1179f7c925f05dcdeb87b4fc4ff74ef61344a259e448e714dc8a27d5b5` |
| `client-manifest.json` | `492543275cd07eb9c1b529a6ba10277590ff39dfa005d2ea0d7fea56222a7968` |
| `prelaunch.py` | `afa7a1f2e459b5bda4b9e767ee920aa2edf0ba814eee93a632231ace6baa40cd` |
| `release/reviewed/Kitchen.Release.dll` | `489c653df86e3259c2e2b635fd005694ed0ab4bfe364b8ad9147048b3e1f9299` |

Before gate execution, Python stdlib compared the launcher bytes against the literal `afa7a1f2e459b5bda4b9e767ee920aa2edf0ba814eee93a632231ace6baa40cd`; result `LAUNCHER_PIN_MATCH`.

Exact offline closure invocation (exit 0):

```sh
python3 -I -B server/Release/prelaunch.py --source-sha256 257a2fb1e3dad98d233d77ff08e534a54dc77d1fb2b36459a5ffa7dfc5a8ba76 --build-sha256 ee63a15b68f8883ef8da49a8bd3eb6dd61b4b47ade8803f6eae7ddf8b4e93a36 --host-sha256 52531b1179f7c925f05dcdeb87b4fc4ff74ef61344a259e448e714dc8a27d5b5 --client-sha256 492543275cd07eb9c1b529a6ba10277590ff39dfa005d2ea0d7fea56222a7968
```

Output: `PLAN_VERIFIED_OFFLINE: source/build/host/client closure; no candidate/authentication loaded. Native release gates remain open.` These proposed pins are local candidate identities, not self-approval or a complete native capture. Parent must independently review BASE..HEAD and the candidate closure before any native use. No original-version completeness, native route/access/device/restore/publication acceptance is claimed.
