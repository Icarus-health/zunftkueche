# Zunftküche Microsoft Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Implementers sequential; controller alone handles provider/browser actions.

**Goal:** Deploy the existing kitchen backend and code app into the approved environment, initially only for Vorstand.

**Architecture:** Local phased provisioning console authenticates through supported Microsoft OAuth, validates the exact target/user, translates existing registration contract into supported metadata, reads back every created resource and stops on drift. Actual generated Code Apps services connect the unchanged repository contract. No broad Team roles.

**Tech Stack:** Existing React/TypeScript app; .NET10 SDK 10.0.402 available at ../dotnet10; pinned Microsoft.Identity.Client if needed; Dataverse Web API v9.2 or official ServiceClient; pa1.3.0; PAC2.13.1 installed at ../pac (help verified, no auth created).

**Spec:** docs/superpowers/specs/2026-10-15-kitchen-deployment.md. Existing server/deployment/registration.json and docs/deployment-preflight-2026-10-15.txt define resources.

## Global Constraints

Only https://org1d76e28a.crm17.dynamics.com, organization5ded2106-01c8-f111-be88-002248db2d69, tenant1dcbc0d3-e9b9-4622-bbd7-811ff1c1f7e9, user Vorstand@Schelmenzunft.onmicrosoft.com. Default dry/inspect mode, explicit phase argument for writes. No real provider actions by implementers/reviewers. No cookies/private token cache extraction or secret logging. No paid subscriptions, other users, app registrations, new access groups, deletion or source mutation.

## Review Focus

- Wrong host, organization or account must stop before any write.
- Rerun after partial/ambiguous creation must read canonical identity, detect drift and avoid duplicates.
- Inactive keys or any supported unguarded table mutation prevent application release; redundant Multiple guards must not block normal individual Commit writes.
- Source seed must preserve IDs/provenance and omit only local paths/working tests in a separate normalized copy.
- Authentication URLs/errors/logs must not leak tokens, passwords or receipt contents; actual tokens remain in memory.

### Task 1: Reviewed provisioning console

**Files:** create server/Deploy/* (separate project, not part of plugin package), create server/Deploy.Tests/* or equivalent meaningful tests, optional tests/deployment-seed.test.mjs; document usage and safe execution under docs/deployment.md. Do not modify src/domain or source import. Root owns deployment-status JSON and current README.

**Interfaces:** Entry arguments `--phase inspect|tables|seed|backend|verify`, `--dry-run` and explicit input paths. `IDataverseTransport.SendAsync(HttpMethod method, string relativePath, JsonNode? payload)` allows fake transport tests. Provisioning reports structured resources/status with no credentials. Default mode inspect. Authentication public URI emitted once as `AUTH_URL <url>` for Root to open in DuckDuckGo; no browser launch or disk token persistence. Supported OAuth token provider supplies HttpClient or ServiceClient. Do not rely on PAC auth token for Dataverse: installed command only exports Power Platform API token and has no resource flag.

- [x] Add failing tests: exact target and case-insensitive identity verification; existing canonical resource reuse and drift rejection; ambiguous write readback; inactive key/unguarded supported message blocks readiness; safe seed normalization preserving source hash/IDs; no secret values in logs.
- [x] Implement actual metadata payloads from official references in preflight. Keep auth, transport, resource provisioning and seed preparation in separate readable files. No shell-driven credential output. Pin official dependencies/lockfiles. Unknown metadata shape is a reported gap, not a guessed payload.
- [x] Implement inspect readbacks: WhoAmI + current systemuser identity, organization language/base currency, actual resource metadata/privileges/message filters, existing package/types/actions/guards; verify expected target before any mutations.
- [x] Implement phases: tables creates publisher/solution/tables/attributes/lookup/key and verifies schema; seed creates the reviewed workspace only if missing, owned by authenticated user, before guards; backend uploads verified nupkg, binds actual types/privileges to APIs, registers every supported guard; verify reads all expected resources and key state. No ordinary roles or other principals granted by tool. Use actual table support metadata, record unavailable bulk messages. Runtime activation tests remain Root's task.
- [x] Run local tests, build, self-review, commit owned files and report. Independent code/security review before Root executes writes; fix findings then scoped re-review.

### Task 2: Standard-table merged pipeline registration

**Files:** modify server/deployment/registration.json (planned registrations and explicit coverage contract), server/Deploy/Provisioner.cs (readback/coverage classification), server/Deploy/Program.cs (truthful report counts if needed), server/Deploy/WebApiTransport.cs and server/Deploy/Core.cs (safe numeric error-code diagnosis for the observed read-only 403), server/Deploy.Tests/Program.cs (focused tests), docs/deployment.md and server/README.md (matching registration guidance only). No change to server/Plugins.cs, compiled nupkg, source seed, domain or frontend.

**Interfaces:** consumes Task1 authenticated ResourceEngine, verified standard-table metadata and unchanged KitchenWriteGuardPlugin. Produces six dedicated single-message guard registrations (Create/Update/Delete for each of two tables), plus explicit report records for Upsert, CreateMultiple, UpdateMultiple, UpsertMultiple and DeleteMultiple on each table. Existing Backend(packageBytes, create) remains callable. Metadata coverage must never be presented as successful runtime acceptance; missing prerequisite guards remains blocking.

- [x] Add failing focused tests: known CreateMultiple/UpdateMultiple filters must not cause dedicated Multiple step POSTs; all six dedicated single guards remain required and exact; Standard Upsert must be recorded as invoking guarded Create/Update instead of requiring an unavailable standalone Upsert step. Missing/inactive single Create/Update protection blocks coverage. UpsertMultiple is recognized as potentially supported whenever both C/U Multiple filters exist, even if its own filter is absent. DeleteMultiple is classified as unsupported only for verified Standard tables, never from absent filters alone. Bulk coverage records require Root live checks rather than claiming execution success.
- [x] Run the focused deployment suite to demonstrate red assertions.
- [x] Update the planned registration contract and provisioning implementation to keep strict individual guards and model merged-pipeline coverage, following https://learn.microsoft.com/en-us/power-apps/developer/data-platform/bulk-operations#message-pipelines-merged and https://learn.microsoft.com/en-us/power-apps/developer/data-platform/use-upsert-insert-update-record#understand-the-upsert-process-for-standard-tables. Never loosen the runtime guard to allow arbitrary singleton Targets or any-ancestor markers. No metadataReady/app release claim based on unchecked runtime behavior. Existing unsupported or drifted Multiple steps must be surfaced and stop; do not silently disable/update/delete live resources.
- [x] Observed live preflight blocker: exact target/account/language/currency validated, kitchen_tables=0, pluginpackages inventory returned HTTP403 despite existing Systemadministrator role. Add only bounded error-code diagnosis: retain HTTP status plus Dataverse error.code if it exactly matches `0x` + eight hex digits. Never emit remote message, body, URL, tokens, headers or arbitrary strings; malformed/missing error code preserves generic HTTP status. Add focused safe/unsafe-code tests, no provider call by implementer. This is required to diagnose the concrete provider refusal, not a new logging feature.
- [x] Align only the affected registration guidance and report counts. Preserve root's current environment/license/owner documentation. Explain that no dedicated UpsertMultiple filter does not imply an unavailable API; real direct Upsert/bulk rejection and a valid ordinary Commit are Root release gates.
- [x] Run local Deploy.Tests and .NET10 build; run only other focused tests that actually bind the changed registration contract. Verify compiled plugin and original source hashes unchanged. Commit owned changes, self-review and report. No provider/auth/browser calls or subagents. Independent task review before Root backend activation.

### Task 3: Real environment execution and generated client

**Files:** generated actual Code Apps metadata/services, src/main.tsx bootstrap integration, deployment documentation/status. Actual names/signatures come from generation; never invent them.

- [x] Root signs in via DuckDuckGo, runs inspect, confirms expected organization/account and read-only gates. Root executes reviewed phases sequentially, reading back actual results. Record exact IDs/status, no credentials. If a phase is rejected or unsupported, preserve partial resources and report the concrete blocker.
- [x] Enable Code Apps only in approved environment; inspect ten existing donated passes and allocate needed quantity without new purchases. Root verifies sharing only for Vorstand; no broad Team app access.
- [x] Generate real services through pa; inspect SDK data.ResultJson/canWrite contract, configure stable workspace GUID before React mount; test build and actual Load/Commit. Agent implements bootstrap after real generation only, independently reviewed.
- [x] Publish private code app, verify real host URL under owner identity; owner-only actual sharing read back.
- [ ] Additional personally scoped Teams integration explicitly approved after automatic CodeApp route failed. No new data roles/messages; independently reviewed package and actual Teams Load/Save/Reload required.

### Task 4: Live acceptance and package

- [x] Root verifies owner browser workflow, provider-side persisted data, retry/idempotence/conflict/direct-write behavior and source preservation with explicitly marked test data only. Do not infer ordinary-user roles from admin success or weaken write guard to make testing pass.
- [x] Final whole change review; one grouped fix wave and scoped re-review if needed. Record unverified live boundaries precisely.
- [x] Fresh tests/build as changes require, source hashes; dated source/usage/status/proof exported and byte-verified from commit44c0f52 (175 files). No credentials/private working test state. Existing originals and historical deliverables preserved. Package closure recorded separately in docs/package-delivery-2026-10-15.json.

### Genehmigte Erweiterung: Schreiber, 15.10.2026

Die ursprüngliche Erstbereitstellung galt nur Vorstand. Der Nutzer hat später ausdrücklich die persönliche Teams-Regel für Schreiber und Schreiber als Küchen-Bearbeiter genehmigt. Aktueller Zugriffskreis ist deshalb Vorstand + Schreiber, kein weiterer Teamnutzer. Diese spätere Freigabe ersetzt die frühere Owner-only-Beschränkung für diesen gezielten Ausbau.

- [x] Schreiber als App-Benutzer ohne Mitbesitz/E-Mail-Einladung geteilt, nach eigener Portal-Neuladung Besitzer+Benutzer/0Einladungen bestätigt.
- [x] Zwei vorhandene App-Pässe zugeteilt; persönliche Teams-Upload-Regel ausschließlich Schreiber direkt wirksam zugewiesen.
- [x] Neue Rollenrechte gemessen und zwei sichere Teilstopps bewahrt; separat geprüfter genauer Observed10-Pfad,155 Tests.
- [x] Tatsächliche leere Dokumentdienst-Konfiguration zuerst lesend bestätigt, danach Rolle und einzelnen Workspace gezielt zugewiesen und nachgelesen, Eigentümer/Revision2 unverändert.
- [ ] Gewöhnliche Schreiber-Anmeldung und tatsächliches Load/Save/Reload prüfen; Nutzer-Anmeldung angefragt.
- [ ] Persönlichen Teams-Upload nach Microsoft-Verteilung, Installation und echtes Teams-Verhalten prüfen. Aktuell im Client noch nicht verfügbar; kein Orgkatalog-Upload oder CSP-Eingriff.
