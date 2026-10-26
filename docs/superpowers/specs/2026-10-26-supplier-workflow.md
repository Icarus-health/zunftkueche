# Gemeinsame Lieferantenbestellung

Freigabe: Der Nutzer hat nach dem vollständigen Usability-Bericht ausdrücklich die Fertigstellung beauftragt. Der Bericht vom 26.10.2026 ist die fachliche Grundlage.

## Auswahl und Umfang
Bestehende SPFx/SharePoint-App erweitern, vorhandene Matrix zum zentralen Bestellformular machen. Ein zusätzliches ERP oder eine neue Plattform würde Pflege und Kosten erhöhen; reine Menüumbenennung löst die getrennten Bestellvorgänge nicht. Keine kostenpflichtigen Dienste, keine zusätzlichen Berechtigungen, keine Löschung oder automatische Zusammenführung alter Vorgänge.

Eine Lieferantenbestellung enthält flexible tatsächliche Lieferdaten mit Ort/Zeit und Mengen pro Position/Termin. Gesamtmengen und Nettokosten bleiben aus den Positionen ableitbar. Lieferannahmen beziehen sich auf einen dieser Termine. Bestellte Vorgänge bleiben unveränderlich, nachträgliche Ergänzungen sind verknüpfte Nachbestellungen. Vorjahresübernahme nimmt eine vollständige Lieferantenbestellung inklusive Aufteilung, bestätigt neue Daten ausdrücklich, aktualisiert Preise und übernimmt keine Lieferungen/Bestellstatus. Alte Einzelbestellungen bleiben lesbar und einzeln übernehmbar.

Eine echte PDF-Datei mit Lieferant, Kundennummer, Bereich, Lieferorten, Lieferdaten, Artikelnummern, Gebinden und Mengen/Gesamtsummen wird lokal im Browser erstellt. Interne Rezept- und Reservierungsvermerke gelangen nicht in den Bestellschein. PDF-Erstellung ist kein Bestellversand und markiert keine Bestellung als abgegeben.

Navigation: Übersicht, Bestellungen, Speisen & Getränke, Bestand, Auswertung. Kleine Einstellungen behalten Saison, Stammdaten, Vorlagen und optionale Konfiguration erreichbar. Preise/Absprachen/Lieferant direkt aus dem Bestellkontext, Rechnung zur Bestellung. Importoptionen am fachlichen Einsatzort. Zunft-CI und große Klickflächen erhalten; horizontale Matrix ist explizit scrollbar.

Gericht: Zutaten direkt ergänzen, sofortige Kalkulation, Versionen historisch erhalten. Portionsplan führt direkt in eine prüfbare Bedarfsübernahme. Ergänzung einer ausdrücklich gewählten passenden Entwurfsbestellung; Herkunft und bereits übernommene Mengen sind gespeichert. Wiederholung desselben Plans ersetzt dessen Beitrag statt ihn erneut zu addieren. Manuelle Zusatzmengen bleiben erhalten. Vorhandene Ware wird nicht still oder mehrfach reserviert; bestätigte Anrechnungen anderer Pläne werden abgezogen.

Eine gemeinsame Zählliste enthält Menge, Einschätzung und Hinweis. Leeres Feld und Null bleiben verschieden; gezählte und berechnete Mengen werden erklärt. Lieferannahme mit Termin und „Alles wie bestellt“. Rechnungszuordnung im passenden Lieferanten-/Bereichskontext; Importe behalten Prüfung, aber technische Optionen werden eingeklappt und gespeicherte Profile dürfen den sichtbar ausgewählten Datentyp nicht übersteuern.

## Technik und Grenzen
SPFx 1.23.2, TypeScript/SCSS, vorhandene Tests und Infrastruktur, Version 1.4.0. Keine neue Laufzeitplattform. Erweiterte Bestellköpfe und Positionen erhalten Schema 3, damit alte Clients sie ablehnen statt Termine zu verlieren. Neue Leser unterstützen Schema 1/2/3. ETag, stabile Wiederholungskennungen, Nachlesen und Archivschutz erhalten. Saison-/Bereichstrennung beibehalten. Ein Rezeptpreis ist eine Kalkulation, kein behaupteter buchhalterischer Deckungsbeitrag. Rechnung ergibt keinen Restbestand.

## Abnahme
Vorjahr → neue Daten → zusätzliches Gericht → Bedarf in dieselbe Lieferantenbestellung → genau eine PDF mit mehreren Lieferdaten → dokumentierte Abgabe → Teillieferung pro Termin → Restzählung. Tests für Summen, doppelte Übernahme, Datumsprüfung, alte Daten, konkurrierende Speicherung und Termin-Restmengen. Browserprüfung mit künstlichen Daten auf schmaler und großer Fläche, Produktionspaket erstellen. Cloud-Veröffentlichung und tatsächliche Teams-Prüfung getrennt vom lokalen Erfolg belegen.
