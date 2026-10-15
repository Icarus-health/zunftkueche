# Bounded single-wrapper guard and v2 package

Base `263ed1bdd9fd928fd7d81922159bee6438d4de08`. Root approved `guard-wrapper-plan.md` before implementation. No provider/auth/browser actions, helper agents, frontend changes or registration changes occurred. Root must obtain independent immutable review before updating the existing package.

## Reason and behavior

Actual Root35785 on verified v1 reported guard_context, mask2064 (parent message mismatch16 + parent marker absent2048), ParentKind3=Update. All other original first-gate bits were clear; independent state remained revision0/count2/fingerprint ef7216d54d6b8a3b62f546b17a3f0611274a7aa14c3a717d4a17f9c21ed3c7a0. The actual grandparent, Create chain and final target gate have not yet been observed. [Microsoft documents merged Create/Update pipelines](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/bulk-operations#message-pipelines-merged), but [does not guarantee arbitrary parent ordering](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/understand-the-data-context#parentcontext). The new path therefore remains bounded and fails closed.

`KitchenWriteGuardPlugin` retains the original direct-API-parent path. It can additionally select only the immediate parent of one fully checked operation wrapper. The wrapper must match the current exact Update/workspace or Create/operation pair, both PrimaryEntityName values must match Target.LogicalName, and its stage30/mode0/transaction/user/initiator checks must all pass. Its immediate parent then faces the unchanged original predicate requiring exact zk_KitchenCommit stage30/mode0/transaction/actors and the private marker on that source. There is no recursion, ancestor search, tag use, current/wrapper-marker substitution or absolute host Depth assumption. Another wrapper, Upsert, Multiple or missing/unknown source is rejected.

The marker parser and final target gate remain byte-for-byte unchanged. The workspace still accepts exactly state+revision on its marker-bound ID; receipt still requires the existing operation/workspace/actor binding. DataverseStore, Protocol and StatePolicy are unchanged, including IfRowVersionMatches, receipt sequence and marker removal in finally. Six guard registrations remain unchanged.

Only first-gate refusals with an immediate Create/Update parent receive the additional fixed suffix `[zk_guard_chain_v1;w=<0..127>;s=<0..32767>;g=<0..10>]`, after the preserved original prefix/v1 suffix. The wrapper bit map is1=operation/table pair or message mismatch,2=stage,4=mode,8=transaction,16=table context,32=initiator,64=user. Source mask reuses the original fifteen conditions against the one immediate candidate; SourceKind reuses the fixed message enum. Unknown diagnostic calculation emits fixed zeros, never authorization. Acceptance emits nullable WrapperMask/SourceMask/SourceKind only after exact complete-message parsing and existing HTTP/code/kind gates. No context values, raw messages, IDs, markers or state enter diagnostics.

Cost if the anticipated grandparent/table/Create shape is wrong: the same operation remains refused, and transactional persistence should remain unchanged; Root must verify that independently. No automatic broadening is possible. Local test success does not establish actual Dataverse execution or transaction behavior.

## Artifact pins

New separate artifact: `server/artifacts/guard-wrapper-v2/Zunftkueche.Dataverse.1.0.0.nupkg`.

| Item | Bytes | SHA256 |
|---|---:|---|
| v2 nupkg |296102|20ebc01203f0eb5f16064ae35c535467f978353bd2ef2ce4bcc45ec164912660|
| v2 Kitchen.Dataverse.dll |45056|d92b3b5994fe86ab58077f04f0cd3f3fae508279e67d8f8cc8955f278aeaef49|
| v2 source-manifest.sha256 |461|0b55bc2e593a00e56bc5eaa37653122e45934f7f3a942d59b38bddbdbd818041|
| unchanged live v1 nupkg |290994|1c6ea57c3c56922911d201fde6a7c2a862efa0619ac7f81e5fe42fcf2ede7d92|
| unchanged original nupkg |290280|215fb97e2a374a4e621719c3c04cc9b21fc55686ca94fe67cc0d2a221c5bdf73|
| unchanged Newtonsoft.Json.dll |711952|e1e27af7b07eeedf5ce71a9255f0422816a6fc5849a483c6714e1b472044fa9d|

Five source-manifest entries:

```
d80ea939cb880a6f2b2bf600b489dc2e8ec1fab1a588d556306da18745f61b3d  server/Kitchen.Dataverse.csproj
567f0ffd7c9295e43810098f057688a2df32414ad64a7137806d5d7507c444ca  server/Plugins.cs
b0c42fecb201cfb7b501c3ac2f7be5f547ff14007f5d2e91b3d62fd299c1e297  server/Policy/Protocol.cs
3e8a7da3a0108ed55d86e817350185a7e245c82da0d219643f8156260ba0c323  server/Policy/StatePolicy.cs
89b052cf533df6109413561375338faab2bf89d3849e44bf018fa28a009021cd  server/packages.lock.json
```

Only Plugins.cs changed among those five sources. ZIP inventory contains only the two intended runtime DLLs plus nuspec, server README and NuGet metadata. README, Newtonsoft and Content_Types bytes equal v1. Kitchen DLL changed as intended. SDK10 packing also changed `_rels/.rels`, core-property entry naming/content, ZIP ordering/metadata and nuspec repository commit; nuspec ID Zunftkueche.Dataverse/version1.0.0/authors/description/empty net462 dependency group remain unchanged. Repository commit records the base; this five-file manifest identifies the built uncommitted source precisely. No updater/Deploy/Acceptance code is packaged.

Normal Deploy/Acceptance default paths and exact hash/length now accept v2 only. Updater Prior is preserved live v1, Current is v2, with the new manifest pin. Its strict/explicit maintenance selection, fixed package identity, single content PATCH, stable prewrite snapshots, bounded readback, no retry and no atomic-CAS claim for maintenance are unchanged. Prior original and v1 files were not rebuilt or overwritten.

Registration hash remains08bd35ddbb43f12ee2c80eed9048630bebf25a899d012a327db3aa9f647baf47. Original import remains d38bf0ac7c2bf34211c1df01af1869dd97522da24e2bde1a284e3e505844a15f.

## Red/green and exact commands

Working directory `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app`. Builds used `DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home`.

```
../dotnet/dotnet build server/Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet/dotnet server/Tests/bin/Debug/net8.0/Kitchen.Policy.Tests.dll import/2026.json server/Tests/obj/reducer-corpus.json
../dotnet10/dotnet pack server/Kitchen.Dataverse.csproj --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1 -o server/artifacts/guard-wrapper-v2
../dotnet10/dotnet build server/Deploy.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet10/dotnet server/Deploy.Tests/bin/Debug/net10.0/Kitchen.Deploy.Tests.dll
../dotnet10/dotnet build server/Acceptance.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet10/dotnet server/Acceptance.Tests/bin/Debug/net10.0/Kitchen.Acceptance.Tests.dll
../dotnet10/dotnet build server/PackageUpdate.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet10/dotnet server/PackageUpdate.Tests/bin/Debug/net10.0/Kitchen.PackageUpdate.Tests.dll
```

Tests were added first. Guard RED:69 passed/4 failed, including exactly2064/Parent3 for Update,2064/Parent2 for Create and the real-store sequence. GREEN:73 passed/0 failed (the complete existing policy/corpus suite plus seven wrapper groups), net8 build0 warnings/0 errors,1.79s. Acceptance RED:30 passed/1 failed for the new numeric chain facts; GREEN before artifact pin changes31/31, and final v2 build0/0,4.32s then31/31 again. Deploy final build0/0,3.04s and74/74. Updater final build0/0,3.64s and36/36. Package creation exited0. Final tests were direct DLL runs following completed serial builds; no implicit builds, package restore or broad Node/UI tests.

New guard tests mutate each wrapper/current/source condition, missing/wrong-type marker, source absence, two wrappers, target fields and receipt bindings; direct CRUD, Upsert, merged bulk-shaped source paths and forged marker/tag/parameter attempts deny. A fake OrganizationService invokes the real DataverseStore and real guard for Update then Create, asserts exact IfRowVersionMatches/RowVersion and verifies private marker cleanup on success and a CAS-shaped failure. This is a local behavioral test, not a simulation proving database rollback. Parser tests cover exact chain facts, upper bounds, negative/leading-zero/unknown version, duplicates/trailing text and failure-evidence propagation; existing byte/depth/privacy guards remain green.

Initial build interruption, separately from successful results: first net8 build PID13415 remained without output at55s, stateSs, waitchannel'-'. An initial SDK10 build of net8 failed NETSDK1127 (targeting pack absent from its own SDK root). SDK10 retry with `-p:NetCoreTargetingPackRoot=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet/packs` started build PID13930/compiler13943 but stalled at33s/32s, statesSs/S, waitchannel'-'. Inspection found three actual dataless net8 analyzer DLLs (LibraryImportGenerator,SourceGeneration,RegexGenerator). Only owned PIDs were terminated; the first sandbox kill was denied and the narrow approved kill succeeded. These canceled attempts are not claimed as passing. Root used Finder to hydrate/keep dotnet and NuGet; after all three flags became'-', the regular net8 build worked. No global shutdown, xattr/security change or blind repetition was used.

## Self-review and next gate

Self-review checked source selection is one assignment, no loop; every selected source still passes the complete original first predicate; original marker/target/Store/Protocol blocks are unchanged; diagnostic parsing affects no authorization decision; v2 pins match actual ZIP/manifest bytes; updater mutation code is unchanged. `git diff --check` passed. Root README/status/source-preservation/spec/plan files remain outside this commit.

Root's independent review must cover the source diff, tests and pinned v2 bytes. Only afterward may Root use the already-reviewed explicit maintenance path under the controlled writer assumption, verify the entire backend and run runtime acceptance. The actual grandparent and receipt path remain unproven until that provider evidence exists.
