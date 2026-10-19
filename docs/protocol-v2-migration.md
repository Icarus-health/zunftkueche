# Kitchen protocol 2 — coordinated release gate

Local implementation only. This document does not attest a deployment, current ownership, or a real two-user run.

The public Custom API signatures remain the existing `RequestJson`/`ResultJson` strings. The embedded JSON protocol is now 2. No connector regeneration, API grant, new identity grant, trial or paid service is required by this change. Stored schema remains 2; old events, receipt bytes and operation signatures are not migrated. Optional event settings and future order context fields are additive.

## Contract

Load request: `{protocolVersion:2, workspaceId}`. Load response includes the canonical aggregate, `canEdit`, `canConfigure`, `canClose`, and `identity:{organizationId,userId,workspaceId}`. `organizationId` is the actual Dataverse execution context OrganizationId, not a guessed Power Apps environment label. `userId` is InitiatingUserId. `canWrite` remains a compatibility alias on load only.

Commit adds required `targetEventId` and the confirmed `identity` to the former request. Server compares the request identity to the current caller/environment. Signature is canonical JSON of `{type,payload,targetEventId}`; receipt SHA-256 still covers the exact RequestJson bytes. Every saved, rejected and conflict response includes target, identity and freshly derived capabilities. The client checks target and identity before consuming a response. CAS remains aggregate-wide.

`canEdit` is effective record WriteAccess. `canConfigure` and `canClose` additionally require ownerid to be a systemuser whose ID equals InitiatingUserId. A team owner, other user or owner without WriteAccess fails closed. Field differences govern authorization regardless of operation label. Ordinary culinary masters remain editable. Event metadata/settings and event creation require configuration authority; event status and closure lessons require closure authority. Unknown fields are rejected throughout the defined state objects.

Selection is a scoped preference, never a commit. Editing an archived event merges only that event slice into its existing position. Creation from a selected archive preserves all old slices and makes the newly created event the canonical root. Projection is distinct from canonical state.

## Pending requests and old clients

Every existing `zunftkueche.pending.v1.<workspace>` value is preserved byte-for-byte, including malformed or empty values. It blocks writes with a reconciliation message. It is never resent, upgraded, renamed, removed or silently cleared. Neither a missing receipt nor a transport failure proves an earlier request did not commit. Resolution requires separately reviewed read-only receipt reconciliation and an explicit user decision; this release provides no automated reconciliation.

New pending bytes use `zunftkueche.pending.v2.<organization>.<user>.<workspace>`. An account change does not replay another scope's request. Version-1 calls fail before mutation with a reload/reconciliation message. Old browser clients cannot keep writing against the new server. The deployment must not leave a new client talking to an old server.

## Required release evidence (not performed by Task 2)

1. Preserve authoritative pre-update aggregate and archive snapshots, raw hashes, global revision, operation IDs/signatures, receipt rows and owner reference. Do not reseed or rerun grant/continuation scripts.
2. Validate the existing stored schema against the new closed field boundary before release. Unexpected existing properties require review, not deletion or history trimming. Confirm the actual owner and both callers' effective access.
3. Update the existing plugin package through the reviewed update workflow, then the existing client. Test v1 rejection and v2 load; keep writes closed if version or identity checks fail.
4. Read back unchanged aggregate/archive/receipt hashes and owner. Observe true owner/editor capability differences in the actual host. Test two real users selecting and editing different events, conflict/retry behavior, archived target isolation and settings denial.
5. Keep original receipt bytes, historical snapshots and 512 KiB limit intact. Report actual device/host evidence separately from synthetic tests.

The old DenialContinuation checkpoint and legacy ExpectedState helper deliberately remain protocol-1 historical evidence. They are not migration routines and must not be executed against this release. The active RuntimeChecks builder now uses protocol 2 and confirmed load identity; original continuation artifacts/hashes remain untouched. No live scripts were run in Task 2.
