# Exact API-source request binding and v3 package

Base `350cc482fc4ae6bee507563392f45f31b54565b3`; Root approved `guard-marker-plan.md` and independent design review before implementation. No provider/auth/browser action, helper agent, frontend change or registry change occurred. Independent immutable review remains required before Root updates the existing package.

## Problem, change and limits

Actual Root55228 on verified v2 passed the bounded wrapper and Commit-source structural checks (WrapperMask0,SourceKind1); SourceMask2048 showed only the private late SharedVariables marker missing. Independent revision0/count2/fingerprint ef7216d54d6b8a3b62f546b17a3f0611274a7aa14c3a717d4a17f9c21ed3c7a0 remained unchanged. This delta replaces that unreliable marker prerequisite with workspace/operation binding from the original RequestJson on the already authorized exact API source.

The guard first retains every current/source stage/mode/transaction/actor check and direct-source OR one fully validated wrapper selection. Only then it reads selected source.InputParameters.RequestJson. Protocol.Parse enforces the existing UTF8 size/depth/duplicate/trailing-data bounds; Protocol.WorkspaceId and StatePolicy.Str derive the exact workspace ID and bounded nonblank operation ID. Expected binding parse/type/argument errors become fixed refusal messages, never Newtonsoft/raw request output. Current/wrapper/tag/private-marker copies are never consulted for authorization.

The final target predicate is unchanged apart from naming its operationId variable instead of marker parts[1]. It still requires exactly state+revision for the bound workspace Update and the same workspace/operation/actor for receipt Create. No extra primary-ID attribute is allowed. Binary source comparisons against base confirmed the entire PluginHost/DataverseStore prefix, Protocol.cs, StatePolicy.cs and registration.json unchanged. Store's existing marker assignment/finally cleanup remains but is non-authorizing. Workspace CAS, receipt sequence and service-fault propagation remain unchanged.

Security authority is the platform-origin chain plus the independently verified exact own handler with AllowedCustomProcessingStepType=None and workflow disabled. Request values are public binding data, not standalone authority. The full handler validates before its only writes; actual-host fake-service tests enforce this ordering. A future write-before-validation handler change would invalidate this proof. [Microsoft documents request InputParameters](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/understand-the-data-context) and [None processing's exclusive handler logic](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/custom-api#select-a-custom-processing-step-type); [tag is explicitly caller-settable](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/optional-parameters?tabs=sdk#add-a-shared-variable-to-the-plugin-execution-context), so it was not introduced.

The actual selected-source RequestJson visibility and final Target/Create shapes remain unmeasured. If an assumption is wrong, the intended behavior is another fixed refusal; Root must independently verify unchanged persistence. No automatic alternative source, ancestor search or target broadening exists. Local fake-service success does not prove provider execution or rollback.

## Versioned diagnostics

New structural suffixes are zk_guard_v2 and zk_guard_chain_v2. Existing structural bit positions remain; former marker bits2048/4096 are reserved zero and rejected by v2 parsing. Historical v1 parsing retains its original meanings. Acceptance emits GuardVersion1/2 for structural facts, so old marker evidence cannot be confused with new source structure.

Binding-only refusal uses `[zk_guard_binding_v1;b=1..5]`: missing source RequestJson, wrong type, bounded parse rejection, protocol/workspace invalid, operation ID invalid. Acceptance emits nullable BindingReason only under the matching fixed prefix, HTTP400/500 and code0x80040265.

Final-target valid=false refusal now adds `[zk_guard_target_v1;m=<0..255>;n=<0..63>;i=<0..3>]`. Mask bits are1=unsupported pair,2=workspace ID,4=count not2,8=state missing,16=revision missing,32=receipt workspace,64=receipt operation,128=receipt actor. Count63 means at least63 attributes. Presence bits refer only to the two fixed known primary-ID attributes. No actual names/values/IDs/state enter the output. Diagnostic failure emits fixed unknown zeros, never authorization. The existing predicate is unchanged and its own exceptions are not converted into acceptance.

Acceptance parses exact complete formats; version mismatches, reserved/out-of-range fields, duplicate suffixes, extra text and wrong HTTP/code/kind suppress parsed facts. Runtime failure evidence adds only GuardVersion/BindingReason/TargetMask/TargetCount/TargetIdPresence after safe-field gates. Independent persistence readback and stop behavior remain unchanged.

## Artifact pins and preservation

New artifact: `server/artifacts/guard-request-binding-v3/Zunftkueche.Dataverse.1.0.0.nupkg`.

| Item | Bytes | SHA256 |
|---|---:|---|
| v3 nupkg |296571|02449a6b7ff2a073d40a833fd64360b964a9d31386d099b6b432f6e05a1ee89e|
| v3 Kitchen.Dataverse.dll |46592|e677ce33c7eb1064c541709c4e406887fa25aa9901991a0fc834dd5c5fbd3058|
| v3 source-manifest.sha256 |461|eb1a71e727adb189248959372c4e2ad5b4ee5e666a12bed1500bddd0d27a994b|
| unchanged live v2 nupkg |296102|20ebc01203f0eb5f16064ae35c535467f978353bd2ef2ce4bcc45ec164912660|
| unchanged v1 nupkg |290994|1c6ea57c3c56922911d201fde6a7c2a862efa0619ac7f81e5fe42fcf2ede7d92|
| unchanged original nupkg |290280|215fb97e2a374a4e621719c3c04cc9b21fc55686ca94fe67cc0d2a221c5bdf73|
| unchanged Newtonsoft.Json.dll |711952|e1e27af7b07eeedf5ce71a9255f0422816a6fc5849a483c6714e1b472044fa9d|

Five source entries:

```
d80ea939cb880a6f2b2bf600b489dc2e8ec1fab1a588d556306da18745f61b3d  server/Kitchen.Dataverse.csproj
89b730d090ddbdd636a0e52308197d65c86de64edcb4207077b232a29c67553c  server/Plugins.cs
b0c42fecb201cfb7b501c3ac2f7be5f547ff14007f5d2e91b3d62fd299c1e297  server/Policy/Protocol.cs
3e8a7da3a0108ed55d86e817350185a7e245c82da0d219643f8156260ba0c323  server/Policy/StatePolicy.cs
89b052cf533df6109413561375338faab2bf89d3849e44bf018fa28a009021cd  server/packages.lock.json
```

Only Plugins.cs changed among manifest sources. ZIP comparison against v2 found only Kitchen DLL and nuspec contents changed; nuspec's only intended metadata difference is repository commit350cc48. ID Zunftkueche.Dataverse/version1.0.0/authors/description/empty net462 dependency group are unchanged. README, Newtonsoft, relationships, Content_Types and core-property bytes are identical. No tool/test assemblies are packaged. The manifest identifies the exact built source while nuspec records the base commit.

Normal Deploy/Acceptance pins/default paths now require only v3. Updater Prior=v2/Current=v3; only its profile constants changed. Fixed package identity, strict/explicit maintenance modes, stable snapshots, single PATCH and authoritative readback/no-retry mechanisms are unchanged. Original/v1/v2 artifacts and manifests remain preserved. Registration hash08bd35ddbb43f12ee2c80eed9048630bebf25a899d012a327db3aa9f647baf47 and original import hashd38bf0ac7c2bf34211c1df01af1869dd97522da24e2bde1a284e3e505844a15f were rechecked unchanged.

## Verification

Working directory `/Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app`. Build environment `DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home`.

```
../dotnet/dotnet build server/Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet/dotnet server/Tests/bin/Debug/net8.0/Kitchen.Policy.Tests.dll import/2026.json server/Tests/obj/reducer-corpus.json
../dotnet10/dotnet pack server/Kitchen.Dataverse.csproj --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1 -o server/artifacts/guard-request-binding-v3
../dotnet10/dotnet build server/Deploy.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet10/dotnet server/Deploy.Tests/bin/Debug/net10.0/Kitchen.Deploy.Tests.dll
../dotnet10/dotnet build server/Acceptance.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet10/dotnet server/Acceptance.Tests/bin/Debug/net10.0/Kitchen.Acceptance.Tests.dll
../dotnet10/dotnet build server/PackageUpdate.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet10/dotnet server/PackageUpdate.Tests/bin/Debug/net10.0/Kitchen.PackageUpdate.Tests.dll
```

Tests were added/updated before implementation. Server RED69 passed/10 failed: adapted binding/diagnostic fixtures and real PluginHost snapshot flows failed on the v2 marker requirement. First GREEN79/79; the planned defensive Target-diagnostic fallback test was then added, with final80/80 and final build0 warnings/0 errors,2.21s. Acceptance RED31 passed/2 failed; GREEN33/33 before pins and final33/33 after v3 pins, final build0/0,2.31s. Deploy final74/74, build0/0,2.36s. Updater final36/36, build0/0,3.07s. Package creation exited0. No build was canceled or stalled in this task; one initial Acceptance build took34.39s but completed0/0. All builds/tests were sequential; no package restore, broad Node/UI suite or provider tests.

`RequestBindingTests.cs` adds real PluginHost/Protocol/DataverseStore calls with a preexisting source InputParameters snapshot and empty SharedVariables, through actual guard decisions. It verifies direct/wrapped successful CAS+receipt, invalid envelope/operation/candidate/permission without writes, conflict and exact replay without new writes, changed replay bytes/actor rejection, and a service CAS fault escaping without receipt while original marker cleanup still runs. Guard binding cases cover absent/type/duplicate/depth/size/trailing JSON/protocol/workspace/operation errors and current/wrapper/tag rescue attempts. Existing structural/bulk/Upsert bypass tests now include valid original-source request fixtures. Target tests assert all mapped failures, known primary-ID extra attribute refusal/count3, arbitrary extra-name nondisclosure, saturated count and diagnostic-error fallback.

Acceptance tests preserve historical v1 meaning, validate v2 reserved bits/version pairing, exact binding/target bounds and safe failure-evidence propagation. Existing bounded provider-body/privacy/independent-readback tests stay green. These tests prove local code behavior, not source-context availability or persistence on the actual provider.

Self-review confirmed unchanged PluginHost/Store/Protocol/StatePolicy/registration bytes, unchanged one-wrapper selection and target predicate semantics, no tag/ancestor fallback, parse-only exception suppression, unchanged updater mutation code and exact artifact/profile pins. `git diff --check` passed. Root README/status/source-preservation/spec/plan files are outside this commit. Root review and controlled update/readback/runtime verification are the next gates.
