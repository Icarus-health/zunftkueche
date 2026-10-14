# Zunftküche – bedienbare lokale App

Stand 14.10.2026. Planung, Einkauf, Lieferungen, Bestand, Belege und Auswertung sind als zusammenhängende React-App umgesetzt. Der Dataverse-Server ist lokal kompiliert und paketiert. **Eine Veröffentlichung in Power Apps oder Teams und die Abnahme mit echten Microsoft-Benutzern stehen aus.** Die konkrete Zugriffsgruppe muss vor der Einrichtung freigegeben sein.

## Öffnen

Die Vorschau läuft im aktuellen Arbeitsordner auf http://127.0.0.1:4182/.

Für einen späteren Neustart in diesem Ordner:

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 4182 --strictPort
```

Voraussetzung ist eine aktuelle Node-Version mit TypeScript-Strip-Unterstützung. Die Vorschau ist nur auf dem eigenen Mac erreichbar. Änderungen liegen privat in `.local-state/state.json` mit Änderungshistorie. Ein Serverprozess bedient diese lokale Arbeitsversion. Sie ist noch kein abgenommenes Mehrbenutzersystem.

## Bedienung

1. Veranstaltung oben wählen. „Neue Veranstaltung“ übernimmt Stammdaten und Rezepturen, auf Wunsch die Einkaufsplanung. Frühere Veranstaltungen bleiben auswählbar. Lieferungen, Verkäufe, Belege und Bestellversionen werden separat aufbewahrt.
2. In „Stammdaten“ Lieferanten, Artikel, Einheiten, Gebinde und Speisen pflegen. Nettopreise können vier Euro-Nachkommastellen haben. Einheiten bereits verwendeter Artikel bleiben geschützt.
3. Unter „Planung“ Freitag und Samstag nebeneinander planen, Zutaten und Portionsmengen bestätigen. Leer bedeutet offen; ausdrücklich 0 bedeutet kein Bedarf. Ohne vollständige Mengen und bestätigte Rezepturen wird kein vollständiger Einkauf behauptet.
4. Anfangsbestand in „Lieferungen & Lager“ erfassen. Der gemeinsame Einkaufsbedarf zieht ihn einmal ab, berücksichtigt vorhandene Einkaufspositionen und rundet zusätzliche Mengen auf Gebinde. Erst die Vorschau prüfen und ausdrücklich übernehmen; importierte und manuelle Positionen bleiben erhalten.
5. „Bestellungen“ beginnt mit dem Lieferanten, danach folgt der Liefertag. Zeiten und Hinweise lassen sich in der Einkaufsplanung festlegen. Vorbereitete Versionen bewahren den damaligen Inhalt. Eine Lieferantenbestellung wird nicht automatisch verschickt.
6. Lieferungen, Verbrauch, Rückgaben und Abfall ausdrücklich erfassen. Eine Bestellung ist keine Lieferung; Verkäufe buchen keinen angenommenen Verbrauch. Berechneter Bestand und tatsächliche Zählung bleiben getrennt.
7. Belege ergänzen, zuordnen und mit SharePoint-Originalen verknüpfen. Originaldaten bleiben geschützt; Korrekturen von Listenbelegen haben eine Historie. Die Auswertung zeigt erfasste Stückzahlen, Planvergleich und Teilsummen mit ihrem Umfang.

## Herkunft und Daten

`import/2026.json` ist die private, quellenbezogene Ausgangskopie. Die Originaldateien bleiben unverändert. Fehlende Portionen, Preise, Verkäufe und Belege werden nicht erfunden. Der Quellimport enthält Schema 1; neue lokale Vorgänge normalisieren auf Schema 2. Eine kontrollierte Cloud-Kopie muss vor der späteren Bereitstellung gesondert normalisiert werden.

Die Original-PDFs sind im Quellpaket nicht enthalten. Lokale Beleglinks funktionieren, wenn die Originale an ihren bisherigen Pfaden erreichbar sind. Markierte lokale Prüfdaten und `.local-state` werden nicht im Paket mitgeliefert und gehören nicht in den späteren Cloud-Import.

Der Produktions-Build enthält weder den privaten Import noch das lokale Dateilesemodul. Ohne tatsächliche Microsoft-Dienste verweigert er den Datenzugriff. Ein Produktions-Build allein erzeugt daher noch keine bedienbare Cloud-App.

## Technische Prüfung und Microsoft-Aufbau

```sh
npm test
npm run build
npm run build:server
```

Der Serverlauf benötigt Python 3 und .NET SDK 8.0.426 oder kompatibel. `KITCHEN_DOTNET` kann auf einen vorhandenen Compiler zeigen. [Bereitstellungsanleitung](docs/deployment.md), `server/deployment/registration.json` und der Prüfbericht beschreiben den echten API-/Rollen-/Transaktionsvertrag. Die Registrierungsspezifikation ist noch kein importierbares Power-Platform-Solution-ZIP.

Der Dataverse-Server prüft Leser/Bearbeiter über den tatsächlichen Aufrufer, Versionen und unveränderliche Wiederholungsbelege. Beide Bearbeiter erhalten vollständige Küchenbearbeitung. Der Datenbestand ist zunächst ein gemeinsames, auf 512 KiB begrenztes Dokument; parallele Änderungen können auch über Veranstaltungsgrenzen hinweg konfligieren. Größere oder feiner berechtigte Nutzung benötigt eine Weiterentwicklung dieses Speichermodells.

Lokale Prüfungen bestätigen Code und simulierte Speichergrenzen. Dataverse-Transaktionen, tatsächliche Rollen, App-Lizenzzuordnung, SharePoint-Verknüpfung und Teams-UI müssen nach der freigegebenen Einrichtung separat mit gewöhnlichen Benutzerkonten abgenommen werden. Die native Druck-/PDF-Vorschau ist ebenfalls noch nicht visuell abgenommen.
