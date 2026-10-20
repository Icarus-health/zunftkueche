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
| Konkreter Abbruch | HTTP 400 / Dataverse `0x80041102` beim neuen Schrittinventar `sdkmessageprocessingsteps` mit Filter über `sdkmessagefilterid/primaryobjecttypecode`. Authentifizierung und Kernlesung waren bereits erfolgt. | Gezielte Korrektur `b8bb4ab` liest das begrenzte SDK-Schrittinventar ohne Auflösung fehlender Tabellennamen. Zehn fokussierte Tests bestanden, unabhängige Gegenprüfung freigegeben. Noch kein erneuter nativer Lauf. |
| Kernrelease | Kernfreigabe und Sicherungsgrenze im Code umgesetzt (`f833e93`): Kern lädt ohne Dokument-/SharePoint-Zugriffe; neue Belegübernahme ist serverseitig aus. Validierung trennt erhaltene Vorgangssignaturen korrekt von Anfragehashes. Die erhaltenen Daten selbst sind unverändert. | 188 fokussierte Prüfungen sowie Microsoft-Client-/Serverbuild bestanden; unabhängige Spec-/Qualitätsprüfung freigegeben. Vorhandene Release-Prüfungen ebenfalls angepasst (`f3b00e8`): 205 gezielte Fälle und Serverbuilds bestanden, unabhängig ohne Befund freigegeben. Konkreter rein lesender Prüfkandidat `e0f4b8e` gebunden und unabhängig samt Dateien geprüft; Offline-Prüfung bestanden. Neuer Bestandslauf nach regulärer Anmeldung erfolgreich durchgelaufen: Daten unverändert, beide neuen Tabellen vor/nach der Lesung nicht installiert, lokale Originale mitgesichert. Unabhängige aktuelle Quellenprüfung läuft; Vollständigkeitsfreigabe und Veröffentlichung stehen noch aus. |
| Pipeline | Als Aufgabe 7 ergänzt; beginnt nach erstem echten Microsoft-Release. | CLI 1.3.0 bestätigt per tatsächlicher Hilfe `pa app push --non-interactive`. Technische Anmeldung/Rechte und Kontingente noch nicht eingerichtet oder praktisch geprüft. |

Die reguläre Anmeldung dieses Laufs erfolgte mit Nutzerhandgriff im integrierten Browser. Es wurden keine Küchendaten, Rollen, Tabellen, Pakete oder Lizenzen verändert. Die 183 privat erhaltenen Dateien sind ein **unvollständiger** Inventarlauf, keine vollständige Sicherung und keine Veröffentlichung.

## Arbeitsübergabe

- Einstieg: `AGENTS.md`; verbindlicher Plan unter `docs/superpowers/plans/2026-10-20-github-microsoft.md`.
- Inventar-Queryfehler lokal korrigiert und unabhängig gegengeprüft. Kernfunktionen von späteren Belegtabellen getrennt und erhaltene Vorgangssignaturen lokal korrekt geprüft. Abgestimmte Releasewerkzeuge sind lokal geprüft und unabhängig freigegeben. Vor dem nächsten Microsoft-Lauf werden die konkreten geprüften Artefakte gebunden.
- Danach: serverbestätigte Kernfreigabe samt Kernbackup/Releaseprüfung, kompatiblen Server/Client in derselben App veröffentlichen und echtes Speichern/Neuladen nachweisen.
- Private Liveantworten/Sicherungen befinden sich bewusst nicht im Repository. Ohne diese Evidenz darf ein anderer Agent keine Vollständigkeit, installierten Rechte oder erfolgreiche Veröffentlichung behaupten. Benötigte Livefakten über regulären freigegebenen Zugang neu lesen.
- Tatsächliches iPhone, native Transaktionsrücknahme, vollständige Originalsicherung und Microsoft-Wiederherstellung sind noch nicht abgenommen. Cloud-KI/OCR bleibt aus.

## Änderungs-/Prüfprotokoll

- `a618100`: Ist/Soll und sechs Aufgaben, unabhängig gegengeprüft; nur Dokumentation.
- 20.10.2026: Umsetzung/Pipeline vom Nutzer freigegeben. Diagnosekandidat lokal unabhängig gegen 52 Quellen, sieben Builddateien, 186 Hostdateien und 89 Clientdateien geprüft; rein lesender Microsoft-Test zeigte oben genannten tatsächlichen Queryfehler. Kein Schreib-/Deployversuch.

- `b8bb4ab` (R0): feste Metadatenabfrage korrigiert; zehn gezielte synthetische Reader-Tests, sauberer Build/Publish und Offline-Closure. Unabhängige Spec-/Qualitätsprüfung freigegeben, ein kleiner nicht blockierender Testhinweis bleibt dokumentiert. [Prüfzusammenfassung](validation/2026-10-20-inventory-query.md). Keine Liveveröffentlichung.

- `f833e93` (2a, lokal): serverbestätigte Funktionsfreigabe, verzögerte Dokumentanbindung, expliziter Kern-/Dokumentsicherungsvertrag und historische Signaturprüfung. 188 fokussierte Prüfungen, Microsoft-Clientbuild und Serverbuild bestanden. Unabhängige Spec-/Qualitätsprüfung freigegeben; ein nicht blockierender Testhinweis dokumentiert. [Prüfzusammenfassung](validation/2026-10-20-core-runtime.md). Keine native Bereitstellung.

- `f3b00e8` (2b, lokal): Inventur, Paketaktivierung, native Kontrollpunkte und abschließender Server-/Sicherungsvergleich verwenden denselben ausdrücklich geprüften Umfang. 205 gezielte synthetische Fälle und saubere Serverbuilds; unabhängige Spec-/Qualitätsprüfung ohne Befund freigegeben. Alle produktiven Bindungen bleiben bis zur tatsächlichen Evidenzprüfung leer. [Prüfzusammenfassung](validation/2026-10-20-core-release-path.md).

- `e0f4b8e` (2c): ausschließlich begrenzte Leseinventur freigeschaltet und feste Quelldateiliste aktualisiert. Unabhängig tatsächliche 54 Quellen, sieben Builddateien, 89 Clientdateien, 186 Hostdateien und zehn lokale Originalkopien geprüft; externe lokale Prüfung und Offlinegate bestanden. Der anschließende Bestandslauf wurde nach regulärer Kontoauswahl beendet; der frühere Queryfehler trat nicht mehr auf. Keine produktive Sicherungs-/Aktivierungs-/Releasefreigabe daraus abgeleitet.

- Aktueller Microsoft-Leselauf: 121 native Antworten, 353 lokal erhaltene Dateien; Datenstand und drei Vorgänge unverändert. Beide neuen Tabellen vor und nach der Aufnahme nativ nicht installiert; Originalanforderungen und lokale Kopien geprüft. Die Quellen-Vollständigkeitsfreigabe war absichtlich noch leer, daher bleibt die Aufnahme bis zur unabhängigen Prüfung als unvollständig gekennzeichnet. Kein Paketupdate und keine Daten-/Rechteänderung.

## Aktueller Auftrag: direkter bestehender App-Release

Der Nutzer hat weitere Agenten-/Prüfrunden ausgeschlossen und Pipeline/Extras zurückgestellt. Das vorhandene geprüfte Serverpaket wurde gebaut; die offizielle Microsoft-CLI ist mit Vorstand angemeldet, die Oberfläche ist vorbereitet. Der erste Paketupdate-Versuch mit exakter Versionssperre wurde von Microsoft wegen abweichender RowVersion abgelehnt. Das alte Paket ist nachweislich unverändert.

Der vorhandene alternative Paketinhalt-Upload benötigt keine neuen Rechte, kann aber eine gleichzeitige Paketänderung überschreiben. Die automatische Aktionsfreigabe hat ihn deshalb vor Ausführung abgelehnt. Die konkrete Nutzerbestätigung für ausschließlich dieses Paketupdate ist angefragt. Noch kein neuer Server-/Clientrelease; Küchendaten und Rechte unverändert.
