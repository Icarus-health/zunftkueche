# Vollständige Warenwirtschaft für die Zunftküche

Arbeitsentwurf vom 26. Oktober 2026. Die bisher gewählte Teams und SharePoint Basis sowie die helle Arbeitsoberfläche werden weiterverwendet. Der hier beschriebene größere Funktionsumfang ist noch nicht umgesetzt oder veröffentlicht.

## Ziel und Grenzen

Die Zunft braucht eine zusammenhängende Warenwirtschaft für Küche und Zunftscheuer: Saison vorbereiten, Bedarf planen, bei mehreren Lieferanten für unterschiedliche Termine bestellen, Lieferungen prüfen, Rechnungen abgleichen, Abendbestände erfassen und Verkäufe auswerten. Wenig erfahrene Helfer sollen die häufigsten Aufgaben ohne Kenntnis von Lagerbuchhaltung erledigen können. Verantwortliche pflegen Artikel, Lieferanten, Rezepturen, Preise und Bestellvorlagen.

Weiterhin gelten: bestehende Vereinskonten, Arbeit direkt in Teams, keine zusätzlich kostenpflichtigen Dienste, keine Pflicht zu Computer Use für Codeänderungen und keine automatische Übernahme der Test-Excel. Die vorhandene App und ihre Daten bleiben während des Ausbaus erhalten. Neue Funktionen werden zuerst lokal und mit künstlichen Daten geprüft.

„Vollständig“ meint hier den Warenfluss und die betriebliche Verwaltung der Zunftküche. Zahlungen, Bankzugriff, Lohnbuchhaltung und Steuererklärungen gehören nicht zum vorgesehenen System. Die App stellt Belege und Exporte für die bestehende Vereinsbuchhaltung bereit. Sie gibt keine Garantie eines rechtskonformen Buchhaltungsarchivs oder einer fachlich geprüften Allergenkennzeichnung.

## Grundlage und Ansätze

Die Fortführung der SPFx-App in der bestehenden SharePoint-Seite ist die bereits gewählte Grundlage. Sie vermeidet eine zusätzliche Laufzeitplattform und erhält den bekannten Teams-Zugang. Auch dieser Weg benötigt sorgfältige Entwicklung und Pflege; „ohne Zusatzkosten“ bedeutet keine neuen laufenden Produkt- oder Cloudgebühren, nicht aufwandsfreie Entwicklung.

Ein separates Standard-ERP wäre eine Alternative mit vorgefertigten Fachfunktionen. Dessen Betrieb, Wartung, Anmeldung und Teams-Anbindung wären neu zu lösen; die vorgegebenen Kosten- und Bedienbedingungen sind dafür bisher nicht nachgewiesen. Ein Rückwechsel zu einer Power-App-Oberfläche würde die bereits erfahrenen Bearbeitungs- und Einbettungsprobleme erneut aufmachen. Beides ist deshalb nicht der vorgeschlagene Weg.

Als fachlicher Vergleich dienen Standardfunktionen aus Odoo und ERPNext: Lieferantenpreise mit festen Zuordnungen, getrennte Bestellung und Rechnung, Rezepturstücklisten und ein Bewegungsjournal. Es ist keine Installation oder Übernahme dieser Produkte geplant. [Lieferantenpreislisten](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase/products/pricelist.html), [Rechnung und Bestellung](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase/manage_deals/control_bills.html), [Stücklisten](https://docs.frappe.io/erpnext/bill-of-materials), [Warenbewegungen](https://docs.frappe.io/erpnext/stock-transactions).

## Was vorhanden ist und was ergänzt wird

| Bereich | Vorhanden in der lokalen Fassung 1.2 | Vorgesehener Ausbau |
|---|---|---|
| Artikel und Lieferanten | Anlegen, bearbeiten, Lieferangebote, Stammdaten-CSV | Suchbare Kataloge, mehrere Bezugsquellen, Lieferantenartikelnummern, Aliasnamen, Lieferbedingungen |
| Preise | Ein aktueller Angebotspreis und Preisdatum; Vorgang hält Preis fest | Einkauf und Verkauf getrennt, Preislistenimport, Gültigkeit, Preisverlauf, Mengenstaffeln, Änderungsvergleich |
| Bestellungen | Entwurf, Dokumentation, Bestelltext, Nachbestellung, Vorjahreskopie | Lieferkalender, Ordersätze, Mengenmatrix pro Liefertermin, zusammenhängende Bestellserie |
| Lieferungen | Teillieferungen mit Historie | Ersatzartikel, Rückgaben, echte Lagerzugänge, Lieferung ohne Vorbestellung, Verknüpfung zu Rechnungen |
| Bestand | Einzelzählung und fortsetzbare Zählliste | Lagerorte, Bewegungsjournal, Umlagerung, Schwund, Leergut, Vergleich von Soll und Ist |
| Rezepturen | Nicht in der aktuellen SPFx-App | Gerichte und Getränke, Zutaten, Ausbeute, Versionen, Portionsplanung und Einkaufsvorschläge |
| Rechnungen | Nicht in der aktuellen SPFx-App | Originaldatei, Auslesen, Prüfmaske, Zuordnung und Mengen-/Preisabgleich |
| Kassen- und Bestellsysteme | Nicht angebunden | Herstellerneutraler Excel-/CSV-Import für Verkäufe und Menübestellungen mit Zuordnung, Zeitraumprüfung und Dublettenschutz |
| Saisonabschluss | Bestellübersicht | Einkauf, Absatz, Verbrauch, Rest, Retouren und interne Verpflegung mit Vorjahresvergleich und Export |

Älterer Code enthält fachliche Ansätze für Rechnungsprüfung, Rezepturen, Korrekturen und Bestellplanung. Er hängt teilweise an der früheren Dataverse-Anwendung. Wiederverwendet werden geeignete Regeln und Tests, nicht ungeprüft deren Speicherzugriff. Die alte Bedarfsberechnung begrenzt sich auf Freitag und Samstag; diese Einschränkung darf nicht übernommen werden. Der alte Beleghelfer schlägt nur Kopffelder vor und hat keine aktive PDF- oder Bilderkennung. Er ist kein fertiger Rechnungsimport.

## Einfache Oberfläche

Die sechs Hauptbereiche bleiben bestehen: **Heute, Einkauf, Bestand, Planung, Auswertung, Verwaltung**. Rezepte liegen unter Planung; Rechnungen, Lieferanten, Preislisten und Ordersätze sind direkt im Einkauf erreichbar. Häufige Aktionen erscheinen zusätzlich als konkrete Aufgabe auf Heute.

Die Tagesansicht zeigt etwa „Für Freitag bestellen“, „Zwei Lieferungen prüfen“, „Eine Rechnung mit Abweichung“ und „Abendbestand fortsetzen“. Jede Aufgabe führt unmittelbar zum passenden Vorgang. Die Tagesansicht zeigt keine bloßen Datensatzanzahlen ohne Handlungsbezug.

Der Küchendienst arbeitet überwiegend mit drei Abläufen: Lieferung annehmen, Bestand zählen, Nachbestellung melden. Verantwortliche erreichen die ausführlichere Planung und Stammdatenpflege über dieselbe App. Eine vereinfachte Ansicht ist eine Bedienhilfe, keine zusätzliche technische Berechtigung. Bestehende SharePoint-Rechte bestimmen den tatsächlichen Zugriff.

Mengen lassen sich in einer Liste direkt ändern, ohne für jeden Artikel ein eigenes Formular zu öffnen. Suchfeld, Kategorien und „nur offene Punkte“ verkürzen lange Listen. Gebinde und Einzelmengen sind ausdrücklich beschriftet. Unbekannt, ungeprüft und echte Null bleiben verschiedene Zustände. Große Bedienelemente, Tastaturbedienung, sichtbarer Fokus und Text zusätzlich zu Statusfarben sind verbindlich. Keine reine Bedienung über kleine Symbole oder Hover-Menüs.

## Termine und Lieferplanung

Liefertermine sind echte Daten mit optionalem Zeitfenster und Zielort. Mittwoch, Freitag, Samstag und Sonntag sind Schnellwahlen für die Saison, keine fest programmierten Grenzen. „Weiteren Termin hinzufügen“ erlaubt jeden anderen Kalendertag. Die Anzeige zeigt Wochentag und Datum gemeinsam.

Für Lieferanten lassen sich übliche Liefertage, Bestellvorlauf, Bestellschluss, Mindestbestellwert, Lieferkosten und Abholung hinterlegen. Ausnahmen sind mit Hinweis möglich. Ein Warnhinweis ersetzt keine bestätigte Terminabsprache.

**Lieferdatum und Verwendung werden getrennt:** Eine Lieferung am Mittwoch kann den Bedarf für Freitag und Samstag abdecken. Ware darf beim Wechsel zwischen diesen Ansichten nicht doppelt als frei verfügbar angerechnet werden. Lieferort, Lagerort und Veranstaltung sind ebenfalls verschiedene Angaben. Eine neue Saison übernimmt Vorlagen und Terminregeln; konkrete Daten werden für die neue Saison ausgewählt.

Im Einkauf gibt es je Lieferant eine Mengenmatrix mit den tatsächlichen Lieferterminen als Spalten. Häufig gebrauchte Artikel stehen sofort darin. Beim Vorbereiten entstehen klar getrennte Bestellvorgänge je Lieferant, Termin und Zielort, verbunden zu einer Bestellserie. Der gemeinsame Bestelltext kann mehrere Termine verständlich zusammenfassen. Eine gemeinsame telefonische Bestellung wird nicht mit einer einzigen Lieferung verwechselt.

## Ordersätze und Preislisten

Ein **Ordersatz** ist eine wiederverwendbare Auswahl typischer Lieferantenartikel mit Reihenfolge, optionalen Ausgangsmengen und Verwendungshinweis. Beispiele: Küchen-Grundbestellung, Freitag-Nachbestellung, Zunftscheuer-Getränke. Er ist keine bereits aufgegebene Bestellung. Beim Anwenden wählt man Termine, passt Mengen an und prüft Preise und Gebinde.

Preislisten beziehen sich entweder auf **Einkauf beim Lieferanten** oder auf **Verkauf an Gäste**. Die im Küchenordner vorhandene Preisliste enthält Verkaufsprodukte und ist deshalb keine automatisch verwendbare Lieferantenpreisliste. Beide Preisarten brauchen eigene Kennzeichnung und Historie.

Import per CSV oder Excel zeigt zuerst einen Vergleich: neu, unverändert, Preisänderung, Gebindeänderung, nicht zuordenbar. Zuordnung über Lieferant, Lieferantenartikelnummer und Gebinde; Bezeichnung nur als zusätzlicher Hinweis. Fehlende Positionen einer neuen Datei werden nicht automatisch gelöscht. Mengenstaffeln, Netto/Brutto, Währung, Pfand und Gültigkeitsbeginn bleiben ausdrücklich erhalten.

Änderungen erzeugen einen neuen Preisstand. Historische Bestellungen und Rechnungen behalten ihre damaligen Werte. Ein Rechnungsbetrag wird nur nach ausdrücklicher Auswahl als neuer Einkaufspreis vorgeschlagen. Ein Skontohinweis wird nicht als bereits gewährter Rabatt behandelt. PDF-Preislisten laufen bei fehlender Tabellenstruktur über die gleiche geprüfte Erkennung wie Rechnungen.

## Rezepte und Bedarfsplanung

Verkaufsprodukte werden von Einkaufsartikeln getrennt. Eine Rezeptur enthält Zutatenmengen für eine festgelegte Ausbeute, beispielsweise zehn Portionen. Die App rechnet auf die geplante Portionszahl hoch, berücksichtigt bestätigte Umrechnungen und macht Fehlstellen sichtbar. Einkaufen in Kisten oder Säcken, Lagern in Flaschen oder kg und Verkaufen als Portion oder Glas sind eigene Einheiten.

Umrechnungen wie kg zu g sind eindeutig; „ein Sack“, „eine Flasche“ oder „eine Portion“ benötigen eine artikelbezogene Menge. Unterschiedliche Flaschengrößen und Ausschankmengen dürfen nicht stillschweigend gleichgesetzt werden. Getränke sind entweder direkter Artikelverkauf oder eine ausdrücklich zugeordnete Ausschank-/Mischrezeptur. Eine Sammlung mehrerer Getränke ist keine Rezeptur, die bei jedem Verkauf alle Zutaten verbraucht.

Eine Rezeptur beginnt als Entwurf. Erst eine geprüfte Version darf verbindliche Einkaufs- oder Verbrauchsvorschläge erzeugen. Änderungen legen eine neue Version an; frühere Planungen und Verkäufe behalten die damals zugeordnete Version. Die aus der Test-Excel rückgerechneten Rezepturen bleiben ungeprüft, bis jemand die Mengen bestätigt.

Planung erfolgt pro Veranstaltung und Verwendungsdatum. Aus Portionen entstehen Zutatenbedarfe. Verfügbare Bestände, bereits zugeordnete Reservierungen und rechtzeitig erwartete Lieferungen werden einmalig berücksichtigt. Der Vorschlag wird auf das gewählte Einkaufsgebinde gerundet. Herkunft und Rechenweg bleiben aufklappbar. Die App erzeugt zunächst prüfbare Bestellentwürfe, keinen automatischen Versand.

## Rechnungsimport und Abgleich

Der Ablauf lautet **Datei hinzufügen → Vorschläge prüfen → Bestellung/Lieferung zuordnen → bestätigen**. Am Rechner stehen Original und erkannte Felder nebeneinander. Am Handy kann man schnell zwischen beiden wechseln. Hervorgehoben werden unklare Zuordnungen und tatsächliche Abweichungen.

Die vorhandenen acht Rechnungs-PDFs wurden lokal strukturell geprüft: Alle elf Seiten enthalten auslesbaren Text. Eine Rechnung wurde zusätzlich visuell auf Tabellenaufbau geprüft. Das ermöglicht einen ersten Import ohne gebührenpflichtigen Cloud-Erkennungsdienst; es beweist noch keine korrekte Positionsauswertung. Originaldateien wurden nicht geändert oder in SharePoint importiert.

Digitale PDF-Texte werden im Browser ausgelesen. Für gescannte Belege ist später lokale Texterkennung mit klarer manueller Prüfung vorgesehen. Formate und Genauigkeit werden zuerst an euren Belegen nachgewiesen. Keine Zusage, beliebige Rechnungslayouts fehlerfrei zu erkennen. Ein Importprofil je Lieferant kann wiederkehrende Spalten und Artikelzuordnungen speichern. Strukturierte Rechnungsdaten lassen sich als weiterer Importadapter ergänzen, wenn eine solche Beispieldatei vorliegt.

Prüffelder: Lieferant, Rechnungsnummer, Datum, Positionen, Artikel, Menge, Einheit, Gebinde, Einzel- und Positionspreis, Preisart, Steuergruppen, Rabatt, Pfand, Versand, Endbetrag und Gutschriften. Unbekannte Werte bleiben offen. Originalausschnitt und Seite werden zum Vorschlag gespeichert. Dokumentinhalt ist Datenquelle und kann keine Anweisungen ausführen.

Eine Rechnung kann mehrere Lieferungen betreffen; eine Lieferung kann über mehrere Rechnungen abgerechnet werden. Der Vergleich zeigt bestellt, tatsächlich geliefert und berechnet. Differenzen lassen sich begründen oder zur Klärung offen halten. Auch ein Einkauf ohne vorherige Bestellung ist möglich: Beleg erfassen und tatsächlichen Warenzugang ausdrücklich bestätigen.

**Eine Rechnung erzeugt keinen zweiten Lagerzugang.** Datei-Hash und Lieferant plus Rechnungsnummer dienen getrennt zur Dublettenprüfung. Eine bestätigte Rechnung wird durch eine nachvollziehbare Korrektur oder Gutschrift berichtigt, nicht unbemerkt überschrieben. Ein Übertragungsfehler darf keine zweite Rechnung erzeugen.

## Import aus Kassen und Bestellsystemen

Vom Nutzer am 26.10.2026 ausdrücklich präzisiert: Der Import wird herstellerneutral gehalten. Die Produktbezeichnung lautet **Kassen- und Bestellsystem**. Zunächst werden **CSV und Excel im Format .xlsx** unterstützt. Ein bestimmter Hersteller ist weder Pflichtfeld noch Voraussetzung für die übrige Warenwirtschaft. Herstellerspezifische API-Anbindungen sind kein Teil dieses ersten Importwegs.

Der Ablauf lautet **Datei auswählen → Blatt und Kopfzeile wählen → Spalten zuordnen → Artikel und Zeitraum prüfen → bestätigen**. Die App schlägt passende Spalten vor; unbekannte Überschriften lassen sich manuell zuordnen. Die einmal geprüfte Zuordnung kann als frei benanntes Importprofil gespeichert werden. Beispielsweise „Kasse Zunftscheuer“ oder „Menübestellungen Küche“. Das Quellsystem ist ein frei gewählter Name, kein fest eingebauter Hersteller.

Jeder Import hat einen ausdrücklichen Zweck:

- **Verkäufe:** bestätigte tatsächliche Absatzmengen, optional Erlöse und Rabatte. Grundlage für Bestseller und – bei bestätigten Rezepturen – rechnerischen Verbrauch. Fehlende Erlöse bleiben offen und werden nicht aus einem aktuellen Verkaufspreis erfunden.
- **Menübestellungen:** vorbestellte Portionen für einen Veranstaltungstermin. Grundlage für Portionsplanung und Bedarf. Eine noch offene Menübestellung ist kein bereits erfolgter Verkauf und keine zweite Umsatz- oder Verbrauchsbuchung. Stornierte Bestellungen zählen nicht zum Bedarf. Auch eine als erfüllt bezeichnete Bestellung wird nicht allein dadurch als bezahlter Verkauf behandelt.

Typische Zuordnungsfelder sind Datum/Zeitraum, externer Artikelcode, Artikel-/Menübezeichnung, Menge, Einheit, Status, Standort/Bereich sowie optional Einzelpreis, Gesamtbetrag, Währung, Rabatt und externe Vorgangskennung. Welche Spalten erforderlich sind, hängt vom Importzweck ab. Nicht jeder Export muss alle Felder enthalten. Ein bloßer Zahlungs- oder Auszahlungsbericht ohne Artikel und Mengen reicht nicht für Bestseller oder Rezepturverbrauch. Personenbezogene Bestellerdaten sind für die geplante Mengenübernahme nicht erforderlich und werden nicht routinemäßig eingelesen.

CSV-Dateien können unterschiedliche Trennzeichen, Zeichencodierungen, Zahlen- und Datumsformate haben. Das Profil legt diese Interpretation fest; mehrdeutige Werte benötigen eine Entscheidung. Excel-Dateien werden nach Blatt und Kopfzeile eingelesen. Makros, externe Verknüpfungen und Formeln werden nicht ausgeführt. Ein fehlender oder unklarer gespeicherter Formelwert wird zur Prüfung gemeldet. Ältere binäre .xls-Dateien sind zunächst vor dem Import als .xlsx oder CSV zu speichern.

Die Vorschau zeigt Quelle, Importzweck, Saison, Bereich, Datum/Zeitraum, Währung, Summen und offene Produktzuordnungen. Artikel werden über feste externe Kennungen je Quellprofil zugeordnet; unbekannte Namen werden einmalig manuell verbunden. Die gleiche Kennung eines anderen Systems ist nicht automatisch derselbe Artikel. Abweichende Einheiten benötigen eine ausdrückliche Umrechnung. Rabatte werden nicht erneut abgezogen, wenn der Export sie bereits berücksichtigt. Rückerstattung und physische Warenrücknahme sind verschiedene Vorgänge.

Identische Dateien werden anhand der Prüfsumme erkannt. Zusätzlich werden normalisierte Inhalte und Überschneidungen geprüft: Die gleichen Verkäufe können in einem Tages- und Wochenbericht vorkommen. Wo stabile Vorgangskennungen fehlen, gilt ein abgestimmter nicht überlappender Berichtszeitraum je Quelle und Standort. Überlappende Berichte dürfen nicht additiv als neuer Absatz oder Verbrauch übernommen werden. Korrekturen ersetzen einen früheren Import kontrolliert oder bleiben zur Prüfung offen. Auch Umbenennen einer Datei oder erneutes Speichern als Excel darf keinen doppelten Import ermöglichen.

Ein nach Mitternacht endender Zunftabend erhält einen ausdrücklichen Betriebszeitraum. Eine Tageszuordnung wird nicht aus einem Dateinamen erraten. Ohne passende Zeitauflösung darf die App keine exakten stündlichen Bestände berechnen.

Für dieselbe Veranstaltung werden Verkäufe und Menübestellungen getrennt angezeigt. Sie können einander zum Abgleich zugeordnet werden, werden aber nicht blind addiert. Eine manuell gepflegte Portionsplanung und dieselben importierten Menübestellungen dürfen ebenfalls nicht doppelt als Bedarf angerechnet werden; die Planung wählt die gültige Grundlage oder eine ausdrücklich zusätzliche Menge.

Für die erste Betriebsfassung ist festgelegt: Verbrauch entsteht durch direkten Artikelverkauf oder durch Rezepturauflösung der bestätigten Verkäufe. Es gibt keine zusätzliche Herstellungsbuchung und keine automatische Bestandsführung produzierter Portionen. Damit werden dieselben Zutaten nicht zusätzlich schon beim Kochen ausgebucht. Speisenreste können im Abendresümee dokumentiert werden; sie werden nicht automatisch in Rohwaren zurückgerechnet. Eine spätere Produktionsverwaltung wäre ein eigener Ausbau. Echte Zählung und rechnerischer Bestand bleiben sichtbar unterscheidbar.

## Bestand und Saisonabschluss

Das Bewegungsjournal erfasst Anfangsbestand, tatsächlichen Zugang, Verbrauch, interne Verpflegung, Schwund, Rückgabe und Umlagerung mit Quelle, Person und wirksamem Zeitpunkt. Küche und Zunftscheuer können eigene Lagerorte haben. Umlagern erzeugt verknüpfte Abgangs- und Zugangsseiten, ohne den Vereinsgesamtbestand zu erhöhen. Leergut und Pfand werden getrennt von verkaufsfähigen Getränken erfasst.

Die vorhandene Zählliste bleibt der einfache Abendablauf. Ein Zählwert setzt einen beobachteten Bestand zu einem Zeitpunkt; er wird nicht zum bisherigen Bestand hinzuaddiert. Ältere Entwürfe dürfen neuere Beobachtungen nicht überdecken. Rückdatierte Bewegungen und verspätete Verkaufsimporte werden als Nachträge erkennbar behandelt; sie verändern nicht stillschweigend einen bereits gezählten Abschlussbestand.

Auswertungen verbinden belegten Einkauf, tatsächliche Lieferungen, bestätigte Verkäufe, internen Verbrauch, Restbestände und Rückgaben. Fehlende Preise, unvollständige Rezepturen oder Lücken im Kassenimport bleiben sichtbar. Ein Deckungsbeitrag ist nur mit passender Netto-/Bruttobasis und vollständiger Kostenbasis auszuweisen; ein Bruttoumsatz minus Netto-Einkauf ist keine belastbare Marge. Die erste Fassung zeigt Mengen und belegte Werte ohne Scheingenauigkeit.

Saisonübernahme kopiert Vorlagen und ausgewählte Planungen als neue Entwürfe. Bestände, Belegnummern, historische Verkäufe, Lieferbestätigungen und alte konkrete Termine werden nicht als neue Geschäftsvorfälle übernommen. Export und Wiederherstellung sind Teil der Betriebsfassung, damit Nachfolger die Daten weiterverwenden können.

## Datenstruktur und Speicherung

| Datengruppe | Wesentliche Verknüpfungen und Historie |
|---|---|
| Saison, Veranstaltung, Lagerort | Datum und Betriebszeitraum; Bereich getrennt vom physischen Ort |
| Lieferant, Lieferregel | Bestellweg, Vorlauf, Wochentage, Bestellschluss und Ausnahmen |
| Artikel, Lieferangebot, Artikelalias | Basiseinheit, Lieferantenkennung, Gebinde und bestätigte Umrechnung |
| Preisstand und Importlauf | Einkaufs-/Verkaufspreis, Gültigkeit, Mindestmenge, Quelle, Währung |
| Ordersatz mit Version | Geordnete Lieferartikel und optionale Ausgangsmengen, kein Bestellstatus |
| Bestellserie und Bestellung | Lieferant/Datum/Zielort, konkrete Positions- und Preis-Snapshots |
| Lieferung und Zuordnung | Tatsächlich angenommene Mengen, Abweichungen und Bestellbezug |
| Rechnung, Originaldatei, Abgleich | Mehrere Lieferungen je Rechnung möglich, Positionen und Korrekturen |
| Verkaufsprodukt und Rezepturversion | Ausbeute, Zutaten, direkter Artikelbezug oder Rezepturverbrauch |
| Portionsplan und Bedarfszuordnung | Verwendungstag, berücksichtigte Bestände und offene Lieferungen |
| Systemimport und Produktzuordnung | Frei benanntes Quellprofil, Zweck Verkäufe/Menübestellungen, Zeitraum, Standort, normalisierte Quelle und Dublettenschutz |
| Warenbewegung und Zählung | Quelle, Wirksamkeitszeit, Person, Korrekturbezug und Ort |

Bestehende Kennungen und historische Einheiten bleiben erhalten. Neue Bereiche bekommen eigene app-eigene Datengruppen; Dateien liegen in einer vorhandenen SharePoint-Dokumentbibliothek. Speicherzugriff wird von Import- und Rechenregeln getrennt, damit UI-Anpassungen keine Datenmigration verlangen.

SharePoint-Schreibvorgänge über mehrere Listen sind keine automatisch gemeinsame Datenbanktransaktion. Der Ausbau benötigt deshalb einen klaren Buchungsabschluss: zunächst vollständige, validierte Daten bereitstellen; anschließend genau eine bestätigte Vorgangskennung veröffentlichen. Auswertungen berücksichtigen nur vollständig bestätigte Vorgänge. Abbrüche bleiben wiederaufnehmbar. Bei Umlagerungen und Importen werden beide Seiten bzw. alle Positionen zusammen auf Vollständigkeit geprüft. Ein einfacher Test mit zwei Browsern und simuliertem Verbindungsabbruch ist vor Freigabe Pflicht.

Größere Datenmengen werden nach Saison, Zeitraum und Standort gefiltert und seitenweise geladen. Diese Filter benötigen eigene indizierte SharePoint-Metadaten statt ausschließlich Daten in einem JSON-Textfeld. Kassenimporte und Bewegungen dürfen nicht beim Start vollständig über alle Jahre geladen werden. Microsoft beschreibt für große Listen entsprechende Abfrageschwellen und indizierte Filter; die Grenze ist keine maximale Kapazität der gesamten Liste. [Microsoft zu großen Listen](https://support.microsoft.com/en-us/sharepoint/lists/data-and-lists/list-view-threshold-for-large-lists-and-libraries). Die heutige vollständige Workspace-Ladung muss dafür gezielt weiterentwickelt werden.

Bestehende ETag-Prüfungen, feste Vorgangskennungen, Wiederholungsschutz und Nachlesen werden weiterverwendet. Alte Clients müssen erweiterte Datensätze ablehnen, statt unbekannte Felder zurückzuschreiben. Keine neue Microsoft-Graph-Freigabe oder externe Hintergrundautomation wird für den geplanten Dateiimport vorausgesetzt. Falls ein gewünschter Automatismus später zusätzliche Rechte oder Gebühren benötigen würde, wird er vorher getrennt bewertet.

## Erscheinungsbild der Schelmenzunft

Am 26.10.2026 sichtbare Website-Quelle: [schelmenzunft.de](https://schelmenzunft.de/). Hauptblau **#3f4695**, dunkle Schrift **#20234b**, gedämpfte Beschriftung **#9091a5**, Weiß als Grundfläche. Fließtext und Navigation verwenden Montserrat; der Markenschriftzug verwendet Dancing Script. Das Original-Zunftlogo ist auf der Website vorhanden. Die Website wurde im Browser geprüft.

![CI der Zunftwebsite als Referenz](/Users/sorenkube/Documents/Codex/2026-10-22/moin-so-wir-sind-da-ich-4/outputs/WW-Ausbau-2026-10-26/CI-Website.jpg)

Vorgesehen: Original-Logo im App-Kopf, blau-weiße Farbwelt, Montserrat für eine gut lesbare Arbeitsoberfläche. Die Schreibschrift bleibt auf den Markenschriftzug begrenzt. Tabellen, Mengenfelder und Aktionen behalten die ruhige, bereits ausgewählte Struktur und große Klickflächen. Keine dekorativen Website-Animationen im Arbeitsablauf. Logo und verfügbare korrekt lizenzierte Schriftdateien werden lokal gebündelt; die App ist nicht von einem externen Schriftabruf abhängig. Statusfarben bleiben zusätzlich textlich erklärt.

## Reihenfolge und Abnahme

Der gesamte Zielumfang wird gemeinsam geplant, aber in betriebsfähigen Abschnitten gebaut. Kein Abschnitt erhält einen bloßen Menüeintrag ohne funktionierenden Ablauf.

1. **Einkauf und Vorbereitung:** CI, flexible Termine, Lieferregeln, Ordersätze, versionierte Preislisten und Mengenmatrix. Beispielabnahme: Ein Helfer bereitet je Lieferant Ware für Mittwoch, Freitag, Samstag und einen frei hinzugefügten Montag vor; Bestelltext und Lieferannahme zeigen die richtigen Termine.
2. **Rezepte und Bedarf:** Gerichte/Getränke anlegen, Rezeptversion prüfen, Portionen pro Abend planen, Bestand und offene Lieferungen einmalig anrechnen und echte Bestellentwürfe erzeugen.
3. **Belege und Warenfluss:** Eure digitalen Rechnungen einlesen, Positionen prüfen, Lieferungen zuordnen, Korrekturen und Direktkäufe erfassen; kein doppelter Warenzugang. Wareneingänge, Lagerorte, Retouren und Umlagerungen funktionieren zusammen.
4. **Kassen und Bestellsysteme und Abschluss:** CSV und Excel einlesen, Spalten und Artikel über Importprofile zuordnen, Verkäufe und Menübestellungen getrennt behandeln, Zeitüberschneidungen verhindern, Verkäufe und bestätigten Sollverbrauch auswerten, Abendzählung und Saisonbericht verbinden.

Für jeden Abschnitt: Regeln mit echten Grenzfällen testen, Bedienung mit realistischen Artikellisten und künstlichen Geschäftsvorfällen prüfen, Paket bauen, danach getrennte Prüfung in der vorhandenen Teams-Registerkarte. Änderungen werden lokal vorbereitet; keine tägliche Fernsteuerung des Microsoft-Editors nötig. Eine automatische Veröffentlichungspipeline ist ein eigener, bisher nicht eingerichteter Betriebsweg.

Für die abschließende Abnahme muss eine wenig erfahrene Person ohne Hilfestellung einen neuen Lieferanten samt Angebot und Ordersatz anlegen, eine Rezeptur eingeben, eine Mehrtagesbestellung vorbereiten, eine Teillieferung erfassen, eine abweichende Rechnung prüfen, einen Kassenexport einlesen und eine Zählung fortsetzen können. Zwei Personen dürfen dabei keine gespeicherten Änderungen unbemerkt überschreiben.

## Fachliche Gegenprüfung

Eine unabhängige Gegenprüfung hat die fehlende Festlegung zur Produktion hervorgehoben. Der Entwurf entscheidet diesen Punkt als Vorschlag für die erste Betriebsfassung: keine gesonderte Herstellungsbuchung, sondern direkter Artikelverbrauch oder Rezepturverbrauch aus bestätigten Verkäufen. Diese Entscheidung vereinfacht den Dienstablauf; sie ist keine bereits vom Nutzer getroffene Fachentscheidung. Weitere wesentliche offene Planungsfragen wurden über die Importmaterialien hinaus nicht benannt.

## Importmaterial und Freigabestand

Der Nutzer hat den Gesamtumfang am 26.10.2026 freigegeben und den Kassenimport ausdrücklich auf einen herstellerneutralen Import aus Kassen- und Menübestellsystemen per Excel oder CSV präzisiert. Die genaue SumUp-Variante ist damit keine Voraussetzung für die Umsetzung. Ein tatsächlicher Export des später eingesetzten Systems bleibt für die abschließende Prüfung dieses Dateiformats nötig. Bis dahin wird mit nachvollziehbaren künstlichen CSV- und Excel-Dateien gearbeitet; damit ist noch keine echte Herstelleranbindung nachgewiesen.

Die acht vorhandenen Rechnungs-PDFs können als lokaler, unveränderter Prüfkorpus dienen. Lieferantenpreislisten in einem strukturierten Format sind noch nicht als bestätigter Prüfkorpus identifiziert. Die bestehende Verkaufs-Preisliste und Test-Excel werden nicht ohne Prüfung als aktuelle Betriebsdaten übernommen.

Die Freigabe betrifft den beschriebenen Funktionsumfang. Die Umsetzung wird auf der bestehenden SPFx-Basis geplant. Eine Produktivveröffentlichung oder Datenübernahme ist damit nicht als bereits erfolgt behauptet.
