# Task 3 — observed primary-name metadata drift

Base: f7ea2b1. This implementer made no provider, authentication, browser or tenant calls. Evidence about the live organization below was supplied by Root; public Microsoft Learn documentation was read independently.

## Evidence and diagnosis

Root reported exact reuse of publisher 567e35a2-67c8-f111-a05c-7ced8d5f6e0d, solution 587e35a2-67c8-f111-a05c-7ced8d5f6e0d and workspace table metadata df7db5b7-aa29-470d-8623-c7cc0635fdc6. An initial delayed table read correctly stopped without another POST. On the later tables run, the workspace table matched; its primary zk_name attribute differed only in MaxLength: contract 200, actual readback 850. SchemaName zk_name, RequiredLevel.Value None, IsPrimaryName true and FormatName.Value Text matched. Extra managed-property fields are expected and already accepted by subset comparison. zk_state, zk_revision and the operation table were still absent.

The official [create-table Web API documentation](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-definitions-using-web-api) explicitly supplies a primary-name StringAttributeMetadata with MaxLength 100 and requires Text format. It does not document a rule that replaces requested lengths with 850. The observed 850 is real Root readback evidence, **not evidence of a documented universal 200-to-850 normalization**. The payload uses the documented MaxLength/FormatName/IsPrimaryName shape; no local serialization defect was found in that path.

The official [publish-customizations documentation](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/publish-customizations) says creation automatically publishes customizations, while updates require publication. Our utility has only created metadata and has no update or publish-all path. Therefore an unpublished update is not established by the known action history. A plain EntityDefinitions result alone is insufficient to conclude the current published/unpublished versions agree.

Microsoft documents the read-only [RetrieveEntity function](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveentity?view=dataverse-latest) with EntityFilters, LogicalName, MetadataId and RetrieveAsIfPublished. Root can compare the primary attribute inside EntityMetadata.Attributes using the same function with RetrieveAsIfPublished=false and true, EntityFilters=Microsoft.Dynamics.CRM.EntityFilters'Attributes', LogicalName='zk_kitchenworkspace', MetadataId=00000000-0000-0000-0000-000000000000. False selects published metadata; true includes saved unpublished definitions. Root added these probes only to its read-only scratch diagnostic. Its new DuckDuckGo authentication surface stalled, so Root asked the user to complete the browser step. No alternate authentication or bypass was attempted by this implementer.

## Local change and remaining decision

Added drift diagnostics to ResourceEngine.EnsureAsync: a mismatch records the already source-defined resource name, existing fixed error code and an allowlisted field path, e.g. `$.MaxLength` or `$.RequiredLevel.Value`. The allowlist prevents arbitrary property names from becoming diagnostic text; unknown expected keys become `field`, and array paths use `[]`. Remote values, expected payload values, tokens, provider body text and seed/package content are never emitted. RequireMatch retains exact leaf equality, required-field checks and exact array lengths/order. Existing extra managed-property fields remain accepted as before. No write, overwrite, retry, publishing or drift-tolerance capability was added.

**Capacity decision remains pending Root evidence/ruling.** Per Root's instruction, zk_name remains exactly 200 in the contract and payload; 850 continues to fail safely. Registration contract/hash are unchanged (SHA256 46e7fe2b0a71763318bd713df028c3e57ed7d8a7fae380566622a44f94017207). If Root later authorizes exactly 850 for the internal name capacity, it must be a narrow reviewed contract change with a matching pin and focused regression, not a generic “at least requested length” relaxation. No need to mutate live columns merely to satisfy the local expectation is inferred.

## Local verification

Covering tests: server/Deploy.Tests/Program.cs. Added two behavioral tests: primary-name MaxLength drift identifies the fixed resource/path while suppressing remote data, and a nested managed-property mismatch identifies RequiredLevel.Value without disclosing the remote value or extra provider fields. Both assert zero writes.

Red against the prior implementation: `50 passed; 2 failed`. Green after diagnostics: `52 passed; 0 failed`. Existing six-guard/ten-runtime-gate tests remain unchanged and pass. Exact commands from the repository directory:

```sh
DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home DOTNET_GENERATE_ASPNET_CERTIFICATE=false ../dotnet10/dotnet run --project server/Deploy.Tests --no-restore -p:UseSharedCompilation=false
DOTNET_CLI_HOME=/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet-home DOTNET_GENERATE_ASPNET_CERTIFICATE=false ../dotnet10/dotnet build server/Deploy --no-restore -p:UseSharedCompilation=false
```

Build succeeded with 0 warnings and 0 errors. No Node tests or plugin rebuild were run because those files are unchanged. Self-review: only expected source-defined keys feed field paths, values never feed diagnostics, comparison semantics/zero-write behavior are unchanged, and the diagnostic callback runs immediately before the same safe-stop exception. Source/domain/plugin/package/registration, guard coverage and runtime gates are unchanged. Root owns README/status/plan/spec/ledger and retains those changes; this commit includes only Core.cs, the focused tests and this report. The observed capacity mismatch is intentionally not claimed fixed while its contract decision is on hold.
