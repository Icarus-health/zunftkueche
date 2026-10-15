# Privater Teams-Wrapper: experimentell, persönlich

Stand: 15.10.2026. Reproduzierbares ZIP für einen kontrollierten persönlichen Test mit **Vorstand@Schelmenzunft.onmicrosoft.com**. Noch keine Teams-Installation oder Funktionsfreigabe. `personal` begrenzt den Einbindungsort, nicht die installierenden Benutzer: Identität und Datenzugriff bleiben von bestehenden Power-Apps-/Backend-Freigaben und Teams-Verwaltung abhängig. Das Manifest erteilt keine Benutzerfreigaben.

## Quellen und Identität

- Wrapper-ID: `a93e06f2-e1e8-4572-bb29-a52acc9c2c7a` (eigene stabile UUID, unabhängig von Power-App und offiziellem Template).
- Code-App: `bfec495e-c223-4176-89a8-3e4d631337ae`; Umgebung `5684204c-3254-ec15-93f4-276ec50cc65b`; Tenant `1dcbc0d3-e9b9-4622-bbd7-811ff1c1f7e9`.
- `contentUrl`: tatsächliche Play-URL mit `&source=teamstab`; `websiteUrl`: dieselbe Play-URL ohne diesen Zusatz.
- Einzige `validDomains`-Angabe: `apps.powerapps.com`, der Host dieser beiden URLs. Keine geratenen Weiterleitungs-, Login- oder Wildcard-Domains. Falls Teams einen anderen tatsächlichen Navigationshost ablehnt, zuerst die konkrete Ablehnung prüfen. Diese Liste ersetzt weder CSP noch Zugriffsrechte.
- Nur ein statischer persönlicher Tab. Keine Bots, RSC-/Graph-/Identitäts-/Geräte-/Medienrechte, kein `webApplicationInfo`, keine Team-/Gruppenchat-Einbindung.
- Originale geometrische Kochtopf-Icons: 192×192 RGB+A undurchsichtig; 32×32 weiße Form auf transparentem Hintergrund. Kein Vereinslogo. Generator in `build.py`.

## Freigegebene Links

`approved-links.json` enthält die vom Nutzer am 15.10.2026 ausdrücklich ausgewählten bestehenden Website-Links: Startseite, `/datenschutz/`, `/impressum/`. Das Impressum wird auf Nutzerwunsch im Feld `termsOfUseUrl` verwendet; es wurden keine App-Nutzungsbedingungen erstellt und keine rechtliche Eignung oder App-Abdeckung der Website-Datenschutzerklärung bestätigt.

Der Builder verlangt alle drei ausdrücklich mitgegebenen HTTPS-URLs und weist fehlende Werte, bekannte Platzhalter und lokale/IP-Adressen zurück. Es gibt keinen stillen Standard und kein installierbar bezeichnetes Manifest mit ausstehenden Metadaten. Die Prüfung kann keine tatsächliche Freigabe oder Rechtsprüfung durch eine Person ersetzen.

## Lokal bauen und prüfen

Python-Standardbibliothek genügt für Build und Vertrags-/PNG-Prüfung. Der Ausgabeordner muss existieren; bestehende Dateien werden nie überschrieben.

```sh
mkdir -p teams/artifacts
python3 teams/build.py --metadata teams/approved-links.json --output teams/artifacts/zunftkueche-personal-0.1.0.zip
python3 teams/validate.py teams/artifacts/zunftkueche-personal-0.1.0.zip
python3 -m unittest discover -s teams -p 'test_*.py'
```

Das ZIP enthält genau `manifest.json`, `color.png`, `outline.png` im Wurzelverzeichnis. Feste Zeitstempel und gespeicherte ZIP-Einträge erzeugen bei gleichen Quellen identische Bytes. Keine Laufzeit-, Backend- oder Provideränderung. Artefakte sind lokal und nicht versioniert.

Wenn `jsonschema` in der ausführenden Python-Umgebung bereits vorhanden ist:

```sh
python3 teams/validate.py teams/artifacts/zunftkueche-personal-0.1.0.zip --schema
```

`--schema` prüft das tatsächliche Manifest gegen die lokale offizielle v1.16-Referenz und URI-Formate. Ohne diese Option meldet die Ausgabe ausdrücklich, dass die Schema-Prüfung nicht lief. Keine automatische Installation oder Netzwerkzugriffe beim Bauen/Validieren.

## Grenzen und tatsächliche Teams-Abnahme

Der offizielle „Add to Teams“-Export scheiterte hier am fehlenden `icons.outline`; ein eigenes vollständiges ZIP behebt nur diesen Paketfehler. Es beweist keine unterstützte Code-App-Integration.

Microsofts [Teams-Tab-Anforderungen](https://learn.microsoft.com/en-us/microsoftteams/platform/tabs/how-to/tab-requirements) verlangen passende Frame-Header, HTTPS und TeamsJS-Initialisierung im gehosteten Inhalt. Der Wrapper kontrolliert den Power-Apps-Player und dessen verschachtelte Frames nicht. Ob `source=teamstab` dort die erforderliche Host-Initialisierung ermöglicht, ist unbestätigt. Kein TeamsJS- oder Authentifizierungs-Code wurde hinzugefügt.

Die [Code-App-iframe-Dokumentation](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/embed-iframe) beschreibt generisches Einbetten und CSP-Konfiguration, keine verifizierte Teams-Unterstützung. Allgemeine iframe-Fähigkeit bedeutet keine funktionierende Teams-Anmeldung. Standard-CSP kann externe Frame-Vorfahren blockieren; `validDomains` hebt dies nicht auf. Kein CSP-Wert wurde geändert. Bei Ablehnung konkrete Header, tatsächlichen Teams-Host und betroffene Einstellung erfassen, Änderung gesondert prüfen lassen; keine pauschalen Wildcards hinzufügen.

Nach unabhängiger Paketprüfung durch den Hauptverantwortlichen, nur im genehmigten persönlichen Zugang:

1. ZIP im tatsächlichen Teams-Client prüfen/importieren; Identität und persönlicher Einbauort kontrollieren. Keine Organisationsveröffentlichung.
2. **Laden:** App lädt im Tab; angemeldeter Benutzer ist der freigegebene Vorstand. Bei Frame-/Anmelde-/SDK-Fehler abbrechen und genaue Fehlermeldung dokumentieren.
3. **Bestellungen:** reale freigegebene vorhandene Bestellungen anzeigen; keine Testdaten als Produktionsnachweis ausgeben.
4. **Speichern:** eine vorher vereinbarte reversible Änderung speichern; Erfolg und Backend-Zustand nachvollziehen.
5. **Neu laden:** Tab neu laden/erneut öffnen; gespeicherter Zustand bleibt erhalten. Teständerung bei Bedarf kontrolliert zurücknehmen.
6. Client/Version, Zeitpunkt, verwendete ZIP-Prüfsumme, beobachtete Ergebnisse und verbleibende Einschränkungen festhalten. Paket-/Schema-Prüfung, Installation, Laden und fachlicher Erfolg getrennt berichten.
