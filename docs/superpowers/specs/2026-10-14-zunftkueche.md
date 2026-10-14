# Zunftküche – vereinbarter Aufbau

Stand: 14.10.2026. Der Nutzer hat den Aufbau der App und anschließende UI/UX-Prüfung ausdrücklich beauftragt.

## Zweck
Eine kleine, zuverlässige Küchenverwaltung für die Zunftabende: planen, bestellen, Lieferungen und Restmengen erfassen, Belege zuordnen und Speisen/Getränke nach dem Abend auswerten. Sören und eine Vertretung bearbeiten; der Säckelmeister liest Auswertungen. Helfer benötigen druckbare Anleitungen, keine laufende Kassenerfassung.

## Plattform und Zugriff
Power Apps in der bestehenden Microsoft-Umgebung; Dataverse für strukturierte Daten, SharePoint für Originalbelege, bestehender Teams-Kanal „Küche Zunftabend“ als Einstieg. Keine zusätzliche kostenpflichtige Subscription oder Azure-Abrechnung. Zunächst nur der vorhandene Administrator; weitere Personen erst mit konkreter Identität und serverseitiger Rolle. Eigene unverwaltete Umgebung in EU/EFTA. Moderne Code-App als Implementierungsweg, sofern die tatsächliche Plattformintegration funktioniert. Keine Offline-Startgarantie in Teams: unterbrochene Schreibvorgänge bleiben sichtbar offen und dürfen keinen Erfolg vortäuschen.

## Oberfläche
Helle Arbeitsfläche, Petrol als Hauptfarbe, mintfarbene aktive Zustände, dunkler gut lesbarer Text. Referenzen sind die zuletzt akzeptierten Start- und Bestellansichten. Nur app-eigene Navigation umsetzen: Übersicht, Planung, Bestellungen, Lieferungen, Belege, Auswertung. Teams liefert seine eigene äußere Oberfläche.

Start: Ereignis und Jahr, nächste konkrete Aufgaben, Lieferanten, Planung öffnen. Planung: Freitag/Samstag nebeneinander, Mengen mit Einheit, Detailzeiten und Herkunft. Bestellung: Lieferant zuerst, danach Liefertag; Zeiten gruppieren, Mengen bearbeiten, Vorschau und unveränderliche vorbereitete Bestellversion. Kein automatischer Versand an Lieferanten.

## Daten und Zuverlässigkeit
Veranstaltung → Tage → Planpositionen. Lieferanten, Artikel und Mengeneinheiten bilden den gemeinsamen Kern. Speisen mit Verkaufspreisen und zunächst unbestätigten Rezepturen. Bestellversionen referenzieren Planpositionen; tatsächliche Lieferungen, Bestände, Verbrauch, Abfall und Verkäufe sind separate Datensätze. Belege und Belegpositionen haben Zuordnung, Brutto/Netto-Steuerstatus und Originalquelle. Auswertungen zeigen ihren erfassten Umfang und offene Angaben.

Jeder importierte Datensatz trägt Datei, Blatt/Seite/Zeile und Quellenhash. Fehlender Wert ist null, niemals automatisch 0. Bestellmenge ist keine Lieferung und kein Verkauf. Negative Mengen ablehnen; explizite 0 darf gespeichert werden. Geldbeträge in Cent, Mengendarstellung deutsch. Keine hardcodierten privaten Originaldaten in öffentlich abrufbaren App-Assets. Jede Speicherung erhält eine eindeutige Vorgangs-ID; wiederholte Übermittlung darf nicht doppelt buchen. Paralleländerungen dürfen sich nicht unbemerkt überschreiben. Keine Originaldatei löschen oder ändern.

## 2026 – bestätigte Ausgangsdaten
Quelle: Zunftabende_Bestellung_2026.xlsx, Originalbestellungen. 76 Eingabepositionen, 14 Blätter. Kalenderdaten ungeklärt, nur Wochentage übernehmen. Wiggen Freitag: 200 Bockwürste, 50 Bauernwürste, 10 kg Hinterschinken (10×1 kg), 50 Portionen Schweinerei, 30 kg Wurstsalat, 25 kg Kartoffelsalat, 50 Portionen Schäufele, 30 vegetarische Frikadellen um 17 Uhr; 6 Gemüsetorten und 8 Schinkentorten um 19 Uhr. Samstag u.a. 150 Bockwürste, 50 Bauernwürste, 20 kg Wurstsalat, 25 kg Kartoffelsalat, 50 Portionen Schweinerei, 50 Portionen Schäufele, 60 vegetarische Frikadellen (30+30), 10 kg Schweinebraten. Gouda 40/20 kg und Faller-Baguettes 270/200 Stück.

Verkaufspreise laut 2026-Preisliste: Wurst/Brot 5 €, Wurst/Kartoffelsalat 8 €, Schäufele/Kartoffelsalat 10 €, Wurstsalat/Brot 8 €, vegetarisches Brötchen 5,50 €, Käsewürfel 6,50 €. Portionsgewichte fehlen. Originalrechnungen Getränke und METRO vorhanden; Fleisch, Backwaren und REWE unvollständig. Bekannte Teilkosten sind kein gesamter Wareneinsatz und kein Gewinn. Geschätzte Erlöse und qualitative Restnotizen separat markieren, nicht als verkaufte Stückzahlen importieren.

## Abnahme
Echte Anmeldung, serverseitiges Speichern/Neuladen, deutsche Mengeneingabe, explizite Null/0-Unterscheidung, Bestellung mit 10 Freitagpositionen/korrekten Zeiten, unveränderte vorbereitete Version nach Planänderung, Erfassung ohne Doppelbuchung, Konfliktanzeige, nachvollziehbare Teilauswertung. Anschließend sichtbare UI-Prüfung im tatsächlichen Player und Teams; Leserzugriff separat prüfen, wenn die konkrete Person benannt ist.
