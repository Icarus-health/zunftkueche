# Eigenständige Zunftküche als PWA

**Überholt durch die anschließende Nutzerkorrektur vom 19. Oktober 2026:** Die Lösung soll ohne zusätzliche laufende Kosten möglichst mit den vorhandenen Microsoft-Lizenzen betrieben werden. Render und andere kostenpflichtige Hosting-Angebote sind nicht freigegeben. Der folgende Entwurf bleibt als historische Alternative erhalten und ist keine aktive Umsetzungsfreigabe. Zunächst wird die bereits funktionierende Power-Apps-Code-App mit Dataverse weitergenutzt; ein App-Symbol oder eigenes Browserfenster ist getrennt von einer eigenständigen/offlinefähigen PWA zu bewerten.

Stand 19. Oktober 2026. Konkreter Entwurf zur Prüfung; die eigenständige PWA ist noch nicht implementiert und kostenpflichtiges Hosting noch nicht beauftragt. Der Nutzer hat den Wechsel zur PWA und die Weiterentwicklung beauftragt und fragt nach Hosting und Entwicklung. Dieser Entwurf konkretisiert den neuen Betrieb und die Umstellung.

## Ziel und vorhandener Stand

Die vorhandene Küchenverwaltung soll über eine eigene Adresse und ein installierbares App-Symbol erreichbar sein. Planung, Warenwirtschaft, Rezepturen, Kalkulation, Bestellungen, Lieferungen und Auswertung bleiben der fachliche Kern. Zunächst bearbeiten Vorstand und Schreiber; ein Säckelmeister kann später eine gezielte Lesefreigabe erhalten. Die bestehende Microsoft-App bleibt während Entwicklung und Abnahme erreichbar.

Der bestehende React-/TypeScript-Code einschließlich der Fachlogik und quellenbezogenen Importdaten wird weiterverwendet. Der tatsächliche Browserablauf mit Schreiber wurde am 19. Oktober mit Laden, Speichern unveränderter Termine und Neuladen erfolgreich geprüft. Die persönliche Teams-App 0.1.0 ist installiert, scheitert aber beim Öffnen an einem Microsoft-Anmeldefehler. Die veränderte Teams-Testversion 0.1.1 wurde nicht hochgeladen; weitere Teams-Experimente sind eingestellt.

Das Ziel ist eine handhabbare Anwendung für einen kleinen Verein. Vollständige Offline-Synchronisierung, ein neues Kassensystem, Nachrichten an Lieferanten und eine zusätzliche Teams-App gehören nicht zur ersten PWA-Version.

## Empfohlener Betrieb

Ein betreuter Node-Webdienst bei Render liefert Oberfläche und API unter derselben HTTPS-Adresse aus. Eine betreute PostgreSQL-Datenbank liegt zusammen mit dem Webdienst in Frankfurt. Die Datenbank ist nur intern für den Dienst erreichbar. Microsoft Entra ID bleibt der Anmeldedienst; Power Apps und Dataverse sind keine Laufzeitabhängigkeiten der neuen Anwendung.

Zunächst wird die vom Hoster bereitgestellte HTTPS-Adresse verwendet. `kueche.schelmenzunft.de` ist eine mögliche spätere Wunschadresse; Verfügbarkeit und DNS-Zugriff sind nicht geprüft. Ein Render-Konto und ein privates Quellcode-Repository sollen dem Verein gehören. Der einfache Kostenansatz setzt einen Hosting-Verantwortlichen voraus; die Zahl der Küchenbenutzer ist davon unabhängig.

Frankfurt bezeichnet den gewählten Standort der Anwendungs- und Datenbankinstanzen. Daraus folgt keine Zusage, dass sämtliche Verwaltungs-, Support-, Protokoll- und Sicherungsdaten ausschließlich in Deutschland verarbeitet werden. Vor Übertragung echter Vereinsdaten sind die konkreten Anbieterbedingungen und der Auftragsverarbeitungsvertrag zu prüfen und zuzuordnen.

### Kostenrahmen

Nach den am 19. Oktober geprüften öffentlichen Angaben kostet ein ständig laufender Webdienst mit 512 MB RAM 7 US-Dollar und die kleinste bezahlte PostgreSQL-Instanz mit 256 MB RAM 6 US-Dollar pro Monat. Hinzu kommen gegebenenfalls zugeteilter Speicher, Mehrverbrauch und Steuern. Die Quellen sind beim ersten enthaltenen GB Speicher nicht ganz einheitlich; deshalb dient rund 15 US-Dollar pro Monat als Budgetansatz, nicht als Preisgarantie.

Dieser Ansatz nutzt den gebührenfreien Hobby-Workspace mit einem Hosting-Verantwortlichen, aber bezahlte Dienst- und Datenbankinstanzen. Ein Pro-Workspace mit mehreren Hosting-Verantwortlichen kostet zusätzlich 25 US-Dollar monatlich. Eine dauerhaft laufende zusätzliche Testinstallation, langfristige externe Sicherungsablage und ein Domain-Neukauf sind im Einstiegspreis nicht enthalten. Vor jeder Bestellung wird die tatsächliche Anbieterübersicht mit dem freigegebenen Budget abgeglichen. Es wurde nichts bestellt.

Die kostenlose Render-Datenbank ist wegen Ablauf nach 30 Tagen kein Betriebsziel. Auch ein Dienst, der nach Inaktivität einschläft, soll nicht die fertige Küchenlösung bedienen.

### Betrachtete Alternativen

| Variante | Einordnung für die Zunftküche |
| --- | --- |
| Render mit Node und PostgreSQL | Empfohlen: ein Hosting-Anbieter für Oberfläche, API und Datenbank; bestehende TypeScript-Fachlogik läuft auch auf dem Server. |
| Getrenntes Frontend bei Cloudflare oder Vercel und Backend bei Supabase | Möglich; bringt einen zusätzlichen Anbieter und eine andere Backend-Anbindung. Supabase Pro beginnt öffentlich bei 25 US-Dollar monatlich; der Free-Plan kann bei Inaktivität pausieren. Ein bereits geeignetes Vereinsabonnement wäre vor Neubestellung zu berücksichtigen. |
| Eigener virtueller Server | Technisch möglich; Betriebssystem, Sicherheitsupdates und Sicherungen müssten selbst betreut werden. Passt schlechter zum gewünschten geringen Verwaltungsaufwand. |

## Anwendung und Datenzugriff

### Oberfläche und Build

Ein ausdrücklich gewählter eigenständiger Build bekommt ein separates Ausgabeverzeichnis. Der vorhandene Power-Apps-Build wird erhalten. Die aktuelle Produktionsvorgabe in Bootstrap und Vite wird nicht pauschal abgeschaltet; jeder Modus erhält eine eindeutige Konfiguration. Fehlende Anmeldung oder Datenverbindung führt zu einer verständlichen Sperr- oder Fehleransicht, niemals zu einem lokalen Ersatzdatenbestand.

Die vorhandene Repository-Schnittstelle dient als Übergang. Eine neue HTTP-Anbindung lädt Daten und Berechtigungen vom eigenen Server. Die lokale Entwicklungsanbindung mit festem Schreibrecht wird nicht unverändert veröffentlicht. Verbindungs- und Speichermeldungen nennen den tatsächlichen Zustand und behaupten keine lokale Speicherung bei einer Serverbestätigung.

Die Veranstaltungsauswahl bleibt pro Browser/Sitzung. Ein Wechsel in der Oberfläche darf die Auswahl eines zweiten Bearbeiters nicht verändern. Jeder Änderungsauftrag enthält eine ausdrückliche Zielveranstaltung. Gemeinsame Stammdaten und Jahresübernahmen bleiben fachlich erhalten; die bestehende interne Darstellung wird über eine gezielte Anpassung der Ereigniszuordnung weiterverwendet.

### Anmeldung und Rollen

Microsoft-Anmeldung im normalen Browser mit dem für Webanwendungen vorgesehenen Authorization-Code-Verfahren. Der Server prüft Signatur, Aussteller, Zielgruppe, Ablauf, Anmeldezustand und Nonce mit einer gepflegten Bibliothek. PKCE wird verwendet. Zugang erhalten ausschließlich ausdrücklich hinterlegte Identitäten aus dem Vereinsmandanten, geprüft anhand von Mandanten- und Benutzerobjekt-ID.

Vorstand und Schreiber erhalten die Bearbeiterrolle der neuen App. Eine spätere Leserrolle wird gezielt zugewiesen. Eine Microsoft-Anmeldung oder eine bekannte E-Mail-Adresse allein erteilt keinen Datenzugriff. Der Server prüft die aktuelle Mitgliedschaft bei jedem API-Zugriff, auch bei wiederholten Schreibanfragen. Fehlende Konfiguration sperrt den Zugriff.

Serversitzungen liegen dauerhaft in PostgreSQL, Browser erhalten nur einen sicheren HttpOnly-Sitzungscookie. Schreibzugriffe werden gegen fremde Ursprünge und CSRF geschützt. Geheimnisse liegen in den geschützten Einstellungen des Hosters; keine Tokens oder Datenbankkennwörter werden an die Oberfläche ausgeliefert oder ins Repository aufgenommen. Für den Anfang werden nur die Anmeldeberechtigungen benötigt; keine neue pauschale Graph-/SharePoint-Leseberechtigung.

### Speicherung und gleichzeitige Bearbeitung

Der Server akzeptiert fachliche Änderungsaufträge, keinen vom Browser vorgegebenen vollständigen Ersatzbestand. Er lädt den gültigen Stand, prüft Rechte und Zielveranstaltung, sperrt die betroffene Arbeitszeile in einer PostgreSQL-Transaktion, prüft die Revision und führt die vorhandene Fachlogik aus. Datenstand, Änderungsnachweis und Wiederholungsschutz werden gemeinsam gespeichert oder gemeinsam verworfen.

Für den kleinen Benutzerkreis bleibt zunächst ein versioniertes Arbeitsdokument mit strukturierter PostgreSQL-Speicherung bestehen. Eine globale Revision kann auch bei unabhängigen Änderungen zu einem sichtbaren Konflikt führen; stilles Überschreiben ist ausgeschlossen. Eine komplette Normalisierung sämtlicher Fachobjekte ist kein Voraussetzung für den PWA-Start.

Wiederholte Anfragen nach einem Verbindungsabbruch nutzen dieselbe Vorgangs-ID. Die dedizierte Vorgangstabelle bindet ID, Arbeitsbereich, handelnden Benutzer und den kanonischen fachlichen Auftrag. Gleiche Wiederholung erzeugt keine zweite Buchung; andere Daten unter derselben ID werden abgelehnt. Der bisher im Arbeitsdokument anwachsende Verlauf der Wiederholungsbelege wird bei der Umstellung kontrolliert in diese Struktur überführt. Importhistorie und Herkunft bleiben nachvollziehbar. Vom Server erzeugte Bestellzeitpunkte werden mit dem gespeicherten Vorgang festgehalten.

Ein ausstehender Auftrag wird für die Wiederaufnahme nach einem Browserneustart an die angemeldete Identität gebunden zwischengespeichert. Nach einem Kontowechsel gibt es keine automatische Wiederholung fremder Aufträge. Eine verlorene Serverantwort gilt in der Oberfläche als unbestätigt; erneutes Senden desselben Auftrags klärt den Zustand sicher.

## PWA und Belege

Manifest, passende Symbole und HTTPS machen die Anwendung auf unterstützten Geräten installierbar. Eine kleine Service-Worker-Strategie hält ausschließlich öffentliche App-Dateien vor. API-Antworten, Anmeldung, Belege und private Kücheninhalte werden nicht vom Service Worker zwischengespeichert. Die Offline-Ansicht zeigt verständlich, dass für aktuelle Daten und bestätigtes Speichern eine Verbindung nötig ist. Sie verspricht keinen Offline-Arbeitsbestand.

Neue App-Versionen werden angezeigt und erst ohne offenen Speichervorgang aktiviert. Abmelden beendet die Serversitzung; lokaler Wiederaufnahmestand wird kontrolliert verworfen beziehungsweise vor einem Verlust offener Änderungen erklärt. Cookies, lokale Speicherung und installierte App-Fenster werden auf den Zielgeräten tatsächlich getestet.

Vorhandene Belegverweise auf SharePoint bleiben erhalten und öffnen die Dokumente mit den bestehenden Microsoft-Dateiberechtigungen. Lokale Mac-Pfade und der Entwicklungs-Endpunkt zum Lesen lokaler PDFs werden nicht veröffentlicht. Originalrechnungen werden nicht automatisch auf einen neuen Anbieter kopiert. Ein eigener Belegupload oder ein automatischer SharePoint-Dateizugriff wäre eine gesonderte Erweiterung; fehlende Dokumente bleiben erkennbar.

## Sicherung und Umstellung

Bezahlte Render-PostgreSQL-Instanzen bieten laufende Sicherungen mit Wiederherstellung innerhalb der letzten drei Tage im Hobby-Workspace, sieben Tage ab Pro. Das kurze Wiederherstellungsfenster ersetzt kein Jahresarchiv. Die App bekommt einen berechtigten vollständigen Datenexport; vor und nach dem Zunftabend wird eine datierte Kopie im Vereinsarchiv aufbewahrt. Eine Wiederherstellung wird in einer getrennten Testdatenbank geprüft, ohne produktive Daten zu überschreiben. Langfristige automatische externe Sicherungen benötigen später eine ausdrücklich ausgewählte Ablage und einen zusätzlichen Kostenansatz.

Entwicklungs- und Testläufe verwenden klar gekennzeichnete Kopien. Für die endgültige Übernahme gilt eine kurze, mit den Bearbeitern abgestimmte Schreibpause in der Microsoft-App. Der dann aktuelle Dataverse-Stand wird exportiert, mit Revision und Prüfsumme gesichert und auf unerwünschte lokale Pfade geprüft. Nicht der ältere Ausgangsimport, sondern der kontrollierte aktuelle Stand wird übernommen. Mengen, Preise, IDs, offene Angaben und Herkunft werden vor und nach dem Import verglichen. Unmittelbar vor Freigabe der PWA-Schreibzugriffe wird die Quellrevision erneut gelesen. Hat sie sich seit dem Export geändert, wird die endgültige Übernahme wiederholt; bei unklarer Revision bleibt die PWA gesperrt. So können während einer längeren Abnahme angefallene Microsoft-Änderungen nicht verloren gehen.

Nach gemeinsamer Abnahme gibt es einen eindeutigen Umschaltzeitpunkt. Gleichzeitige produktive Bearbeitung zweier voneinander unabhängiger Datenbestände wird vermieden. Die alte Microsoft-Installation und die Quellunterlagen bleiben erhalten. Bei einem späteren Rückwechsel werden zwischenzeitliche PWA-Änderungen erst gesichert und abgeglichen; das bloße Öffnen des alten Links wäre kein Datenrollback.

## Entwicklung und Abnahme

Entwicklung am bestehenden React-/TypeScript-Projekt in einer eigenen Git-Arbeitslinie. Änderungen kommen in kleine Pakete mit unabhängigen Agenten-Gegenprüfungen. Die Node-API und PostgreSQL laufen für die lokale Entwicklung mit Testkonfiguration. Ein privates Vereins-Repository speichert den Code und die automatische Prüfung, keine Echtdaten, Rechnungen oder Geheimnisse.

Zuerst werden der eigenständige Start und die Serveranbindung, dann Rechte und transaktionales Speichern, anschließend Installation und Aktualisierung fertiggestellt. Fachlicher Umfang und vertraute Ansichten bleiben erhalten. Eine geschützte Testversion wird mit getrenntem Datenbestand geprüft; ihre tatsächlichen Hostingkosten werden vor Anlegen benannt. Die Freigabe der produktiven Version erfolgt erst nach den folgenden Nachweisen:

- Installation und Öffnen auf den tatsächlich genutzten Rechnern/Mobilgeräten; Microsoft-Anmeldung und Wiederanmeldung im installierten Fenster.
- Bearbeiter kann speichern und nach einem vollständigen Neuladen dieselben Daten sehen. Leser kann lesen und wird auch bei direkten API-Schreibversuchen abgewiesen. Fremde Identitäten erhalten keinen Datenzugriff.
- Zwei Bearbeiter: gleichzeitige Änderung führt entweder zum richtigen Ergebnis oder zu einem erklärten Konflikt. Veranstaltungsauswahl bleibt unabhängig.
- Netzabbruch vor und nach der Serverbestätigung, Wiederholung, Browser- und Serverneustart erzeugen keine verlorenen oder doppelten Vorgänge. Kontowechsel übernimmt keine fremden offenen Aufträge.
- App-Update unterbricht keinen offenen Speichervorgang. API-, Authentifizierungs- und Dokumentdaten bleiben aus dem öffentlichen Cache und Build ausgeschlossen.
- Der Importvergleich und eine Wiederherstellung aus einer Sicherung sind tatsächlich bestanden. Anwendung, Datenbank, Domain, Abrechnung und Wiederherstellung sind für die Nachfolge dokumentiert.
- Die finale Übernahme erfolgt unter Schreibpause mit erneutem Vergleich der Dataverse-Revision; ein zwischenzeitlicher Quellschreibzugriff verhindert die Freigabe des veralteten PWA-Standes.

## Entscheidungen vor dem kostenpflichtigen Betrieb

Dieser Entwurf benötigt die Zustimmung zum Aufbau mit einem Hosting-Verantwortlichen und dem Budgetansatz von rund 15 US-Dollar monatlich zuzüglich Steuern/Mehrverbrauch. Der Anbieter-Endpreis, das Vereinskonto und die Vertragszuordnung werden vor Bestellung geprüft. Ein zweiter Hosting-Verantwortlicher, dauerhafte Testinstanzen oder zusätzliche externe Sicherungen ändern den Kostenansatz und werden nicht stillschweigend hinzugebucht.

## Quellen

- [Render Preisübersicht](https://render.com/pricing) und [konkretes offizielles Kostenbeispiel](https://render.com/articles/production-rails-hosting-guide): Webdienst 7 US-Dollar, kleinste bezahlte PostgreSQL-Instanz 6 US-Dollar.
- [Render Abrechnungsbeispiel und Speicher](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses): zusätzliche Speicherkosten und getrennte Berechnung von Workspace und Ressourcen.
- [Render Workspace-Funktionen](https://render.com/docs/platform-features-by-plan): ein Hosting-Verantwortlicher im Hobby-Workspace; zusätzliche Funktionen ab Pro.
- [Render Regionen](https://render.com/docs/regions): Frankfurt und privates Netz innerhalb einer Region.
- [Render Sicherung und Wiederherstellung](https://render.com/docs/postgresql-backups): drei beziehungsweise sieben Tage Wiederherstellungsfenster, getrennte Wiederherstellungsinstanz.
- [Render kostenlose Instanzen](https://render.com/docs/free): Einschränkungen und Ablauf kostenloser Datenbanken.
- [Render Bereitstellung](https://render.com/docs/deploys): automatische Bereitstellung nach bestandenen Codeprüfungen.
- [Supabase Preise](https://supabase.com/pricing) und [Pausierung](https://supabase.com/docs/guides/platform/free-project-pausing): eingeordnete Alternative.
- [Microsoft OpenID Connect](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc): Anmeldung eigenständiger Webanwendungen mit festgelegtem Mandanten.
- [MDN installierbare PWAs](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable): Installation, Manifest und HTTPS; Offline-Arbeit ist eine eigene Fähigkeit.
