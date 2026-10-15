# v4 refusal-only Target bookkeeping diagnostic

Base: 592204fe2835c9482531da7cd16e3bf40f4901cf. Implements Root-approved guard-target-plan.md; v5 allowance is not implemented. Local verification only; no provider/auth/browser actions or helpers.

## Behavior and self-review

The exact authorization/source binding and final Target predicates are unchanged. The original target_v1 suffix remains intact. Only an already refused Update/zk_kitchenworkspace adds decor_v1: successful measurement bit; four fixed presence/type/null masks; fixed GUID/reference equality flags; DateTime.Kind; count of attributes outside the exact business2+candidate4 names. No arbitrary names/values, timestamps, IDs, object.ToString, raw errors or secrets are emitted. Calculation failure produces q0 with every new value zero and preserves refusal. The hypothetical six-field shape still refuses.

Acceptance stores the new bounded record as Decoration {Measured,Presence,Types,Nulls,Matches,DateKind,UnknownCount}. Exact whole-message grammar, range/subset/disjoint/type-support/date-kind/ID-presence constraints and complete capped attribute accounting are checked. Business presence is derived from unchanged target mask bits8/16. Total count must equal min(63,business-presence+candidate-popcount+unknown-count); count-mismatch bit4 must agree. q0 requires all seven new facts to be zero except Measured itself (also zero). Historical target-only messages remain supported. Invalid new suffixes suppress parsed Target/Decoration facts; failure kind remains diagnostic only. Runtime still independently reads back and stops after refusal, never retries or treats facts as authorization.

Self-review verified by byte comparison to base: PluginHost/DataverseStore prefix and guard Execute predicates through the final refusal are identical; only refusal text appends the helper. Protocol, StatePolicy, registration and FixedPackageUpdater are byte-identical. Updater changes are pins/profiles only. No frontend/domain/original import/source changes. Root README/docs left unstaged. Existing tests retain direct/bulk/Upsert/forged-source denial, real host validation/permission/replay/conflict/CAS ordering, and receipt binding. New tests cover six-field denial, absent/null/correct/wrong types, empty/wrong GUID/reference names/actor, all DateTime.Kind values, unknown malicious objects/names, cap63, error fallback, strict parser invariants and unchanged independent readback.

## RED/GREEN and exact commands

Working directory: /Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app.
All builds below prefixed with `DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home`. Sequential explicit builds then direct DLL execution; no restore, broad Node/UI suite, stalled/canceled build, package retry or provider activity.

```sh
../dotnet/dotnet build server/Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet/dotnet server/Tests/bin/Debug/net8.0/Kitchen.Policy.Tests.dll import/2026.json server/Tests/obj/reducer-corpus.json
../dotnet10/dotnet build server/Acceptance.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet10/dotnet server/Acceptance.Tests/bin/Debug/net10.0/Kitchen.Acceptance.Tests.dll
```

RED: server build0 errors/0 warnings1.56s; `Policy tests: 80 passed, 3 failed`, exit1. Three missing decoration-measurement tests fail. Acceptance build0/0,3.48s; `33 passed; 2 failed`, exit1, both new decoration parser/evidence tests fail. No unrelated failures.

GREEN after implementation, same commands: server build0/0,1.54s, `Policy tests: 83 passed, 0 failed`, exit0; Acceptance build0/0,2.47s, `35 passed; 0 failed`, exit0.

```sh
../dotnet10/dotnet pack server/Kitchen.Dataverse.csproj --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1 -o server/artifacts/guard-target-diagnostic-v4
../dotnet10/dotnet build server/Deploy.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet10/dotnet server/Deploy.Tests/bin/Debug/net10.0/Kitchen.Deploy.Tests.dll
../dotnet10/dotnet build server/Acceptance.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet10/dotnet server/Acceptance.Tests/bin/Debug/net10.0/Kitchen.Acceptance.Tests.dll
../dotnet10/dotnet build server/PackageUpdate.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet10/dotnet server/PackageUpdate.Tests/bin/Debug/net10.0/Kitchen.PackageUpdate.Tests.dll
```

Package net462 succeeded exit0. Deploy build0/0,2.51s, `74 passed; 0 failed`, exit0. First post-pin Acceptance build0/0,2.42s; `34 passed; 1 failed`, exit1: existing package-file download test still loaded hardcoded v3 bytes while reviewed expected length was v4. Corrected only that fixture path to v4 (no expectation weakened). Updater build0/0,2.11s, `36 passed; 0 failed`, exit0. Final affected-only Acceptance rebuild0/0,1.62s and direct suite `35 passed; 0 failed`, exit0. `git diff --check` exit0.

Covering files: server/Tests/RequestBindingTests.cs; server/Acceptance.Tests/Program.cs. Deploy.Tests package fixture paths updated; updater existing suite validates measured prior/current/source profiles and unchanged mutation safety.

## Frozen artifact pins

v4: server/artifacts/guard-target-diagnostic-v4/Zunftkueche.Dataverse.1.0.0.nupkg

- Package: 297112 bytes; SHA256 54534e6c1053e1e41fbd4eab6741183f53996e18995b0924c7f695f619ed865b.
- Kitchen.Dataverse.dll: 47616 bytes; SHA256 c0420dc2dc76da0c64e047cf4d81c155885563472e03e3d54b021f674e4244e2.
- Five-file source-manifest.sha256: 461 bytes; SHA256 384eeebf242d6280cc5e4ba78031aa0ff74a768de2c9c451bbfc5a0f81e80182.
- Plugins.cs: 9ee592dad6e0ea3f9cb10c2f1407d10d3e0c944857c954540e563ea563c9b27e. Other four manifest source hashes unchanged.

Normal Deploy/Acceptance checks use v4 only. Updater Prior=v3, 296571 bytes/SHA02449a6b7ff2a073d40a833fd64360b964a9d31386d099b6b432f6e05a1ee89e; Current=v4 with above manifest. Mutation implementation/modes/ETag handling remain unchanged.

Measured all prior artifacts preserved: original290280/SHA215fb97e2a374a4e621719c3c04cc9b21fc55686ca94fe67cc0d2a221c5bdf73; v1290994/SHA1c6ea57c3c56922911d201fde6a7c2a862efa0619ac7f81e5fe42fcf2ede7d92; v2296102/SHA20ebc01203f0eb5f16064ae35c535467f978353bd2ef2ce4bcc45ec164912660; v3 above. ZIP entry names unchanged; only Kitchen DLL and nuspec repository commit changed (350cc48→592204f). Package identity/version/author/description/empty net462 dependency group unchanged. README, Newtonsoft bytes, relationships, content types and core properties identical to v3. No tool/test assemblies included.

## Remaining live boundary

Root's v3 observation proves count6, not candidate attribute names/types. v4 deliberately continues refusing that target. Independent review precedes Root's one controlled package update/measurement and independent unchanged-state readback. No v5 allowance is justified until actual decor facts prove exact accounting and reviewed values; receipt shape remains unmeasured. No live success is claimed.
