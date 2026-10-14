# Microsoft-backed kitchen repository — verified path and implementation contract

**Controlling recommendation:** the follow-up section at the end supersedes the initial event-per-record/reducer-parity proposal for the current two-editor, multi-event aggregate.

Research date: 2026-10-14. Read-only inspection of installed packages and official Microsoft documentation; no tenant, credentials, environment, connections, or cloud data inspected or changed. **Recommendation: native Dataverse Custom APIs backed by synchronous C# plug-ins, called through generated Code Apps services.** The current React/Vite repository interface can remain; the browser must send operations, never authoritative replacement state.

## Evidence and exact SDK surface

Locally inspected `@microsoft/power-apps/package.json` confirms SDK **1.5.0**. CLI package present is **1.3.0**. Relevant installed files:

- `node_modules/@microsoft/power-apps/dist/data/Data.types.d.ts`
- `node_modules/@microsoft/power-apps/dist/internal/data/core/types/index.d.ts`
- `node_modules/@microsoft/power-apps-cli/dist/chunk-I3YX4AUN.js` (service-generation implementation)
- `src/data/repository.ts`, `src/domain/state.ts` (existing contracts; domain under concurrent development)

Public exports from `@microsoft/power-apps/data` include `getClient`, `DataClient`, `IOperationResult`, `IOperationOptions`. Installed signatures:

```ts
getClient(dataSourcesInfo: DataSourcesInfo): DataClient;
client.executeAsync<TRequest, TResult>(operation: IDataOperation<TRequest>): Promise<IOperationResult<TResult>>;
client.updateRecordAsync<TInput, TResult>(tableName: string, recordId: string,
  changes: TInput, partitionId?: string): Promise<IOperationResult<TResult>>;
// IOperationResult<T> = { success: boolean; data: T; error?: Error | PowerDataRuntimeHttpError; ... }
```

The update signature and `IOperationOptions` have **no documented If-Match / rowVersion / custom-header option**. Do not claim optimistic concurrency from generated `.update()` or a revision comparison performed only in the browser. Do not import private SDK internals to compensate.

Supported commands, confirmed in installed CLI implementation and Microsoft documentation (shown only; **not executed**):

```sh
pa app find-dataverse-api --search zk_Kitchen --json
pa app add dataverse-api --api-name zk_KitchenLoad
pa app add dataverse-api --api-name zk_KitchenCommit
```

Names use a proposed publisher prefix `zk`, not an existing tenant resource. Generate actual classes/types from deployed API metadata. Microsoft documents `<ApiName>Service.<ApiName>(...)`; bound APIs take the target record ID first. Return type is `Promise<IOperationResult<...>>`. Generation updates schemas, `power.config.json`, data-source metadata, and generated services. The installed generator uses `client.executeAsync` with `dataverseRequest.action: 'customapi'`. Exact kitchen parameter order must come from generated metadata, not a handwritten guess. The documentation's WhoAmI comment says `result.value`, but the installed SDK declares **`result.data`**; validate actual response in the integration test. [Official action/function guide](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/add-dataverse-action-function)

Ordinary Dataverse table services remain useful for administrative views. Their documented limitations include alternate-key support, while the server-side Dataverse API can enforce keys. Do not confuse a client-library limitation with a database limitation. [Code Apps Dataverse guide](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse)

## Smallest implementable server design

Use two standard Dataverse tables for the first integration, preserving the existing aggregate model. This is a deliberate small-event design, with contention and payload limits measured before production; normalized tables can follow without changing the operation API.

| Resource | Required properties |
| --- | --- |
| `zk_kitchenevent` | User/team ownership; event ID; schema version; integer application revision; bounded multiline state JSON; Dataverse RowVersion; optimistic concurrency enabled. One aggregate per event. |
| `zk_kitchenoperation` | Event lookup; operation ID; canonical request hash; initiating user; applied revision; timestamp. Unique alternate key `(event, operationId)`, active before enabling writes. No automatic expiry within the promised retry period. |
| `zk_KitchenLoad` | Entity-bound function/API returning `StateJson` plus schema/revision; caller must have event read access. A read-only action is also acceptable if generation/function behavior requires it. |
| `zk_KitchenCommit` | Entity-bound **Action**, `IsFunction=false`; input `OperationJson` string; output `ResultJson` string containing existing `CommitResult`; synchronous main-operation plug-in. |

API configuration: `PluginTypeId` points to the implementing plug-in; `AllowedCustomProcessingStepType=None`; `ExecutePrivilegeName` uses an existing table privilege appropriate to the API. `IsPrivate` controls discovery, **not authorization**. Keep metadata discoverable during generation; decide its packaged setting with ALM. A custom API without a plug-in can still be invoked and return default outputs, so a successful transport call alone proves nothing. [Custom API documentation](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/custom-api)

Server commit algorithm:

1. Resolve the authenticated caller from Dataverse execution context. Check event access and operation-specific capability; parse a bounded, versioned envelope and allowlisted operation schema. Never accept a caller ID or role from JSON. Reject unknown fields/types, malformed IDs, non-finite quantities, invalid state references, and unexpected tenant/document hosts.
2. Load event state and **Dataverse RowVersion**. Find a committed receipt for `(event, op.id)` **before** checking `baseRevision`. Same caller and canonical request hash means an acknowledged replay; return `saved` with current readable state. Same ID with different content/caller is rejected. Include baseRevision in the immutable request fingerprint; rebasing is a new user action with a new ID.
3. If application revision differs from `op.baseRevision`, return `conflict` with current state before any write. Apply the operation using server-side domain rules; generate authoritative timestamps on the server.
4. Update the aggregate with `UpdateRequest`, target `Entity.RowVersion` from the read, and `ConcurrencyBehavior.IfRowVersionMatches`; increment application revision. Create the unique receipt **within the same synchronous transaction**. Throw on failure so both roll back. Require `context.IsInTransaction` before any mutation, and prove rollback through integration tests.
5. Return `saved` only after the action successfully completes. Race-induced version faults must propagate out of the failed transaction. The adapter can retry the exact operation in a **new request**: a receipt now present returns saved; another operation winning returns conflict. Bounded retries, never an unconditional overwrite.

`UpdateRequest` concurrency is a documented server API; custom-table concurrency is enabled by default but must be checked in deployed metadata. Application revision alone does not prevent a race between read and write. [Optimistic concurrency](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/optimistic-concurrency)

Dataverse synchronous transaction behavior supports rollback; avoid asynchronous persistence or separate browser calls for aggregate and receipt. The plug-in must not swallow an OrganizationService failure and continue using the failed transaction. No nested `ExecuteTransactionRequest` is needed inside an existing transaction. [Transactions](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/scalable-customization-design/database-transactions), [plug-in exception behavior](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/handle-exceptions), [transaction error guidance](https://learn.microsoft.com/en-us/troubleshoot/power-platform/dataverse/plug-in-execution/dataverse-plug-ins-errors)

The unique key requires successful index activation; index creation is asynchronous. It protects duplicate receipts under races, independently of the browser. [Alternate keys](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/define-alternate-keys-entity)

## Server permissions and direct-write bypass

Preferred initial policy: execute under caller context via `CreateOrganizationService(context.UserId)`; validate initiating-user identity for receipts. Dataverse owner/team access scopes each event. Use separate reader/operator/manager capabilities, with price/recipe/administrative operations restricted on the server. [Caller context](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/impersonate-a-user)

**Caller-context CRUD rights alone are insufficient**: a permitted writer could otherwise bypass domain rules by updating JSON directly. Add synchronous write-guard plug-ins on all externally reachable mutation messages for both tables. Permit changes only from the expected KitchenCommit execution context (and separately controlled migration/admin paths), not by trusting a JSON flag. Cover Create, Update, Delete, Upsert and available bulk messages; prevent operation-receipt alteration/deletion. Deny user delete privileges as additional protection. Prove direct CRUD and bulk bypass attempts fail. An elevated storage service is an alternative only with explicit caller/record authorization and dedicated least-privilege design; do not silently use SYSTEM or an app-maker connection. [Dataverse event framework](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/event-framework)

Environment security-group membership, app sharing, and Dataverse data roles are separate gates. The approved group and membership are still unresolved. Do not create an unrestricted environment or substitute the default/developer environment to bypass the blocked step. Standard/default and developer environment group rules differ; confirm the intended supported environment type. [Environment access controls](https://learn.microsoft.com/en-us/power-platform/admin/control-user-access)

## Adapter behavior and next task contract

Implement a `DataverseRepository` around a narrow injected `KitchenApi` bridge; keep generated service imports in one module. `load()` validates `result.success`, then the shape/version of `result.data.StateJson`. `commit(op)` validates `ResultJson` into `CommitResult`, including revision/state consistency. Handle both rejected promises and `success:false`; do not convert authorization, malformed response, throttling, or connection failure into `saved` or `conflict`. Preserve the same operation ID and immutable content after ambiguous timeouts. Never automatically rebase an operation to overwrite newer work. Keep unsent user input visible; label it saved only after server acknowledgement. Preserve the existing fail-closed production mode until the real bridge is configured.

Next implementation deliverables, possible locally before environment authorization:

- Versioned JSON schemas and operation fixtures shared between TypeScript and C# tests; exact server parity for calculations, validation and historical snapshots. The browser's `applyOperation` is not automatically reused by a C# plug-in.
- Plug-in project, solution definitions, roles, table guards, and integration-test plan; explicit supported JSON size/operation retention and per-event concurrency bounds.
- Adapter and transport contract tests using injected API responses; these establish mapping/retry behavior only, **not Microsoft acceptance**.

After concrete environment/group authorization: provision/import the reviewed solution, activate keys, generate real services, wire the bridge, and run two-user tests: allowed/denied operations; wrong-event access; direct CRUD/bulk rejection; simultaneous same-revision writes (one saved, one conflict); duplicate ID requests (one effect); same ID/different payload rejection; forced rollback between state and receipt; timeout-after-commit replay; restart/reload persistence. Use an unauthorized third identity where available. Verify both app launch and Dataverse access as ordinary users, not an administrator.

Provider resources still required: approved Dataverse environment and access group; Code Apps feature enabled; app sharing; appropriate end-user licensing; solution publisher; plug-in deployment privileges/toolchain; event ownership and roles; storage capacity and operational ownership. Microsoft lists Premium, pay-as-you-go, App Pass or auto-claim paths; tenant entitlement is **not verified**. Bundled JavaScript assets are publicly accessible, so never bundle source kitchen records, secrets or privileged credentials. [Code Apps prerequisites and limits](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview)

**Status:** supported transport and server primitives verified from installed SDK and official sources; this specific schema/plug-in design is an engineering proposal. No generated kitchen services, deployed APIs, transactional runtime behavior, permissions, licenses, or multiuser acceptance have been live-verified. SharePoint/Excel read-modify-write and a Power Automate sequence are not substitutes for the atomic server commit contract.

## Follow-up: simplest safe deployable backend for two fully authorized editors

This section supersedes the initial operation-reducer/per-event proposal above. **Use candidate-state compare-and-swap, one workspace aggregate, two unbound Custom API actions, and one receipt table.** It preserves the working TypeScript domain implementation and requires a small C# persistence/validation plug-in, not a second implementation of every UI operation. This is an engineering recommendation conditional on **every writer having full kitchen-edit authority**; it does not assert that this permission scope has already been approved.

### What candidate-state commit guarantees

The browser computes a proposed state with `applyOperation(current, op)`. The server receives that candidate but owns authorization, validation, version checks, deduplication and persistence. With a genuine Dataverse RowVersion CAS, this is a safe full-document edit protocol for two equally authorized editors. It prevents lost updates and duplicate effects. It does **not** prove the candidate was produced by the named operation or by the official UI. The operation description is audit metadata, not authorization evidence.

C# need not recompute purchasing suggestions, every reducer branch, or UI-derived totals. It must validate the persisted-state contract: exact supported schema; bounded strings/collections/depth; finite/ranged numbers and cent precision; valid references; unique IDs and supplier/invoice-number keys; allowed document hosts; preservation of original source records and required history. Revision, operation receipts, actor, and server timestamps are server-owned. Invariants advertised as guarantees (for example preserving issued-order snapshots and already-recorded sale prices) need server comparisons, even if both users may edit everything else. Merely testing the top-level JSON shape is insufficient. If future users receive limited permissions per operation or field, either enforce allowed diffs server-side or move those operations to server reducers.

The current `KitchenState` now includes `archivedEvents`, and `event.switch` changes `state.event.id`. Therefore use a stable **`zk_kitchenworkspace` row GUID**, separate from every domain event ID. One CAS covers the whole existing aggregate. Do not key storage by whichever event is currently selected, and do not claim that archived events already reside in separate Dataverse tables. Existing JSON source is **68,246 bytes formatted / 48,581 UTF-8 bytes minified** (measured from `import/2026.json`); a single document is reasonable initially. Propose a **512 KiB UTF-8 state cap**, explicit collection/depth limits, and a multiline column configured at 1,048,576 characters. Reject excess size visibly; never trim history automatically. Every update transmits the full aggregate and conflicts even when editors touch different events. This is acceptable at the stated scale, not a scalability promise. [Dataverse text limits](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/types-of-fields)

### Exact v1 API contract to implement

Proposed names below are the definitive local implementation contract, not discovered cloud resources. Use lowercase table schema names to make the intended privilege names unambiguous; confirm actual generated privileges when importing the solution.

Both API definitions:

```text
BindingType = Global (0)
IsFunction = false
IsPrivate = false (needed for metadata-based Code Apps generation)
AllowedCustomProcessingStepType = None (0)
WorkflowSdkStepEnabled = false
PluginTypeId = corresponding concrete IPlugin type
Request parameter: RequestJson, String, required
Response property: ResultJson, String
```

| API unique name / plug-in | ExecutePrivilegeName | RequestJson content | ResultJson content |
| --- | --- | --- | --- |
| `zk_KitchenLoad` / `KitchenLoadPlugin` | `prvReadzk_kitchenworkspace` | `{protocolVersion:1, workspaceId:"GUID"}` | `{protocolVersion:1, workspaceId, state:KitchenState}` |
| `zk_KitchenCommit` / `KitchenCommitPlugin` | `prvWritezk_kitchenworkspace` | `{protocolVersion:1, workspaceId:"GUID", operationId:"immutable-id", expectedRevision:integer, operation:{type,payload}, candidateState:KitchenState}` | `{protocolVersion:1, workspaceId, operationId, status:"saved"|"conflict", appliedRevision:integer|null, state:KitchenState}` |

On first saved commit, `appliedRevision` is the resulting revision. On an acknowledged replay it is the revision stored in the receipt, while `state` may be the newer current state. On conflict it is null. Validation/permission/system errors are faults, not successful business results. Neither API creates or seeds a missing workspace automatically. Provisioning the initial row is a separate controlled deployment/import action.

After actual metadata generation, the SDK calls are `zk_KitchenLoadService.zk_KitchenLoad(requestJson)` and `zk_KitchenCommitService.zk_KitchenCommit(requestJson)`; with one parameter there is no positional ambiguity. Confirm generated class identifier casing in the generated file. Wrap `IOperationResult<Record<string, unknown>>`, require `success === true` and string `data.ResultJson`, parse/validate the v1 envelope, and map it to the existing repository contract. An unconfigured production adapter must remain blocked. Local fake transport tests are not generated-service/live-runtime proof.

The privilege names above follow the deliberately chosen lowercase schema names. Verify `Privilege.Name` metadata after table creation; do not use display labels or invent privilege GUIDs. Use a user/team-owned workspace table and, for this single kitchen, an organization-owned receipt table containing only minimal audit metadata. A reader role gets workspace Read; an editor gets workspace Read/Write/AppendTo scoped through the owning kitchen team and organization-level receipt Read/Create/Append for the lookup. This lets either editor see duplicate IDs without needing to reassign newly created receipts. The API still validates the workspace access; the receipt table is not a separate source of permission to edit a workspace. No user Delete/Assign/Share or receipt Write/Delete privilege. `ExecutePrivilegeName` checks privilege possession, not access to the selected workspace: use caller-context service operations for record access as well. Direct table write guards remain required so external CRUD cannot skip CAS or receipt rules. Protect workspace create/update/delete/upsert/bulk paths and receipt writes; only the expected server execution context or the explicit provisioning path may write. Do not grant general bypass privileges. [Custom API privileges and binding](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/custom-api)

### Transaction and repeat algorithm

Use two standard, non-elastic tables: `zk_kitchenworkspace` and `zk_kitchenoperation` (workspace lookup, operation ID, SHA-256 request digest, initiating user, applied revision, server timestamp), with active unique key `(workspace, operationId)`. Hash the **exact UTF-8 RequestJson string**. The client must freeze and preserve that string for every retry; computing a fresh candidate with a fresh timestamp under the same ID is an invalid retry. This avoids cross-language canonical-JSON ambiguity. Different bytes under the same ID are explicitly rejected even when they look semantically equivalent.

The commit plug-in validates identity and access, retrieves the workspace and RowVersion, checks the receipt before stale revision checks, validates candidate invariants against current state, replaces client revision/operationIds with server-computed values, performs `UpdateRequest` with `IfRowVersionMatches`, and creates the receipt. Both writes must occur inside the same transaction. An existing matching receipt returns saved; a stale expected revision without a receipt returns conflict. A raced database fault rolls back and escapes; the client may retry the frozen envelope in a new request, never inside the aborted transaction.

Microsoft's own architecture reference explicitly states that Dataverse Custom APIs complete modifications in a transaction and discusses both bound and unbound actions. Binding does not create record authorization automatically. Set `PluginTypeId` for the synchronous main operation; do not use an asynchronous callback, a background operation, or confuse this with a generic HTTP custom API/Azure Function. Custom APIs do not have the legacy workflow action's user-settable Enable Rollback switch. **Check `context.IsInTransaction` before the first mutation and fail closed if false.** A real deployment must verify true and a forced exception after aggregate update but before receipt creation must leave neither write. These are runtime acceptance requirements, not gaps to hide behind a local mock. [Official transaction architecture](https://learn.microsoft.com/en-us/power-platform/architecture/reference-architectures/optimize-performance-canvas-apps), [custom-message comparison](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/custom-actions)

### macOS compilation without cloud deployment

A normal SDK-style C# library targeting `net462` can be cross-compiled using the macOS .NET SDK and the official reference-assemblies NuGet package. The reference pack supplies compile-time Framework APIs; it does not install or run .NET Framework on macOS. This combination is a supported-component engineering path, **not a build already verified here**. `command -v dotnet` returned no executable in the current PATH. No runtime, SDK, NuGet package, or tool was installed. [Official reference-assemblies guidance](https://learn.microsoft.com/en-us/dotnet/framework/migration-guide/reference-assemblies), [macOS SDK guidance](https://learn.microsoft.com/en-us/dotnet/core/install/macos)

Minimal project starting point (not the complete packaging/signing contract):

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net462</TargetFramework>
    <LangVersion>latest</LangVersion>
    <Deterministic>true</Deterministic>
    <RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.CrmSdk.CoreAssemblies" Version="9.0.2.60" PrivateAssets="all" />
    <PackageReference Include="Microsoft.NETFramework.ReferenceAssemblies" Version="1.0.3" PrivateAssets="all" />
  </ItemGroup>
</Project>
```

The official CoreAssemblies package currently supplies a net462 target; pin the restored version/lockfile. The metapackage resolves the net462 reference package. A local build is then `dotnet restore server/Kitchen.Dataverse.csproj` followed by `dotnet build server/Kitchen.Dataverse.csproj -c Release --no-restore`. Keep restore caches in the approved workspace if necessary. Do not add a Windows-only Visual Studio PowerApps targets import merely to compile this class library. [CoreAssemblies package](https://www.nuget.org/packages/Microsoft.CrmSdk.CoreAssemblies/9.0.2.60), [net462 reference package](https://www.nuget.org/packages/Microsoft.NETFramework.ReferenceAssemblies.net462/1.0.3)

A compiled DLL is not yet a deployable solution: direct assembly registration requires strong-name signing; a proper Dataverse plug-in NuGet package can carry unsigned assemblies and required dependencies. Prefer the documented plug-in package path if using a JSON library. Do not assume `System.Text.Json` transitively referenced by CoreAssemblies has the matching sandbox runtime version; explicitly package it if used. Avoid ILMerge. Keep Dataverse-provided SDK assemblies out of uploaded runtime dependencies. Local unit tests should run portable validation/hash logic under a current .NET target; executing the net462 plug-in runtime still requires the Dataverse/Windows-compatible test environment. [Official plug-in build and packaging requirements](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/build-and-package)

**Next implementation task:** write and compile real `KitchenLoadPlugin`, `KitchenCommitPlugin`, and `KitchenWriteGuardPlugin`, plus bounded candidate validator, deterministic protocol fixtures, and solution/table/API/role registration definitions. Preserve the existing TypeScript reducers and add the snapshot adapter with immutable pending request persistence. Supply a real compiled/package artifact and reproducible build evidence; separately label solution import and live permissions/concurrency tests pending. No tenant resource creation or deployment before the unresolved security-group authorization is resolved.
