# Professionelle Zunftküche Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die bestehende Microsoft-Küchen-App mit verlässlichen Alltagsabläufen, mobiler Bedienung, Einstellungen und einem prüfbaren Belegeingang weiterentwickeln.

**Architecture:** React/TypeScript und Dataverse bleiben bestehen. Neue Dokumente sollen nach geprüftem Dateizugriff im bestätigten SharePoint-Ordner liegen; Dokumentmetadaten und Erkennungsentwürfe werden separat vom begrenzten Küchenaggregat geführt. Erkennung erzeugt Vorschläge, die ausschließlich nach bewusster, servergeprüfter Freigabe zu Belegen werden.

**Tech Stack:** Bestehendes React, TypeScript, Vite, Power Apps Code Apps SDK, Dataverse Custom APIs und synchrone C#-Validierung; SharePoint-Online-Connector als zu prüfender Dateiadapter. Lokale PDF-Textauslese und Tesseract.js als zu prüfender Browser-OCR-Kandidat. Neue Paketversionen werden erst nach dem Nutzer-Go anhand aktueller offizieller Dokumentation gewählt und festgeschrieben.

**Spec:** `docs/superpowers/specs/2026-10-19-kitchen-professional-online.md`

## Global Constraints

- Umsetzung und Veröffentlichung beginnen erst nach dem Go des Nutzers.
- Die Microsoft-Code-App und Dataverse bleiben die Grundlage; zusätzliche laufende Kosten, Trials und neue Hostingverträge sind nicht freigegeben.
- Onlinebetrieb ist für den Anfang ausreichend. Eine Offline-Synchronisierung und eine neue Teams-Einbettung sind keine Voraussetzung.
- Lieferant vor Liefertag; Freitag und Samstag am Rechner nebeneinander; unbekannte Angaben nicht als null behandeln; Quellen und historische Stände bewahren.
- Originaldateien und wirtschaftliche Ausgangswerte bleiben unverändert. Keine automatischen Lieferantenmitteilungen, öffentlichen Dateifreigaben oder neuen Benutzergrants.
- Erkennung darf weder direkt buchen noch Bestände oder Stammpreise selbstständig ändern. Nicht erkannte Werte bleiben offen.
- Bestehende echte Benutzerprüfung, RowVersion, Transaktion, Invarianten und unveränderliche Wiederholungsbelege bleiben erhalten.
- Foto-Bytes, Base64-Bilder, OCR-Rohtexte und Jobverläufe werden nicht in das auf 512 KiB begrenzte gemeinsame Küchendokument eingebaut.
- Gegenprüfungen erfolgen mit Agenten. Pro Paket unabhängiger Fach-/Code-Review; sichtbare Änderungen zusätzlich im tatsächlichen Microsoft-Host prüfen.

## Review Focus

1. Mobile 390 px mit Bildschirmtastatur: Name, Tag, Menge und Einheit bleiben gemeinsam sichtbar; feste Fußleisten verdecken keine Eingabe. Tests in Task 1 und Task 7.
2. Gemischte Belege: Gewichtsware, Gebinde, Pfand, Rabatt, Gutschrift und unklare Netto-/Bruttopreise werden nicht in plausible, falsche Werte umgerechnet. Tests in Task 3 und Task 6.
3. Zwei Bearbeiter, zwei Veranstaltungen, zwei Tabs: Auswahl bleibt persönlich; doppelte Übernahme und Wiederholung erzeugen genau eine wirtschaftliche Buchung. Tests in Task 2, Task 5 und Task 6.
4. Kontowechsel oder entzogenes Dokumentrecht: Kein fremder Entwurf, Originalbeleg oder privilegierter Dateizugriff wird weitergereicht. Tests in Task 2 und Task 5.
5. OCR-Hostbeschränkung, fehlende Credits oder geänderte Originaldatei: Kein bezahlter Ersatz, keine stille Teilanalyse, keine Buchung aus einem veralteten Entwurf. Tests in Task 0, Task 5 und Task 6.

## Ausgangspunkt und Reihenfolge

Geprüfter Produktcode: `078d490`. Bestehende Node-Prüfungen: 105 bestanden. Aktuelle visuelle Belege: `../kitchen-audit-2026-10-19/evidence.json` vom Repository aus, Bilder unter dem übergeordneten `outputs/Zunftkueche_Pruefung_UI_KI_19-10-2026/`. Geprüft wurden die veröffentlichte App und eine responsive Browseransicht; physische Telefone, Kamera und Bildschirmtastatur bleiben spätere Abnahme.

Task 0 klärt die technischen Kandidaten früh. Task 1 liefert unmittelbar bessere mobile Bedienung und kann unabhängig vom vollständigen Abschluss des Datei-/OCR-Probes bearbeitet werden. Offene Verbindungen oder echte Gerätetests aus Task 0 dürfen die belegten mobilen Korrekturen und den Schutz offener Entwürfe nicht verzögern. Tasks 2-4 vervollständigen den Fachablauf. Task 5 liefert einen nutzbaren manuellen Dokumenteingang auch ohne OCR. Task 6 ergänzt Erkennung nur bei positivem Machbarkeitsnachweis. Task 7 nimmt die Gesamtlösung ab. Keine Entwicklungsstufe setzt einen bezahlten KI-Dienst voraus.

## Task 0: Microsoft Dateizugriff und lokale Erkennung nachweisen

**Files:**
- Create: `docs/acceptance/2026-10-19-document-capabilities.json` (tatsächliche Ergebnisse nach Go)
- Temporary probes: `.superpowers/probes/document-intake/` (unveröffentlicht, keine Echtbelege ohne geklärten Zielort)
- Inspect: `power.config.json`, `src/generated/`, vorhandene Microsoft-Verbindungen und genehmigter Teamordner

**Interfaces:**
- Consumes: veröffentlichte App, bestehender Mandant/Benutzerkreis und freigegebener Küchenordner.
- Produces: dokumentierter `DocumentCapabilities`-Befund `{ photoUpload:boolean, pdfUpload:boolean, originalRoundtrip:boolean, localPdfText:boolean, localOcr:boolean, testedDevices:string[], verifiedUploadLimitBytes:number|null, aiCredits:'unverified'|'verified'|'unavailable', limitations:string[] }`. Ein `false` oder `null` ist ein tatsächlicher Befund, keine versteckte Ersatzannahme.

- [ ] Bezahlte Anbieter, Trials und automatische AI-Builder-Aktivierung ausgeschaltet lassen. Kontingent und Vertragsende nur lesend mit geeignetem vorhandenen Adminkonto prüfen; fehlende Leserechte als unbestätigt dokumentieren, keine Rechte zur Prüfung ausweiten.
- [ ] Die tatsächliche Zunftvorstand-Website/Bibliothek und den Küchenordner bestätigen. Standard- und private Kanäle unterscheiden; keine Dateiverschiebung und keine neue öffentliche Freigabe.
- [ ] Mit einem ausdrücklich als Test erkennbaren, inhaltsarmen JPEG und PDF den dokumentierten SharePoint-Online-Action-Weg über generierte Dienste prüfen. Upload und Rückdownload hinsichtlich Bytes, SHA-256, Typ und Größe vergleichen; Wiederholung darf keine zweite Datei erzeugen. Tests in klar abgegrenzter Testablage, nicht mit einer alten lokalen Originalrechnung.
- [ ] Technische Probe für PDF-Textauslese und OCR-Worker/WASM zunächst lokal durchführen, anschließend in einer klar getrennten Testversion im echten Microsoft-Host nachweisen. Die Testversion wird nicht als Produktivstand veröffentlicht; vorhandene Test-/Bereitstellungsrechte und Kostenrahmen vorher bestätigen. Testbeleg synthetisch; keine externen KI-Aufrufe. Modell-/Worker-Dateien kontrolliert ausliefern, keine privaten Dokumentinhalte an CDN oder Telemetrie senden.
- [ ] Leistung und Abbruchmöglichkeit im mobilen Browser messen; auf mindestens dem tatsächlichen Handy des Nutzers prüfen. Keine CSP-/Sicherheitsabschwächung zur Erzwingung der OCR.
- [ ] Ergebnis gegenprüfen. Ist ein Kandidat blockiert, manuellen Eingang beibehalten und genau diese Grenze dokumentieren. Kein Wechsel auf bezahlte Cloud-OCR ohne gesonderte Freigabe.

**Verification:** Original-Rundlauf und Limits tatsächlich nachweisen. Reine SDK-Typen, allgemeine Connector-Dokumentation oder ein erfolgreicher Upload-Request beweisen keine lesbare Originaldatei. Testartefakte erhalten; keine automatische Bereinigung fremder Dateien.

## Task 1: Mobile Arbeitsansichten und Schutz offener Eingaben

**Files:**
- Create: `src/components/MobileItemCard.tsx`, `src/components/DiscardChangesDialog.tsx`, `src/hooks/useDraftGuard.ts`
- Modify: `src/App.tsx`, `src/components/shared.tsx`, `src/screens/Home.tsx`, `Planning.tsx`, `Orders.tsx`, `Deliveries.tsx`, `Receipts.tsx`, `Analysis.tsx`, `Masters.tsx`, `src/styles.css`
- Test: `tests/mobile-layout.test.mjs`, `tests/draft-guard.test.mjs`, sichtbare Host-Abnahme

**Interfaces:**
- Produces: `MobileItemCard({title,subtitle,children,actions})` für die gleiche Fachinformation wie am Desktop; eine einzige Berechnungsgrundlage, keine getrennten mobilen Daten.
- Produces: `useDraftGuard({dirty,onDiscard})` mit `requestClose()` und `confirmDiscard()`; öffnet bei `dirty` zuerst einen verständlichen Verwerfungsdialog. Bestehender `Modal` bekommt die erforderliche Übergabe für Schließen/Escape; Speicherfehler leeren den Entwurf nicht.
- Preserves: vorhandene Repository- und Fachoperationsschnittstellen; dieses Paket führt noch kein neues Datenschema ein.

- [ ] Reproduktionsfälle für 390 x 844 festhalten: Samstagsfeld verliert Speisenname, Bestellmenge rechts abgeschnitten, Fußleiste verdeckt Liste. Akzeptanz fordert Name+Tag+Menge+Einheit ohne horizontales Suchen und eine nach der letzten Zeile frei erreichbare Aktion.
- [ ] Neue mobile Speisen-/Artikelzeilen umsetzen; Desktopvergleich und Lieferant-vor-Liefertag beibehalten. Eine beschriftete mobile Navigation und kompakte Kontextzeile ergänzen. Seltener genutzte Aktionen ins Menü verlegen.
- [ ] Auf der Übersicht die nächsten nötigen Schritte vor die lange Lieferantenliste setzen. Warnlisten zusammenfassen, konkrete nächste Aktion verlinken. Vorhandene Farben/Typografie vereinheitlichen, keine neue vollständige Marke oder austauschbare Dashboard-Dekoration.
- [ ] Nur eine kleine feste Hauptaktionsleiste verwenden; sichtbare Mengenfelder auch mit Bildschirmtastatur nachweisen. Scrollposition beim Wechsel eines Hauptbereichs sinnvoll zurücksetzen.
- [ ] Den beobachteten Belegfall als Test festhalten: Text eingeben, Escape/Schließen, Verwerfen bestätigen oder weiterarbeiten. Dasselbe Verhalten bei Rezept-/Stammdatenformularen anwenden; leere oder unveränderte Dialoge schließen ohne unnötige Rückfrage.
- [ ] Schnelle Mengenfeldwechsel und ausstehende Speicherungen mit dem bestehenden SaveController prüfen; Eingaben bei Fehler/Konflikt erhalten, keine erfolgreiche Speicherung vor Bestätigung anzeigen. Falls eine Eingabewarteschlange benötigt wird, sie separat mit unveränderlichen Operationen testen; kein automatisches Rebase/Überschreiben.
- [ ] `npm test` und `npm run build` ausführen; Desktop/Mobil/Fokus/Escape im Microsoft-Host prüfen. Unabhängigen Screenshot-/Code-Review durchführen, dann dieses Paket committen.

## Task 2: Persönlicher Kontext und echte Küchen-Einstellungen

**Files:**
- Create: `src/screens/Settings.tsx`, `src/data/preferences.ts`, `src/domain/event-context.ts`
- Modify: `src/App.tsx`, `src/domain/state.ts`, `src/ui/facts.ts`, `src/data/repository.ts`, `microsoft-repository.ts`, `server/Policy/Protocol.cs`, `StatePolicy.cs`, `server/Plugins.cs`, zugehörige Metadaten und generierte Dienste
- Test: `tests/event-context.test.mjs`, `tests/preferences.test.mjs`, `tests/settings.test.mjs`, `server/Tests/EventContextTests.cs`, `SettingsTests.cs`

**Interfaces:**
- Produces: `UserPreferences { startScreen, selectedEventId, displayDensity, lastSupplierId, lastLocation }`, getrennt je bestätigter Benutzeridentität und Umgebung. Präferenzspeicherung verändert keine Arbeitsdaten.
- Produces: `projectEvent(state,eventId):KitchenState` und `applyEventOperation(state,eventId,operation):CommitResult`, mit erhaltener globaler Revision, vorhandenen Archiven und explizit geprüftem Zielereignis.
- Extends: versionierter Load-/Commit-Vertrag um Zielveranstaltung und serverabgeleitete Fähigkeiten `canEdit`, `canConfigure`, `canClose`. Der konkrete Protokollwechsel erhält einen eigenen Migrations-/Bereitstellungsnachweis; bestehende v1-Pending-Bytes bleiben unverändert wiedererkennbar oder werden ausdrücklich zur Klärung gesperrt.

- [ ] Tests für zwei Bearbeiter mit verschiedenen Veranstaltungsauswahlen schreiben; Auswahl erzeugt keine Fachmutation. Lesen/Bearbeiten alter Veranstaltungen verändert nicht die Auswahl des zweiten Nutzers und keine anderen Veranstaltungswerte.
- [ ] Persönliche Präferenzen mit sicheren Standardwerten und einer Kontowechselprüfung umsetzen. Keine privaten Beleginhalte in Präferenzen oder öffentlichen Build-Dateien speichern.
- [ ] Einstellungen mit drei klaren Bereichen ergänzen: Persönlich, Veranstaltung, Verwaltung. Alle tatsächlich verwendeten Liefertage erhalten Daten; Orte werden mit bestätigter historischer Zuordnung geführt. Lieferadresse und Ansprechpartner kommen auf zukünftige Bestellfassungen.
- [ ] Konfigurations- und Abschlussbefugnisse serverseitig aus tatsächlichem Aufrufer/Rechten ableiten. Bestehende `canWrite`-Grenze nicht als ausreichende Adminprüfung ausgeben. Unberechtigter direkter Konfigurations-/Abschlussaufruf muss scheitern; kein Bypass durch umbenannte Operationsmetadaten oder alternative `candidateState`-Felder.
- [ ] Schemawechsel und Original-/Archivvergleich testen. Alte offene Clients bekommen nötigenfalls einen erklärten Neuladehinweis; keiner darf stillschweigend in die falsche Veranstaltung schreiben.
- [ ] Aktuelle Speicherbelegung anzeigen. Grenztest bei 512 KiB beibehalten; keine Historie kürzen oder geschützte Quellen entfernen, um Änderungen durchzubekommen.
- [ ] Node-/Serverprüfungen, unabhängigen Review und echten Zwei-Benutzer-Ablauf abschließen, dann committen.

## Task 3: Bestellstatus und nachvollziehbare Korrekturen

**Files:**
- Create: `src/domain/corrections.ts`, `src/domain/order-status.ts`
- Modify: `src/domain/state.ts`, `workflow.ts`, `src/screens/Orders.tsx`, `Deliveries.tsx`, `Analysis.tsx`, `server/Policy/Protocol.cs`, `StatePolicy.cs`
- Test: `tests/corrections.test.mjs`, `tests/order-status.test.mjs`, `server/Tests/CorrectionTests.cs`, `OrderStatusTests.cs`

**Interfaces:**
- New commands: `movement.correct { movementId,replacementQuantity,reason }`, `sales.correctPrice { saleId,priceCents,reason }`, `invoice.correct { invoiceId,changes,reason }`, `order.mark { orderId,status:'bestellt'|'bestaetigt',note }`.
- Produces: referenzierte, vom Server mit Aufrufer/Zeitpunkt versehene Korrekturereignisse und unveränderliche Bestellstatus-Historie. Originale Mengen-/Preisbuchungen und Bestellinhalte bleiben erhalten.

- [ ] Test: 100 statt 10 geliefert, Berichtigung ergibt rechnerisch 10; Original100, Korrekturgrund und Person/Zeit bleiben erhalten. Wiederholung erzeugt keinen weiteren Effekt; normale negative Mengen bleiben unzulässig.
- [ ] Test: gespeicherter Verkaufspreis0,50 auf5,00 berichtigen; spätere allgemeine Stammpreisänderung ändert den bestätigten Verkauf weiterhin nicht.
- [ ] Für neue/manuelle Belege den ersten bestätigten Ausgangsstand ebenso schützen wie importierte Quellen. Korrekturen brauchen Vorher-/Nachherwerte, Grund, serverbestätigten Aufrufer und Zeitpunkt. Die bisherige `source == null`-Ausnahme der Beleg-Historienprüfung entfernen und migrieren, ohne einen historischen Ursprung zu erfinden. Tests: Änderung eines manuellen Belegs ohne `source`, Entfernung/Wechsel von `source`, Verkürzung früherer Korrekturen und direkter `candidateState`-Bypass werden korrekt geprüft beziehungsweise abgewiesen.
- [ ] Vorhandene Bestellfassung manuell als bestellt und bestätigt markieren; falsche Reihenfolge und unbekannte Fassung abweisen. Kein Nachrichtendienst wird dabei aufgerufen. Veränderte lebende Planung gegenüber bestellter Fassung sichtbar machen.
- [ ] Schema und serverseitige Invarianten passend erweitern; wirtschaftliche Wirkung, Historie und Wiederholungsschutz gemeinsam prüfen. Nicht nur eine neue UI-Schaltfläche mit unverändertem Server einbauen.
- [ ] Fachreview, Node-/Serverprüfungen und sichtbare Korrektur-/Statusabläufe mit klar markierten Testdaten abschließen, dann committen.

## Task 4: Wareneingangslisten, Getränke und Abschluss

**Files:**
- Create: `src/domain/receiving.ts`, `src/domain/event-close.ts`, `src/data/exports.ts`, `src/data/backup.ts`, `tools/backup-restore/`
- Modify: `src/screens/Deliveries.tsx`, `Planning.tsx`, `Analysis.tsx`, `Orders.tsx`, `src/domain/state.ts`, `workflow.ts`, `kitchen.ts`, Server-Invarianten
- Test: `tests/receiving.test.mjs`, `tests/event-close.test.mjs`, `tests/exports.test.mjs`, `tests/backup-restore.test.mjs`, passende Server-Paritätstests

**Interfaces:**
- Produces: `buildReceivingList(state,orderId)` mit Sollmenge, bestätigter Istmenge, Rest und Abweichung je Position; Aufnahme nur über ausdrücklichen Fachauftrag.
- New commands: `delivery.accept { orderId,day,location,lines,note }`, `event.close { eventId,revision,confirmedScope,note }`, `event.reopen { eventId,reason }`, `lesson.add { eventId,text }`.
- Produces: `buildEventExport(state,scope)` mit Veranstaltung, ausgewähltem Umfang, Revision, Erstellzeitpunkt, Quellverweisen und ausdrücklich offenen Werten.
- Produces separately: `KitchenBackup { formatVersion,environment,workspaceRevision,createdAt,state,settings,documents,drafts,operationReceipts,documentManifest }` als vollständiges strukturiertes Paket. Alle IDs, Beziehungen, bestätigten Ausgangswerte und Historien bleiben erhalten. Task 5/6 erweitern denselben versionierten Vertrag um tatsächliche Dokument-/Entwurfstabellen; keine nur dem Namen nach vollständige Sicherung.
- Produces: begrenzter, berechtigter Wiederherstellungsweg in eine separate Testumgebung, mit Schema-/Hash-/Relationsprüfung. Kein allgemeiner ungeschützter Import- oder Schreibschutz-Bypass in der Produktiv-App.

- [ ] Test:120bestellt/110geliefert zeigt10offen; ungeprüfte Sollmengen erzeugen keinen Lagerzugang. Ersatzartikel und zweite Teillieferung bleiben nachvollziehbar; Wiederholung erzeugt keinen doppelten Wareneingang.
- [ ] Einkaufsmenge über Freitag/Samstag/Zeitfenster verteilen, Gesamtsumme sichtbar halten und Überdeckung benennen. Vorhandene manuelle/importierte Mengen bleiben erhalten.
- [ ] Getränkesammelpositionen ausdrücklich als direkt/Varianten/weiter manuell unterscheiden. Test: eine Auswahl aus Bier/Radler/alkoholfrei wird nicht als Rezept aus drei gleichzeitigen Flaschen gerechnet. Ohne bestätigte Zuordnung bleibt die Aufteilung offen.
- [ ] Abschlusscheckliste statt dauerhaft festem Ergebnisstatus umsetzen. Komplettheit und vergleichbarer Kosten-/Umsatzumfang bestimmen die Anzeige; Bruttobelege werden nicht als Netto-Wareneinsatz ausgegeben. Öffnen/Schließen und Korrektur nach Abschluss benötigen tatsächliche Berechtigung und Grund.
- [ ] CSV und prüfbare Druck-/PDF-Ausgabe mit Scope/Revision/Datum testen; unveränderliche Bestellfassungen nutzen damalige Kontextdaten. Diese Auswertungsdateien ausdrücklich von der Vollsicherung unterscheiden.
- [ ] Vollsicherung mit Formatversion, Datenrevision, vollständiger Historie und Wiederholungsbelegen erstellen. Wiederherstellung ausschließlich in separater Testumgebung prüfen, Originalbestand erhalten. Konsistenzprüfung bei während der Sicherung geänderter Revision vorsehen; Leserrechte für Auswertung ergeben kein Recht auf Vollbackup.
- [ ] Fachreview, Node-/Serverprüfungen und praktische Liefer-/Abschlussabnahme abschließen, dann committen.

## Task 5: Manueller Foto- und PDF-Eingang in SharePoint

**Files:**
- Create: `src/data/documents.ts`, `src/data/sharepoint-documents.ts`, `src/screens/ReceiptIntake.tsx`, `src/components/DocumentPreview.tsx`, `server/Documents/` und Metadaten für Dokument-/Entwurfsdatensätze
- Modify: `src/screens/Receipts.tsx`, `src/screens/Settings.tsx`, generierte Connector-Dienste nach tatsächlicher Metadatenprüfung
- Test: `tests/document-intake.test.mjs`, `tests/document-recovery.test.mjs`, `server/Tests/DocumentTests.cs`

**Interfaces:**
- `DocumentRef { siteId,driveId,itemId,version,webUrl,sha256,mimeType,size,originalName }`.
- `DocumentRepository.upload({uploadId,eventId,file}):Promise<DocumentRef>`, `getOriginal(ref):Promise<Blob>`, `loadUpload(uploadId):Promise<UploadStatus>`.
- `UploadStatus = 'selected'|'uploading'|'uploaded-unlinked'|'linked'|'failed'` mit erhaltenem Wiederholungsbezug. `ExtractDraft` erhält die in der Spec genannten Herkunfts-, Versions- und Reviewfelder; Dokumente und Entwürfe liegen außerhalb des Küchenaggregats.

- [ ] Tests für einmaligen Upload, Timeout nach erfolgreichem Upload und Verknüpfungsfehler schreiben. Der nächste Versuch findet die vorhandene Datei; kein automatisches Löschen und kein stilles doppeltes Original.
- [ ] SharePoint-Online-Action-Dienste aus verifizierter Verbindung generieren; keine handgeschriebene Scheinimplementierung. Ziel-IDs aus der geprüften Konfiguration verwenden, tatsächliche Benutzerrechte respektieren. Erforderliche neue Zugriffsänderungen erst als konkrete, minimale Aktion vorlegen; die bisherige Rollen-Sonderkonfiguration nicht pauschal ausweiten.
- [ ] Kamera-/Dateiauswahl, mehrere geordnete Seiten, Vorschau, erneut aufnehmen, Fortschritt, Abbrechen und Wiederaufnahme ergänzen. Originale unverändert speichern; Arbeitsbilder getrennt halten. JPEG/PNG/PDF initial nachweisen; HEIC/andere Typen klar erkennen und einen unterstützten Aufnahme-/Konvertierungsweg anbieten, statt sie als leere Seite zu behandeln.
- [ ] Size-/Seitenlimits anhand Task0 und Gerätespeicher begrenzen und vor Upload/Analyse sichtbar machen. Das Limit aus einer zukünftigen Azure-F0-Option darf nie stillschweigend Seiten abschneiden.
- [ ] Kopfdaten/Positionen manuell im Prüfplatz erfassen können, auch wenn jede Erkennung deaktiviert ist. Dokument verknüpft und Original geprüft als getrennte Zustände führen.
- [ ] Foto-/PDF-Originalrundlauf, zwei berechtigte Konten, Leser ohne Dokumentrecht, widerrufenes Recht und Kontowechsel testen. Keine Hersteller- oder Adminverbindung als verdeckten Ersatz verwenden.
- [ ] Vollsicherung um Dokumentmetadaten, manuelle Entwürfe und versioniertes Dokumentmanifest erweitern. Originalbytes aufnehmen oder die Verfügbarkeit einer separat erhaltenen Originalsicherung anhand Hash/Version tatsächlich prüfen; bloße Links reichen nicht. Wiederherstellung von Beziehungen und Originaldateien in der Testumgebung nachweisen. Fehlende Datei ergibt klar unvollständige Sicherung.
- [ ] Review, Tests und echte Host-/Geräteabnahme abschließen, dann committen.

## Task 6: Kostenfreie Erkennung und bewusste Übernahme

**Files:**
- Create: `src/ocr/engine.ts`, `src/ocr/local-text.ts`, `src/ocr/local-image.ts`, `src/ocr/receipt-parser.ts`, `src/domain/receipt-draft.ts`, `src/screens/ReceiptReview.tsx`, `server/Intake/` als Helfer innerhalb des vorhandenen Commit-Pfads
- Modify: `ReceiptIntake.tsx`, `Receipts.tsx`, `Settings.tsx`, `server/Plugins.cs` (`KitchenCommitPlugin` und gezielter Guard), `server/Policy/Protocol.cs`, Domain-/Server-Invarianten und Paket-/Lockdateien nur nach Go
- Test: `tests/receipt-parser.test.mjs`, `tests/receipt-review.test.mjs`, `tests/receipt-idempotence.test.mjs`, `server/Tests/IntakeTests.cs`

**Interfaces:**
- `RecognitionEngine.extract({document,pages,signal}):Promise<ExtractionResult>` mit Text/Fundstellen/Anbieterversion; niemals ein Küchen-Commit.
- `parseReceipt(extraction,supplierCandidates):ReceiptDraft` liefert ausschließlich Vorschläge; fehlende/mehrdeutige Werte bleiben als solche markiert.
- New operation on existing `KitchenCommit`: `receipt.draft.accept { eventId,expectedWorkspaceRevision,draftId,draftRowVersion,documentVersion,reviewedFields,reviewDecisions,operationId }`; Workspace-Erwartungsrevision wird mit dem bestehenden `expectedRevision`-Vertrag gebunden. Der synchrone Commit-Handler aktualisiert Entwurf, Küchenbeleg und Wiederholungsbeleg in derselben Dataverse-Transaktion. Bereits übernommene identische Anfrage liefert dasselbe Resultat. Der Guard erlaubt nur die genau gebundene Entwurfsänderung aus diesem Kontext; kein zweiter Intake-Schreibweg.

- [ ] Task0 als Freigabekriterium für Browser-OCR abgleichen. Bei negativem Befund keine kostenpflichtige Ersatzimplementierung einbauen; manuellen Eingang fertigstellen und OCR-Grenze benennen.
- [ ] Digitale PDFs lokal textuell auslesen, Scan-Seiten kontrolliert rasterisieren und Bilder über einen abbrechbaren Worker verarbeiten. Kein kompletter Modell- oder Seitenstapel darf die Bedienung dauerhaft blockieren. Originale werden weder verändert noch an einen anderen Anbieter gesendet.
- [ ] Mit synthetischen Testfällen Lieferant, Datum, Nummer, Mengen/Einheiten, Beträge und Fundstellen als Vorschläge erzeugen. Deutsche Kommas, Tausendertrennung und echte Centwerte auf Parser-Ebene testen; die bestehenden strengen manuellen Eingaberegeln nicht durch blindes Ersetzen aufweichen.
- [ ] Falltabelle testen: Gewichtsware, Gebinde, Pfand, Rabatt, Gutschrift, Steuergruppen, mehrseitige Rechnung, blasser/verdrehter Bon, nur erste Seite erkannt, unbekanntes Layout und im Dokument enthaltene Handlungsanweisung. Letztere ist nur Dateninhalt und löst keine App-Aktion aus. Mehrdeutiges Netto/Brutto bleibt offen; keine fehlenden Werte erfinden.
- [ ] Original/Felder/Fundstellen und Artikelzuordnung nebeneinander beziehungsweise mobil umschaltbar darstellen. Belegannahme, Preisvorschlag und Wareneingang bleiben getrennte bewusste Entscheidungen.
- [ ] Exakten Datei-Hash, Geschäftsdublette über Lieferant/Nummer/Datum/Betrag und wiederholte Anfrage getrennt prüfen. Zwei Tabs akzeptieren denselben Entwurf nur einmal. Geänderte Dokumentversion oder Entwurfsversion verhindert die Übernahme eines veralteten Vorschlags. Keine geschützten alten Belegwerte überschreiben.
- [ ] Erwartete Workspace-Revision, Zielveranstaltung, Entwurfs-RowVersion und Dokumentversion im vorhandenen synchronen Commit prüfen. Tests für direkten Intake-/Tabellenschreibversuch, ungültigen Parent-Kontext, unerlaubte Ziel-ID und Teilfehler zwischen Entwurfs-/Workspace-/Wiederholungsbelegänderung verlangen vollständigen Rollback. Wiederholter Request mit identischem unveränderlichem Inhalt liefert den bereits gespeicherten Beleg; anderslautender Inhalt zur selben Operations-ID wird abgewiesen.
- [ ] Neu bestätigte Erkennungsbelege erhalten denselben unveränderlichen Ausgangsstand und ergänzenden Korrekturverlauf wie manuelle Belege aus Task 3, unabhängig von `source`. Mit Draft-/Review-/Providerherkunft und Wiederholungsbelegen das vollständige Sicherungsformat erweitern; Wiederherstellung nach diesem Ausbau erneut testen.
- [ ] Etwa30ausdrücklich freigegebene repräsentative Belege lokal vergleichen: Kopf-/Zeilentreffer, Cent-/Einheitenfehler, fehlende/erfundene Werte, Korrekturzeit und Gesamtzeit gegen manuelle Erfassung. Ergebnisse je Dokument festhalten; keine vorab versprochene Prozentzahl. Nur freigegebene Dokumente/Anbieter nutzen.
- [ ] Einstellungen zeigen Erkennungsmodus und echte Verfügbarkeit. AI Builder, Copilot Studio und Azure bleiben ausgeschaltet, solange Rechte, Preisfreiheit/Kontingent und sicherer Aufrufweg nicht ausdrücklich bestätigt sind. Keine Schlüssel im Frontend, kein automatischer Fallback auf PAYG.
- [ ] Review, Tests und nachvollziehbare Belegfreigabe im Microsoft-Host abschließen, dann committen.

## Task 7: Gesamtabnahme und Veröffentlichung

**Files:**
- Create/update: `docs/acceptance/`, `docs/deployment.md`, `docs/progress.md`, aktuelle Übergabe und datierter Paketnachweis
- No unrelated source changes; zusätzliche Fehlerbehebungen nur mit gezielten Reproduktionstests.

**Interfaces:**
- Consumes: abgezeichnete Einzelpakete, tatsächliche Microsoft-Verbindungen und ausdrücklich freigegebener Benutzerkreis.
- Produces: datierte Desktop-/Mobil-/Rollen-/Speicher-/Original-/Export-Nachweise und eine eindeutig zugeordnete veröffentlichte Version.

- [ ] Gesamte lokale Node- und Serverprüfungen sowie Produktionsbuild ausführen. Unabhängiger Gesamt-Fach-/Code-Review, sichtbare Desktop-/Mobilprüfung und offene Befunde zusammenführen.
- [ ] Den realen Testabend durchspielen: Freitag/Samstag planen, zwei Liefertermine bestellen,120/110annehmen, Fehlbuchung100/10berichtigen, fotografierten Beleg prüfen, Verkäufe erfassen, Schlussstand erzeugen und als Leser ansehen.
- [ ] Zwei Benutzer/Veranstaltungen, alte Browserstände, Netzabbruch, doppelte Freigabe, entzogenes SharePoint-Recht, fehlende OCR, Speichergrenze und fehlendes KI-Kontingent prüfen. Keine dieser Situationen darf eine falsche Erfolgsmeldung oder unerwartete Kosten auslösen.
- [ ] Vollsicherung einschließlich Dokument-/Erkennungsentwürfen, Historie, Originalen und Wiederholungsbelegen in getrennter Testumgebung wiederherstellen. Berichtsexport allein erfüllt diesen Test nicht. Verknüpfungen und Originalhashes vergleichen, anschließend einen alten Übernahmeauftrag wiederholen: kein weiterer Beleg.
- [ ] Tatsächliches iPhone/Android-Zielgerät und Rechner mit Kamera, virtueller Tastatur, Dateiauswahl und Export testen. Responsive Browserbilder allein nicht als Geräteabnahme ausgeben.
- [ ] Vor Schema-/Bereitstellungsänderungen aktuellen Bestand mit Revision/Prüfsumme sichern; Migration auf einer Kopie vergleichen. Unter abgestimmter Schreibpause den finalen Stand übernehmen und unmittelbar vor Aktivierung die Quellrevision erneut prüfen. Eine Änderung der Quelle erzwingt erneute Übernahme.
- [ ] Erst nach Nutzer-Go und erfolgreicher Abnahme veröffentlichen. Keine andere App, Gruppe, Dateiablage oder Lizenz ändern. Bei Rückwechsel neue Änderungen zuerst sichern/abgleichen; ein alter App-Link ist kein Datenrollback.
- [ ] Verständliche Übergabe mit Benutzerrechten, Dateiziel, Erkennungsgrenzen, Export/Wiederherstellung und offenen Punkten liefern. Screenshots und Datum der tatsächlich veröffentlichten Version nennen.

## Umfang des erbetenen Go

Das Go gilt für die oben beschriebene Entwicklung mit Agenten-Gegenprüfungen und die kostenfreie Microsoft-Grundlage. Es ist kein Auftrag zum Kauf von Copilot-/AI-Builder-/Azure-Kapazität, zum Anlegen eines neuen Hostingvertrags oder zum automatischen Teilen von Belegen. Benötigt ein konkreter Microsoft-Schritt eine zusätzliche sicherheitsrelevante Berechtigung oder neue Vertragsannahme, wird der fertige, minimale Schritt gesondert vorgelegt. Reine Entwicklung, Tests und bereits gedeckte Routinearbeiten erhalten keine zusätzlichen abstrakten Freigabeschleifen.
