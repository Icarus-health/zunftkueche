# Microsoft-Release und GitHub-Automatisierung

Stand 20.10.2026 – laufende Umsetzung, **kein bereits nachgewiesener neuer Releaseweg**. Aktueller Befund und nächster Schritt: `project-status.md`. Ziel bleibt dieselbe bestehende Code App aus `power.config.json`; kein neues App-/Umgebungsprojekt.

## Reihenfolge

1. Aktuellen Bestand und Rechte regulär lesen; Rohdaten privat sichern und Vollständigkeit prüfen. Der letzte Test scheiterte nach erfolgreicher Anmeldung an einer konkreten Metadatenabfrage.
2. Kernrelease mit Protokoll 2, abgeschalteten neuen Dokumentfunktionen und passendem Sicherungsvertrag fertigstellen. Bereits vorhandene Speicher niemals aus dem Backup ausblenden.
3. Genau benannten Commit bauen, Client-/Serverkompatibilität und bestehende Daten validieren. Schreibpause und wiederanlauffähiges Versionspaar dokumentieren.
4. Backend zuerst, danach Oberfläche in der bestehenden Microsoft-App bereitstellen. Danach tatsächlichen Host mit berechtigtem Laden/Speichern/Neuladen prüfen. Build oder CLI-Erfolg allein genügt nicht.
5. Erst diesen nachgewiesenen Weg in GitHub `workflow_dispatch` übernehmen; automatische Prüfungen bei Änderungen, Veröffentlichung bewusst auslösen.

## Vor Automation noch konkret zu klären

- Tatsächlich unterstützter nicht interaktiver Modus der gepinnten CLI oder begründetes gezieltes Update.
- Technische Identität, Ziel-App/Umgebung, notwendige App-/Backendrechte und Zugangsmittel/Laufzeit; erforderliche neue Freigaben am konkreten Aktionspunkt einholen.
- Zugangsmittel als GitHub-Secret, niemals als Quelltext oder Log; Ablauf und Rotation dokumentieren.
- Vorhandenes kostenfreies GitHub-Kontingent und Begrenzung zusätzlicher Abrechnung. Keine kostenpflichtigen Runner, Testabos oder neue Umgebung.
- Parallele Veröffentlichung ausschließen, falsche Versionen vor Mutation stoppen, unklaren Updateausgang nicht automatisch wiederholen.

## Grenzen

Vorhandene historische Deploy-/Access-/Acceptance-/PackageUpdate-Skripte sind datierte Belege und keine pauschal freigegebenen aktuellen Migrationsroutinen. Ein Rückwechsel der Oberfläche allein ist bei geändertem Backend/Datenvertrag kein belegter Rollback. Originale und Historie bleiben erhalten. Die vollständige Microsoft-Wiederherstellung ist bisher nicht nachgewiesen; kein Produktivbestand wird für einen Wiederherstellungstest überschrieben.

## Freigabenachweis je Release

Commit und Artefakthash, Client-/Serververtrag, Installationsumfang, Sicherungsnachweis, Zeitpunkt, tatsächlich getestetes Konto/Rolle, Ergebnis im Host, bekannte Grenzen und konkreter Wiederanlauf. Sobald die Schritte real ausgeführt sind, werden die tatsächlichen Befehle und Ergebnisse hier ergänzt – keine geratenen produktiven Befehle vorab als funktionierend darstellen.
