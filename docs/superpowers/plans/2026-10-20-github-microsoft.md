# Zunftküche GitHub–Microsoft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aus dem bestehenden Code zwei nachweislich nutzbare Microsoft-Lieferungen machen: zuerst den Küchen-Kern, danach Originalbelege und Prüfplatz.

**Architecture:** GitHub verwaltet Quellcode und geprüfte Änderungen; die vorhandene Power Apps Code App hostet dieselbe React-Oberfläche. Dataverse bleibt für Fachzahlen und Historie zuständig, der bestehende SharePoint-Vereinsordner für Originaldateien. Lokale synthetische Entwicklung und frühzeitige Microsoft-Abnahme teilen dieselben Fachverträge.

**Tech Stack:** Vorhandenes React/TypeScript/Vite mit npm-Lockfile; lokale Baseline Node 22.22.3; bestehendes .NET-SDK 8.0.426 für Tests/Build, Dataverse-Plugin weiterhin net462; vorhandenes Power Apps SDK/CLI und SharePoint-Connector. Keine Framework- oder Anbieterumstellung im Plan.

**Spec:** [Ist- und Sollzustand](../specs/2026-10-20-github-microsoft-design.md). Referenz-Commit `a0855d74eced69f2c412d77649bba2dc7710d226`; Quelleninventur am 20.10.2026, keine neue Live-Abnahme.

## Global Constraints

- Entwicklung und Versionsgeschichte liegen in GitHub; Microsoft bleibt das Betriebsziel.
- Keine zusätzlichen laufenden Kosten, bezahlten Dienste, Trials oder automatische kostenpflichtige Ausweichwege.
- Bestehende Microsoft-Konten, Umgebung, App und Daten bleiben erhalten.
- Teams ist ein optionaler Einstieg über einen Link. Eine Kanal-Einbettung oder ein eigenes Teams-Paket ist kein Lieferziel.
- Private Importe, Originalbelege, Zugangsdaten und Sicherungen bleiben außerhalb des GitHub-Repositorys.
- Fehlende Werte bleiben offen; Originale, frühere Bestellfassungen und Korrekturhistorien bleiben erhalten.
- Onlinebetrieb reicht für die erste nutzbare Version. Offline-Synchronisation ist kein Abnahmekriterium.

## Review Focus

1. Frischer Klon ohne private Importdatei und ohne externen SDK-Pfad: Entwicklung und Prüfungen müssen reproduzierbar sein → Aufgabe 1.
2. Neuer Client mit altem Server, unbekannter Funktionsfreigabe oder altem offenen Speicherauftrag: sperren und erklären; keine Fallbackbuchung → Aufgabe 2.
3. Schneller Feldwechsel, verlorene Speicherbestätigung, zwei Benutzer und historischer Bestellkontext: keine stillen Verluste oder Doppelbuchungen → Aufgaben 2/3.
4. Wechselndes Dateirecht, bereits hochgeladene Datei oder fehlende Originalversion: Zustand sichtbar erhalten, keine öffentliche Ersatzfreigabe → Aufgaben 4/5.
5. Teilfehler bei Übernahme, unvollständige Sicherung und Testbeleg in echter Auswertung: keine Teilbuchung und kein falsches vollständiges Ergebnis → Aufgaben 5/6.

## Lieferfolge und Grenzen

| Meilenstein | Aufgaben | Ergebnis und Stoppunkt |
| --- | --- | --- |
| M0: entwickelbar | 1 | Jeder berechtigte Entwickler kann den Klon ohne Vereinsdaten starten und prüfen. |
| M1: Microsoft-Kernpilot | 2 | Früher echter Laden/Speichern/Neuladen-Nachweis. Bei ungelöstem Microsoft-Block keine zusätzlichen Komfortfunktionen entwickeln. |
| M2: nutzbarer Küchen-Kern | 3 | Paket A mit vollständigem Arbeitsabend auf Rechner und iPhone. |
| M3: Belegworkflow | 4, 5 | Paket B mit Originalablage und bewusstem Prüfabschluss. |
| M4: Betriebsfreigabe | 6 | Abnahme, Sicherungs-/Wiederherstellungsnachweise und verständliche Übergabe; offene Grenzen bleiben ausdrücklich benannt. |

Aufgaben sind überprüfbare Lieferungen, keine Zusage fester Stunden. Der Aufwand für Microsoft-Veröffentlichung und Wiederherstellung wird nach M1 neu eingeschätzt. GitHub-Prüfungen laufen innerhalb vorhandener kostenfreier Kontingente; keine bezahlten Runner, Codespaces, Add-ons oder automatische Mehrkosten. Ist das Kontingent erschöpft, werden Prüfungen lokal ausgeführt.

## Datei- und Zuständigkeitskarte

| Bereich | Bestehende Grenze / geplante Dateien |
| --- | --- |
| Lokaler Start und Fixtures | `dev/local-api.ts`, `tests/fixtures/`, neu `dev/seed.ts` und `tests/fixtures/demo-seed.ts` |
| Build/CI | `package.json`, `package-lock.json`, `server/build.sh`, neu `.node-version`, `.github/workflows/checks.yml` |
| Host und Freigaben | `src/bootstrap/`, `src/data/repository.ts`, `src/data/microsoft-repository.ts`, `server/Policy/Protocol.cs`, `server/Plugins.cs` |
| Fachabläufe/Bedienung | `src/screens/`, `src/components/`, `src/domain/`, `src/ui/`, `src/styles.css` |
| Originale und Prüfplatz | `src/data/documents.ts`, `src/data/document-runtime.ts`, `src/data/sharepoint-documents.ts`, `server/Documents/`, `server/Intake/` |
| Auswertung/Sicherung | `src/data/exports.ts`, `src/data/backup.ts`, `tools/backup-restore/`, `server/DataverseBackup.cs` |
| Release/Status | Vorhandenes `server/Release/` gezielt wiederverwenden; neu `docs/project-status.md`, `docs/release-runbook.md`, `docs/acceptance-checklist.md` |

## Aufgabe 1: Reproduzierbarer Klon und schlanke GitHub-Prüfung

**Abhängigkeit:** keine. **Abnahme:** A1, technische Grundlage A10.

**Dateien:** `dev/local-api.ts`, neu `dev/seed.ts`, `tests/fixtures/demo-seed.ts`, `tests/development-seed.test.mjs`, `.node-version`, `.github/workflows/checks.yml`; betroffene seedabhängige Tests, `server/build.sh`, `package.json`, `README.md`.

**Schnittstellen:** `readDevelopmentSeed(root: string): KitchenState` in `dev/seed.ts`; `demoSeed(): KitchenState` in `tests/fixtures/demo-seed.ts`. `KITCHEN_SEED_FILE` ist eine ausschließlich lokale, explizite Wahl. Ohne Auswahl wird synthetisch gestartet; vorhandene `.local-state` wird niemals überschrieben. Produktbuild enthält weder Seeddatei noch lokalen Dateileser. `KITCHEN_DOTNET` bleibt ein optionaler Compilerpfad; ohne Wert wird das reguläre `dotnet` verwendet. Der .NET-Prüfeinstieg erhält die synthetische Fixture über seinen bestehenden Seeddatei-Parameter.

- [ ] Regressionstests zuerst: leerer temporärer Klon → synthetischer Start; vorhandene private Datei ohne ausdrückliche Auswahl wird nicht benutzt; vorhandener Arbeitsstand bleibt bytegleich; ungültig ausgewählte Datei erzeugt erklärten Fehler.
- [ ] Demodaten aus vorhandenen synthetischen Fixtures ableiten: zwei Lieferanten, Freitag/Samstag, die geplanten Speisenarten sowie markierte offene/volle Werte. Keine echten Rechnungsnummern oder persönlichen Vereinsdaten kopieren. Tests mit wirtschaftlichen Assertions erhalten benannte synthetische Fälle statt geänderter Sollzahlen ohne Begründung.
- [ ] Alle `import/2026.json`-Abhängigkeiten in Node-/C#-Tests und Korpusgeneratoren auf diese Testgrenze umstellen; die private Importfunktion als separaten lokalen Weg erhalten.
- [ ] Portablen Build mit gepinnter SDK-Version und bestehenden Lockfiles herstellen. CI: Node-Tests und Microsoft-Produktbuild, separater .NET-Policy-/Pluginbuild; nur Lesezugriff, keine Microsoft-Zugangsdaten, keine Veröffentlichung, begrenzte Laufzeit. Das Projekt-Lockfile bleibt maßgeblich.
- [ ] In einer temporären sauberen Arbeitskopie ohne `import/`, `.local-state`, lokale Caches und Nachbarverzeichnisse prüfen: `npm ci`, `npm test`, `npm run build -- --mode microsoft`, `npm run build:server`. Erwartung: alle erfolgreich; privates Original und bisherige `.local-state` vor/nachher bytegleich. Einmaliger kompletter Ausgangslauf; danach nur betroffene Prüfungen wiederholen.
- [ ] Kleine Änderung mit Startanleitung und reproduzierbaren Ergebnissen prüfen lassen, committen und über PR nach `main` übernehmen. Github-Checks erst nach tatsächlichem erfolgreichen Lauf als grün dokumentieren.

## Aufgabe 2: Früher Microsoft-Nachweis und getrennte Kernfreigabe

**Abhängigkeit:** 1. **Abnahme:** A2, A4, Kernteil A9/A10. Dies ist der entscheidende Integrationsmeilenstein.

**Dateien:** `src/data/repository.ts`, `src/data/microsoft-repository.ts`, `src/bootstrap/microsoft.ts`, `server/Policy/Protocol.cs`, `server/Policy/BackupProtocol.cs`, `server/Plugins.cs`, betroffene bestehende Releaseprüfungen in `server/Release/{ReleaseContract,ReleaseInventory}.cs`, `server/Release/Authentication.cs`/`Program.cs` nur bei nachgewiesenem Fehler; neue `tests/release-capabilities.test.mjs`, betroffene Bootstrap-/Microsoft-Tests, `server/Tests/BackupTests.cs` und betroffene C#-Policy-/Releaseprüfungen; `docs/protocol-v2-migration.md`, neu `docs/release-runbook.md`, `docs/project-status.md`.

**Schnittstellen:** Protokoll-2-Loadantwort erweitert additiv um `features: { documents: boolean; receiptIntake: boolean }`; Repository exponiert dieselben bestätigten Freigaben. Fehlende/ungültige Freigabe ist jeweils `false`, niemals eine Umgehung von Identitäts- oder Protokollfehlern. Für Paket A sendet der Server beide Werte `false` und lehnt neue Dokumentaktionen einschließlich `receipt.draft.accept` vor jedem Datenspeicherzugriff ab. `documents` wird im Client dann nicht eingebunden; historische Belegreferenzen und normale manuelle Küchenbelege bleiben erhalten. Die Werte werden durch die tatsächlich bereitgestellte Serverfassung festgelegt, nicht durch Browserparameter. Dokument-/Entwurfsfreigabe folgt erst nach Aufgaben 4/5. Separat bindet ein unabhängig geprüfter Releaseumfang den Sicherungsvertrag: `kitchen-core-v1` mit `documents/drafts: not_in_contract` nur bei autoritativ nicht installierten neuen Tabellen und unverändertem reinem Kernbestand; installierter oder früher dokumenthaltiger Umfang behält `kitchen-documents-v1` mit beiden Quellen `required` und `manifestVersion: 1`, auch bei ausgeschalteter Oberfläche. Diese Auswahl folgt bestätigtem Installations-/Datenumfang, nicht einem fehlgeschlagenen Read, Browserflag oder bloßen `IKitchenDocumentStore`-Interface. Releaseverifikation und tatsächliche Serverantwort müssen denselben Umfang belegen.

- [ ] Vertragstests zuerst: altes Protokoll → Ablehnung ohne Mutation; falsche bestätigte Identität → Ablehnung; `features` fehlt → neue Dokumentfunktionen aus; Paket-A-Dokumentaufruf → Ablehnung vor Tabellen-/Entwurfszugriff; alter offener Request bleibt bytegleich und blockiert ungeklärtes Schreiben.
- [ ] Sicherungs-/Releasegrenze zuerst testen: bestätigter Core-Umfang ohne neue Tabellen → ownerberechtigter Kernbackup und passende Kernverifikation erfolgreich, ohne Dokumentabfrage; Tabellen unbekannt/unlesbar oder ein bestehender/früher dokumenthaltiger Umfang → kein Core-Fallback. Aktuelles `BackupProtocol.Load` fragt wegen des implementierten Dokumentinterfaces sonst beide Tabellen ab; `ReadServerBackup` fordert bisher immer Dokumentschema und Dokumentvertrag. Nur diese konkreten Abhängigkeiten passend zum geprüften Umfang ändern. Fehlende Quellen und referenzierte Originale bleiben unvollständig.
- [ ] Freigabegrenze in Server und Client implementieren und gezielt testen. Bereits vorhandene Rollen-/Versions-/Wiederholungsprüfungen bleiben die Schreibgrenze; eine UI-Ausblendung ersetzt sie nicht.
- [ ] Letzten Verwaltungs-Anmeldeabbruch mit bereits geprüften, bereinigten Diagnosestufen untersuchen. Maximal zwei unveränderte Versuche nach einer konkreten Hypothese; danach Befund und kleinste Alternative dokumentieren. Regulären Anmeldeschritt vom Nutzer übernehmen lassen, wenn Browsersteuerung ihn blockiert. Keine anderen Browser-/Callback-/Tokenwege als Umgehung, keine abgeschwächten Identitätsprüfungen.
- [ ] Runbook auf einen benannten Kernrelease reduzieren: tatsächlicher Bestand/Verträge feststellen, vorhandene Originale und Geschäftszustand sichern, Schreibpause, kompatibles Backend und danach Client in derselben bestehenden App aktivieren, nachlesen, Grenzen und Wiederanlauf dokumentieren. Bestehende Release-Prüfungen nur bei konkret belegter Redundanz vereinfachen; keine ungeschützten Direktwrites und kein neues allgemeines Deployment-Framework.
- [ ] Vor Veröffentlichung echten bestehenden Datenstand gegen neue Policy prüfen; unbekannte Felder bewahren und Konflikt lösen, nicht bereinigen. Version-1-Pendingrequests separat abstimmen. Ein Client-Rollback allein genügt nicht: kompatibles Client-/Serverpaar und Verhalten bereits geschriebener neuer Daten ausdrücklich festhalten.
- [ ] Mit den zwei bereits berechtigten Konten tatsächlich prüfen: laden, verschiedene Veranstaltung auswählen, einen abgesprochenen nicht finanziellen Wert ändern, speichern, neu laden und kontrollieren; konkurrierende Änderung und Konfigurationsablehnung prüfen. Testwert über normale Korrektur zurückführen, Prüfspur erhalten. Dokument-/Drafttabellen sind für diesen Nachweis keine Voraussetzung.
- [ ] `node --experimental-strip-types --test tests/release-capabilities.test.mjs tests/bootstrap*.test.mjs tests/microsoft*.test.mjs` und betroffene C#-Vertragsfälle erfolgreich; anschließend echte Hostbelege mit Commit, Version, Konto-Rolle und Ergebnis in `docs/project-status.md`. Kein Erfolgseintrag allein aufgrund von Build/CLI-Ausgabe.

## Aufgabe 3: Küchen-Kern fachlich und auf beiden Geräten abnehmen

**Abhängigkeit:** 2. **Abnahme:** A3–A5, A8; Paket A nutzbar.

**Dateien:** bestehende `src/screens/{Home,Planning,Orders,Deliveries,Receipts,Analysis,Settings}.tsx`, betroffene Komponenten/Styles und Fachmodule nur für tatsächlich gefundene Lücken; `tests/workflow-ui-integration.test.mjs`, `tests/order-context.test.mjs`, `tests/receiving.test.mjs`, `tests/settings.test.mjs`, neue `docs/acceptance-checklist.md`.

**Schnittstellen:** Vorhandene `Repository.load()/commit(op)`, `KitchenState`, `Operation` und `SaveController` weiterverwenden. Fachänderungen durch bestehende versionierte Operationen; kein zweiter direkter Speicherpfad aus einem Bildschirm.

- [ ] Ein gemeinsames Abnahmeszenario aus synthetischen Fixtures formulieren: Brötchen/Wurstsalat/Wurst mit Brot/Kartoffelsalat/Getränke, Portionen für zwei Abende, Rezepturbedarf, Lieferant und Liefertag, gespeichert/bestellt, 120 bestellt und 110 geliefert, Berichtigung 100 auf 10, manueller Beleg und Verkaufsstückzahlen.
- [ ] Gefundene Fachfehler mit einem gezielten Test reproduzieren und minimal beheben. Assertions: historischer Bestellkopf bleibt nach späterer Terminänderung unverändert; Lieferung/Bestellung bleiben getrennt; fehlender Verkauf oder Beleg führt zu offenem Teilwert; Berichtigung erhält Ausgangsbuchung.
- [ ] Dasselbe Szenario durch tatsächliche UI bedienen: Rechner mit Freitag/Samstag nebeneinander; 390 px und 320 px ohne abgeschnittene Hauptfelder; tatsächliches iPhone mit Tastatur. Ungespeicherte Eingaben, schneller Feldwechsel und verlorene Speicherbestätigung prüfen.
- [ ] Nur die bei diesem Durchlauf nachgewiesenen Bedienprobleme verbessern. Aktionshierarchie, Abstände, Status und Formulare konsistent halten; vorhandene Seiten nicht nochmals vollständig neu gestalten.
- [ ] Tatsächlichen CSV-Download öffnen und Veranstaltung, Umfang, Revision, Einheiten und Dezimalwerte kontrollieren. Druck/PDF separat kennzeichnen, solange native Ausgabe nicht geprüft ist.
- [ ] Betroffene Tests ausführen, Microsoft-Build prüfen und Änderungen unabhängig gegenlesen; im Host wiederholen, geänderte Wege abnehmen und Paket A als begrenzten Pilot freigeben. Tatsächliche Geräteprüfung kann eine kurze Mitwirkung Sörens erfordern; eine Viewportsimulation ersetzt sie nicht.

## Aufgabe 4: Gemeinsame Originalablage und manuelle Prüfentwürfe

**Abhängigkeit:** 2 und nutzbarer Kern 3. **Abnahme:** A6, manuelle Entwurfserfassung; noch keine Finanzübernahme.

**Dateien:** `src/data/{documents,document-runtime,sharepoint-documents}.ts`, `src/bootstrap/microsoft.ts`, `src/screens/{ReceiptIntake,ReceiptReview,Receipts}.tsx`, `server/Documents/{schema-proposal.json,DataverseDocuments.cs,DocumentProtocol.cs}`, vorhandenes `server/Release/`; betroffene Dokumenttests und `docs/release-runbook.md`.

**Schnittstellen:** Bestehende `DocumentRepository`-Methoden und der Protokoll-2-Dokumentvertrag aus `server/Documents/README.md`. Die erste Paket-B-Fassung sendet `features.documents=true`, `features.receiptIntake=false`. Neue Tabellen, Rollen und Schutzregistrierungen werden erst nach tatsächlicher Metadaten-/Zugriffsprüfung als installiert ausgewiesen.

- [ ] Vorhandenen Vereinsordner und beide Konten/Rechte bestätigen. Keine Freigaben verbreitern. Abweichend breite bestehende Gruppenrechte sichtbar benennen; eine Änderung wäre eine konkrete separate Entscheidung.
- [ ] Fehlende Tabellen/Beziehungen und Schutzwege anhand tatsächlicher Plattformmetadaten vervollständigen, vorhandene lokale Verträge nutzen und unabhängig prüfen. Kein Schema-Neubau auf Verdacht. Direkte/bulk Schreibwege, andere Arbeitsbereiche und nicht berechtigte Leser müssen tatsächlich abgegrenzt sein, bevor `documents=true` veröffentlicht wird.
- [ ] Regressionen zuerst: fehlendes Dateirecht → erklärte Ablehnung; Originalversion verändert → keine stillschweigende Wiederverwendung; verlorene Uploadbestätigung → Wiederaufnahme statt Zweitupload; neue Entwurfsfassung → nachvollziehbare Historie. Belegübernahme bleibt serverseitig gesperrt.
- [ ] Bestehende kleine synthetische Foto-/PDF-Fixtures im bestätigten Ziel testen: Upload, Neuladen, Download, Bytehash/Dateiidentität, Öffnen auf iPhone und Rechner. Originale/Drafts müssen für beide berechtigten Bearbeiter entsprechend dem Vertrag erreichbar sein. Eigene unverbuchte Testdateien regulär entfernen, Ausgangsordner kontrollieren; keine fremden Dateien löschen oder Papierkorb leeren.
- [ ] Unvollständige/verwaiste Zuordnung sichtbar halten; keinen erneuten Upload oder automatisches Löschen als Fehlerverdeckung. Fehlende historische Version als fehlend kennzeichnen, nicht durch gleichnamige aktuelle Bytes ersetzen.
- [ ] Betroffene `tests/document*.test.mjs` und `tests/sharepoint-documents.test.mjs` sowie betroffene C#-Dokument-/Guardtests prüfen; danach echte Host-/Rechtebelege dokumentieren. Paket B bleibt mit manuellen Angaben nutzbar, Bild/PDF/Cloud-Erkennung bleibt aus.

## Aufgabe 5: Bewusste Belegübernahme und begrenzte Eingabehilfe

**Abhängigkeit:** 4. **Abnahme:** A7; vollständiger manueller Paket-B-Ablauf.

**Dateien:** `src/screens/{ReceiptIntake,ReceiptReview}.tsx`, `src/ui/{receipt-acceptance,receipt-intake-draft}.ts`, `src/ocr/{engine,receipt-parser}.ts`, `server/Intake/ReceiptIntake.cs`, betroffene `server/Policy/Protocol.cs`/Dokumentguards; bestehende Receipt-/Pending-/Idempotenztests.

**Schnittstellen:** `receipt.draft.accept` bleibt eine normale Operation des bestehenden synchronen KitchenCommit. Genau derselbe Aufruf bindet Zielveranstaltung, Workspace-Revision, Draft-RowVersion, Dokumentversion und bewusste Prüfentscheidungen. Nach vollständigem Nachweis wird `features.receiptIntake=true`; kein separater Rechnungs-Schreibendpunkt.

- [ ] Die Testdatenentscheidung vor tatsächlicher erfolgreicher Finanzübernahme konkret treffen: echten, freigegebenen Beleg einmal gemeinsam übernehmen oder eine ausdrücklich vereinbarte, ausgeschlossene Testveranstaltung mit bleibender Prüfspur. Keine synthetische Rechnung stillschweigend in der echten Vereinsauswertung belassen; keine Auditlöschung versprechen.
- [ ] Abnahmetests zuerst: zwei Tabs übernehmen denselben Entwurf → genau ein Beleg; verlorene Antwort → identische Wiederholung liefert dasselbe Ergebnis; Fehler nach Draft-Update und vor Kernspeicherung → vollständige Dataverse-Rücknahme; geänderte Originalversion → erneute Prüfung statt Übernahme.
- [ ] Bestehenden Prüfplatz vervollständigen, sofern der echte Durchlauf Lücken zeigt. Rohangaben bewahren, Netto/Brutto/Pfand/offene Werte explizit; Lager und Stammpreise nur durch getrennte bewusste Vorgänge ändern.
- [ ] Eingegebener oder bewusst eingefügter Text darf Vorschläge mit Fundstelle liefern. Unsupported Formate bleiben manuell; keine automatische Buchung oder Cloudübermittlung. Bestehende Parserlücken wie `Gesamtbrutto` nur bei reproduzierbarem Fachbeispiel mit gezieltem Test verbessern. Originalprüfung bleibt nötig.
- [ ] Native Transaktions-/Berechtigungsnachweise, reale Dateiidentität und das tatsächliche iPhone prüfen. Erst danach `receiptIntake=true` aktivieren und genau eine kontrollierte Übernahme nachlesen. Fakes allein reichen nicht.
- [ ] Optionalen OCR-Ausbau als eigene spätere Aufgabe abgrenzen: tatsächlicher Browser-/Worker-/WASM-Test, Qualität und Wartezeit auf iPhone, vorhandenes Kostenrecht. Scheitert dieser Nachweis, bleibt die manuelle Lösung vollständig bedienbar; keine zusätzliche Dienstbuchung.

## Aufgabe 6: Sicherung, Abschluss und Übergabe

**Abhängigkeit:** 3 für Kernumfang, 4/5 zusätzlich für gesamten Belegumfang. **Abnahme:** A8–A10 und abschließende Freigabe.

**Dateien:** `src/data/{backup,exports}.ts`, `src/components/{BackupPanel,EventClosure}.tsx`, `server/DataverseBackup.cs`, `tools/backup-restore/`, `docs/{project-status,release-runbook,acceptance-checklist}.md`, `README.md`.

**Schnittstellen:** Vorhandene `buildRepositoryBackup`, `validateKitchenBackup` und `restoreLocalTest` verwenden. Kernvertrag und Dokumentvertrag bleiben getrennt; ein Dokumentbestand darf nicht zum Kernbackup heruntergestuft werden. Lokal geprüfte Wiederherstellung heißt ausdrücklich nicht Microsoft-Wiederherstellung.

- [ ] Fehlerszenarien zuerst prüfen: unlesbare Quelle ist unvollständig; fehlende Originalversion ist unvollständig; laufende Änderung während Sicherung führt zu Abbruch/erneutem Versuch unter kontrollierter Schreibpause; Belegbestand ohne Draft-/Wiederholungsbezug ist nicht vollständig.
- [ ] Für den tatsächlich installierten Umfang aktuelle Rohdaten, Revisionen, Historien und Originalbytes vollständig sichern; Vollständigkeit unabhängig prüfen und in einem neuen isolierten lokalen Ziel wiederherstellen. Historische Sicherungen bleiben erhalten. Keine Logs/Sicherungen/Originale ins Repository stellen.
- [ ] Für tatsächliche Microsoft-Wiederherstellung zuerst einen vorhandenen geeigneten, getrennten Zielort und Rechte/Kosten bestätigen. Existiert keiner, keinen neuen anlegen und keinen Produktivbestand überschreiben: Lücke sowie eingeschränkte Pilotfreigabe benennen; vollständige Betriebsfreigabe bleibt bis zur konkreten Entscheidung offen.
- [ ] Abschluss anhand Stückzahlen, offenen Zuordnungen, fehlenden Belegen und Beständen durchspielen. Säckelmeister-Rolle erst bei konkret benanntem Konto einrichten; serverseitig nur lesen, keine automatische Original-/Vollsicherungsfreigabe.
- [ ] Einmalige Gesamtprüfung des finalen Release-Commits: Fachablauf, Rollen, Wiederholung/Konflikt, CSV, Desktop und tatsächliches iPhone, Sicherung und Wiederherstellungsgrenze. Unabhängige Gesamtgegenprüfung einmal am Ende; danach nur betroffene Fehlerkorrekturen nachprüfen.
- [ ] Release mit Commit, Client-/Serververtrag, Prüfergebnissen, bekannten Grenzen und kurzer Bedienanleitung dokumentieren. Erst tatsächlich bestandene Kriterien als erledigt markieren. Nächster Abend und Übergabe an einen Nachfolger müssen ohne Kenntnis der Entwicklungswerkzeuge möglich sein.

## Arbeitsweise in GitHub

- `main` bleibt der gemeinsame, nachvollziehbare Ausgangspunkt. Pro Aufgabe ein kurzer Branch und eine prüfbare Änderung; vorhandene Historie nicht umschreiben.
- Pro Lieferung ein fachliches Abnahmeziel und unabhängiges Gegenlesen durch einen zweiten Agenten. Eine kleine Korrektur erhält einen gezielten Test; reine Dokumentations-/Layoutkleinigkeiten brauchen keine neue Testkampagne.
- Alle Tests gegen unbetroffene Bereiche nicht nach jedem Schritt wiederholen. Einmalige Baseline in Aufgabe 1, danach betroffene Prüfungen; Gesamtprüfung in Aufgabe 6.
- GitHub-Actions prüft und baut. Erste Microsoft-Veröffentlichungen erfolgen bewusst über den dokumentierten bestehenden Zugangsweg; ein Push auf `main` veröffentlicht nichts automatisch. Automatische Veröffentlichung ist ein späteres Wartungsthema.
- `docs/project-status.md` wird bei Umsetzung die einzige aktuelle Statusübersicht: Aufgabe, Commit, lokaler Nachweis, echter Hostnachweis, Gerät, offene Grenze, nächster Schritt. Historische Berichte bleiben datiert.
- In diesem Planungsauftrag werden die zwei Planungsdokumente gespeichert und nach GitHub übertragen. Die Aufgaben beginnen nach Nutzerprüfung des Plans; kein Produktcode, keine Microsoft-Konfiguration und keine Küchendaten werden jetzt geändert.
