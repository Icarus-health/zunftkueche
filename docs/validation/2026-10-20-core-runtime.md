# Küchen-Kern: lokale Vorbereitung des Microsoft-Release

Stand: 20. Oktober 2026. Änderung `3d535dc..f833e93`, Aufgabe 2a. Diese Zusammenfassung enthält keine privaten Küchendaten oder Microsoft-Rohantworten.

## Verhalten

- Der Microsoft-Kern lädt zunächst ausschließlich die beiden Kerndienste. Dokument-/SharePoint-Anbindung folgt erst einer erfolgreich geprüften serverseitigen Dokumentfreigabe. Fehlgeschlagenes Neuladen und fremde Identität widerrufen die Freigabe.
- Der öffentliche Server bestätigt beide neuen Dokumentfunktionen als ausgeschaltet. Manuelle Rechnungen und der bisherige Küchen-Kern bleiben nutzbar. Finanzielle Belegübernahme verlangt später beide Freigaben; gewöhnliche Dokument-/Entwurfsarbeit benötigt nur Dokumentfreigabe.
- Sicherung unterscheidet geprüften Kernumfang von installiertem Dokumentumfang. Ausgeschaltete Funktionen sind kein Abwesenheitsnachweis. Der Kern benötigt frische native Abwesenheit beider neuer Tabellen und geprüfte Historie; unbekannte/lesegesperrte/installierte Quellen werden nicht als leer behandelt. Originalanforderungen bleiben erhalten.
- Historische kanonische Vorgangssignatur und Hash der vollständigen Speicheranfrage sind unterschiedliche Felder. Die Prüfung erhält beide unverändert und kontrolliert ihre jeweiligen Formen und Vorgangsbeziehungen.

## Gezielte lokale Prüfung

104 Client-/Bootstrap-/Microsoft-/Sicherungsfälle, 25 Laufzeit-/Sicherungsfälle, 8 Dokumentfälle, 22 Übernahmefälle, 19 Signatur-/Vorgangsprüfungen und 10 bestehende Inventarabfragefälle bestanden. Insgesamt 188 Fälle. Microsoft-Clientbuild und .NET-Framework-4.6.2-Serverbuild bestanden; C# ohne Warnung/Fehler. Die künftigen Dokumenttests arbeiten ausdrücklich mit freigegebenen synthetischen Konfigurationen und bleiben aktiv.

Unabhängige Spec-/Qualitätsprüfung: freigegeben. Kein blockierender Befund; ein kleiner Testhinweis bleibt offen: Ein Test für widerrufenen Originalzugriff sollte einen gültigen Dateiverweis verwenden, damit er gezielt die neue Sperre erreicht. Die Sperre selbst wurde im Code geprüft.

## Offene Grenze

Noch keine neue Veröffentlichung, vollständige Produktionssicherung, Microsoft-Wiederherstellung oder iPhone-Abnahme. Die produktive Sicherungsbindung bleibt bewusst leer, bis native und historische Evidenz unabhängig geprüft wurde. Die alten Releaseartefakte passen nicht mehr zum geänderten Code und dürfen nicht unverändert ausgeführt werden. Aufgabe 2b passt die bestehenden Aktivierungs-/Prüfwerkzeuge an denselben Umfang an; danach werden konkrete Artefakte und Evidenz geprüft.
