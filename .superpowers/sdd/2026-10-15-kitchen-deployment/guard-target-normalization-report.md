# v5 exact observed workspace Target shape

Base: 25088a22db22c6cd7f971adcfce12e7675b11093. Root explicitly authorized the measured v5 contract after independent v4 verification76155 and runtime68700. This task made no provider/auth/browser calls and used no helpers.

## Evidence, change and safety boundary

Root reports actual v4 first-Commit refusal HTTP400/0x80040265, target mask4/count6/IDpresence1; Decoration Measured1/Presence15/Types7/Nulls8/Matches15/DateKind2/UnknownCount0. Independent before/after revision0/count2/fingerprint ef7216d54d6b8a3b62f546b17a3f0611274a7aa14c3a717d4a17f9c21ed3c7a0 unchanged. Those facts establish the exact candidate set and value predicates for this pipeline. They do not establish receipt acceptance or transaction success.

The guard preserves original Update/table/workspace/state/revision checks and the original exact two-business-field shape. Its sole alternative requires total count6, all four observed decorations, nonempty source workspace and actor, primary Guid equal to both Target.Id and source workspace, modifiedby EntityReference logical name exactly systemuser and ID equal to the authorized actor, modifiedon DateTime with Kind UTC, and modifiedonbehalfby present with explicit null. Together with the two required business fields, the exact count excludes every unknown extra. No optional hybrid, non-null behalf reference, loose system-field exemption, case-insensitive name, clock comparison, field removal or rewriting is introduced.

Existing structure/source/actor/transaction checks, RequestJson binding, direct-or-one-wrapper selection and receipt Create gate are unchanged. PluginHost/DataverseStore prefix, Protocol, StatePolicy, registration and FixedPackageUpdater were byte-compared to base and are identical. Only Plugins.cs changes among the five manifest sources. Existing versioned refusal diagnostics and Acceptance parser are unchanged; target_v1 bit4 retains its historical count-not-two measurement on refusals, with decor_v1 explaining decoration mismatches. No diagnostic value grants permission. Receipt is still a separate live gate.

## Tests and deferred M1

Covering file server/Tests/RequestBindingTests.cs now accepts the observed exact shape under authorized direct and one-wrapper contexts, while retaining both original two-field successes. Both paths reject every missing business/candidate field, replacement by unknown field at the same count, null/wrong type, empty or different primary/Target/actor ID, wrong or wrong-case systemuser name, Local/Unspecified timestamp, every non-null behalf value, owner/status/custom/unknown extras, every partial 1..14 decoration mask, and bookkeeping-only writes. Decorated direct caller, bulk/Upsert/other messages, missing original request and wrong bound workspace remain denied. Existing wrapper/actor/stage/transaction/bulk-chain tests remain intact.

Real PluginHost→Protocol→DataverseStore→guard tests now exercise both shapes and direct/wrapped service contexts: exact CAS RowVersion, Update then receipt, saved state/hash and marker cleanup. Deferred M1 is addressed test-only: separate Attempts list increments at simulated UpdateRequest/Create dispatch before invoking the guard. Invalid schema/unknown envelope/unsupported operation/candidate/permission/conflict cases assert zero attempts; exact replay and altered replay bytes/actor assert no additional attempts. A dedicated regression deliberately dispatches after a schema-invalid source snapshot and proves one attempted Update but zero guard-accepted writes. The synthetic CAS-fault test asserts exactly one attempted Update and no receipt. This proves local ordering, not provider rollback.

## Exact commands and results

Working directory: /Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app. All build/pack commands use prefix `DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home`. Explicit sequential builds then direct DLL runs; no restore, broad Node/UI tests, stalled/canceled processes or provider actions.

```sh
../dotnet/dotnet build server/Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet/dotnet server/Tests/bin/Debug/net8.0/Kitchen.Policy.Tests.dll import/2026.json server/Tests/obj/reducer-corpus.json
```

RED build0 warnings/0 errors,1.63s. Suite exit1: `Policy tests: 84 passed, 2 failed`; observed-shape success and real-host decorated sequence fail with the exact v4 refusal, as required. GREEN same commands after narrow predicate change: build0/0,1.64s; exit0, `Policy tests: 86 passed, 0 failed`.

```sh
../dotnet10/dotnet pack server/Kitchen.Dataverse.csproj --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1 -o server/artifacts/guard-target-normalization-v5
../dotnet10/dotnet build server/Deploy.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet10/dotnet server/Deploy.Tests/bin/Debug/net10.0/Kitchen.Deploy.Tests.dll
../dotnet10/dotnet build server/Acceptance.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet10/dotnet server/Acceptance.Tests/bin/Debug/net10.0/Kitchen.Acceptance.Tests.dll
../dotnet10/dotnet build server/PackageUpdate.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet10/dotnet server/PackageUpdate.Tests/bin/Debug/net10.0/Kitchen.PackageUpdate.Tests.dll
```

Pack net462 exit0. Deploy build0/0,3.32s; `74 passed; 0 failed`, exit0. Acceptance build0/0,2.69s; `35 passed; 0 failed`, exit0. Updater build0/0,2.61s; `36 passed; 0 failed`, exit0. `git diff --check` exit0. Deploy/Acceptance changes only default/test package paths and hash/length pins; updater only immutable profile pins. No extra test rounds or cleanup work.

## Frozen v5 artifact and source pins

Path: server/artifacts/guard-target-normalization-v5/Zunftkueche.Dataverse.1.0.0.nupkg.

- Package297290 bytes, SHA256 6d74048606fd199b06a20c2856752eb56e87e7bd6bb9d634bdef80387c596247.
- Kitchen.Dataverse.dll48128 bytes, SHA256 36828332dd0a70820ca52a04cbb06b9dce97b22023f881276ef630db6f4dbf88.
- source-manifest.sha256461 bytes, SHA256 5152cb2bc9f323d309870725f33c50e9d9cd430c2a67352f1db6626ee7a27263.
- Plugins.cs SHA256 e720fd3da814c0a48c1610512af1ad227ebf05e759c5d4782e603145c46f0ccd; other four manifest entries unchanged.

Normal verification current=v5 only. Updater Prior=v4,297112 bytes/SHA54534e6c1053e1e41fbd4eab6741183f53996e18995b0924c7f695f619ed865b; Current=v5. Same exact already-reviewed update mechanism and explicit maintenance invocation, no fallback/retry/header/registration changes.

Measured original and v1-v4 artifacts preserved unchanged: original290280/215fb97e2a374a4e621719c3c04cc9b21fc55686ca94fe67cc0d2a221c5bdf73; v1290994/1c6ea57c3c56922911d201fde6a7c2a862efa0619ac7f81e5fe42fcf2ede7d92; v2296102/20ebc01203f0eb5f16064ae35c535467f978353bd2ef2ce4bcc45ec164912660; v3296571/02449a6b7ff2a073d40a833fd64360b964a9d31386d099b6b432f6e05a1ee89e; v4 above.

ZIP entry names identical to v4; only Kitchen DLL and nuspec repository commit change (592204f→25088a2). ID/version/author/description/empty net462 dependency identity unchanged. README/Newtonsoft/relationships/content-types/core-properties bytes identical. No tool/test code in package. Root README/status/spec/plan/source-preservation documents remain outside this commit.

## Self-review and live limitations

Reviewed exact diff: helper requires all four names at count6; outer gate still requires both business fields, so unknown extras cannot be hidden by omissions. Type tests avoid casting exceptions, explicit null is distinguished from absent, and actor/workspace equality is nonempty. Trusted source/transaction/actor anchor remains necessary before either shape. Only the measured form is admitted; no assumption of a universal Dataverse normalization rule.

Independent review remains required before Root's controlled provider update. No v5 live success claimed. The next real Commit may expose the unmeasured receipt shape or other platform failure; unchanged safe stop/readback remains. There is no automatic broadening or follow-up write.
