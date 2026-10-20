# Microsoft-Release und GitHub-Automatisierung

Stand 20.10.2026 – **manueller Kernrelease tatsächlich veröffentlicht und auf Laden/Speichern/Neuladen geprüft**; keine Pipeline aktiviert. Aktueller Befund und nächster Schritt: `project-status.md`. Ziel bleibt dieselbe bestehende Code App aus `power.config.json`; kein neues App-/Umgebungsprojekt.

## Reihenfolge

1. Aktuellen Bestand und Rechte regulär lesen; Rohdaten privat sichern und Vollständigkeit prüfen. Der letzte Test scheiterte nach erfolgreicher Anmeldung an einer konkreten Metadatenabfrage.
2. Kernrelease mit Protokoll 2, abgeschalteten neuen Dokumentfunktionen und passendem Sicherungsvertrag fertigstellen. Bereits vorhandene Speicher niemals aus dem Backup ausblenden.
3. Genau benannten Commit bauen, Client-/Serverkompatibilität und bestehende Daten validieren. Schreibpause und wiederanlauffähiges Versionspaar dokumentieren.
4. Backend zuerst, danach Oberfläche in der bestehenden Microsoft-App bereitstellen. Danach tatsächlichen Host mit berechtigtem Laden/Speichern/Neuladen prüfen. Build oder CLI-Erfolg allein genügt nicht.
5. Erst diesen nachgewiesenen Weg in GitHub `workflow_dispatch` übernehmen; automatische Prüfungen bei Änderungen, Veröffentlichung bewusst auslösen.

## Vor Automation noch konkret zu klären

- Gepinnte CLI 1.3.0 unterstützt laut tatsächlicher Hilfe `pa app push --non-interactive`; kein CLI-Update dafür erforderlich. Die vorhandene Implementierung enthält einen Service-Principal-Modus (siehe unten). Praktische Anmeldung/Veröffentlichung damit noch offen.
- Technische Identität, Ziel-App/Umgebung, notwendige App-/Backendrechte und Zugangsmittel/Laufzeit; erforderliche neue Freigaben am konkreten Aktionspunkt einholen.
- Zugangsmittel als GitHub-Secret, niemals als Quelltext oder Log; Ablauf und Rotation dokumentieren.
- Vorhandenes kostenfreies GitHub-Kontingent und Begrenzung zusätzlicher Abrechnung. Keine kostenpflichtigen Runner, Testabos oder neue Umgebung.
- Parallele Veröffentlichung ausschließen, falsche Versionen vor Mutation stoppen, unklaren Updateausgang nicht automatisch wiederholen.

## Grenzen

Vorhandene historische Deploy-/Access-/Acceptance-/PackageUpdate-Skripte sind datierte Belege und keine pauschal freigegebenen aktuellen Migrationsroutinen. Ein Rückwechsel der Oberfläche allein ist bei geändertem Backend/Datenvertrag kein belegter Rollback. Originale und Historie bleiben erhalten. Die vollständige Microsoft-Wiederherstellung ist bisher nicht nachgewiesen; kein Produktivbestand wird für einen Wiederherstellungstest überschrieben.

## Freigabenachweis je Release

Commit und Artefakthash, Client-/Serververtrag, Installationsumfang, Sicherungsnachweis, Zeitpunkt, tatsächlich getestetes Konto/Rolle, Ergebnis im Host, bekannte Grenzen und konkreter Wiederanlauf. Sobald die Schritte real ausgeführt sind, werden die tatsächlichen Befehle und Ergebnisse hier ergänzt – keine geratenen produktiven Befehle vorab als funktionierend darstellen.

## Vorbereiteter Pipeline-Anmeldeweg (noch nicht eingerichtet)

Die vorhandene CLI-Version 1.3.0 enthält `ServicePrincipalAuthenticationProvider`: `PA_CLI_USE_SP_AUTH=true` wählt ihn ausdrücklich; auch `CI=true` wählt diesen Modus. Ihre Implementierung erwartet `PA_CLI_SP_CLIENT_ID`, `PA_CLI_SP_CLIENT_SECRET` und `PA_CLI_SP_TENANT_ID` und verwendet den Client-Credentials-Fluss. `--non-interactive` allein ist kein Nachweis einer funktionierenden technischen Anmeldung. Das wurde ausschließlich in den installierten CLI-Dateien und ihrer Hilfe gelesen: keine neue Identität, kein Secret und kein Recht wurde angelegt oder getestet.

Diese Namen gelten für die im Lockfile gepinnte CLI, nicht ungeprüft für andere Werkzeuge/Versionen. Konkrete minimale Rechte und kostenlose Kontingente werden erst für den nachgewiesenen manuellen Releaseweg festgelegt. Geheimwerte gehören ausschließlich in die dafür vorgesehenen GitHub-Secrets.

## Tatsächlich durchgeführter manueller Kernrelease

Die vorhandenen geprüften Produktquellen wurden verwendet; keine neue Agenten-/Prüfrunde. Das net462-Paket wurde mit dem vorhandenen SDK gebaut/gepackt. Archivprüfung bestätigte ausschließlich `Kitchen.Dataverse.dll` und `Newtonsoft.Json.dll` als Laufzeit-DLLs sowie Übereinstimmung mit der tatsächlichen Buildausgabe.

Der einmalige Backend-Upload verwendete die bestehende normale Microsoft-Anmeldung (Vorstand, PKCE, Token nur im Arbeitsspeicher), festen Zielmandanten/Arbeitsbereich/Paket und einen lokalen privaten Vorherabzug. Unmittelbar davor wurden Identität, ursprüngliche Paketbytes, wiederholte Paketmetadaten und Kernstand geprüft. Der exakte ETag-Upload wurde abgewiesen. Erst nach ausdrücklicher Nutzerfreigabe des konkreten Risikos erfolgte genau ein `PATCH pluginpackages(70a54daa-73c8-f111-a05c-7ced8d5f6e0d)` des `content`-Felds mit `If-Match: *`. Dieses Verfahren bietet keinen atomaren Schutz gegen einen konkurrierenden Paketautor und ist nicht als allgemeine automatische Wiederholung freigegeben.

Nachgelesen: Paket-SHA256 `4d7c3224a37d89df61911996d0a5762df5617c7bb20907f7262ffb0e55b8666b`, Kern-/Vorgangsdaten beim Wechsel unverändert, echter `zk_KitchenLoad` mit Protokoll 2 erfolgreich. Die lokale manuelle Ausführungsdatei ist ein auf diesen früheren Daten-/Paketstand begrenztes privates Hilfsmittel; nicht blind erneut starten.

Anschließend tatsächlich erfolgreich ausgeführt:

```sh
node node_modules/@microsoft/power-apps-cli/dist/Bin.js app push --non-interactive
```

Das veröffentlicht die bereits gebauten `dist`-Dateien gemäß `power.config.json` in dieselbe bestehende App. Die CLI war regulär als Vorstand angemeldet. Danach im Microsoft-Host die angezeigte alte Version über **Aktualisieren** ersetzt. Browserprüfung mit Schreiber: neue Oberfläche und Bestandsdaten geladen, vorhandenen Lieferanten mit unveränderten angezeigten Werten gespeichert, Bestätigung „Gespeichert“, Browserreload und frische Datenansicht erfolgreich. Die normale Vorgangshistorie dieses Speichertests bleibt erhalten.

Der formale Katalog im älteren Releasewerkzeug ist weiterhin nicht befüllt; dessen Offline-/Vollständigkeitsfreigaben sind nicht der Nachweis für diesen manuellen Lauf. Nicht nachträglich gefälschte Katalog-/Sicherungsfreigaben eintragen. Aktueller tatsächlicher Zustand steht in `project-status.md`. Pipeline und Extras bleiben zurückgestellt.
