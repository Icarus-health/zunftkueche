# Zunftküche 1.3.0 – Warenwirtschaft in Teams

Stand 26.10.2026: In der bestehenden SPFx-App umgesetzt, lokal mit künstlichen Daten geprüft und als Update-Paket gebaut. **Diese Fassung ist noch nicht in SharePoint veröffentlicht oder in der echten Teams-Registerkarte abgenommen.** Keine echten Bestellungen, Rechnungen oder Kassenexporte wurden übernommen.

## Die sechs Arbeitsbereiche

- **Heute:** nächste Aufgaben, erwartete Lieferungen und datierte Zählbestände.
- **Einkauf:** Bestellungen, Vorjahreskopien, Teillieferungen, beliebige Liefertermine, Lieferregeln, Ordersätze, Mengen je Termin und neue Preisstände. Preislisten lassen sich aus CSV oder Excel zuordnen. Der Bestelltext unterstützt Telefon, E-Mail oder den Lieferanten-Shop; die App versendet keine Bestellung.
- **Bestand:** fortsetzbare Abendzählung sowie Bewegungsjournal für Direktzugänge, Retouren, Schwund, Eigenverbrauch und Umlagerungen. Lagerorte lassen sich getrennt ansehen. Eine Zählung setzt einen beobachteten Bestand; sie wird nicht aufaddiert. Ohne Zählgrundlage bleibt der rechnerische Bestand offen.
- **Planung:** Rezepte und Getränke als Verkaufsprodukte, Zutaten in Artikel-Basiseinheiten, Ausbeute, Verkaufspreis, bestätigte Versionen und Portionspläne. Beim Einkauf ausdrücklich Bestand und rechtzeitig offene Lieferungen anrechnen; der Rest wird auf volle Liefergebinde gerundet und je Lieferant als Entwurf angelegt. Es gibt keine automatische Reservierung zwischen mehreren Plänen.
- **Auswertung:** dokumentierte Einkaufswerte, geprüfte Rechnungen, bestätigte Verkäufe, Bestseller und Rezeptverbrauch. Brutto/Netto/unbekannt bleiben getrennt. CSV-Auswertung und JSON-Datenexport sind verfügbar.
- **Verwaltung:** Artikel, Lieferangebote, Lieferanten und Saisons; bestehender Stammdaten-CSV-Import bleibt erhalten.

## Einfache Arbeitsabläufe

### Saison und Einkauf vorbereiten

1. Saison, Lieferanten, Artikel und Liefergebinde anlegen. Beim Artikel die feste Basiseinheit wählen, zum Beispiel kg oder Flasche. Eine Kiste mit 12 Flaschen ist ein Lieferangebot mit Gebindegröße 12.
2. Unter Einkauf **Neue Bereiche einrichten** einmalig auswählen, wenn die neue Journal-Liste noch fehlt. Danach Liefertermine anlegen: Mittwoch, Freitag, Samstag, Sonntag oder jeder andere tatsächliche Kalendertag.
3. Lieferregeln als Hinweise hinterlegen. Ordersatz je Lieferant anlegen; Ausgangsmengen können noch offen bleiben.
4. **Bestellung vorbereiten** öffnet die Mengenmatrix. Termine auswählen, Mengen prüfen und einzelne Entwürfe erzeugen. Erst nach tatsächlicher Bestellung beim Lieferanten als bestellt dokumentieren.
5. Neue Preislisten als neuen gültigen Preisstand prüfen. Alte Bestellungen behalten ihre Preise. Verwendete Gebinde nicht umdeuten: bei einer neuen Verpackung ein neues Lieferangebot anlegen.

### Rezepte und Bedarf

Die Zutatenmenge gilt für die gesamte Ausbeute. Beispiel: 2 kg Zutat für 10 Portionen ergibt 0,2 kg je Portion. Jede Zutat wird in ihrer Artikel-Basiseinheit erfasst; eine unbestätigte kg/g-Umrechnung wird nicht geraten. Rezept nach Prüfung freigeben. Eine spätere Änderung erzeugt eine neue Version.

Portionen nach Verwendungstag planen. **Einkauf vorbereiten** zeigt Bruttobedarf, rechnerischen Bestand und rechtzeitig offene Liefermengen. Nur ausdrücklich eingetragene Mengen werden angerechnet. Dieselbe Ware nicht mehrfach in verschiedenen Plänen verwenden. Der gewählte Liefertermin muss spätestens am Verwendungstag liegen.

### Rechnung / PDF prüfen

PDF auswählen und **PDF lesen und Original vormerken** wählen. Kopf und Summen werden vorsichtig vorgeschlagen, soweit eindeutig erkennbar. Rechnungspositionen am Original erfassen und Artikel/Bestellungen zuordnen. Die Prüfmaske zeigt auch den ausgelesenen Text. Mengen- und Preisabweichungen stehen in der bestätigten Belegansicht; unklare Rechnungseinheiten bleiben offen.

Das Original wird beim Speichern als native SharePoint-Listenanlage abgelegt und durch SHA-256 sowie Nachlesen geprüft. Eine Rechnung bucht keinen Wareneingang. Lieferungen bei der Bestellung annehmen; Direktkäufe bei Bedarf getrennt als Zugang buchen. Eine bestätigte Rechnung bleibt erhalten. Gutschriften/Korrekturbelege separat mit eigener Nummer und Bezug im Hinweis erfassen; negative Beträge sind möglich.

Bilder/Scans ohne PDF-Text werden manuell erfasst. Es gibt keinen kostenpflichtigen OCR- oder KI-Dienst. Alle acht vorhandenen Rechnungs-PDFs konnten im lokalen Lesetest gelesen werden; dies bestätigt noch keine automatische Positionszuordnung oder fachliche Richtigkeit.

### Kassen- und Bestellsystem importieren

1. **Tatsächliche Kassenverkäufe** oder **Menüvorbestellungen** wählen. Quelle frei benennen oder gespeichertes Profil benutzen. Bereich, Betriebstage und Währung ausdrücklich wählen.
2. CSV (.csv) oder Excel (.xlsx) auswählen; bei Excel das Tabellenblatt, danach die Kopfzeile und Spalten wählen. „Umsatz“ ist der gesamte Zeilenbetrag, kein Stückpreis. Zahlen-, Datumsformat und Brutto/Netto angeben.
3. Externe Produkte mit einer geprüften Rezeptversion verbinden. Faktor = Portionen/Stück je exportierter Einheit. Einheit und Statuswerte am Original prüfen.
4. Vorschau mit Zeilenzahl, Mengen und Summen prüfen und bestätigen. Profil auf Wunsch für die nächste Datei speichern.

Menüvorbestellungen erzeugen ausschließlich Planbedarf; sie sind keine Umsätze und kein tatsächlicher Zutatenverbrauch. Tagespläne aus Menüimporten nicht zusätzlich als dieselben manuellen Portionen planen. Verkäufe lösen den Verbrauch anhand der beim Import festgehaltenen Rezeptversion aus. Erstattungen erhöhen den physischen Bestand nicht automatisch. Es gibt keine zusätzliche Herstellungsbuchung.

Identische Dateien und überlappende Zeiträume derselben Datenart im selben Bereich werden gesperrt, auch bei einer anderen Quellenbezeichnung. Nach Verbindungsfehlern denselben Vorgang erneut versuchen. Nach Neuladen zeigt ein gespeicherter Importentwurf **Übernahme fortsetzen**. Korrigierte Berichte können im ersten Importschritt ausdrücklich einen früheren Bericht derselben Quelle und desselben Zeitraums ersetzen. Die alte Fassung bleibt in der Historie und zählt erst nach erfolgreicher Bestätigung der Korrektur nicht mehr mit.

Grenzen: Datei bis 5 MiB, Vorschau bis 5.000 Datenzeilen, bestätigter Import bis 500 Zeilen und 56.000 Zeichen. Umfangreiche Transaktionsdateien vorab als Artikel-/Tagesbericht verdichten. Nicht denselben Zeitraum in überlappenden Teildateien importieren. PDF bis 8 MiB und 40 Seiten. Grenzen werden angezeigt; nichts wird still gekürzt. Ein tatsächlicher Export eures später eingesetzten Kassensystems muss noch am Originalformat geprüft werden.

## Kosten, Daten und Berechtigungen

Keine neuen Laufzeitdienste, Abonnements, Premium-Connectoren oder API-Freigaben. SPFx, Logo, Schrift, Excel-Leser und PDF-Worker sind im Paket enthalten. Die Daten bleiben auf der vorhandenen Kanal-SharePoint-Seite mit den vorhandenen Vereinsrechten.

Die bisherigen `ZK_V1_`-Listen bleiben erhalten. Neu ist die optionale app-eigene `ZK_V2_Journal`-Liste mit Versionierung, indizierten Saison-/Artfiltern und eindeutigen Vorgangs-/Belegschlüsseln. Testmodus verwendet `ZK_AbnahmeV2_Journal`. Fremde gleichnamige Listen werden abgelehnt. Preise, Rezepte, Rechnungen, Bewegungen und Systemimporte sind nach Bestätigung unveränderlich; Korrekturen behalten die Historie. Parallele Bearbeitungen werden mit Versionskennungen geprüft.

Der JSON-Export enthält geladene Daten/Quellversionen, **keine PDF-Originalbytes**. Er ist kein vollständiges Backup und hat keinen automatischen Wiederherstellungsdialog. Originale separat herunterladen und SharePoint-Versionierung nutzen. Eine vollständige Wiederherstellung aller Daten und Originale ist eine verbleibende Betriebsaufgabe. Die älteren Dataverse-Backup-Werkzeuge im übergeordneten Repository gelten nicht für diese neue SPFx-Journal-Liste.

Nicht Bestandteil dieser Fassung: automatischer Bestellversand, Hersteller-API-Synchronisierung, automatische PDF-Positionsübernahme/OCR, separate Produktionsbuchhaltung, Mengenstaffelpreise, vollständige Pfand-/Leergutabrechnung, vollständige Backup-Wiederherstellung oder automatische Veröffentlichung. Leergut kann als eigener Artikel gezählt und gebucht werden; eine Pfandabrechnung wird daraus nicht behauptet.

## Code ändern – ohne Computer Use

Alle Änderungen erfolgen in diesem Projektordner. Die Oberfläche wird als TypeScript/HTML und SCSS gepflegt; ein Power-Apps-Editor ist nicht erforderlich.

| Datei / Ordner | Zweck |
|---|---|
| `src/kitchen/workspace.ts` | Startseite, Hauptnavigation, Bereichsübersichten |
| `src/kitchen/view.ts` | Verbindung der bestehenden Bedienabläufe |
| `src/kitchen/ww/controller.ts` | neue Warenwirtschaftsabläufe |
| `src/kitchen/ww/*-view.ts` | Einkaufs-, Rezept-, Beleg- und Bestandsmasken |
| `src/kitchen/ww/table-wizard.ts` | Excel-/CSV-Importdialog |
| `src/kitchen/ww/domain.ts`, `plan-procurement.ts`, `reconciliation.ts` | Mengen-, Preis- und Abgleichregeln |
| `src/kitchen/imports/` | CSV, Excel, PDF und neutrale Zuordnung |
| `src/kitchen/ww/store.ts` | zusätzliche SharePoint-Speicherung |
| `src/webparts/kitchen/KitchenWebPart.module.scss` | CI, Schrift, Farben, große Flächen, responsive Darstellung |

Mit vorhandenem Node.js 22 im Projektordner:

```sh
npm ci
npm run test:probe
npm run build
npm run preview:local
```

Vorschau: `http://127.0.0.1:53429/`. Sie nutzt Produktionscode mit einem künstlichen SharePoint-Ersatz. Beispieldaten werden ausschließlich im lokalen Browser gespeichert; keine Microsoft-Anmeldung, kein Zugriff auf Vereinsdaten. Die neue Vorschau nutzt einen eigenen Speicherbereich; Daten der alten 1.2-Vorschau werden nicht gelöscht. Nach Codeänderungen neu bauen und die Seite neu laden.

## Update und Nachweis

Paket: `sharepoint/solution/zunftkueche-spfx-probe.sppkg`, Solution-/Feature-Version **1.3.0.0**. Bestehende Solution- und Webpart-IDs bleiben erhalten. Die neue Fassung kann deshalb als Update des vorhandenen Pakets und in der vorhandenen SharePoint-/Teams-Registerkarte bereitgestellt werden. Kein neues Hosting nötig.

Vor Veröffentlichung: Paket im bestehenden Katalog aktualisieren, die vorhandene Küche-Registerkarte neu laden, sichtbare Version prüfen und neue Bereiche einmalig einrichten. Mit zwei bestehenden Vereinskonten Speichern/Neuladen, Konflikt, Originaldatei und Importfortsetzung prüfen. Echte Stammdaten oder Originalexporte erst nach dieser Abnahme übernehmen. Browser-Vorschau, Paketbau und wirkliche Teams-Abnahme sind getrennte Nachweise.

GitHub/PRs sind für Codeänderungen optional; eine automatische Veröffentlichungs-Pipeline ist nicht eingerichtet. Veröffentlichung benötigt weiterhin ein bewusstes Update des vorhandenen SharePoint-Pakets, aber keine tägliche Fernsteuerung der Oberfläche.
