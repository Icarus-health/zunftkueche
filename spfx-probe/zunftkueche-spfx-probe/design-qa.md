# Zunftküche 1.3 – Nachweis vom 26.10.2026

## Stand

Bestehende SPFx-App erweitert, gleicher Solution-/Webpart-Schlüssel, lokale Produktionsfassung. Keine Veröffentlichung, Datenübernahme oder Berechtigungsänderung im Microsoft-Mandanten. Lokale Vorschau mit ausdrücklich künstlichen Beispieldaten auf 127.0.0.1:53429. Der neue Vorschau-Speicherbereich lässt den alten 1.2-Bereich bestehen.

## Fachliche und technische Prüfung

109 automatisierte Tests einschließlich bestehender Artikel-/Lieferanten-/Bestell-/Inventurabläufe. Neue Regeln für Termine, Preisstände, Rezepte, Nachfrage, Lieferungen, Bewegungen, CSV/XLSX, Belege, Importsperren, Korrekturen und Export. Produktionsbau inklusive Lint und Paketierung ohne Fehler/Warnungen.

Eine unabhängige Gesamtprüfung fand drei wichtige Fälle, alle mit fehlschlagendem Regressionstest vor der Korrektur geprüft:

1. Registrierter, noch unbestätigter Import ist nach Neuladen über **Übernahme fortsetzen** abschließbar.
2. Explizit stornierte negative Zeilen werden nicht als Erstattungen gezählt.
3. Bestätigte Preise behalten eine Signatur ihrer Lieferartikel-/Gebindeidentität. Änderung durch einen alten Client wird bei Preisverwendung abgelehnt; die neue Oberfläche verlangt dafür ein neues Lieferangebot.

Weitere behobene Grenzfälle: Objektfeld-Reihenfolge darf eine erfolgreich gespeicherte Bestellung nicht fälschlich als unbestätigt melden; mehrere Verkaufszeilen ohne externe Belegnummer müssen jede ihre Zutaten verbrauchen; Originaldatei muss vor/nach Upload denselben SHA-256 haben; Konflikte/Überlappungen bleiben bei gleichzeitiger Verarbeitung gesperrt; bestehende Journal-Daten bleiben nach Stammdaten-CSV-Import geladen.

## Sichtbarer Browserablauf

- Ordersatz mit zwei vorhandenen Lieferterminen → getrennte datierte Bestellentwürfe; nach Neuladen vorhanden.
- Excel-Preisliste (.xlsx) → Blatt wählen → Code-/Netto-/Pfandspalten zuordnen → Liefergebinde prüfen → neuen Preisstand 9,50 Euro je 12er-Kiste bestätigen. Vorhandene Bestellpreise blieben 8,50 Euro.
- Portionsplan für 150 Stück → 30 Flaschen Bruttobedarf → ausdrücklich 10 Flaschen anrechnen → 2 volle Kisten zu je 9,50 Euro, Bestellentwurf 19 Euro. Bestellung dokumentieren → eine Kiste annehmen → eine Kiste weiterhin offen; Lieferhistorie erhalten.
- Text-PDF → Belegnummer, Datum, Netto/Steuer/Brutto vorgeschlagen → Position manuell geprüft → Original und bestätigte Rechnung gespeichert und nachgelesen. Keine zusätzliche Bestandsbewegung aus Rechnung.
- Herstellerneutraler Kassen-CSV → Spalten/Produkt zuordnen → 30 aktive Verkäufe und eine Erstattung prüfen → bestätigen → Bericht zeigt Absatz29, Bruttoumsatz58 EUR und Rezeptverbrauch6 Flaschen. Erstattung bucht keine Zutaten zurück.
- Korrigierte Systemimporte, Fortsetzung nach Abbruch, Bestell-/Rechnungsabweichungen und Lagerorte zusätzlich über Domänen-/Speicher-/UI-Tests nachgewiesen.
- Alle acht vorhandenen PDF-Originale (11 Seiten) mit derselben lokalen PDF.js-Version read-only lesbar. Nur Dateinamen/Seitenzahl/Lesbarkeit protokolliert, keine Originalinhalte in Test-Repository kopiert.

## Oberfläche und CI

Original-Zunftlogo, lokales Montserrat, Hauptblau #3f4695, Text #20234b und weiße Flächen. Sechs Hauptbereiche bleiben erhalten. Zusätzliche Einkaufsthemen erscheinen als Unterbereich. Formularfelder und Schaltflächen sind groß; Daten-/Statusunterschiede haben Textlabels.

Browserbreite730px und echte iframe-Breite390px geprüft. Bei390px Dokumentbreite und Inhaltsbreite jeweils390px, kein horizontaler Seitenüberlauf. Hauptnavigation scrollt bei Bedarf horizontal; Mengenmatrix hat eigenen Scrollbereich (316px sichtbar,645px Tabelleninhalt). Sichtbare Schaltflächen in dieser Ansicht sind52/56/66px hoch. Console nach den Hauptabläufen ohne erfasste Fehler/Warnungen. Temporäre Prüfansicht geschlossen, Hauptvorschau bleibt geöffnet.

Bildbelege liegen im Aufgabenordner unter outputs/Zunftkueche-v1.3: Heute, Auswertung, gespeicherter Excel-Preisstand und390px-Ansichten. Die Bilder sind lokale Vorschau, keine Teams-Abnahme.

## Verbleibende Grenzen

- Noch keine Veröffentlichung und keine erneute Abnahme der Fassung1.3 in Teams mit zwei Vereinskonten. Das fertige Paket ist der nächste konkrete Prüfschritt.
- Kein Originalexport des tatsächlich eingesetzten Kassen-/Menüsystems vorhanden; herstellerneutraler Dateiablauf mit nachvollziehbaren synthetischen Dateien geprüft.
- PDF-Positionszeilen werden manuell am Original erfasst. Mehrdeutige Kopf-/Summenwerte bleiben offen; kein bezahlter OCR-Dienst.
- Bedarf verwendet ausdrückliche Anrechnungen, keine globale Lagerreservierung. Keine separate Produktionsbuchung, Mengenstaffelpreise oder vollständige Pfandabrechnung.
- CSV/JSON sind Datenexporte. JSON enthält keine Original-PDF-Bytes; vollständiges Backup/Wiederherstellung bleibt eine eigene Betriebsaufgabe. Alte Dataverse-Restore-Tools gelten nicht für das SPFx-Journal.
