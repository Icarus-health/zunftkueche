# Zunftküche – Einstieg für andere Agenten

## Zuerst lesen

1. `docs/project-status.md`: aktueller Stand, nachgewiesene Ergebnisse, offene Grenze und nächster Schritt.
2. `docs/superpowers/specs/2026-10-20-github-microsoft-design.md`: Ist/Soll und verbindliche Produktgrenzen.
3. `docs/superpowers/plans/2026-10-20-github-microsoft.md`: Aufgaben, Pipeline und Abnahmekriterien.
4. `docs/release-runbook.md`: tatsächlicher Veröffentlichungsweg und aktuelle Einschränkungen.

## Auftrag und Grenzen

- Entwicklung in diesem GitHub-Repository, Betrieb in der bestehenden Microsoft Code App/Dataverse/SharePoint. Erst echten Microsoft-Release nachweisen, danach aus GitHub automatisieren.
- Keine zusätzlichen laufenden Kosten, Trials, bezahlten Runner oder neuen Hostinganbieter aktivieren. Teams-Einbettung ist optional; vorhandene gemeinsame Ablage behalten.
- Private Importe, Rechnungen, lokale Sicherungen, Rohantworten aus Microsoft, Tokens und Secrets niemals committen. Synthetische Fixtures verwenden; Originale und bestehende Historie erhalten.
- Keine alten Deployment-/Zugriffs-/Continuation-Skripte blind wiederholen. Neue Oberfläche spricht Protokoll 2; der zuletzt nachgewiesene Live-Server verwendet noch Protokoll 1. Immer kompatibles Client-/Serverpaar veröffentlichen.
- Neue Dokumentfunktionen benötigen eine explizite serverbestätigte Freigabe; UI-Schalter allein genügt nicht. Backup-/Releaseumfang folgt den tatsächlich installierten Speichern, nicht der UI-Freigabe.
- Routineänderungen auf kurzem Aufgabenbranch umsetzen, committen, testen und über PR nachvollziehbar machen. Kein Force-Push auf fremde Arbeit. Unabhängige Gegenprüfung für fachliche Änderungen und Releases.
- Nur betroffene Prüfungen wiederholen, außer wenn Baseline/Abhängigkeiten oder neue Befunde einen Gesamtlauf erfordern. Kein neues Test-/Deployment-Framework auf Verdacht.
- Status nach jeder Lieferung aktualisieren: Commit, genaue Prüfung, Ergebnis, lokal/Host/Gerät, offene Grenzen, nächster ausführbarer Schritt. Historische Belege sind keine aktuelle Live-Abnahme.

## Entwicklung

Aktuell: `npm ci`, `npm test`, `npm run build -- --mode microsoft`, `npm run build:server`. Noch nicht klonunabhängig: einige Tests/Vorschau brauchen `import/2026.json`; der Serverbuild erwartet bisher ein SDK/Cache neben dem Repository. Aufgabe 1 beseitigt das mit synthetischen Fixtures und portablen Pfaden. Die private Ausgangsdatei darf hierfür nicht hochgeladen werden.

## Mehrere Agenten

Vor Änderungen Branch/HEAD/Arbeitsbaum prüfen, eigenen Umfang in Status/PR benennen. Nicht gleichzeitig dieselben Produktdateien bearbeiten. Erkenntnisse, Prüfzusammenfassungen und Entscheidungen im Repository festhalten; private Rohbelege lokal behalten. Keine anderen Codex-Chats anschreiben, solange der Nutzer dies nicht ausdrücklich autorisiert hat.
