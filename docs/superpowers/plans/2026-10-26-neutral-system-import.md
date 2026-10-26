# Herstellerneutraler Systemimport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CSV- und Excel-Dateien verschiedener Kassen- und Menübestellsysteme über denselben geprüften Importablauf verarbeiten.

**Architecture:** Dateilesen, fachliche Zuordnung und Bestätigung bleiben getrennt. Der Importkern liefert herstellerneutrale Datensätze und prüft sie vor jeder Übernahme. Verkäufe und Menübestellungen besitzen unterschiedliche Wirkungen. Der Kern ist ohne vorhandene Kassenschnittstelle und ohne Anmeldung bei einem Hersteller prüfbar.

**Tech Stack:** Bestehendes SPFx 1.23.2, TypeScript 5.8, Node 22, Node-Test-Runner und jsdom. Für .xlsx den bereits vorhandenen JSZip als ausdrückliche Abhängigkeit des Lesemoduls verwenden; keine Tabellenkalkulation oder Formelausführung im Browser.

**Spec:** ../specs/2026-10-26-zunft-warenwirtschaft-design.md, insbesondere „Import aus Kassen und Bestellsystemen“.

## Global Constraints

- Oberfläche „Kassen- und Bestellsystem“; keine vorgeschriebene Herstellerwahl, keine Herstellerkennung in gemeinsamen Entitäten.
- Anfangs CSV und .xlsx. Binäres .xls wird mit verständlicher Konvertierungshilfe abgewiesen.
- Vorschau vor Übernahme; feste Artikelzuordnung je Quelle; fehlender Umsatz bleibt unbekannt.
- Menübestellungen erzeugen Portionsbedarf, keine Verkaufs- oder Verbrauchsbuchung. Dieselben Vorbestellungen und manuell geplanten Portionen werden nicht ungeprüft addiert.
- Quellen werden nicht addiert, wenn sie dieselben Verkäufe oder überlappende aggregierte Zeiträume enthalten.
- Vorhandener Stammdaten-CSV-Import und seine Begrenzungen bleiben unverändert. Der neue Reader ist ein eigener allgemeiner Dateileser.
- Keine zusätzlichen laufenden Dienste, Cloud-Erkennungsgebühren, API-Zugangsdaten oder produktiven Schreibvorgänge während Entwicklung und lokaler Prüfung.

## Review Focus

- Eine Menüvorbestellung mit Preis und Status erfüllt darf nicht allein dadurch als bezahlter Verkauf zählen.
- Gleiche SKU in zwei Quellsystemen kann zwei verschiedene Produkte bedeuten; Zuordnung ist quellengebunden.
- Eine umbenannte Datei und ein erneut gespeichertes Excel mit gleichen fachlichen Inhalten dürfen keinen Doppelimport ermöglichen.
- Ein Wochenbericht kann schon übernommene Tagesberichte enthalten; Dateiprüfsumme allein genügt nicht.
- Ein Bruttogesamtbetrag oder eine Rabattspalte darf nicht als Nettopreis gelesen bzw. zweimal abgezogen werden.

## Gemeinsame Schnittstellen

Alle Produktdateien liegen relativ zu `spfx-probe/zunftkueche-spfx-probe/`.

`src/kitchen/imports/model.ts` definiert:

- `ImportPurpose = 'sales' | 'menuOrders'`.
- `ImportField = 'externalId' | 'productCode' | 'productName' | 'quantity' | 'unit' | 'date' | 'status' | 'amount' | 'currency'`.
- `ImportProfile`: id, frei gewählter Name, purpose, separator, decimalSeparator, dateFormat, amountBasis (`net`/`gross`/`unknown`), columnMap als partielle Zuordnung ImportField → Spaltenindex. Keine automatische Herstellererkennung.
- `ImportContext`: seasonId, area, locationId, sourceId, periodStart und periodEnd als Kalendertage; periodEnd einschließlich des gewählten Tages. Ein erforderlicher genauer Zeitstempel muss im Eingabewert eine Zeitzone tragen; unklare lokale Uhrzeiten bleiben offen.
- `GridCell`: text, optionaler Rohzahlenwert, Kennzeichen für Formelwert. `ImportGrid`: Blattname und zweidimensionales Raster.
- `ProductMapping`: sourceId, externalCode, targetProductId, unit und ausdrücklich bestätigter Umrechnungsfaktor.
- `ImportRow`: Quellzeile, externe Kennung, Produktkennung, Menge, Basiseinheit, Datum, Status und optionaler Betrag mit eigener Preisart und Währung.
- `ImportPreview`: normalisierte Zeilen, blockierende Fehler, Warnungen, Mengen-/Betragssummen und noch offene Produktzuordnungen.

Diese Namen werden vor Implementierung mit den vorgelagerten Rezept- und Speichermodulen abgeglichen. Produktzuordnung braucht feste Kennungen der Verkaufsprodukte; deren Anlage ist Bestandteil des Rezept-/Produkt-Ausbaus. Dieser Plan erfindet keine parallele Artikelliste.

### Task 1: CSV und Excel als neutrales Raster lesen

**Files:** Create `src/kitchen/imports/model.ts`, `csv-reader.ts`, `xlsx-reader.ts`; Test `tests/system-file-reader.test.mjs`; vorhandene `package.json` und Lockdatei nur für ausdrückliche Nutzung der vorhandenen ZIP-Abhängigkeit ändern.

**Interfaces:** `readCsv(text: string, separator: ';' | ',' | '\t'): ImportGrid`; `listWorkbookSheets(data: Uint8Array): Promise<string[]>`; `readWorkbookSheet(data: Uint8Array, sheet: string): Promise<ImportGrid>`.

- [ ] Failing Tests schreiben: BOM, zitierte Trennzeichen, mehrzeilige CSV-Zellen, leere Zellen, zwei Excel-Blätter, sharedStrings, Inline-Strings, Rohzahlen und Formelkennzeichnung. Älteres .xls und Überschreitung von 5 MiB komprimierter Datei, 20 MiB entpacktem Inhalt oder 5.000 Datenzeilen werden ausdrücklich abgewiesen; nichts wird still gekürzt.
- [ ] `npm run test:probe` ausführen; neue Tests müssen wegen fehlender Reader scheitern, vorhandene Tests weiter bestehen.
- [ ] Reader implementieren. Blatt- und Kopfzeilenauswahl bleiben explizit. Makros, Formeln und externe Bezüge werden nicht ausgeführt. Fehlende Formel-Caches bleiben unbekannt und werden als solche ausgewiesen.
- [ ] Gesamte Testsuite erneut ausführen; Erwartung: alle Tests erfolgreich. Vergleichsdateien aus künstlichen Werten erzeugen und keine Rechnungsoriginale als Testfixture ins Repo kopieren.
- [ ] Geprüften Reader als eigenen lokalen Commit speichern.

### Task 2: Spalten, Produkte und Importzweck prüfen

**Files:** Create `src/kitchen/imports/preview.ts`; Test `tests/system-import-preview.test.mjs`.

**Interfaces:** Consumes Reader und Typen aus Task 1. Produces `previewSystemImport(grid: ImportGrid, headerRow: number, profile: ImportProfile, context: ImportContext, mappings: ProductMapping[]): ImportPreview`.

- [ ] Failing Tests schreiben: frei benannte Spalten über Index zuordnen; doppelte Überschrift bleibt unterscheidbar; deutsche und internationale Dezimalformate nur gemäß Profil; unbekannter Artikel blockiert seine Übernahme; Umrechnung wird benötigt, wenn Einheiten abweichen. Null und leer unterscheiden. Ein Verkauf ohne Betrag liefert Absatz, aber keinen erfundenen Erlös.
- [ ] Tests ausführen und fehlende Funktion als Ursache des Scheiterns prüfen.
- [ ] Vorschau implementieren. Verkauf verlangt mindestens Produkt, Menge und passenden Zeitraum. Menübestellung verlangt Produkt, Menge, Termin und Statuszuordnung; offene/stornierte/unbekannte Statuswerte bleiben unterscheidbar. Keine personenbezogenen Zusatzspalten routinemäßig übernehmen.
- [ ] Tests für Menübestellung mit Preis und Status erfüllt sowie für Nettobetrag, Bruttobetrag und bereits rabattierten Gesamtbetrag erfolgreich ausführen. Kein impliziter Umsatz und kein zweiter Rabattabzug.
- [ ] Gesamte Testsuite erfolgreich ausführen und lokal committen.

### Task 3: Doppelimporte und fachliche Wirkung absichern

**Files:** Create `src/kitchen/imports/identity.ts`, `effects.ts`; Test `tests/system-import-identity.test.mjs` und `system-import-effects.test.mjs`.

**Interfaces:** `canonicalImportKey(profile: ImportProfile, context: ImportContext, rows: ImportRow[]): Promise<string>`; `checkImportOverlap(candidate: ImportContext, confirmed: ImportContext[]): string[]`; `buildImportEffects(preview: ImportPreview, purpose: ImportPurpose): { sales: ImportRow[]; menuDemand: ImportRow[] }`.

- [ ] Failing Tests schreiben: identische normalisierte Inhalte bei anderem Dateinamen, verschiedenen ZIP-Metadaten oder anderer Zeilenreihenfolge erhalten dieselbe fachliche Identität. Mengenänderung ist eine Korrektur, kein identischer Import. Gleiche SKU aus Quelle A/B wird getrennt geprüft.
- [ ] Tests ausführen, fehlendes Verhalten bestätigen.
- [ ] Identität aus Quelle, Zweck, Standort, Zeitraum, Preisart/Währung und stabil sortierten vollständigen Zeilen bilden. Bei fehlenden eindeutigen Verkaufskennungen aggregierte überlappende Zeiträume derselben Verkaufsgrundlage blockieren. Unterschiedliche Quellen dürfen nicht ungeprüft als unabhängige Verkäufe behandelt werden.
- [ ] Wirkungsprüfung implementieren: `sales` und `menuDemand` werden niemals für denselben Import gemeinsam befüllt; stornierte Menübestellungen erzeugen keinen Bedarf. Derselbe Bedarf darf beim Verbinden mit manueller Portionsplanung nur ausgewählt oder ausdrücklich zusätzlich bestätigt werden.
- [ ] Gesamte Testsuite erfolgreich ausführen und lokal committen.

### Task 4: Prüfbare Oberfläche und dauerhafte Übernahme integrieren

**Files:** Create `src/kitchen/imports/view.ts`, `store.ts`; Modify `src/kitchen/view.ts`, `workspace.ts` und browser fixture; Test `tests/system-import-view.test.mjs` und `system-import-store.test.mjs`.

**Interfaces:** View consumes Reader/Vorschau/Identitätsprüfung. `SystemImportStore.saveProfile(profile, previous, operationId)` speichert versionsgesichert; `SystemImportStore.commitImport(preview, profile, context, operationId)` bestätigt einen vollständigen, prüfbaren Import. `loadImports(context)` liefert nur bestätigte Importvorgänge des gewählten Umfangs.

- [ ] Zunächst vorgelagerte Rezept-/Produktkennungen und den gemeinsamen wiederholungssicheren Buchungsabschluss aus dem Warenfluss-Ausbau verwenden. Keine eigene ungesicherte Ersatzbuchung bauen.
- [ ] Failing UI-/Store-Tests schreiben: Dateiauswahl → Blatt/Kopfzeile → Spalten → Artikel → Vorschau → Bestätigen; Profil beim nächsten Import wiederverwenden. Lieferfehler nach bestätigtem Schreiben erzeugt bei Wiederholung keinen zweiten Import. Konflikt einer zweiten Person verhindert stilles Überschreiben.
- [ ] Neue Fehlerfälle ausführen und prüfen, dann Oberfläche und Speicherung implementieren. Nicht bestätigte Zwischenstände bleiben außerhalb von Auswertung und Bedarf. Profile und Importzweck werden im gespeicherten Nachweis festgehalten.
- [ ] Im Browser künstliche CSV- und Excel-Datei unterschiedlicher Struktur über dieselbe Oberfläche einlesen. Absatz, Menübedarf, Summen, Neuladen und Doppelimport sichtbar prüfen. Große Eingaben und schmale Ansicht mitprüfen.
- [ ] Gesamte Testsuite und `npm run build` erfolgreich ausführen. Paket und Quellcode lokal speichern; echte Dateiformate erst nach Prüfung eines tatsächlichen Exports als abgenommen bezeichnen. Eine Veröffentlichung in Teams bleibt ein eigener Schritt.

## Einordnung in den freigegebenen Ausbau

1. Einkauf: CI, Liefertermine, Lieferregeln, Ordersätze und Preisstände.
2. Rezepturen: Verkaufsprodukte, Rezeptversionen, Portionsplanung und Bedarf.
3. Warenfluss: Belegimport, Warenbewegungen und gemeinsame bestätigte Buchung.
4. Systemimporte und Abschluss: Dieser Plan verbindet die vorigen Teile mit neutralen Kassen-/Bestelldateien.

Task 1 bis 3 können unabhängig mit künstlichen Tabellen geprüft werden. Die dauerhafte produktive Wirkung aus Task 4 setzt die passenden vorgelagerten Module voraus. Der Plan ist keine Behauptung, dass diese Funktionen schon in der bisherigen Vorschau verfügbar sind.

## Planprüfung

- Herstellerneutralität, Excel/CSV, freies Spaltenmapping und zwei Importzwecke sind abgedeckt.
- Jeder Review-Focus-Fall besitzt benannte Regressionstests.
- Dateiinhalt, Parser und Übernahme sind voneinander getrennt; kein Hersteller-SDK ist erforderlich.
- Umsetzung der übrigen Warenwirtschaft erfolgt in separaten, zusammenhängenden Abschnitten auf derselben bestehenden App.
