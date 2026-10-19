# Professionelle Zunftküche mit Belegerfassung

Entwurf vom 19. Oktober 2026 zur Nutzerprüfung. Beauftragt sind Untersuchung und Planung; Umsetzung und Veröffentlichung beginnen erst nach dem Go des Nutzers. Dieser Entwurf ersetzt den verworfenen kostenpflichtigen PWA-Betriebsplan. Die Microsoft-Code-App und Dataverse bleiben die Grundlage; zusätzliche laufende Kosten, Trials und neue Hostingverträge sind nicht freigegeben.

## Ziel

Eine verlässliche Küchenverwaltung für Zunftabende mit dem Qualitätsniveau einer professionellen Küchen- und Kantinenanwendung: klare Arbeitslisten, nachvollziehbare Bestände, sichere Korrekturen, ein brauchbarer Abschluss und kurze Wege am Handy. Die Vereinsgröße bestimmt den Umfang. Patientenverwaltung, klinische Kostformen und ein neues Kassensystem gehören nicht dazu.

Vorstand und Schreiber bearbeiten zunächst die Daten. Ein später gezielt freigegebener Leser wie der Säckelmeister erhält eine verständliche Auswertung; Originaldokumentrechte bleiben separat. Onlinebetrieb ist für den Anfang ausreichend. Eine Offline-Synchronisierung und eine neue Teams-Einbettung sind keine Voraussetzung.

Bestehende Entscheidungen bleiben erhalten: Lieferant vor Liefertag; Freitag und Samstag am Rechner nebeneinander; Küche und weitere Erfassungsbereiche ausdrücklich unterscheiden; unbekannte Angaben nicht als null behandeln; Quellen und historische Stände bewahren. Die ruhige vorhandene Desktopgestaltung wird gezielt verbessert, nicht vollständig neu erfunden.

## Aktuelle Befunde

Der Hauptagent hat die veröffentlichte App am 19. Oktober in der angemeldeten Sitzung geprüft: Übersicht, Planung, Rezepturen, Bedarf, Freitag-/Samstagsbestellung, Vorschau, Lieferungen, Belege, Auswertung und Stammdaten/Termine. Desktop 1440 x 1000, mobile Browserbreite 390 x 844. Aktuelle Screenshots und Interaktionen sind unter `work/kitchen-audit-2026-10-19/evidence.json` im übergeordneten Arbeitsordner dokumentiert. Ein unabhängiger Agent hat sieben dieser Bilder zusätzlich visuell geprüft, zwei weitere haben Fachablauf/Erweiterbarkeit und aktuelle KI-Dokumentation untersucht.

- Desktopansichten sind grundsätzlich brauchbar. Bei 390 px Browserbreite hat die Planungstabelle 540 px Breite bei 296 px sichtbarem Inhaltsraum. Beim Fokussieren der Samstagsmenge verschwindet der Speisenname links. Bestellmengen sind rechts abgeschnitten; der feste Bestellabschluss nimmt etwa ein Viertel des Bildschirms ein. Ein physisches Telefon, Kamera und Bildschirmtastatur wurden in dieser Untersuchung noch nicht geprüft.
- Die mobile Symbolnavigation besitzt zugängliche Namen, aber keine sichtbaren Beschriftungen. Veranstaltung, Administrationsaktionen und lange Lieferantenlisten verdrängen tägliche Aufgaben.
- Ein probeweise eingegebener, nicht gespeicherter Belegentwurf wurde mit Escape ohne Warnung verworfen; nach erneutem Öffnen war das Feld leer. Eine Speicherung wurde nicht ausgelöst.
- Die Liefererfassung ist eine Einzelartikelbuchung. Ein Bezug zur bestellten Fassung und ein sauberer Berichtigungsweg fehlen. Bestellungen enden bei einer vorbereiteten Fassung; tatsächlich bestellte/bestätigte Stände sind nicht als eigener Ablauf dokumentiert.
- Der aktuelle Belegdialog erfasst Felder und einen SharePoint-Link. Fotoauswahl, Upload, Texterkennung und Prüfentwürfe fehlen. Die acht lokalen Originale im Datenstand sind in der Cloud-App ausdrücklich nicht verfügbar.
- Ein eigener Küchen-Einstellungsbereich fehlt. Termine lassen sich nur für Freitag/Samstag pflegen, obwohl Bestellungen weitere Liefertage anbieten. Die gemeinsame Veranstaltungsauswahl der Bearbeiter ist im Code eine globale Datenänderung.
- Die Auswertung trennt Teilwerte vernünftig. Ein abschließbarer Prozess fehlt; die Anzeige des vollständigen Ergebnisses ist derzeit dauerhaft offen.

Die vorhandenen 105 Node-Prüfungen liefen bei dieser Untersuchung erfolgreich. Das belegt vorhandene lokale Verträge, nicht die noch fehlenden mobilen Arbeitswege oder einen vollständigen Cloud-Rollentest. Es wurden keine Küchenbuchungen, Bestellfassungen, Uploads, Nachrichten, Rollen- oder Anbieteränderungen ausgelöst. Produktcode und bestehende Quelldaten blieben unverändert.

## Zielansichten und täglicher Ablauf

Die Hauptbereiche bleiben wiedererkennbar: Übersicht, Planung, Bestellungen, Wareneingang und Lager, Belege, Auswertung und Stammdaten. Ein eigener Bereich Einstellungen ergänzt sie. Mobil stehen beschriftete tägliche Ziele und eine kompakte Kontextzeile im Vordergrund. Seltene Verwaltungsaktionen stehen im Menü.

Die Übersicht zeigt zuerst die nächste notwendige Handlung, dann den Status von Planung, Bestellungen, Lieferungen und Belegen. Offene Daten werden gezielt verlinkt; lange Warnlisten sind standardmäßig zusammengefasst. Lieferanten bleiben direkt erreichbar. Eine globale Volltextsuche über alle privaten Daten ist für diese Stufe nicht nötig; bestehende Bereichssuchen werden verbessert.

Am Rechner bleiben vergleichende Tabellen. Mobil erhält jede Speise beziehungsweise jeder Artikel eine kompakte Eingabekarte: Name, Tag, vollständige Menge und Einheit sind gleichzeitig sichtbar. Freitag/Samstag können innerhalb derselben Speisenkarte nebeneinander stehen; bei knapper Breite stehen sie klar beschriftet untereinander. Zusatzangaben lassen sich aufklappen. Häufige Eingaben brauchen keine horizontale Suche. Aktionsleisten überdecken weder die letzte Zeile noch die Eingabe mit Bildschirmtastatur.

Dialoge und längere Formulare zeigen offene Änderungen und schützen sie beim Schließen, Navigieren und Neuladen. Bewusstes Verwerfen bleibt möglich. Eine fehlende Serverbestätigung wird niemals als Speicherung angezeigt. Mengen behalten den schnellen Eingabefluss; schnelle Feldwechsel, Konflikte und Netzabbrüche verlieren keine Eingaben unbemerkt. Fokus bleibt sichtbar und wird nach Dialogen sinnvoll zurückgegeben. Die tatsächlichen Zielgeräte werden nach der Umsetzung mit Kamera, Bildschirmtastatur und Dateiauswahl geprüft.

## Einstellungen

| Bereich | Inhalt | Änderungsgrenze |
| --- | --- | --- |
| Persönlich | Startbereich, letzte Veranstaltung, komfortable/kompakte Darstellung, zuletzt gewählter Lieferant/Ort | Benutzerbezogene Präferenz; ändert keine Küchenzahlen und nicht die Auswahl anderer Nutzer. |
| Veranstaltung | Name/Jahr, Veranstaltungstage und tatsächliche Lieferdaten, aktiv genutzte Orte, Lieferadresse/Ansprechpartner, Status offen/abgeschlossen | Versionierte Fachänderung; frühere Bestellfassungen und bestätigte Preise bleiben erhalten. |
| Verwaltung | Freigegebener SharePoint-Zielordner, Verbindungsstatus, Rollenanzeige, Erkennungsmodus, Kostenstatus/Kontingentstatus, Datenexport und Belegung | Auf dem Server geprüfte Befugnis. Keine Rollenvergabe oder neue Anbieterbuchung allein durch eine sichtbare Schaltfläche. |

Die Benutzeroberfläche bekommt keinen bloßen Schalter, der unbekannte Backendmöglichkeiten vortäuscht. Tage, Orte und Einheiten werden abgestimmt in TypeScript, Dataverse-Validierung und Migration behandelt. Alte Ortsbezeichnungen werden nicht automatisch gleichgesetzt. Eine nachgewiesene Zuordnung kann ausdrücklich bestätigt und nachvollziehbar hinterlegt werden.

## Bestellungen, Lieferungen und Abschluss

Bestellfassungen bewahren weiterhin ihren damaligen Inhalt. Der Nutzer kann die tatsächlich verwendete Fassung manuell als bestellt/versandt und später optional als bestätigt markieren, mit Person und Zeitpunkt. Die App sendet keine Lieferantennachricht automatisch. Änderungen der lebenden Planung gegenüber der bestellten Fassung bleiben erkennbar.

Wareneingang beginnt mit Lieferant, Liefertag und bestellter Fassung. Die Positionen bilden eine Annahmeliste. Tatsächliche Mengen, Ersatzartikel, Teil-/Restlieferung und Abweichungsnotiz werden ausdrücklich erfasst; bestellte Mengen werden nicht stillschweigend zu Lieferungen. Lieferschein und Rechnung können verknüpft werden, verändern aber nicht automatisch Lager oder Artikelpreise.

Falsche Lagerbuchungen erhalten eine referenzierte Storno-/Berichtigungsbuchung mit Grund, Person und Zeitpunkt. Originalbuchungen bleiben sichtbar. Auch ein versehentlich falsch gespeicherter Verkaufspreis kann ausdrücklich korrigiert werden; eine allgemeine spätere Preisänderung wirkt weiterhin nicht rückwirkend auf Verkäufe.

Für jeden bestätigten Beleg bleibt der erste bestätigte Ausgangsstand erhalten, auch bei manuell angelegten oder künftig erkannten Belegen ohne historisches Importfeld `source`. Spätere Änderungen erzeugen ausschließlich ergänzende Korrekturen mit Vorher-/Nachherwert, Grund, serverbestätigter Person und Zeitpunkt. Das Entfernen einer Quellenangabe darf diesen Schutz nicht umgehen.

Getränkesammelpositionen werden nicht als additive Rezeptur mehrerer Varianten ausgelegt. Direkte Artikel beziehungsweise eine bestätigte Variantenzuordnung und ausdrücklich getrennte Einkaufsplanung verhindern erfundene Mischungen. Mengenverteilung über Freitag/Samstag und Lieferzeitfenster zeigt die Gesamtsumme und mögliche Überdeckung.

Der Abschluss nennt fehlende Verkäufe, Belege, Bestände und Zuordnungen. Nach bewusster Prüfung lässt sich die Veranstaltung abschließen und bei berechtigtem Bedarf mit Grund wieder öffnen. Ein Schlussstand speichert Umfang, Datenrevision und Zeitpunkt. Bruttobeträge, Nettowerte, Pfand, Rabatte und Gutschriften werden unterscheidbar geführt; ein Ergebnis wird nur für einen ausdrücklich abgegrenzten, vollständigen Umfang angezeigt. Ein Browserdruck allein ersetzt keinen prüfbaren Datenexport. Erfahrungen können für den nächsten Abend ergänzt werden.

## Originalbelege und SharePoint

Neue Originaldateien sollen künftig im Küchenordner des Teams Zunftvorstand liegen, technisch in SharePoint. Dieser Dateizugriff ist noch nicht eingerichtet; die vorhandenen lokalen Originale bleiben unverändert. Zielwebsite, Bibliothek und Ordner werden zunächst anhand stabiler IDs bestätigt. Der dokumentierte SharePoint-Online-Connector ist der erste Kandidat; sein binärer Foto-/PDF-Rundlauf muss mit dem generierten Code-App-Client nachgewiesen werden. Benutzerverbindungen respektieren die tatsächlichen Dateirechte; eine administrative Verbindung darf keine zusätzlichen Vorstandsdateien an andere App-Nutzer durchreichen.

Ein `DocumentRepository` trennt Dateiablage von Küchenbuchungen. Es speichert Originaldateiname, Dateityp, Größe, SHA-256, Website-/Bibliotheks-/Datei-ID, Version/eTag, Link sowie Person/Zeitpunkt. Originalbytes bleiben unverändert. Drehen, Zuschnitt und Vorschau erzeugen getrennte Arbeitsfassungen. Fotos, OCR-Rohtexte und Auftragsverläufe kommen nicht in das auf 512 KiB begrenzte gemeinsame Küchendokument.

Ein stabiler Uploadauftrag verhindert Duplikate nach Wiederholung. SharePoint-Upload und Dataverse-Verknüpfung sind getrennte Schritte: Ein bereits hochgeladenes, noch nicht verknüpftes Dokument bleibt sichtbar und kann wieder zugeordnet werden. Unklare Zwischenstände werden nicht durch erneuten Upload oder automatisches Löschen verdeckt. App-Leser und Dokumentleser werden getrennt getestet.

## Automatische Belegerfassung

Der verbindliche Ablauf lautet: **Foto/PDF wählen - Original sichern - Erkennung erzeugt Entwurf - Original und Felder prüfen - bewusst übernehmen.** Die Erkennung darf weder direkt buchen noch Bestände oder Stammpreise selbstständig ändern. Nicht erkannte Werte bleiben offen. Die Lösung bleibt auch mit manueller Erfassung voll benutzbar.

### Empfohlene kostenfreie Grundlage

Nach einem frühen Machbarkeitstest werden vorhandene Texte digitaler PDFs lokal ausgelesen. Bilder und gerasterte Scan-PDF-Seiten können mit Tesseract.js im Browser erkannt werden. Dies ist Texterkennung, kein Rechnungs-LLM. Lieferantenerkennung, Feldzuordnung, Artikelvorschläge und Summenprüfungen folgen als getrennte, überprüfbare Schritte. Neue Muster oder Lieferanten bleiben bei Unsicherheit manuell zu bestätigen.

Dieser Weg setzt keinen zusätzlichen KI-Hostingvertrag voraus. Noch nicht nachgewiesen sind WebWorker-/WASM-/Modellasset-Ausführung im tatsächlichen Power-Apps-Host und hinreichende Geschwindigkeit auf den Zielhandys. Der Test findet vor einer umfangreichen OCR-Integration statt. Bei einem Block werden keine Schutzregeln aufgeweicht und keine Kosten ausgelöst; die Belegerfassung funktioniert weiter manuell und der Befund wird offen benannt. Temporäre Arbeitsdaten werden nach Abschluss oder bewusstem Verwerfen bereinigt.

### Microsoft-KI als getrennt zuschaltbarer Anbieter

Copilot Chat kann für geeignete Microsoft-365-Business-Basic-Konten als manueller Helfer ohne Aufpreis verfügbar sein; das ist kein kostenloser eingebetteter Endpunkt. Microsoft-365-Copilot-API und Copilot-Studio-Laufzeit benötigen gesondert passende Rechte/Kapazität. AI Builder kann nur dann ohne zusätzlichen Einkauf eingesetzt werden, wenn tatsächlich nutzbare vorhandene Credits und die Laufzeit des Anspruchs bestätigt sind. Die zehn gespendeten App-Pässe belegen das nicht allein.

Die aktuelle enthaltene-Credits-Regel ändert sich ab 1. November 2026 für neue/erneuerte geeignete Lizenzen; vorhandene Ansprüche werden laut Microsoft bis zum jeweiligen Vertragsende weitergeführt. Die Lizenzseite war in der bei der Untersuchung angemeldeten Sitzung mangels Administrator-Leserechten nicht einsehbar. Der Kontingentstatus lautet daher **unbestätigt**, nicht null und nicht kostenlos zugesichert.

Azure Document Intelligence F0 ist eine weitere mögliche kostenlose Kapazität: öffentlich 500 Seiten monatlich, höchstens 4 MB je Datei und nur die ersten zwei PDF-/TIFF-Seiten pro Analyse. Azure-Abonnement, separate Ressource und sicherer Aufrufweg wären neu zu prüfen; das ist keine bereits eingerichtete Gesamtlösung. Ein Schlüssel wird niemals in React eingebaut. Es erfolgt kein automatischer Wechsel auf einen bezahlten Tarif oder Anbieter.

Ein kleines LLM ist technisch im Browser mit WebGPU möglich, müsste aber Modellgröße, Speicherbedarf, Geschwindigkeit und Qualität auf Mobilgeräten erst beweisen. Es ist für den ersten zuverlässigen Belegworkflow nicht erforderlich und bleibt ein späteres Experiment.

### Prüfentwürfe und Übernahme

Ein Entwurf enthält Veranstaltung, Originalreferenz/Hash/Version, Erkennungsauftrag und Anbieter-/Parser-Version, Kopfwerte, Positionsvorschläge, Fundstellen, unklare Felder, Dublettenhinweise und Korrekturen. Er unterscheidet wartend, in Bearbeitung, prüfen, übernommen, verworfen und fehlgeschlagen. Die Rohfassung bleibt von bestätigten Werten getrennt.

Der Prüfplatz zeigt am Rechner Original und Eingaben nebeneinander, mobil schnell wechselbar. Zu prüfen sind Lieferant, Datum/Nummer, Menge/Einheit, Gebinde, Einzel-/Positionspreis, Netto/Brutto, Steuer, Pfand, Rabatt und gegebenenfalls Gutschrift. Ein Einzelpreis ist nicht automatisch netto. Eine OCR-Sicherheit ist kein Beweis einer korrekten Rechnung. Dokumenttexte sind Eingabedaten und dürfen keine Aktionen oder Anweisungen an die App auslösen.

Die Übernahme ist eine servergeprüfte, wiederholungssichere Zustandsänderung für genau eine Entwurfsversion. Sie bindet Zielveranstaltung, erwartete Workspace-Revision, Entwurfs-RowVersion und Dokumentversion an den bestehenden synchronen `KitchenCommit`-Pfad. Entwurfsabschluss, bestätigter Küchenbeleg und Wiederholungsbeleg werden in derselben Dataverse-Transaktion geschrieben. Der bestehende Schreibschutz wird hierfür gezielt erweitert, nicht umgangen. Ein Teilfehler rollt alle drei Dataverse-Änderungen zurück; die bereits gesicherte SharePoint-Datei bleibt als zuordenbares Original erhalten. Zwei Tabs oder ein Netzabbruch erzeugen nur einen Beleg. Exakte Dateiduplikate, mutmaßlich doppelte Rechnungen mit anderer Scan-Datei und wiederholte Speicheranfragen werden getrennt erkannt. Eine neu erkannte Rechnung überschreibt weder ein geschütztes Original noch einen gespeicherten historischen Preis.

## Auswertungsexport und vollständige Sicherung

CSV und PDF liefern eine lesbare Auswertung für einen benannten Umfang. Eine wiederherstellbare Sicherung ist ein separates, versioniertes strukturiertes Paket: Küchenzustand samt Veranstaltungsarchiven und Einstellungen, IDs/Beziehungen, gesamte Korrektur- und Statushistorie, Dokumentmetadaten und Entwürfe mit Prüfverlauf sowie Wiederholungsbelege. Ein Dokumentmanifest enthält Hash, Dateiversion und Ablage-IDs. Zusätzlich müssen die Originalbytes enthalten oder in einer getrennten, nachweislich erhaltenen Originalsicherung verfügbar sein; ein Link allein stellt eine gelöschte Datei nicht wieder her.

Sicherung und Wiederherstellung werden nach Einführung der Dokument- und Entwurfstabellen erneut getestet. Konsistente Revisionen und Dateiversionen werden geprüft; fehlende Originale werden als unvollständige Sicherung ausgewiesen. Wiederherstellung erfolgt zunächst ausschließlich in einer getrennten Testumgebung über einen begrenzten, berechtigten Weg. Ein Auswertungsleser erhält dadurch weder einen Vollbackupzugriff noch zusätzliche Dokumentrechte.

## Technische Leitplanken

Die bestehende Repository-Grenze, authentifizierter Dataverse-Aufrufer, Datensatzrechte, RowVersion-Prüfung, Transaktion und unveränderliche Wiederholungsbelege bleiben erhalten. Die bisherige Schreibrolle erlaubt umfassende Küchenbearbeitung. Einschränkungen für Konfiguration, Schlussstand und Entwurfsübernahme benötigen zusätzliche serverseitige Prüfungen; Operationstext oder ausgeblendete UI allein genügt nicht.

Eine persönliche Veranstaltungsauswahl verändert keinen gemeinsamen aktiven Bestand. Neue Änderungsaufträge binden die Zielveranstaltung ausdrücklich. Backend und Frontend erhalten einen abgestimmten versionierten Vertrag und einen nachvollziehbaren Migrationspfad. Alte offene Browserstände werden gegebenenfalls zum Neuladen aufgefordert, statt mit unpassendem Protokoll weiterzuschreiben. Quellen, IDs, wirtschaftliche Ausgangswerte und Historie bleiben erhalten.

Dokumentmetadaten und Prüfaufträge werden separat in geeigneten Dataverse-Tabellen geführt. Der aktuelle Küchenbestand bekommt eine Belegungsanzeige. Eine spätere feinere Verteilung nach Veranstaltung wird nur bei gemessenem Bedarf vorgenommen; eine pauschale Datenbank-Neuentwicklung ist kein Bestandteil dieser Freigabe.

## Abnahme

Alle Ausbauschritte erhalten eine unabhängige Fach-/Code-Gegenprüfung und eine sichtbare Bedienprüfung. Die endgültige Abnahme umfasst mindestens:

1. Auf 390 px und einem tatsächlichen Handy bleiben Artikel/Speise, Tag, vollständige Menge und Einheit gleichzeitig erkennbar; Bildschirmtastatur verdeckt die Eingabe nicht. Am Rechner bleibt der Tagesvergleich erhalten.
2. Ein ungespeicherter Formularentwurf überlebt Navigation beziehungsweise verlangt bewusstes Verwerfen. Netzabbruch und schneller Feldwechsel erzeugen keine falsche Erfolgsmeldung oder Doppelbuchung.
3. Zwei Bearbeiter in verschiedenen Veranstaltungen verändern nicht gegenseitig ihre Auswahl; veraltete Revisionen führen zum erklärten Konflikt.
4. Mittwoch-/Sonntaglieferungen erhalten ein vollständiges Datum. Die spätere Termin- oder Preisänderung verändert keine alte Bestellfassung.
5. 100 statt 10 geliefert lässt sich nachvollziehbar auf 10 berichtigen. Bestellte 120 und gelieferte 110 bleiben getrennt sichtbar.
6. Foto und PDF lassen sich unverändert aus SharePoint wieder herunterladen; Hash, Größe und Typ stimmen. Leser ohne Dokumentrecht erhält keinen stillen Ersatz- oder öffentlichen Zugriff.
7. Vor der Belegfreigabe entstehen keine Küchenbuchungen. Doppelte Übernahme oder Wiederholung ergibt genau einen Beleg. Mehrseitigkeit und ein geändertes Original werden erkannt.
8. Ein späterer Vergleich mit etwa 30 repräsentativen Belegen misst Kopfwerte, vollständige Positionen, Centbeträge, Einheiten, Fehler, Korrekturaufwand und Gesamtzeit. Schlechte Fotos und unbekannte Formate müssen erkennbar in die manuelle Prüfung fallen; es gibt keine vorab behauptete Erkennungsquote.
9. Leser kann Auswertung und freigegebene Unterlagen ansehen, aber auch über direkte Aufrufe keine Daten verändern. Konfigurations- und Abschlussrechte werden serverseitig geprüft.
10. Export und Wiederherstellung in einer getrennten Testumgebung sind geprüft; Produktivdaten werden für den Test nicht überschrieben. Veröffentlichung erfolgt erst nach dem ausdrücklichen Go und der jeweiligen Abnahme.

## Quellen und Einordnung

- Microsoft Code Apps: https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview
- Code-App-Datenanbindung und Connector-Aktionen: https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-data
- SharePoint Online, Standard und CreateFile: https://learn.microsoft.com/en-us/connectors/sharepointonline/
- Teams-Dateiablage: https://learn.microsoft.com/en-us/sharepoint/teams-connected-sites
- Copilot-Chat-Berechtigung: https://learn.microsoft.com/en-us/copilot/manage#microsoft-365--chat-eligibility
- Copilot-Umfang: https://learn.microsoft.com/en-us/copilot/overview
- Copilot Chat API: https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/api/ai-services/chat/overview
- Copilot Studio in Code Apps: https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-copilot-studio
- Copilot-Studio-Lizenzierung: https://learn.microsoft.com/en-us/microsoft-copilot-studio/billing-licensing
- AI Builder, aktuelle Übersicht: https://learn.microsoft.com/en-us/ai-builder/administer-licensing
- AI-Builder-Übergang: https://learn.microsoft.com/en-us/ai-builder/endofaibcredits
- Azure-Kapazität: https://azure.microsoft.com/pricing/details/ai-document-intelligence/
- Azure-Grenzen: https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/service-limits?view=doc-intel-4.0.0
- Tesseract.js und Grenzen: https://github.com/naptha/tesseract.js
- WebLLM: https://webllm.mlc.ai/docs/user/get_started.html

Die Quellen wurden von einem gesonderten Agenten am 19. Oktober 2026 geprüft. Sie belegen Möglichkeiten und veröffentlichte Bedingungen, keinen durchgeführten Belegbenchmark oder tatsächlich vorhandene Mandantenkontingente. Vor einer künftigen KI-Aktivierung werden Bedingungen und Ansprüche erneut abgeglichen.
