# Zunftküche – lokaler Arbeitsstand

Stand 14.10.2026. Diese bedienbare Arbeitsversion ist der vorbereitete Teil des beauftragten Microsoft-Aufbaus. Noch keine Power-Apps-App, Dataverse-Umgebung oder Teams-Registerkarte veröffentlicht. Die Microsoft-Anmeldung wurde erfolgreich geprüft; das Anlegen der Umgebung wartet auf die ausdrückliche Zugriffsgruppenfreigabe und einen entsperrten Mac.

## Öffnen

Die Vorschau läuft im aktuellen Arbeitsordner auf http://127.0.0.1:4182/.

Für einen späteren Neustart in diesem Ordner:

```sh
npm ci
npm run dev -- --port 4182
```

Die Vorschau ist nur auf dem eigenen Mac erreichbar. Sie speichert Änderungen privat in `.local-state/state.json`. Originaldateien werden gelesen, nicht verändert. Im Paket fehlen Original-PDFs; die lokalen Herkunftspfade werden verwendet, wenn die Dateien am ursprünglichen Ort liegen.

## Vorhanden

Startseite, Planung Freitag/Samstag, Lieferant und Liefertag, Bestellmengen und zusätzliche Positionen, getrennte Bestellversionen, Preise und Entwurfsrezepturen, Lieferungen/Restzählungen/Abfall, vorhandene Belege und ihre Herkunft, SharePoint-Verknüpfung, Stückzahlen je Abend, begrenzte Auswertung und Erfahrungen aus 2026.

`import/2026.json` enthält den belegten Ausgangsstand, offene Werte als null. Das ist kein veröffentlichbares Frontend-Asset. Vite nimmt diese Datei nicht in `dist/` auf. Das lokale Daten- und Dateilesemodul wird ebenfalls nicht in den Produktions-Build übernommen. Ohne eingerichteten Microsoft-Adapter verweigert der Produktions-Build den Datenzugriff.

## Prüfung und verbleibende Arbeit

22 Fach-/Speicher-/Fehlerprüfungen bestanden. Build erfolgreich. Browser hat Speicherung/Neuladen, Bestellvorschau, Planungsvergleich, Belegumfang und Wiederholung bei unterbrochener Verbindung geprüft. 62 Originaldateien haben unveränderte Inhaltshashes. Ein markierter lokaler Testdatensatz und die Teständerungshistorie werden nicht mitgeliefert und gehören nicht in den späteren Cloud-Import.

Noch erforderlich: tatsächlicher Dataverse-Datenspeicher und Datenadapter, Rollen für Bearbeiter/Leser, App-Lizenzzuordnung, SharePoint-Belege, Power-Apps-Bereitstellung und Teams-Integration, weitere Stammdaten-/Jahres- und Belegpflege. Eine endgültige UI/UX-Prüfung in Microsoft/Teams steht aus. Vollständige Küchenkennzahlen benötigen fehlende Belege, bestätigte Portionsgrößen und tatsächliche Mengen.

Keine Lieferantenbestellung wird automatisch versendet. Bekannte Teilausgaben verschiedener Orte werden nicht als Küchengewinn ausgegeben. Die private lokale Umsetzung unterstützt einen Serverprozess; sie ist kein freigegebenes Mehrbenutzersystem.

```sh
npm test
npm run build
```
