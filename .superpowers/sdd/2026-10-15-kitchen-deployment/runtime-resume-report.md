# Fixed denial-only continuation and grouped final corrections

Base703f6c0bc1f7ad7f04e4b8da41c66d6947ab27a5; implements Root-approved runtime-resume-plan.md and final-review M1–M4. No provider/auth/browser actions, subagents, plugin/package rebuild, restore or Node/server-policy suite. Root-owned README/status/acceptance/spec/plan/source-preservation files remain outside this commit.

## Continuation contract and self-review

Acceptance adds exact phase denials-only, offline without --execute. Session executes the existing complete runtime prerequisites before this branch: target identity/account/object/German/EUR, tables/key/Standard/concurrency, validated workspace, exact v5 package file/types/APIs/privileges, exact52 platform definitions and six guards, direct administrator, exact canaries and fixed absent IDs. It returns from DenialContinuation without calling RuntimeChecks.Run or constructing any CommitRequest. The only app Action dispatched in this branch is read-only Load.

The branch checks the fixed measured snapshot revision1/count3/hash8050006306b60bda077c3086a809c6b7d311ec8f5f6d1cc055f16914b5e7c0c6, workspace ID/owner/revision, bounded state parsing/self-snapshot validation and exact canonical ExpectedState(normalized original seed, fixed acceptance operation). The exact-state comparison preserves original economics/provenance and all operation/history fields. Self-validation deliberately allows the original duplicate invoice labels; it does not authorize changed content. Session separately runs its existing seed-anchored persisted-state validator before reaching this code.

Exactly3 receipts are required: one under the app workspace with exact operation8e73764d-8e28-4c0f-b24d-c7a686e23ed3, actor=current verified user, request SHA8e9c02522e69ce5f05a7389b182bda4670510de85d9a9af4d3d8d44cea77ab4c, appliedRevision1 and valid identity/timestamp, plus exactly the two known canary receipt identities linked to their fixed canary workspace. Missing/duplicate/conflict/other app receipts stop. Load must match persisted state and canWrite=true. None of these observations pretends to repeat the historical replay/conflict proof.

Both fixed13-entry plans are validated before any denial dispatch. Only each exact POST DeleteMultiple route is excluded; plan name/count/order, unsupported flag and route/method are checked and other unsupported entries fail. The24 remaining probes use existing fixed canary payloads; every before snapshot must equal the immutable checkpoint, then every response needs the existing known guard denial and unchanged independent after snapshot. Success/unknown405or404/ambiguity/readback failure/change stops without retry. Existing global405 behavior and exact400 unsupported-message matcher are untouched.

Two separate availability records report documented_unsupported_standard_table, Executed=false, GuardExecutionProved=false. Exact Standard metadata plus Microsoft's elastic-only documentation is the basis, not missing filters/CSDL. Root41582 independently observed a DeleteMultiple message/filter for each Standard table and one generic crmbaseentity collection binding; those do not prove support. No DeleteMultiple POST is made in the new branch. The existing runtime denial loop also uses the same supported-plan selection for consistent24+2 counts; its initial receipt safety stop remains intact and it must not be rerun against the current saved operation.

Only all24 completed probes set SupportedDenialsComplete. DenialContinuation explicitly clears both completion/release flags on entry; RootReleaseAllowed remains false. Program exposes supportedDenialsComplete, separate availability and historicalCommitEvidence=root_run_25963_not_reexecuted. Root25963 remains a stopped historical run with successful save/replay/conflict/workspace12 evidence, combined explicitly with the later continuation result. Browser/Teams/ordinary-role/rollback-fault gates are unaffected.

## Minor fixes

M1: docs/deployment.md now names actual v5 installation90335/verification79283,25963 partial live success and unexecuted continuation/publication gates. Existing case-correct Zk_ generated services/bootstrap are documented, obsolete second-initialization recipe removed, original/general build artifact separated from reviewed v5, guard evolution and fixed continuation explained. Root will append future live results; none are fabricated here.

M2: ResourceEngine uses a closed trusted collection/name-to-primary-field mapping, never first-present foreign solutionid. Package/API/step regression fixtures contain both IDs and assert the correct resource ID; canonical matching and ambiguous readback are unchanged. Missing primary IDs stay null evidence rather than falling back to a foreign ID; downstream existing mandatory identity validation is unchanged. Public signatures are unchanged.

M3: Inventory reads workspace Read/Write privilege metadata when the table exists regardless of package/type availability, and reports only fixed available/missing/invalid_or_duplicate/table_missing labels and own Read/Write labels. No arbitrary privilege names or provider values are logged. API creation retains its separate original strict privilege lookup; no grants or role changes.

M4: additive guard/chain/binding/target/decoration numeric facts require unique root error and unique direct code/message. Duplicate relevant keys suppress additive facts. Numeric code/status and the existing GuardDenied/failure-kind contract remain unchanged as authorized. Remote strings stay suppressed; the test includes duplicate root/code/message and a private sentinel. Unrelated fields do not broaden the change.

## Tests and exact commands

Working directory /Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app. Every build uses `DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home` and explicit serial invocation:

```sh
../dotnet10/dotnet build server/Deploy.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet10/dotnet server/Deploy.Tests/bin/Debug/net10.0/Kitchen.Deploy.Tests.dll
../dotnet10/dotnet build server/Acceptance.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet10/dotnet server/Acceptance.Tests/bin/Debug/net10.0/Kitchen.Acceptance.Tests.dll
```

RED: Deploy build0 warnings/0 errors4.86s;74 passed/2 failed exit1 for wrong logged ID and absent privilege inventory. Acceptance build0/0,2.50s;36 passed/4 failed exit1 (new phase unsupported, duplicate-envelope fact still accepted, missing continuation success path, missing per-probe dispatch behavior). Negative continuation cases initially passing with missing implementation were not used as positive proof; success/dispatch tests supplied behavioral RED.

Deploy GREEN: build0/0,2.81s;76 passed/0 failed exit0. Acceptance first implementation compile failed CS0122 because SnapshotVerification is internal to Deploy. No shared interface was widened: continuation uses public StatePolicy snapshot validation plus exact expected-state equality while Session retains its existing full validator. An accidentally invoked old Acceptance DLL after that failed build repeated the prior36/4 result; it is not verification of the changed implementation. Next successful build0/0,2.41s yielded37 passed/3 failed: null-previous validation rejected imported duplicate invoice labels. Corrected to established state-self snapshot validation; build0/0,1.28s and40/0. Final scoped test refinements added explicit plan-drift coverage, fixed missing-backend fixture and direct typed test invocation; final build0/0,2.50s; **41 passed;0 failed**, exit0. No stalls/hydration problems, canceled processes or repeated broad test runs.

Covering files: Deploy.Tests/Program.cs (M2/M3), Acceptance.Tests/Program.cs and new ContinuationFake.cs (checkpoint/state/owner/receipt hash/actor/workspace/revision/timestamp/cardinality/conflict/Load mismatches;24 fixed calls; no Commit/DeleteMultiple; before drift, after change, success/unknown routing/ambiguity/readback failure; partial-purpose output; duplicate envelopes; exact plan drift), Fixtures.cs (empty-backend preflight). Existing prerequisite/guard/CAS/replay/parser and unchanged-state tests remain. Continuation unit tests inject a fixed fake snapshot; they test control flow and evidence, not a fresh provider fingerprint or live authorization. Session negative tests prove identity/Standard/missing-backend failures stop without writes; code review verifies the new branch remains after all existing full prerequisites.

No updater suite needed: IDataverseTransport and ResourceEngine signatures, package/download/profile pins and updater code are unchanged; only Acceptance's own Denial method has an optional checkpoint argument. No plugin/server-policy/package build occurred.

```sh
../dotnet10/dotnet server/Acceptance/bin/Debug/net10.0/Kitchen.Acceptance.dll --phase denials-only
```

Actual exit0 output:
`{"phase":"denials-only","offline":true,"providerCalls":0,"writes":0,"canaryWorkspaces":2,"canaryReceipts":2,"supportedDenialRoutes":24,"unexecutedAvailabilityClassifications":2,"rootReleaseAllowed":false}`

`git diff --check` exit0. Python byte comparisons against703f6c0 and SHA256 checks confirmed Plugins.cs, Protocol, StatePolicy, registration, updater/profile, Seed/package pins and File-reader unchanged; all five source-manifest entries verified. No required check remains locally unfinished.

## Preserved pins and remaining gate

Installed/current v5 unchanged:297290 bytes/SHA6d74048606fd199b06a20c2856752eb56e87e7bd6bb9d634bdef80387c596247. Manifest461 bytes/SHA5152cb2bc9f323d309870725f33c50e9d9cd430c2a67352f1db6626ee7a27263. No new package revision or provider update is needed.

Independent scoped review precedes Root's explicit `--phase denials-only --execute` run from its verified immutable local mirror. The actual revision1 checkpoint can legitimately drift because of another writer; that must stop and require fresh evidence, never a configurable override. The code does not promise all receipts/denials pass live. Code App/private publication, browser/reload/storage/pass and Teams acceptance remain unexecuted in this report.
