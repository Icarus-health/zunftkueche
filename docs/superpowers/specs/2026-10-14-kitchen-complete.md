# Nutzbare Zunftküche – Ausbau

Der Nutzer beauftragt den weiteren Code-Aufbau und wiederholte gegenseitige Agentenprüfungen. Die bestehende React-Code-App bleibt erhalten. Kein erneuter Design-Freigabezyklus: die zuvor besprochene Richtung ist beauftragt.

## Ziel
Ein durchgängiger, bedienbarer Küchenkreislauf: Veranstaltung wählen oder neues Jahr starten, Stammdaten pflegen, Speisen Freitag/Samstag planen, bestätigte Rezepturen in Einkaufsbedarf übersetzen, vorhandenen Anfangsbestand und Gebinde berücksichtigen, Bestellungen gezielt übernehmen, Lieferungen/Rückgaben/Abfall zählen, Rechnungen ergänzen und Abschlusserfassung auswerten.

## Regeln
- Bestehende 2026-Quellen weder verändern noch löschen. Keine erfundenen Portionen, Verkäufe, Bestände oder Rechnungen.
- Leere Werte bleiben null; ausdrücklich 0 bleibt 0. Entwurfsrezepturen erzeugen keinen behaupteten vollständigen Bedarf.
- Einkaufspreise netto je Einheit mit vier Euro-Nachkommastellen; Geldsummen einmal auf Cent runden. Verkaufspreise/Belegsummen ganzzahlige Cent.
- Anfangsbestand wird ausdrücklich erfasst. Bestellungen, Lieferungen, Verbräuche und Verkäufe sind getrennt. Bestandsrechnung darf keinen unbekannten Anfangsbestand als 0 behandeln.
- Einkaufsbedarf zuerst zeigen; nur explizites Übernehmen aktualisiert automatisch abgeleitete Planzeilen. Importierte/manuelle Positionen niemals automatisch überschreiben. Gebindegröße ist Artikel-Einheit pro Gebinde, keine behauptete Umrechnung unbekannter Einheiten.
- Neues Jahr übernimmt Stammdaten und bestätigte/Entwurfsrezepturen, optional alte Einkaufsplanung, jedoch keine Verkäufe, Lieferungen, Rechnungen oder Bestellversionen. Vorherige Veranstaltungen vollständig weiter auswählbar.
- Belege erfassen mit Lieferant, Nummer, Zuordnung, Datum, Brutto/Netto, optional Positionen und SharePoint-Original. Lieferanten-Nummern-Duplikate werden abgewiesen. Keine automatische Preisbestätigung aus einer Rechnung.
- Kein automatischer Versand, kein Cloud-Publish und keine Umgehung der offenen Microsoft-Zugriffsgruppenfreigabe. Produktive Microsoft-Speicherung benötigt echte serverseitige Rollen und Konflikt-/Wiederholungsbehandlung.
- Bestehende helle Petrol/Mint-Oberfläche, Lieferant vor Liefertag, Freitag/Samstag nebeneinander. Verständliche Fehlermeldungen, sinnvolle Leerzustände, Tastaturbedienung und mobile Navigation.

## Abnahme
Fachtests für Bedarfsaggregation, fehlende Rezepturen/Anfangsbestände, Gebinderundung, präzise Preise, manuelle vs. abgeleitete Bestellpositionen, Ereigniswechsel, Belegvalidierung und Wiederholungs-/Konfliktsicherheit. Tatsächliche Browserprüfung der neuen Formulare und eines Speise→Bedarf→Bestellung→Lieferung→Beleg→Auswertung-Durchlaufs mit ausschließlich markierten Testdaten. Unabhängiger Task-Review und abschließender Review, Befunde nachprüfen. Microsoft-Livestatus getrennt dokumentieren.
