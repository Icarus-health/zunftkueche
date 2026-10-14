# Zunftküche – vorläufige UI-Prüfung

final result: blocked

Die lokale Desktopprüfung ist dokumentiert. Die endgültige Abnahme der beauftragten Microsoft-/Teams-App ist offen: Umgebung und Veröffentlichung fehlen, die konkrete Gruppenzuordnung wartet auf Bestätigung und der Mac ist inzwischen gesperrt. Eine native Teams- und weitere Mobilprüfung konnte daher nicht abgeschlossen werden. Dieser Bericht erklärt die lokale Arbeitsversion nicht zur fertigen App.

## Referenz und Nachweise
- Source Startseite: `/Users/sorenkube/.codex/generated_images/01a13a0f-6afa-7682-8e22-2c6fb92f8ac7/exec-04b72744-afa7-412c-9acb-ae95c5e387f1.png`
- Source Bestellung: `/Users/sorenkube/.codex/generated_images/01a13a0f-6afa-7682-8e22-2c6fb92f8ac7/exec-db112b95-b9fb-43a8-9da9-0185624f5736.png`
- Umsetzung: `http://127.0.0.1:4182/`, `qa/home-final.jpg`, `qa/order-final.jpg`.
- Source 1487×1058 Pixel; reine Appfläche bei (74,55) auf 1413×1003 ausgeschnitten. Generierter Teams-Rahmen entfernt, da er vom echten Host geliefert werden muss.
- Browser-CSS-Viewport 1413×1003, Screenshot 1413×1003; Vergleich als 2826×1003 mit Referenz links und Umsetzung rechts, identische Geometrie. JPEG-Kompression des Browsercaptures schränkt eine Bewertung der Raster-Schärfe ein; im Produkt sind die Icons Vektoren aus Phosphor.
- Zustände: Startseite 2026; Bestellung Wiggenhauser/Freitag, ohne Preise, 10 Positionen, 17/19 Uhr; keine Lieferantenkommunikation.
- Full-view-Vergleiche: `qa/home-comparison-final.jpg`, `qa/order-comparison-final.jpg`, beide geöffnet und verglichen. Die Tabellenzahlen/Zeiten wurden zusätzlich im sichtbaren DOM gelesen; die zentrale Mengen-Zeile wurde vor/nach Neuladen geprüft.

## Iterationen
1. Startseite: [P2] Hierarchie und Schriftgröße gegenüber der Referenz zu klein. H1 auf 38 px, Abschnittstitel 27 px und Hauptaktion vergrößert; Lieferanten-/Aufgabenzeilen angepasst. Neuer Capture `home-final.jpg` im gemeinsamen Vergleich geprüft.
2. Bestellung: [P2] Zusätzliche Rahmen, Quelltextzeilen und große Abstände verschoben die 19-Uhr-Positionen unter den sichtbaren Bereich. Quellinformationen in Planung/Tooltip erhalten, überflüssige Wiederholung reduziert, Reihen/Unterleiste verdichtet. Finale DOM-Messung: erste Gruppe y=370/h=376, zweite y=758/h=115, Aktionen y=919/h=84 bei Viewporthöhe 1003. Beide Liefergruppen und Aktionen sichtbar; Capture `order-final.jpg` geprüft.

## Fünf Flächen
- Typografie: helle, klare Hierarchie, systemnahe Sans-Serif-Fallbacks; Source-Font nicht als reale Schriftdatei gegeben. Kleine optische Font-/Iconunterschiede bleiben P3.
- Abstände: eigene linke Navigation, zwei Hauptspalten und klare Teal-Aktion entsprechen der akzeptierten Richtung. Bestellung hat zusätzlich echte Versionsansicht und allgemeine Liefertage; diese funktionalen Ergänzungen sind beabsichtigt.
- Farben: Petrol #09645f, Mint #e2f4f0, Ink #101c30, Weiß und zurückhaltender Amber-Status; keine erfundenen Fotos oder dekorativen Ersatzgrafiken.
- Assets: Standardicons aus Phosphor; kein handgezeichneter Teams-Rahmen, kein abgeflachtes UI-Bild statt echter Bedienung.
- Inhalte: echte Planmengen/Belegbeträge mit Herkunft, offene Preise/Portionsgrößen/Datum, Versand offen. Datensatz steht ausdrücklich auf 2026 und lokale Arbeitsversion; keine ungeprüften Verkäufe als Ist-Werte.

## Bedienung und Zuverlässigkeit
Im Browser geprüft: Lieferantenpfad, Menge speichern/neuladen/wiederherstellen, 10 Positionen in Vorschau, Freitag/Samstag-Vergleich, Belegsumme mit Umfangshinweis, offene Speicherung bei Verbindungsabbruch/Navigation, Retry mit gleicher ID, anschließendes leeres Formular und genau eine deutlich markierte Testzeile. Gezielter Serverstopp verursachte erwartete Netzwerkfehler; vor diesem Test waren keine Konsolenwarnungen/-fehler sichtbar. Nach dem gesperrten Mac war eine abschließende neue Konsolen-/Mobilaufnahme nicht mehr möglich; diese ist Teil der offenen Abnahme.

22 automatisierte Prüfungen und Produktions-Build grün. Private Importdaten, Anmeldedaten und lokales Dateilesemodul sind nicht in öffentlichen App-Assets. Produktionsdatenzugriff ist bis zur echten Microsoft-Verbindung gesperrt.

## Verbleibende Abnahme
Entsperren und Gruppenfreigabe; Dataverse/SharePoint/Power Apps/Teams tatsächlich verbinden, Bearbeiter/Leser am Server testen, anschließend am echten Zielsystem UI/UX und Mobilansicht prüfen. Englische Netzwerkfehlermeldung bei Plattformanbindung sprachlich vereinheitlichen. Bestehende lokale Testdaten nicht nach Microsoft importieren.
