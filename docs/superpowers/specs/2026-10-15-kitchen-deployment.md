# Zunftküche – freigegebene Microsoft-Einrichtung

Der Nutzer hat ausdrücklich freigegeben: Zunftküche mit Dataverse, EU/EFTA, Deutsch und Euro, bestehendes Zunft-Team als Umgebungszugang. Anschließend hat er die App-Nutzung zunächst auf Vorstand@Schelmenzunft.onmicrosoft.com beschränkt und DuckDuckGo mit vorhandener Anmeldung als Browser gewählt. Es braucht keine erneute abstrakte Baufreigabe. Die vorher beauftragten Agenten-Gegenprüfungen gelten weiter.

## Bereits live bestätigt

- Umgebung 5684204c-3254-ec15-93f4-276ec50cc65b ist Ready mit Dataverse.
- Organisation 5ded2106-01c8-f111-be88-002248db2d69, URL https://org1d76e28a.crm17.dynamics.com.
- EU/EFTA, zugeteilte Region Schweiz, Sandbox, nicht verwaltet, Azure-Abrechnung ausgeschaltet.
- Zugeordnet: Schelmenzunft Staufen Traditionszunft der Staufener Stubengesellschaft 1449 e.V.
- Bestehende offizielle pa-CLI als Vorstand angemeldet. Keine Küchenressourcen in Dataverse registriert, keine App veröffentlicht, keine anderen App-Nutzer freigegeben.

## Ziel und Grenzen

Die vorhandene App mit echtem Dataverse-Backend verbinden, zunächst privat für Vorstand bereitstellen und den tatsächlichen Speichern-/Neuladen-Ablauf prüfen. Bestehenden Fachvertrag, Quelldaten und historischen Stand erhalten. Keine neuen Gruppen, Dienstprinzipale, dauerhaften Secrets, Bezahl-/Testabonnements oder weiteren Benutzerrechte anlegen. Keine Originaldateien löschen/überschreiben; keine lokalen Prüfdaten importieren. Keine Lieferanten-/Teams-Nachrichten versenden.

## Bereitstellung

Der vorhandene registration.json-Vertrag wird über unterstützte Dataverse-SDK/Web-API-Metadaten umgesetzt: Publisher zk, dedizierte unmanaged Solution, zwei Standardtabellen, aktiver zusammengesetzter Receipt-Schlüssel, echtes nupkg, zwei Actions und vollständige synchrone Absicherung der unterstützten Schreibwege. Bei den beiden Standardtabellen gelten die von Microsoft dokumentierten zusammengeführten Create-/Update-Pipelines: strikte einzelne Create/Update/Delete-Guards, keine zusätzlichen pauschal ablehnenden Multiple-Schritte, die normale Commits mitblockieren würden. CreateMultiple/UpdateMultiple-Abdeckung über die einzelnen Guards sowie Upsert-/UpsertMultiple-Abdeckung sind gesondert nachzuweisen. Standardtabellen-Upsert ruft laut Microsoft Create oder Update auf und wird über diese Guards abgesichert. UpsertMultiple kann trotz fehlendem eigenen Filter unterstützt sein. DeleteMultiple ist bei Standardtabellen nicht unterstützt; die tatsächliche Nichtaufrufbarkeit bleibt Teil der Liveprüfung. Keine App-Freigabe vor vollständiger Absicherung und Root-Liveprüfung. Anfangsdaten nur aus import/2026.json in geprüfter Kopie zu Schema2 normalisieren, lokale Pfade in dieser Kopie entfernen, ursprüngliche Werte/IDs/Provenienz erhalten. Initialer Datensatz gehört zunächst dem bestätigten Admin-Benutzer; kein breiter Zunft-Team-Schreibzugriff.

Authentifizierung ausschließlich mit unterstütztem Microsoft OAuth/MSAL oder offizieller CLI. Keine Browsercookies, privaten Cachedateien oder Zugangsdaten auslesen. Tokens bleiben im Speicher, werden weder geloggt noch gespeichert/committed/ausgegeben. Ein interaktiver Loopback-PKCE-Flow kann seine öffentliche Microsoft-Anmelde-URL ausgeben, damit Root sie im genehmigten DuckDuckGo öffnet; kein automatischer Safari-Start. Als Beispiel-Client ist die von Microsoft ausdrücklich dokumentierte öffentliche SDK-Client-ID nur für dieses lokale Sandbox-Einrichtungswerkzeug zulässig; kein Einbau in die ausgelieferte Web-App. Der Benutzer muss bei einer unerwarteten zusätzlichen Einwilligung übernehmen.

Jeder schreibende Lauf prüft zuerst genaue Organisation, URL und Vorstandsidentität. Existierende Ressourcen werden gelesen und verglichen; abweichende Definitionen stoppen den Lauf. Keine pauschalen Updates oder Löschungen. Unbestätigte Schreibfehler führen zur Readback-Prüfung, keinem blinden Wiederholen. Aufrufbare Phasen: inspect (nur lesen), tables, seed, backend, verify. Trockenlauf/Plan erstellt keine Ressourcen.

Nach realer API-Bereitstellung echte pa-Dienste generieren, deren tatsächliche Signaturen prüfen und vor dem React-Mount konfigurieren. Code Apps und App-Pässe für genau diese Umgebung kontrollieren. App ausschließlich für Vorstand veröffentlichen/freigeben. Teams-Einbindung erst mit gültiger App-URL; keine zusätzlichen Nutzerrechte dabei.

## Abnahme

Lokale Provisionierungsprüfungen für falsches Ziel/falsche Identität, Wiederholung ohne Duplikate, abweichende Schemata, Key noch nicht aktiv, Guard-Lücken, sichere Seed-Kopie und Secret-freie Logs. Unabhängiger Review vor Provider-Schreibläufen. Anschließend echte Metadaten/Key/Plugin/API/Guard-Readbacks und tatsächlicher Load/Commit, Wiederholung/Konflikt/Direktschreibablehnung sowie Browserablauf. Admin-Abnahme beweist keine gewöhnlichen Leser-/Bearbeiterrollen; diese bleiben bis zur Freigabe weiterer Konten ausdrücklich unbestätigt.


Integrationskorrektur vor Aktivierung: [Microsofts zusammengeführte Nachrichtenpipelines](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/bulk-operations#message-pipelines-merged) führen bei einzelnen Create/Update-Aufrufen auch die entsprechenden Multiple-Ereignisse aus. Der bestehende Guard akzeptiert bewusst nur den exakt autorisierten einzelnen Target-Write aus dem laufenden KitchenCommit. Er bleibt unverändert; die redundante Multiple-Registrierung wird vor dem ersten Backend-Lauf durch explizite Abdeckungsmetadaten ersetzt. Dies ist eine Implementierungskorrektur innerhalb des freigegebenen Ziels, keine Erweiterung von Benutzerrechten.

Zusätzliche Primärquelle: [Upsert-Verarbeitung bei Standardtabellen](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/use-upsert-insert-update-record#understand-the-upsert-process-for-standard-tables). Einzelne Create/Update/Delete-Schritte sind die sechs zwingenden Registrierungen. Upsert bleibt ein abzusichernder Aufrufweg, wird aber nicht mit einem eventuell nicht registrierbaren eigenen Ereignis verwechselt.
