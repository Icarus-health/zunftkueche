# Aktueller Projektstand

Stand: 20. Oktober 2026. Repository: `Icarus-health/zunftkueche`. Entwicklungszweig: `feat/microsoft-release-pipeline`, Ausgangspunkt `a618100ed55b25492394bb7314737dbbfeb45b5e`.

## Auftrag

Zuerst einen echten Release der bestehenden Microsoft-App nachweisen, anschließend genau diesen Weg als GitHub-Pipeline automatisieren. Keine zusätzlichen laufenden Kosten. Die Umsetzung ist freigegeben; neue materielle Rechte/Zugangsmittel sind noch nicht eingerichtet.

## Was bereits vorhanden ist

- React/TypeScript-Oberfläche und Fachlogik für Planung, Rezepturen/Kalkulation, Bestellungen, Lieferungen/Lager, Belege, Auswertung und Einstellungen. Neuer Quellstand noch nicht live veröffentlicht.
- Bestehende Microsoft Code App, Dataverse-Kernbestand, SharePoint-Vereinsordner und zwei bereits freigegebene Konten. Teams-Einbettung optional.
- Private GitHub-Ablage mit Versionsgeschichte; Ist/Soll und Entwicklungsplan eingecheckt. Noch keine aktivierte Deployment-Pipeline.

## Aktuelle Arbeit und echte Nachweise

| Punkt | Zustand / Nachweis | Nächster Schritt |
| --- | --- | --- |
| Anmeldung | 20.10.2026 reguläre Vorstand-Anmeldung erfolgreich: geprüfter Reader erreichte native Dataverse-Abfragen. Damit ist der jüngste Abbruch kein Anmeldefehler. | Keine erneute Anmeldung ohne korrigierten konkreten Befund. |
| Bestand | Lesender Lauf erfasste Rohzustand, Operationen, Metadaten und Paket. Kernrevision 3, drei unveränderliche Vorgangsbelege. Zustand und Paket stimmen mit dem früher erhaltenen Stand überein. | Nur private Rohdaten lokal; vollständige Capture-Abnahme noch offen. |
| Neue Speicher | Frische native Metadatenabfragen klassifizieren Dokument- und Entwurfstabelle als nicht installiert. Der erweiterte Gesamtlauf brach danach ab. | Abwesenheit im fertig gegengeprüften Inventarlauf bestätigen. |
| Konkreter Abbruch | HTTP 400 / Dataverse `0x80041102` beim neuen Schrittinventar `sdkmessageprocessingsteps` mit Filter über `sdkmessagefilterid/primaryobjecttypecode`. Authentifizierung und Kernlesung waren bereits erfolgt. | Quelle und bereinigte Fehlerantwort vergleichen; kleinstmögliche Query-Korrektur, Test und unabhängige Prüfung. |
| Kernrelease | Protokoll-2-Code vorhanden; koordinierte Veröffentlichung und Funktions-/Sicherungsgrenze noch umzusetzen. | Nach fertiger Bestandslesung Paket A freigabefähig machen; neue Belegfunktionen zunächst serverseitig aus. |
| Pipeline | Als Aufgabe 7 ergänzt; beginnt nach erstem echten Microsoft-Release. | Gepinnte CLI und nicht interaktiven Zugang prüfen; Rechte/Kosten vor Aktivierung konkret benennen. |

Die reguläre Anmeldung dieses Laufs erfolgte mit Nutzerhandgriff im integrierten Browser. Es wurden keine Küchendaten, Rollen, Tabellen, Pakete oder Lizenzen verändert. Die 183 privat erhaltenen Dateien sind ein **unvollständiger** Inventarlauf, keine vollständige Sicherung und keine Veröffentlichung.

## Arbeitsübergabe

- Einstieg: `AGENTS.md`; verbindlicher Plan unter `docs/superpowers/plans/2026-10-20-github-microsoft.md`.
- Aktueller technischer Fokus: den nachgewiesenen Inventar-Queryfehler beheben, nicht nochmals die Anmeldung umbauen.
- Danach: serverbestätigte Kernfreigabe samt Kernbackup/Releaseprüfung, kompatiblen Server/Client in derselben App veröffentlichen und echtes Speichern/Neuladen nachweisen.
- Private Liveantworten/Sicherungen befinden sich bewusst nicht im Repository. Ohne diese Evidenz darf ein anderer Agent keine Vollständigkeit, installierten Rechte oder erfolgreiche Veröffentlichung behaupten. Benötigte Livefakten über regulären freigegebenen Zugang neu lesen.
- Tatsächliches iPhone, native Transaktionsrücknahme, vollständige Originalsicherung und Microsoft-Wiederherstellung sind noch nicht abgenommen. Cloud-KI/OCR bleibt aus.

## Änderungs-/Prüfprotokoll

- `a618100`: Ist/Soll und sechs Aufgaben, unabhängig gegengeprüft; nur Dokumentation.
- 20.10.2026: Umsetzung/Pipeline vom Nutzer freigegeben. Diagnosekandidat lokal unabhängig gegen 52 Quellen, sieben Builddateien, 186 Hostdateien und 89 Clientdateien geprüft; rein lesender Microsoft-Test zeigte oben genannten tatsächlichen Queryfehler. Kein Schreib-/Deployversuch.
