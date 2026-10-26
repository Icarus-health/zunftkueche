# Zunftküche Arbeitsoberfläche

## Ausgangspunkt und Auswahl
Der Nutzer wählte am 26.10.2026 den ersten von zwei angezeigten Bildentwürfen. Visuelle Referenz: `/Users/sorenkube/Documents/Codex/2026-10-22/moin-so-wir-sind-da-ich-4/outputs/WW-Pruefung-2026-10-26/Entwurf-1.png`. Gewünscht sind eine professionelle Warenwirtschaft mit großer, einfacher Bedienung und die Weiterverwendung der bestehenden Teams-/SharePoint-App ohne Zusatzkosten. Die Excel ist Anschauungsmaterial und wird nicht importiert.

Die gewählte Richtung ist eine helle Arbeitsoberfläche mit zurückhaltend grünen Akzenten, linker Navigation und konkreten nächsten Aufgaben. Die andere gezeigte Richtung war eine stärker geführte Dienstansicht. Eine neue Plattform entfällt, weil die vorhandene SPFx-App bereits in Teams läuft.

## Umfang dieses Ausbaus
- Referenzgetreue Seitenleiste, klare Überschriften, echte Aufgaben statt Beispielzahlen, nächste Aktion und zuletzt gezählte Mengen.
- Einkauf mit Suche/Statusfilter, Bestellübersicht, vorhandenen Bestellformularen, Bestelltext und Vorjahresübernahme.
- Lieferung zu einer aufgegebenen Bestellung erfassen: Datum, Person, Teilmengen und Hinweis. Restmengen und Lieferstatus werden aus den Annahmen berechnet. Keine Bestellung und keine Rechnung erzeugt automatisch einen Warenzugang. Überlieferungen werden in dieser Fassung abgewiesen; Korrekturen nicht stillschweigend überschrieben.
- Bestandsbereich mit einer Zählliste, leeren gegenüber echten Nullmengen, Gebindeumrechnung, gespeicherten Entwürfen und ausdrücklichem Abschluss. Ungezählte Artikel bleiben offen; Teilzählungen werden als solche gekennzeichnet.
- Planung führt zur tatsächlichen Vorjahresübernahme. Auswertung zeigt nur belegte Bestell-/Liefermengen und Preisvollständigkeit; keine erfundenen Verkaufszahlen. Stammdaten bleiben unter Verwaltung erreichbar.
- Handyansicht mit erreichbarer Navigation und ohne abgeschnittene Aktionen. Echte Teams-Leiste gehört dem Host und wird nicht im Webpart nachgebaut.

## Technik und Daten
SPFx 1.23.2, bestehendes TypeScript und SCSS, Node 22, vorhandene Test- und Buildwerkzeuge. Keine neue Laufzeitplattform oder kostenpflichtigen Dienste. Vorhandene Lösung und Komponentenkennungen bleiben gleich. Neue Version 1.2.0.

Lieferannahmen hängen unveränderlich am Bestellkopf, damit konkurrierende Annahmen über dieselbe Versionskennung abgesichert sind. Bestellpositionen bleiben unverändert. Köpfe mit Lieferungen erhalten Umschlagschema 2; neue Leser unterstützen 1 und 2, ältere App-Versionen dürfen diese Daten nicht verlustbehaftet zurückschreiben. Ein Rückwechsel auf 1.1 nach Liefererfassung ist deshalb keine freigegebene Rückfallstrategie.

Eine zusätzliche app-eigene Liste `Inventuren` speichert vollständige Zählsitzungen. Fehlt sie, bleiben bisherige Daten lesbar, die Einrichtung ist eine ausdrückliche Aktion. Erst abgeschlossene Sitzungen fließen als Beobachtungen in die Bestandsanzeige ein. Bestehende Einzelmeldungen bleiben erhalten. Dies ist kein behaupteter lückenloser Echtzeitbestand: Zählzeitpunkt und Quelle bleiben sichtbar.

Speichern bleibt versionsgesichert und wird nachgelesen. Wiederholung nach unsicherer Antwort verwendet dieselben Kennungen und Zeitpunkte. Archivierte Saisons sind schreibgeschützt. Aus einer Vorjahreskopie werden keine Lieferannahmen übernommen. Fremde oder unbekannte Schemata werden nicht umgebaut.

## Prüfung und Freigabegrenze
Vorhandene Tests müssen grün bleiben. Zusätzliche Tests betreffen Teil-/Doppellieferungen, konkurrierende Erfassung, leere gegenüber Nullzählung, Entwurf/Abschluss, unsichere Antworten und Archivschutz. Lokale Browserprüfung erfolgt mit künstlichen Daten und demselben Produktionscode. Bildvergleich gegen die gewählte Referenz, zusätzliche schmale Ansicht und Konsolenprüfung sind Teil der Abnahme.

Zunächst lokal prüfbare Fassung und aktualisiertes App-Paket erstellen. Eine Veröffentlichung und neue Microsoft-Anmeldeberechtigungen sind getrennte Schritte; sie werden nicht als bereits erfolgt dargestellt. SumUp-Anbindung, Rezepturplanung, Retouren und Umlagerungen werden durch diesen Ausbau nicht als fertig behauptet.
