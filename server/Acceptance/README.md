# Bounded Dataverse runtime acceptance helper

This separate console references the reviewed Deploy implementation and Protocol. It changes no frontend, plugin, registration contract, source import, users, grants, or credentials. Its default is **offline**. Building and the test suite perform no OAuth or Dataverse calls.

Only Root may execute online phases after independent review and user authorization. Run from the repository root. Use the existing local .NET 10 runtime and exact cached dependencies:

```sh
export DOTNET_CLI_HOME="$PWD/../dotnet-home"
export NUGET_PACKAGES="$PWD/../nuget"
export DOTNET_CLI_TELEMETRY_OPTOUT=1
../dotnet10/dotnet restore server/Acceptance.Tests --locked-mode --source ../nuget -p:NuGetAudit=false
../dotnet10/dotnet build server/Acceptance.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet10/dotnet server/Acceptance.Tests/bin/Debug/net10.0/Kitchen.Acceptance.Tests.dll
../dotnet10/dotnet server/Acceptance/bin/Debug/net10.0/Kitchen.Acceptance.dll
```

The final command is an offline plan; it locally validates the pinned contract, original import, and plugin package. Specifying a phase without `--execute` is also offline. No persistent token cache or request journal is created. For an online phase the reused MSAL public-client PKCE/loopback flow emits only `AUTH_URL`; Root opens this public authorize URL in DuckDuckGo and selects the approved Vorstand account. The helper independently verifies WhoAmI organization, enabled systemuser, MSAL ObjectId, German 1031, and EUR before any phase-specific activity.

## Phases and order

1. `--phase inspect --execute`: read-only provider inspection, table/key verification, and exact canary readbacks. Missing canaries cause a stop, with no creation. Without `--execute`, the default `inspect` does not authenticate.
2. `--phase prepare-canaries --execute`: explicit write phase **before backend guard activation**. Requires both exact Standard tables, existing reviewed table/key metadata, and absence of every processing step on the kitchen tables, every named guard, and every registration of the KitchenWriteGuard handler. Canonical fixed-ID GETs precede each POST; existing rows must exactly match. Each missing row gets at most one POST and independent GET. Any ambiguous result stops even when the row can be read back. No upsert is used and no cleanup is performed.
3. Root activates/verifies the reviewed backend with the existing Deploy utility.
4. `--phase runtime --execute`: explicit write phase **once**. Rechecks tables/key, package/types/APIs and source-anchored persisted workspace through the reviewed Provisioner; accepts exactly the ten expected pending runtime gaps. Requires exactly six active single C/U/D guard steps with exact handler/message/filter bindings, and rejects any extra step on either kitchen table. Requires the caller's direct built-in System Administrator role template GUID, independent of translated role names. Requires all four canaries intact and all four absent probe IDs absent.

Runtime calls actual `zk_KitchenLoad`, checks owner `canWrite` and exact persistence, then sends one event.switch commit using the existing active event ID and unchanged candidate business state. The expected revision/history and operation receipt are independently checked. Only after confirmed success does it repeat the exact immutable in-memory request body. The repeat must preserve receipt count, state, and revision. A different fixed operation with the old expected revision must conflict without persistence changes.

**Stop after any uncertain outcome. Do not rerun runtime after ambiguity.** There is no persisted raw request or pending journal. Root must first resolve the outcome independently. A previously persisted acceptance operation causes a new invocation to stop before another application commit. No automatic repeat follows any error, timeout, malformed result, or unknown response. A successful full runtime run appends exactly one application operation/receipt and revision; it changes no business data.

For each table, direct denial probes cover Create, Update, Delete, Upsert existing/missing, singleton/two-row CreateMultiple and UpdateMultiple, singleton existing/missing plus two-row mixed UpsertMultiple, and two-canary DeleteMultiple. All mutation targets are fixed synthetic IDs. Existing updates change only `zk_name`; deletes use canaries, never the real workspace or a real receipt. Before/after snapshots cover both canary pairs, all absent IDs, the actual workspace, and scoped operation rows/counts. Every guard denial must match a known plugin denial and leave the snapshot unchanged. ACL denial, generic 404, success, unknown response, or timeout cannot pass. DeleteMultiple must be an HTTP400 provider refusal with a valid numeric Dataverse code and the exact documented message `DeleteMultiple has not yet been implemented.` for a verified Standard table. Route absence404, ACL403, method405, other statuses, malformed codes, and vague unsupported/unavailable text all fail closed.

## Fixed scope

| Purpose | First ID | Second ID |
|---|---|---|
| Workspace canaries | fb82b1ce-01eb-496c-8d8c-c63c386ebc40 | 439792a9-1b67-4287-8775-6fd831e36026 |
| Receipt canaries | 576fe0cc-f64b-42f0-a073-40041c32118d | 3b58aeab-9905-49eb-bd38-e865481dfc93 |
| Receipt operation IDs | bac8345e-afdb-4d0a-93ee-871440151d20 | 3d9ea0ef-ac8c-4475-b450-51e3263c9078 |
| Absent workspace probe IDs | bf206a46-9816-46c6-bd4f-f80540fae828 | 5b8ee9c7-516f-44d3-a322-7e075471a5a9 |
| Absent receipt probe IDs | 4db43c23-1e40-43c2-a545-f9326c4de950 | 83b955f3-c187-415d-b0ac-889857bfa214 |

Both synthetic receipts point to the first synthetic workspace, use the authenticated actor, 64 fake `a` hex characters, applied revision 1, and fixed 2026-10-15 UTC timestamp. Workspace state is only the tiny acceptance marker, revision 0. Names explicitly begin `ACCEPTANCE ONLY`. Canaries remain in place and are never mixed with the application workspace.

The real no-business-change acceptance operation is `8e73764d-8e28-4c0f-b24d-c7a686e23ed3`; the stale conflict operation is `dc317607-f344-4e0f-a597-33322424571b`.

## Evidence and limits

Console evidence is limited to fixed local check names/booleans, HTTP status, validated numeric Dataverse codes, hashes, counts, and revisions. Raw response bodies, data rows, API ResultJson/state, tokens, and provider URLs are never printed. Error-body inspection reads at most 8193 bytes and discards remote text. The sole URL output is the explicitly required public OAuth AUTH_URL.

`rootReleaseAllowed=true` means every required **scoped administrator runtime** check in this invocation passed. Ordinary-user permissions, owning-team behavior, other users, rollback fault injection, browser usability, and full app acceptance remain untested. There is no role assignment, cleanup, broad table query, metadata repair, or automatic retry.

API shapes were checked against current Microsoft primary documentation on 2026-10-15:

- [Bulk operations: bound namespace, @odata.type, standard-table limitations and exact DeleteMultiple refusal](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/bulk-operations)
- [Update, If-Match update-only behavior and PATCH upsert](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/update-delete-entities-using-web-api)
- [DeleteMultiple collection-bound Targets contract](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/deletemultiple?view=dataverse-latest)
