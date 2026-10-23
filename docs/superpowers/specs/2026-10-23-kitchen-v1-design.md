# Zunftküche v1 – approved design

The user approved the four-view proposal in this conversation and explicitly requested implementation and placement in the shared Teams channel Küche on 23 October 2026. This is authorization to build and deploy the agreed first version, not to publish the source to a public repository or send supplier/channel messages.

## Scope
Today, articles, suppliers and orders; supplier-specific offers, seasons, prior-year copying and explicit stock counts. Large controls, few required fields, responsive petrol/mint design matching the accepted inline mockup. Master-data import uses a preview; no automatic supplier dispatch, SumUp integration, paid hosting, premium connections or new licenses.

## Data and preservation
Seven new versioned SharePoint lists: Saisons, Artikel, Lieferanten, Lieferangebote, Bestellungen, Bestellpositionen, Bestandsmeldungen, under an app-owned ZK_V1 prefix. Existing kitchen records, Dataverse application and isolated SPFx probe remain unchanged. No deletion of existing data. Live acceptance uses a separate ZK_AbnahmeV1 prefix selected by a clearly labelled test URL; the normal app starts with empty real records.

Use the current SharePoint page's web as storage, with the existing signed-in user's rights. Küche is a shared channel with its own site; install and add the full-page app there. Do not broaden site membership or deploy to all sites.

Draft orders can be edited. Ordered snapshots keep their article/supplier/pack/price details even when master data changes. Follow-up orders reference their source. Prior-year copying creates a new draft, keeps quantities selectable/editable, clears current prices and delivery dates, records source prices/year as historical references and never changes source orders or stock. Zero differs from an unknown quantity. All required relationships must exist before saving. Unknown prices do not produce a falsely complete total. Stock is an explicit timestamped count, never an order-derived quantity.

## Reliability
Each mutable record uses an ETag; stale writes reject. Every confirmed save is read back. Record creation has a unique operation key. Order positions are staged as immutable revision rows and published by one final header ETag update; incomplete/uncommitted revisions never appear as an order. Repeated copying of the same source order to the same season and area returns the existing copy rather than creating a duplicate. No silent local-only success or overwriting on network uncertainty.

## Decisions
Keep the existing SPFx/TypeScript toolchain and add a separate product web part to the existing package; retain the original probe component. Native HTML forms and scoped styles avoid a framework/dependency migration. Store typed entity payloads in a plain multiline field plus a unique indexed record key, with SharePoint version history and metadata; the app owns validation and editing. These are internal storage choices with the approved user-visible structure unchanged.

## Acceptance
Local domain/transport tests and production build. Real account, actual Küche Teams tab: create supplier, article and offer, create and edit draft, record an order, copy to another season without changing its source, reload and read back, verify stale-write rejection, preserve records across reopening. Synthetic acceptance is visibly separate from the empty production workspace.
