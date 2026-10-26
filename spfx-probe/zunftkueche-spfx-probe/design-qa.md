# Design- und Bedienprüfung – Zunftküche 1.2.0

Stand: 26.10.2026. Lokal geprüfte SPFx-Fassung; kein Nachweis einer Veröffentlichung oder einer Teams-Abnahme dieser neuen Version.

## Vergleich und Belege

- Visuelle Referenz: `outputs/WW-Pruefung-2026-10-26/Entwurf-1.png` im gemeinsamen Aufgabenordner. Dies ist der erste gezeigte, vom Nutzer gewählte Entwurf.
- Browsergerenderte Umsetzung: `outputs/Zunftkueche-v1.2/01-Heute-Desktop.jpg`.
- Quelle und Umsetzung: beide 1487 × 1058 Pixel. Umsetzung bei 1487 × 1058 CSS-Pixeln, Dichte 1. Beide Bilder werden in der Vergleichsansicht gleich skaliert; keine unterschiedliche Dichten-Normalisierung.
- Zustand: helle Startseite, Küche, Saison 2027, künstliche Beispieldaten. Die Umsetzung zeigt nach den Funktionstests einen gespeicherten Entwurf und aktualisierte Bestandsbeobachtungen. Die Referenz zeigt statische Startdaten. Abweichende Mengen und Aufgabenbeschriftungen sind daher keine visuellen Fehler.
- Kombinierte Gesamtvergleiche: `Vergleich-01.jpg`, `Vergleich-02.jpg`, abschließend `Vergleich-04-Gesamt.jpg` im gleichen Ausgabeordner.
- Kombinierter Detailvergleich in Originalbildgröße mit gleichem Bildausschnitt: `Vergleich-03-Details.jpg`. Prüft Aufgabenüberschriften, Mengentexte, Abstände, Status und Aktionen lesbar nebeneinander.
- Weitere Funktionsbelege: `02-Teillieferung.jpg`, `03-Zaehlliste.jpg`, `04-Schmale-Ansicht.jpg`.

## Vergleichshistorie und behobene Befunde

1. [P2, behoben] Erste Umsetzung hatte gegenüber der Referenz zu kleine Schriften und zu wenig Gewicht für die Hauptaktion. Sidebar, Überschrift, Unterzeile, Abschnittsüberschriften und Aktionsfläche vergrößert. Spaltenaufbau und Hauptaktion im zweiten Gesamtvergleich erneut geprüft.
2. [P2, behoben] Verwaltung stand zu weit oben und Statusflächen erbten unbeabsichtigt Warnkasten-Abstände. Navigation am unteren Rand angeordnet und Warnkasten-Regel auf tatsächliche Warnabschnitte eingeschränkt. Nachweis: Vergleich-02 und abschließende Gesamt-/Detailvergleiche.
3. [P2, behoben, unabhängige Codeprüfung] Abschluss eines alten Zählentwurfs konnte neuere Mengenbeobachtungen überdecken. Jede Menge behält nun Person und Erfassungszeit; unveränderte Entwürfe erhalten beim Abschluss keinen künstlich neuen Mengenzeitpunkt. Für ältere Datensätze ohne Zeilenzeitpunkt dient konservativ der Sitzungsbeginn als Zeitpunkt. Erneute Eingabe, auch desselben Werts, gilt als neue Beobachtung. Regressionstest zunächst fehlgeschlagen, dann erfolgreich.
4. [P2, behoben, unabhängige Codeprüfung] Die 101. Lieferannahme konnte gespeichert werden und anschließend das Lesen verhindern. Vollständige Historie wird jetzt vor dem Schreiben geprüft; Abweisung lässt den alten Stand lesbar. Regressionstest zunächst fehlgeschlagen, dann erfolgreich.
5. [P3, behoben] Neuer Zählvorgang erbte unsichtbar den Suchfilter der Bestandsseite. Filter wird zurückgesetzt.
6. [Bedienverbesserung] Artikel ohne eigenes Gebinde erhalten nur ein sichtbares Mengenfeld. Dezimalmengen und bestehende Werte bleiben erhalten. Kontextauswahl und Einschätzung auf mindestens 44 px Mindesthöhe angehoben; Mengeneingaben 60 px.

## Fünf geprüfte Gestaltungsflächen

- **Typografie:** klare große Überschrift, deutlich getrennte Aufgaben- und Hilfstexte, Systemschrift Segoe UI mit System-Fallback, semibold für Navigation und Mengen. Die generierte Referenz benennt keine exakte Schriftdatei. Der gewählte Systemschriftzug ist eine akzeptierte Annäherung. Keine abgeschnittenen Hauptaktionen im Desktop-Vergleich.
- **Abstände und Aufbau:** helle Seitenleiste, grüner aktiver Bereich, breite Hauptaktion, Aufgaben links und Bestände rechts, Verwaltung unten. Bei schmaler Fläche wechseln Inhalte in eine Spalte und Navigation in eine eigene horizontal scrollbare Leiste. Keine seitlich überlaufende Dokumentfläche bei 390 px.
- **Farben:** dunkles Grün für Aktionen, fast weiße mintfarbene Seitenleiste, dunkle Schrift, dezente Trenner. Gelb/Blau/Grün semantisch für Prüfung, Überhang und erfasste Daten. Status ist zusätzlich lesbar beschriftet.
- **Bild- und Iconqualität:** keine neu erzeugten Rasterbilder in der App. Echte vorhandene Fluent-UI-MDL2-Iconfont-Dateien lokal gebündelt; zugehöriger Lizenzhinweis vorhanden. Die Bibliotheksicons sind etwas kleiner und feiner als in der generierten Vorlage (P3, akzeptiert). Die Microsoft-Leiste wird in der Produktion nicht nachgebaut; die Vorschau zeigt stattdessen einen eigenen deutlich beschrifteten Vorschaurahmen.
- **Texte und Inhalte:** tatsächliche Arbeitsabläufe statt Platzhalterdaten in der Produktoberfläche. „Gezählt“ behauptet keine prognostizierte Versorgung. Mengen stehen in Artikel-Basiseinheiten. Beispielangaben existieren ausschließlich im künstlichen lokalen Provider. SumUp-Verkäufe oder Rezepturverbrauch werden nicht als vorhanden dargestellt.

## Funktion und Zuverlässigkeit

57/57 lokale Tests erfolgreich. Produktionsbuild einschließlich Paketierung erfolgreich, keine Buildwarnungen/-fehler. Bestehende 33 Tests sind enthalten. Zusätzliche Prüfungen betreffen Teil-/Über-/Doppellieferungen, konkurrierende Speicherung, unveränderte Historie bei Kopie und Nachbestellung, Wiederholung nach verlorener Antwort, Schema-Schutz vor älteren Clients, optionale Liste, echte Berechtigungsfehler, Entwurf/Abschluss, Null/Leer, Gebindeumrechnung und Beobachtungszeitpunkte.

Im Browser bedient:

- Teillieferung 3 von 8 Kisten; Bestellmenge unverändert, Rest 5; nach Neuladen weiterhin vorhanden, Historie einmalig.
- Zählliste mit 2 Kisten plus 3 Flaschen = 27; 0 kg als tatsächlicher Nullbestand; dritter Artikel leer.
- Entwurf speichern, Seite neu laden, fortsetzen; Werte und ursprüngliche Erfassungszeit bleiben erhalten.
- Teilzählung explizit bestätigen; nur gezählte Artikel aktualisieren die Beobachtungsanzeige, zuvor gezählter ungeprüfter Artikel behält alten Zeitstempel.
- Vorjahr auswählen, Wasser von 8 auf 10 Kisten anpassen, als neuen Entwurf speichern; aktuelle Preise und Liefertermin leer, Vorjahrspreise sichtbar, ursprünglicher Bestellstatus nicht übernommen.
- Gleicher Produktionscode in 390 × 844 px breitem Prüfframe: Navigation erreichbar, 390 px Dokumentbreite ohne horizontalen Überlauf; Zählentwurf erfolgreich gespeichert. Dies ist ein Responsive-Browsertest, keine native Teams-Mobilgeräte-Abnahme.
- Browserkonsole: keine Warnungen/Fehler während der geprüften Abläufe.

## Grenzen und Übergabe

Keine produktiven SharePoint-Schreibvorgänge, kein Excel-Import, keine neuen Microsoft-Rechte, kein GitHub-Push. SPFx-Paket bleibt auf derselben Lösung/Komponente. Vor produktivem Einsatz muss das Paket im bestehenden App-Katalog aktualisiert, die zusätzliche app-eigene Inventuren-Liste über die ausdrückliche Aktion eingerichtet und die neue Version direkt in der vorhandenen Teams-Registerkarte geprüft werden.

Offene Funktionserweiterungen: Rezepturen, automatische Bestandsbewegungen aus Verkäufen, SumUp-Import, Retouren/Umlagerungen und Pfandabrechnung. Kein Versprechen eines lückenlosen Echtzeitbestands. Nach erster Lieferannahme ist 1.1 wegen Schema-2-Bestellköpfen keine geeignete Rückfallversion.

## Implementierungscheckliste

- [x] Ausgewählten Entwurf im bestehenden Projekt umgesetzt.
- [x] Wichtige visuelle Befunde behoben und neu verglichen.
- [x] Reale Hauptabläufe lokal bedient und nachgelesen.
- [x] Unabhängige Codeprüfung ausgewertet; beide P2 korrigiert und regressionsgeprüft.
- [x] Tests, Build und Paketierung erfolgreich.
- [x] Keine offenen P0/P1/P2-Befunde im lokal geprüften Umfang.
- [ ] Separater nächster Schritt: Veröffentlichung und Abnahme direkt in Teams.

final result: passed
