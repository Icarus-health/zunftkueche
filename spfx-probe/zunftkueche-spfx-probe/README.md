# Zunftküche SPFx connection probe

Isolated feasibility test approved on 22 October 2026. This is not a replacement release or data migration. Existing application code, Dataverse, roles, channels and kitchen records remain unchanged.

## Reuse assessment

Source inspected: Icarus-health/zunftkueche at `a618100ed55b25492394bb7314737dbbfeb45b5e`.

- `src/domain/kitchen.ts`: `parseQuantity` is copied verbatim into this probe, preserving German decimal input and the distinction between missing and zero. Existing domain tests: 15 passing.
- `src/styles.css`: teal, mint, ink and spacing direction reused with scoped styles and controls at least 56 px high.
- `teams/icons/`: existing generated pot icons reused. Existing approved website links reused in package metadata.
- Order history, stock rules, CSV, supplier and article models remain candidates for later reuse; they are not part of this test.
- Existing React 19 / Vite / Power Apps bootstrap, generated connector SDK and Dataverse transaction backend are not embedded into SPFx. They depend on a different host and React compatibility.

## Scope and cost

SPFx 1.23.2, Node 22, no paid services, Azure resources, AI calls, premium connectors or GitHub Actions. Static assets are inside the package and hosted by existing SharePoint. No extra API permissions are requested. Uses the signed-in user's existing SharePoint access. The package does not grant data permissions.

The only data target is `Zunftkueche_SPFX_Test_20261022` on the configured existing team site. The app creates that list, its Quantity number column and one synthetic water item only after explicit selection of its setup action. It reads/writes only that list. No production data is imported. Save uses the loaded item ETag; a conflict rejects the write. Successful writes must be read back before the UI confirms saving.

## Build and local checks

```sh
npm ci
npm run test:probe
npm run build
```

Output: `sharepoint/solution/zunftkueche-spfx-probe.sppkg`. Local tests use a fake HTTP boundary and are not a live SharePoint or Teams acceptance.

## Live acceptance

1. Upload only this separate package to the existing SharePoint app catalog, enable it and add it to Teams using the supported catalog action. Do not replace the existing Power App or Teams wrapper.
2. Open the probe within the actual Teams client; record account, client host and visible app version.
3. Set up synthetic data; read 12, save 9 and use Neu laden. Close and reopen the app; 9 must persist.
4. Open as the second existing account. It must read 9 with existing site permissions. Change to 10 and verify readback in both sessions. A stale save must reject instead of overwriting.
5. Publish an updated package and verify that the new version loads while the synthetic data remains.

Do not call the test successful before these steps have actual evidence. App catalog, package build, ordinary browser preview and API simulation are separate milestones. Retain the test list until reviewed; no automatic deletion or permission changes.
