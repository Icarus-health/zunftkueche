# Zunftküche – Planung und Küchenverwaltung

Stand 15.10.2026. Planung, Einkauf, Lieferungen, Bestand, Belege und Auswertung sind als zusammenhängende React-App umgesetzt und als private Power Apps Code App veröffentlicht. Die freigegebene Microsoft-Umgebung „Zunftküche“ enthält Dataverse, Küchentabellen, Schnittstellen, Schutzregistrierungen und die geprüfte Kopie der Daten von 2026 (EU/EFTA, zugeteilte Region Schweiz). Im Vorstand-Konto sind tatsächliches Laden, Speichern und erneutes Öffnen im Browser bestätigt. Die Nachkontrolle bestätigt Revision 2. Identische Wiederholung, Versionskonflikt und 24 unterstützte direkte Schreibschutzprüfungen wurden separat live nachgewiesen; zwei nicht verfügbare Standardtabellen-Sammellöschungen werden ausdrücklich nicht als ausgeführte Prüfungen gezählt. Die Freigabeansicht zeigt genau einen Besitzer und keine weiteren Empfänger. **Das zusätzliche persönliche Teams-Paket ist gebaut und unabhängig geprüft; Installation und echte Teams-Bedienprüfung warten noch auf die Upload-Freigabe.** Microsofts automatischer „Zu Teams hinzufügen“-Weg für Code Apps schlägt mit einem unvollständigen Teams-Paket fehl und wird derzeit nicht unterstützt. Aktueller Einrichtungsstand: docs/deployment-status-2026-10-15.json.

## Öffnen

[Veröffentlichte Zunftküche öffnen](https://apps.powerapps.com/play/e/5684204c-3254-ec15-93f4-276ec50cc65b/app/bfec495e-c223-4176-89a8-3e4d631337ae?tenantId=1dcbc0d3-e9b9-4622-bbd7-811ff1c1f7e9) und mit `Vorstand@Schelmenzunft.onmicrosoft.com` anmelden.

Für die eigenständige lokale Vorschau http://127.0.0.1:4173/ verwenden, nachdem der folgende Prozess gestartet wurde. Der Microsoft-Entwicklungsmodus ist separat für Port 4182 konfiguriert und benötigt den echten Microsoft-Hostkontext.

Für einen späteren Neustart in diesem Ordner:

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 4173 --strictPort
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

`import/2026.json` ist die private, quellenbezogene Ausgangskopie. Die Originaldateien bleiben unverändert. Fehlende Portionen, Preise, Verkäufe und Belege werden nicht erfunden. Der Quellimport enthält Schema 1; neue lokale Vorgänge normalisieren auf Schema 2. Die kontrollierte Cloud-Kopie wurde separat auf Schema 2 normalisiert; nur dort wurden absolute lokale Herkunftspfade entfernt. Original-Identitäten, Wirtschaftsdaten und die ursprüngliche lokale Kopie blieben erhalten.

Die Original-PDFs sind im Quellpaket nicht enthalten. Lokale Beleglinks funktionieren, wenn die Originale an ihren bisherigen Pfaden erreichbar sind. Markierte lokale Prüfdaten und `.local-state` werden nicht im Paket mitgeliefert und gehören nicht in den späteren Cloud-Import.

Der Produktions-Build enthält weder den privaten Import noch das lokale Dateilesemodul. Der vorhandene Microsoft-Bootstrap prüft die richtige Umgebung und verweigert bei fehlendem Hostkontext oder Datenverbindung den Zugriff. Ein Produktions-Build allein veröffentlicht keine Cloud-App.

## Technische Prüfung und Microsoft-Aufbau

```sh
npm test
npm run build
npm run build:server
```

Der Serverlauf benötigt Python 3 und .NET SDK 8.0.426 oder kompatibel. `KITCHEN_DOTNET` kann auf einen vorhandenen Compiler zeigen. [Bereitstellungsanleitung](docs/deployment.md), `server/deployment/registration.json` und der Prüfbericht beschreiben den echten API-/Rollen-/Transaktionsvertrag. Die Registrierungsspezifikation ist noch kein importierbares Power-Platform-Solution-ZIP.

Der Dataverse-Server prüft Leser/Bearbeiter über den tatsächlichen Aufrufer, Versionen und unveränderliche Wiederholungsbelege. Eine spätere Bearbeiterrolle würde vollständige Küchenbearbeitung erlauben; aktuell wird nur der genehmigte Vorstand-Zugang genutzt. Der Datenbestand ist zunächst ein gemeinsames, auf 512 KiB begrenztes Dokument; parallele Änderungen können auch über Veranstaltungsgrenzen hinweg konfligieren. Größere oder feiner berechtigte Nutzung benötigt eine Weiterentwicklung dieses Speichermodells.

Lokale Prüfungen bestätigen Code und simulierte Speichergrenzen. Erfolgreiches Speichern und Wiederholen mit dem Administrator beweist weder gewöhnliche Leser-/Bearbeiterrollen noch erzwungene Transaktionsrücknahme, Lizenz-Verbrauchszähler, SharePoint-Verknüpfung oder Teams-UI. Diese Grenzen bleiben getrennt dokumentiert. Die native Druck-/PDF-Vorschau ist ebenfalls noch nicht visuell abgenommen.
