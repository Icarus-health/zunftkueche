# Zunftküche 1.2.0 – Arbeitsbereich

Stand 26.10.2026: lokal gebaut und mit künstlichen Daten geprüft. Dieses Update wurde noch nicht in SharePoint veröffentlicht oder in Teams abgenommen.

## Bedienung

- **Heute:** konkrete Aufgaben, erwartete Lieferungen und zuletzt gezählte Bestände. Die Anzeige verwendet tatsächliche Erfassungen; sie berechnet keinen laufenden Lagerbestand aus Verkäufen.
- **Einkauf:** Bestellungen vorbereiten, tatsächliche Bestellung dokumentieren, Bestelltext anzeigen und Lieferungen prüfen. Teilmengen bleiben mit Zeitpunkt und Person in der Historie. Eine Dokumentation versendet keine Bestellung an den Lieferanten.
- **Bestand:** Gebinde plus Einzelmenge zählen, als Entwurf speichern und später fortsetzen. Leer bedeutet ungeprüft, 0 bedeutet nichts vorhanden. Beim Abschluss können bewusst ungeprüfte Artikel offenbleiben. Jede Mengenbeobachtung behält ihren Erfassungszeitpunkt und ihre Person; das Abschließen eines alten Entwurfs aktualisiert alte Mengen nicht künstlich.
- **Planung:** Positionen einer Vorjahresbestellung mit angepassten Mengen als neuen Entwurf übernehmen. Liefertermine, Bestellstatus, aktuelle Preise und Lieferungen werden nicht übernommen. Frühere Preise bleiben als Vergleich sichtbar.
- **Verwaltung:** Artikel, Lieferanten, Lieferangebote und Saisons pflegen. CSV-Vorschau für neue Artikel und Lieferanten bleibt verfügbar.
- **Auswertung:** Bestellwerte und Lieferfortschritt aus erfassten Daten. Unbekannte Preise bleiben offen.

Noch nicht umgesetzt: SumUp-Import, Rezepturen und Zutatenverbrauch, automatischer Lagerabgang, Pfandabrechnung, Retouren, mobile Teams-Abnahme und automatische Veröffentlichung. Diese Funktionen werden nicht durch Demo-Kennzahlen vorgetäuscht.

## Kosten und Daten

Keine neuen Dienste, Lizenzen, API-Berechtigungen oder Laufzeit-Abonnements. Statische Dateien liegen im vorhandenen SPFx-Paket, Speicherung erfolgt auf der bestehenden Kanal-SharePoint-Seite mit den bisherigen Rechten.

Die bisherigen sieben `ZK_V1_`-Listen bleiben erhalten. Die neue optionale Liste `ZK_V1_Inventuren` wird erst durch **Zählliste einrichten** angelegt. Es werden keine Excel-Dateien oder Beispieldaten in die echte App importiert. Testdaten bleiben im separaten Testbereich bzw. in der lokalen Vorschau.

## Lokale Vorschau und Änderungen am Code

Voraussetzung: Node.js 22. Im Ordner dieser README:

```sh
npm ci
npm run test:probe
npm run build
npm run preview:local
```

Dann `http://127.0.0.1:53429/` öffnen. Die Vorschau verwendet den gebauten Produktionscode mit einem künstlichen SharePoint-Ersatz und speichert ausschließlich Beispieldaten im Browser. Sie benötigt keine Microsoft-Anmeldung. Nach Codeänderungen erneut `npm run build` ausführen und die Seite neu laden. Der Server bindet nur an die lokale Loopback-Adresse.

Die Einstiegsdateien sind:

- `src/kitchen/workspace.ts`: Startseite, Aufgaben, Navigation und Bereichsübersichten.
- `src/kitchen/view.ts`: Bedienabläufe und Speichern.
- `src/kitchen/operation-forms.ts`: Lieferprüfung und Zählliste.
- `src/webparts/kitchen/KitchenWebPart.module.scss`: Farben, Schriften, Abstände und Bildschirmgrößen.
- `src/kitchen/model.ts`, `operations.ts`, `sharepoint.ts`: Daten, Regeln und SharePoint-Speicherung.

Kein GitHub-Abgleich oder Pipeline eingerichtet. Änderungen sind lokal nachvollziehbar in Git gespeichert. Die Vorschau ist keine Online-App für die Vereinsmitglieder.

## Update des bestehenden Pakets

Gebautes Paket: `sharepoint/solution/zunftkueche-spfx-probe.sppkg`, Solution-/Feature-Version **1.2.0.0**. Bestehende Solution- und Webpart-IDs bleiben gleich. Vor Veröffentlichung vorhandenes Paket und SharePoint-Listen sichern bzw. vorhandene Versionierung prüfen. Nur die bestehende App im App-Katalog aktualisieren; keine neue Teams-App und keine weiteren Berechtigungen anlegen. Die vorhandene Registerkarte im Kanal Küche soll dieselbe SharePoint-Seite weiterverwenden. Anschließend sichtbare Version, Datenladen, Speichern/Neuladen und Konfliktverhalten direkt in Teams prüfen.

**Versionsgrenze:** Sobald Lieferannahmen erfasst sind, verwenden Bestellköpfe Schema 2. Ein alter Client verweigert damit das Lesen, statt die Historie zu überschreiben. Ein Rücksprung auf 1.1 ist nach erster Lieferannahme nicht ohne abgestimmte Datenbehandlung möglich. Neue Lieferannahmen sind auf 100 pro Bestellung begrenzt; die Grenze wird vor dem Schreiben geprüft.

Die Prüfung und ihre Grenzen sind in `design-qa.md` festgehalten. Schriften/Icons stammen aus dem vorhandenen Fluent-UI-Paket; Lizenzhinweis in `src/webparts/kitchen/assets/`.

---

## Historische Machbarkeitsprobe (unverändert dokumentiert)

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

1. Upload only this separate package to the existing SharePoint app catalog. Choose **Only enable this app**, then install it only on the existing team site. The catalog's automatic **Add to Teams** action requires tenant-wide deployment; that broader deployment was cancelled.
2. On the team site, create a page from **Full-page apps → Zunftküche SPFx-Test**, with the site-navigation checkbox cleared. In the existing **Vorstand** channel, add a **SharePoint** tab with that page's URL. Clear the option to post a channel announcement. This embeds the SPFx page through Microsoft's SharePoint tab rather than registering another tenant-wide Teams app.
3. Open the probe within the actual Teams client; record account and visible app version. The embedded page may report SharePoint as its host because the outer tab owns the Teams integration.
4. Set up synthetic data; read 12, save 9 and use Neu laden. Close and reopen the tab; 9 must persist.
5. Open as the second existing account. It must read 9 with existing site permissions. Change to 10 and verify readback in both sessions. A stale save must reject instead of overwriting.
6. Publish an updated package and verify that the new version loads while the synthetic data remains.

Do not call the test successful before these steps have actual evidence. App catalog, package build, ordinary browser preview and API simulation are separate milestones. Retain the test list until reviewed; no automatic deletion or permission changes.

## Deployment observations

- 1.0.0 exposed a SharePoint schema-check edge case: requesting a nonexistent column directly returned HTTP 400, not 404. Version 1.0.1 checks the filtered field collection instead. A regression test covers the empty collection before creating the number field.
- Version 1.0.1 was read back in Safari. Setup completed and read the synthetic initial quantity 12 from SharePoint. The existing native Teams tab also read 12 using its still-open 1.0.0 client.
- Live save verified: the native Teams client (Schreiber account) saved 9 and displayed the successful readback. The independent Safari session (Vorstand account, verified by its SharePoint login hint) reloaded 9 at 12:27. Both accounts have the same display name, so that name alone does not distinguish them.
- The Vorstand session then saved 10 at 12:28:52 and confirmed the value through a readback. A stale Teams save was rejected with “Der Bestand wurde inzwischen geändert. Bitte neu laden.” and disabled saving until a reload.
- The native Teams tab was fully reloaded and left/reopened through the channel's tabs. It then displayed **Testversion 1.0.1** with the preserved stock **10**. Its temporary loading state cleared after showing the Teams main window in normal window mode; no code, permissions or tab settings were changed for that recovery.
- Version 1.0.1 then saved **9** inside native Teams at **12:35:17** and displayed “Gespeichert und durch erneutes Lesen bestätigt.”. The independent Vorstand session reloaded the same **9** with the same modification timestamp. The final native Teams screenshot also showed version 1.0.1, 9 bottles and the successful-save message.
- This proves the bounded desktop Teams/SharePoint round trip with two existing accounts and the observed client update. It is not a production inventory release, mobile-client acceptance or a full application quit/restart test.
- Source changes remain on the local test branch. Publishing to the public GitHub repository was blocked by automatic approval review because the new configuration names the organization's SharePoint target. Do not work around that rejection through another publishing method.
