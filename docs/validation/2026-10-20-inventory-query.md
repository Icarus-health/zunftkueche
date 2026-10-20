# Prüfung: SDK-Inventar ohne neue Dokumenttabellen

20.10.2026, Produktionskorrektur `b8bb4ab1d94941840f6967297f0339befe6aa9c4`, Ausgangspunkt `8d9ae37`. Geändert: feste Inventarabfrage in `server/Release/ReleaseInventory.cs` sowie fokussierte Fälle im vorhandenen Testprogramm. Keine Daten-/Schema-/Rechteänderung.

## Tatsächlicher Ausgangsbefund

Die reguläre Vorstand-Anmeldung und Kernlesung gelangen. Eine folgende Metadatenabfrage ergab HTTP 400 / `0x80041102`, weil der Filter den logischen Namen einer noch nicht installierten Dokumenttabelle auflösen ließ. Die Oder-Bedingung für globale Schritte verhinderte diesen Fehler nicht. Unverarbeitete Antworten und Bestandsdaten bleiben privat lokal; der unvollständige Lauf ist keine vollständige Sicherung.

## Korrektur und Prüfungen

Die feste Abfrage liest nun SDK-Schrittmetadaten samt bisherigen Erweiterungen und Zähler ohne den fehlenden Tabellennamenfilter. Bestehende Seitennavigation, Zählerabgleich, Obergrenze 10.000 sowie Transport-/Antwortgrenzen bleiben erhalten. Das ist eine Metadaten-Obermenge, kein freier Abfragezugang.

- RED mit ursprünglicher Abfrage: 8 Fälle erfolgreich, 2 erwartete Fehler.
- GREEN mit Korrektur: **10 Fälle erfolgreich**, keine Fehler; tatsächlicher Reader mit synthetischem Transport, keine Provideraufrufe.
- Tests: `dotnet server/Release/Tests/bin/Release/net8.0/Tests.dll --inventory-query-only` nach seriellem Release-Build ohne Shared Compilation/Node-Reuse, bestehendes SDK 8.0.426. Build und lokale Kandidatenveröffentlichung ohne Warnungen/Fehler.
- Offline-Prüfung: 52 Quelldateien, 7 Builddateien, 186 Hostdateien und 89 Clientdateien. Keine Anmeldung oder Microsoft-Veröffentlichung durch diese Prüfung.
- Ein zunächst gestallter eigener Build wurde beendet; danach unveränderte Offline-Closure erneut erfolgreich. Kein erfolgreicher Test wird aus dem abgebrochenen Versuch abgeleitet.
- Unabhängige Gegenprüfung: Spezifikation freigegeben, Qualität freigegeben. Ein nicht blockierender Hinweis: Der gezielte Test für eine veränderte Folgeabfrage sollte zusätzlich die Zahl der gesendeten Requests prüfen, damit eine zweite HTTP-Ablehnung nicht die eigentlich erwartete Vorab-Ablehnung verdeckt. Produktionsvalidierung wurde nicht geändert; ein bereits bestehender direkter Test prüft diese Grenze separat.

## Verbleibender Nachweis

Die geänderte Query ist noch nicht erneut nativ ausgeführt. Ein separat nachgewiesener Releasevalidator-Fehler (Vorgangssignatur ist nicht der Hash einer vollständigen Anfrage) wird zuerst unter Aufgabe 2a korrigiert. Ein erfolgreicher lokaler Build ist weder vollständiges Inventar noch ein live geprüfter Release, Rechte-, Geräte- oder Wiederherstellungsnachweis.
