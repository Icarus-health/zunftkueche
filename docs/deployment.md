# Microsoft-Bereitstellung: Umgebung bereit, App-Bereitstellung läuft

Stand 15.10.2026: Die genehmigte Sandbox „Zunftküche“ ist bereit (Umgebung `5684204c-3254-ec15-93f4-276ec50cc65b`, `https://org1d76e28a.crm17.dynamics.com`, EU/EFTA, zugeteilte Region Schweiz). Code Apps ist aktiviert; einer der zehn vorhandenen Pro-App-Pässe ist nach erneutem Laden bestätigt zugeteilt. Der Erstzugang bleibt ausschließlich `Vorstand@Schelmenzunft.onmicrosoft.com`; weitere App-Rollen oder Teamfreigaben sind nicht eingerichtet.

Die beiden Tabellen, der aktive Receipt-Schlüssel, beide APIs, drei Plug-in-Typen und sechs Guards sind bereitgestellt. Das exakt geprüfte v5-Paket wurde in Root-Lauf90335 installiert und unabhängig79283 verifiziert. Lauf25963 bestätigte einen echten Commit auf Revision1, identische Wiederholung ohne weitere Wirkung, den Konfliktpfad und zwölf unterstützte Workspace-Ablehnungen. Anschließend stoppte die bisherige Prüfung bei DeleteMultiple mit HTTP405; der Datenbestand blieb unverändert. Receipt-Ablehnungen und die neue vollständige `denials-only`-Fortsetzung sind noch nicht live bestätigt. Der gestoppte Lauf wird nicht nachträglich als vollständig bestanden dargestellt.

Die echten generierten Dienste und die einmalige Microsoft-Initialisierung sind bereits vorhanden. Code App und Teams-App sind noch nicht veröffentlicht; tatsächlicher App-Start, Pass-Nutzung, Browser-/Reload-/Speicherverhalten und Teams-Abnahme bleiben offen. Aktuelle Einzelnachweise stehen in `deployment-status-2026-10-15.json` und `acceptance-2026-10-15.txt`; diese Zustände sind getrennt von lokalen Tests zu führen.

## Vertrag und Grenzen

Ein stabiler GUID-Datensatz `zk_kitchenworkspace` speichert den gesamten Küchenbestand einschließlich archivierter Veranstaltungen. Diese ID ist unabhängig von `state.event.id`. Der aktuell zugelassene Vorstand darf das komplette Dokument ändern. Gleichberechtigte Bearbeiter- und Leserrollen beschreiben einen späteren, gesondert freizugebenden Ausbau. Der Server prüft das gespeicherte Schema und schützenswerte Historie, führt aber **keinen TypeScript-Reducer erneut aus**. Der angegebene Operationstyp ist Auditmetadatum und keine Einschränkung der Bearbeiterrechte.

`zk_KitchenLoad(RequestJson)` und `zk_KitchenCommit(RequestJson)` sind globale synchrone Custom API Actions. Beide liefern `ResultJson` als Zeichenkette im SDK-Ergebnis `data.ResultJson`; `success:false` ist kein Erfolg.

```json
{"protocolVersion":1,"workspaceId":"<stabile GUID>"}
```

Load antwortet mit `protocolVersion`, `workspaceId`, `state` und einem erforderlichen booleschen `canWrite`. `canWrite` stammt aus `RetrievePrincipalAccess` für den aufrufenden Benutzer und den konkreten Workspace. Es steuert die Leseansicht; der Server prüft die Rechte unabhängig davon bei jedem Commit.

```json
{"protocolVersion":1,"workspaceId":"<stabile GUID>","operationId":"<unveränderliche ID>","expectedRevision":0,"operation":{"type":"article.price","payload":{"articleId":"a-1","priceCents":123.45}},"candidateState":"<hier das echte KitchenState-Objekt>"}
```

Commit antwortet mit `protocolVersion`, `workspaceId`, `operationId`, `status` (`saved`, `conflict` oder `rejected`), `appliedRevision` (bei Konflikt `null`) und vollständigem `state`. Bei einer Wiederholung kann der aktuelle Zustand neuer als `appliedRevision` sein. Die gespeicherte Receipt-Revision muss zur ursprünglichen Basisrevision + 1 gehören.

Eine definitive Kandidatenablehnung ist ausdrücklich typisiert: `status:"rejected"`, `rejectionCode:"candidate_validation"`, `appliedRevision:null`, `requestHash` (SHA-256 der exakten Anfragebytes) und der unveränderte gültige Serverzustand. Sie wird ausschließlich durch die Kandidatenvalidierung erzeugt, nachdem Zugriff, vorhandene Receipts und erwartete Revision geprüft wurden, aber bevor ein Speicheraufruf beginnt. Receipt-Inhalts-/Benutzerkonflikte, fehlende Rechte, Infrastrukturfehler und Fehler ab Beginn des Speicherns bleiben Fehlerantworten mit unbestätigtem Ausgang. Englischsprachige Fehlermeldungen werden nicht als Ablehnungsbeweis ausgewertet. Der Adapter prüft Hash, Workspace, Vorgangs-ID, Basisrevision und das Fehlen dieser Vorgangs-ID im zurückgegebenen Zustand, bevor er die offene Anfrage entfernt. Nach einer so bestätigten Ablehnung ist eine Korrektur möglich; beim Reload kann der gültige Zustand wieder angezeigt werden.

Der Server prüft das Receipt vor dem Versionskonflikt. Derselbe Vorgang mit denselben **UTF-8-Anfragebytes** und demselben authentifizierten Benutzer wird bestätigt, ohne nochmals zu schreiben. Andere Bytes oder ein anderer Benutzer unter derselben ID werden abgewiesen. CAS verwendet die echte Dataverse-RowVersion und `IfRowVersionMatches`; Workspace-Update und Receipt-Erstellung müssen im selben synchronen Dataverse-Transaktionskontext stattfinden. Servicefehler entweichen und werden nicht innerhalb einer gescheiterten Transaktion wiederholt.

Der Browser berechnet den Kandidaten einmal mit dem vorhandenen Reducer. Vor dem Vormerken/Senden prüft er die bekannten 512-KiB-Zustands- und 640-KiB-Anfragegrenzen sowie Tiefe, Texte und Sammlungs-/Metadatengrenzen. Diese Vorprüfung ersetzt nicht die vollständige serverseitige Invariantenprüfung. Eine offene Anfrage bleibt im stabilen Repository und im `sessionStorage` des Tabs unverändert erhalten. Nach einem Reload wird sie nach erfolgreichem Load mit denselben Bytes erneut übertragen. Automatisches Rebase ist ausgeschlossen. Schließen/Verwerfen des Tabs kann diesen lokalen Wiederholungsbeleg verlieren; die serverseitigen Receipts bleiben bestehen. Die Produktionsinitialisierung verlangt einen `PendingStore`: standardmäßig den Browser-`sessionStorage`, alternativ einen ausdrücklich übergebenen Speicher mit atomarem `setItem`. Fehlt er, wird die Initialisierung abgewiesen; scheitert das Vormerken, wird nicht gesendet. Die exportierte Low-Level-Factory kann in isolierten Tests ohne Speicher betrieben werden und garantiert dann nur Wiederholung innerhalb derselben Repository-Instanz.

Grenzen: Zustand maximal 512 KiB UTF-8, gesamte Anfrage maximal 640 KiB, Tiefe 32, Sammlungen maximal 10.000, einzelne Texte maximal 50.000 Zeichen und engere Feldgrenzen. Geschichte wird niemals gekürzt. Ein volles Dokument wird übertragen; parallele Bearbeitungen verschiedener Veranstaltungen können daher ebenfalls konfligieren. Schema 2 wird erwartet; das Originalimportformat Schema 1 muss vor kontrollierter Bereitstellung normalisiert werden (Revision 0, leere operationIds/operationRequests).

Quellprovenienz und lokale Herkunftspfade bleiben unverändert; Pfade sind nur Daten und werden serverseitig nie geöffnet. Bestehende Veranstaltungen, vorbereitete Bestellversionen, Bewegungs-/Lernhistorie und bereits erfasste Verkaufspreise bleiben erhalten. Bei Quellbelegen sind Original-Wirtschaftsdaten unveränderbar. Ergänzungen und Korrekturen fehlender Originalbelege benötigen Originalbaseline und append-only Änderungshistorie. Die beiden bestehenden Rewe-Listenpositionen mit gleichem Lieferanten/Beleglabel werden nur unter ihren unveränderten vorhandenen Identitäten toleriert; neue Duplikate werden abgewiesen. Dokumentlinks erlauben nur HTTPS ohne Benutzerinfo unter `.sharepoint.com`; eine konkrete Tenant-Hostliste wurde mangels genehmigter Umgebung nicht erfunden.

## Reproduzierbar bauen

Voraussetzungen: Node mit TypeScript-Strip-Unterstützung, Python 3 und .NET SDK 8.0.426 (oder kompatibel). Auf diesem Rechner liegt das offizielle SDK unter `../dotnet/dotnet`. Auf einem anderen Rechner kann `KITCHEN_DOTNET` auf das installierte SDK zeigen. `server/build.sh` legt CLI-Home und NuGet-Cache im übergeordneten Arbeitsordner ab, deaktiviert Telemetrie/Erststartzertifikaterzeugung und verwendet gepinnte Lockfiles. `server/NuGet.Config` erlaubt ausschließlich die offizielle NuGet-Quelle.

```sh
npm test
npm run build
npm run build:server
```

Der Serverlauf liest die vorhandene lokale `import/2026.json`, erzeugt lokale Reducer-Testzustände unter `server/Tests/obj`, führt die echten C#-Validatoren und den realen Guard mit künstlichen SDK-Kontexten unter .NET 8 aus und kompiliert dieselben Validatoren zusammen mit den tatsächlichen `IPlugin`-Implementierungen für .NET Framework 4.6.2. Das allgemeine Buildziel `server/artifacts/Zunftkueche.Dataverse.1.0.0.nupkg` ist vom eingefrorenen Bereitstellungsartefakt zu unterscheiden. Aktuell installiert und geprüft ist `server/artifacts/guard-target-normalization-v5/Zunftkueche.Dataverse.1.0.0.nupkg` (297290 Bytes, SHA256 `6d74048606fd199b06a20c2856752eb56e87e7bd6bb9d634bdef80387c596247`); dessen fünfteiliger Quellenbeleg liegt daneben als `source-manifest.sha256`. Frühere Pakete bleiben erhalten; ein neuer Build ersetzt keinen geprüften Pin. `verify-package.py` prüft, dass ausschließlich `Kitchen.Dataverse.dll` und die ausdrücklich paketierte `Newtonsoft.Json.dll` enthalten sind; SDK-Assemblies, Originaldaten und Testfixtures sind ausgeschlossen. Der SHA-256-Wert steht in `package-verification.json`.

Microsoft erlaubt abhängige Assemblies im Plug-in-NuGet-Package. Die unsignierte DLL darf nicht als einzeln registrierte Assembly behandelt werden; für den vorgesehenen Packagepfad ist Strong Naming nicht erforderlich. Kein ILMerge. Quellen: [Build and package plug-in code](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/build-and-package), [optimistic concurrency](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/optimistic-concurrency).

## Registrierungsdefinition und Reihenfolge nach Freigabe

`server/deployment/registration.json` ist eine vollständige lokale Spezifikation für Tabellenattribute, Schlüssel, APIs, Plug-in-Typen, Guard-Schritte und Rollen; **kein bereits importiertes Solution-ZIP**. Eine freigegebene Umgebung und ein genehmigter Zugriffskreis bleiben Voraussetzung für die Umsetzung.

1. Genehmigte Standard-Dataverse-Umgebung und Zugriffsgruppe, Code Apps, Lizenzen, Publisher `zk`, Bereitstellungsrechte und verantwortlichen Betreiber bestätigen. Kein Wechsel auf eine unbeschränkte Default-/Developer-Umgebung als Umgehung.
2. Standardtabellen entsprechend JSON anlegen: Workspace benutzer-/teambesessen mit optimistischer Parallelität; Receipts organisationsbesessen. `zk_actor` ist eine servergeschriebene GUID-Zeichenkette, kein zusätzlicher Benutzer-Lookup. Der Receipt-Workspace-Lookup verwendet `Restrict` für Löschung. Den zusammengesetzten Schlüssel `(zk_workspace, zk_operationid)` anlegen und den Indexstatus **Active** verifizieren.
3. Einen geprüften initialen Schema-2-Workspace mit stabiler GUID und dem angemeldeten Vorstand als Eigentümer in einer kontrollierten Kopie normalisieren und importieren, **bevor** die Write-Guards aktiviert werden. Für die erste Bereitstellung sind keine weiteren App-Nutzer freigegeben. Load/Commit erzeugen bei fehlenden Daten niemals automatisch einen Workspace. Dabei sämtliche Original-IDs, Werte und `source`-Provenienz erhalten. Absolute `localPath`-Felder nur in dieser geprüften Cloud-Kopie entfernen; Originaldateien und lokale Originaldaten unverändert behalten. Für spätere Provisionierung wäre ein gesondert geprüfter administrativer Ablauf nötig.
4. Das echte Plug-in-Package im Sandboxmodus installieren. APIs an `KitchenLoadPlugin` bzw. `KitchenCommitPlugin` binden, globale Action, `AllowedCustomProcessingStepType=None`, `WorkflowSdkStepEnabled=false`. Beide laufen synchron als aufrufender Benutzer, ohne Impersonation. `ExecutePrivilegeName` anhand tatsächlicher `Privilege.Name`-Metadaten verifizieren; lokale Sollwerte stehen in der JSON-Datei. `IsPrivate=false` ermöglicht Metadatengenerierung und ersetzt keine Berechtigungsprüfung.
5. **Sechs einzelne Guard-Registrierungen sind Pflicht:** `KitchenWriteGuardPlugin` auf Create/Update/Delete für jede der beiden nachweislich Standardtabellen, synchron Stage 20, Mode 0, Rank 1, Calling User, ohne Attributfilter. Alle verfügbaren zugehörigen Filter und aktive exakte Handler-/Nachrichten-/Filterbindungen prüfen. Den auf einzelne `Target`-Objekte ausgelegten Guard niemals zusätzlich auf Multiple-Ereignisse registrieren: deren `Targets`-Eingabe wird vom strikten `Target`-Guard abgewiesen und kann einen gültigen Commit zurückrollen. Standard-Upsert führt Create oder Update aus; eine separate Upsert-Registrierung ist dafür keine Voraussetzung. CreateMultiple/UpdateMultiple werden über die zusammengeführten individuellen Ereignisse geschützt. Die zehn separaten `guardCoverage`-Einträge im Vertrag dokumentieren Upsert und die vier Multiple-Nachrichten je Tabelle; sie sind keine zehn weiteren Registrierungen und kein Laufzeitnachweis. UpsertMultiple ist bereits bei Unterstützung von CreateMultiple **und** UpdateMultiple potenziell verfügbar, auch ohne eigenen Filter. Seine tatsächlichen Create-/Update-Pfade bleiben ein Root-Prüfpunkt. DeleteMultiple gilt nur bei verifiziertem Standard-Tabellentyp als dokumentiert nicht unterstützt; fehlende Filter allein beweisen das nie. Bereits vorhandene zusätzliche oder abweichende Guard-Schritte stoppen den Ablauf zur Prüfung; das Werkzeug deaktiviert, ändert oder löscht sie nicht. Der aktuelle v5-Guard bindet Schreibvorgänge an die ursprüngliche RequestJson des exakt geprüften Commit-Quellkontexts, direkt oder über genau einen eng geprüften Create/Update-Wrapper. Das Workspace-Update erlaubt die ursprünglichen zwei Geschäftsattribute oder die exakt gemessenen sechs Attribute einschließlich geprüfter ID, aufrufendem systemuser, UTC-modifiedon und explizit null gesetztem modifiedonbehalfby. Andere Formen bleiben gesperrt; die Receipt-Bindung bleibt separat geprüft.
6. Für einen später ausdrücklich freigegebenen Team-Ausbau: Leser erhalten Workspace Read, Bearbeiter Workspace Read/Write/AppendTo sowie Receipt Read/Create/Append auf Organisationsebene. Keine gewöhnlichen Create/Delete/Assign/Share-Rechte am Workspace, keine Receipt Write/Delete-Rechte, keine Plug-in-/Business-Logic-Bypass-Privilegien. API-Privilegbesitz und konkreter Datensatzzugriff separat prüfen. Bearbeiter erhalten vollständige Küchenbearbeitung; keine durch den Browser gewählte Rolle. Diese zusätzlichen Rollen werden beim aktuellen Einzelzugang nicht eingerichtet.
7. App-Sharing zunächst ausschließlich für Vorstand prüfen. Die unten genannten Tests mit gewöhnlichen Konten bleiben bis zur Freigabe weiterer Nutzer eine gesonderte offene Abnahmegrenze; der erfolgreiche Admin-Zugriff beweist sie nicht.

Microsoft beschreibt die [zusammengeführten Nachrichtenpipelines und Bulk-Verfügbarkeit](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/bulk-operations#message-pipelines-merged) sowie den [Upsert-Prozess für Standardtabellen](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/use-upsert-insert-update-record#understand-the-upsert-process-for-standard-tables). Diese Metadatenzuordnung ersetzt die echte Abnahme nicht: Root muss einen gültigen gewöhnlichen Commit mit genau einer Revision und einem Receipt sowie die Ablehnung direkter Create/Update/Delete/Upsert-, einzelner und mehrzeiliger CreateMultiple/UpdateMultiple- und beider UpsertMultiple-Pfade nachweisen. Auch der erlaubte Vorstand ist direkt zu prüfen, damit fehlende Tabellenprivilegien eine Guard-Lücke nicht verdecken. Bei Ablehnung bleiben Workspace und Receipts unverändert. Die ursprüngliche Paketdatei bleibt erhalten. Die heutige Guard-Implementierung ist das separat geprüfte v5-Artefakt; ihr erfolgreicher Commit beweist noch nicht sämtliche Ablehnungspfade oder eine spätere Benutzer-/Teams-Abnahme.

## Vorhandene Code-Apps-Initialisierung

Die echten CLI-generierten Klassen heißen `Zk_KitchenLoadService` und `Zk_KitchenCommitService` unter `src/generated/services/`. `src/bootstrap/microsoft.ts` wartet auf den verifizierten Host-Kontext, importiert anschließend die echten Dienste und konfiguriert das Repository einmal vor dem React-Mount. Die feste Workspace-ID steht in `src/bootstrap/start.ts`: `45deaf94-5661-4110-8f16-3d2678c09f04`. Keine zweite Initialisierung oder Platzhalterdienste hinzufügen. Außerhalb eines gültigen Microsoft-Hosts bleibt der Microsoft-Build gesperrt; er fällt nicht auf lokale Daten zurück.

`power.config.json` und Datenquellenmetadaten stammen aus der tatsächlichen Generierung. Installiert sind `@microsoft/power-apps`1.5.0 und CLI1.3.0. Die Dienste verwenden den unterstützten SDK-Transport und `IOperationResult.data.ResultJson`. Eine erneute Generierung ist ein eigener kontrollierter Aktualisierungsschritt, kein ausstehender Erstanschluss. [Offizieller Code-Apps-Custom-API-Ablauf](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/add-dataverse-action-function)

## Ausstehende Liveabnahme

Lokale Tests beweisen Validierung, Serialisierung, Fehlerbehandlung und dass CAS/Receiptdaten an den Speicheradapter übergeben werden. Sie beweisen **keine Dataverse-Transaktionen, registrierten Rollen oder Benutzerakzeptanz**. Die bestätigten Vorstand-Ergebnisse stehen oben. Weiter offen beziehungsweise für einen später freigegebenen Mehrnutzer-Ausbau getrennt nachzuweisen:

- Bei später freigegebenen Leserrollen: Leser lädt Daten, alle UI-Mutationen sind gesperrt und direkte Commit-/CRUD-/Bulkversuche werden serverseitig verweigert.
- Bei später freigegebenen weiteren Bearbeitern: Beide Bearbeiter können ausschließlich berechtigte Workspaces lesen/schreiben; dritte unberechtigte Identität bleibt ausgeschlossen.
- Zwei Anfragen mit derselben Basisrevision: genau eine Wirkung, andere Anfrage nach frischem Retry als Konflikt; keine verlorenen Änderungen.
- Gleiches Receipt und identische Bytes: eine Wirkung; anderer Inhalt oder Benutzer: Ablehnung.
- `IsInTransaction=true` bei der tatsächlichen Action. Erzwungener Fehler nach Workspace-Update vor Receipt-Erstellung rollt **beide** Änderungen zurück. Dies in isolierter Abnahmeumgebung mit temporärem kontrolliertem Test-Plugin prüfen, nicht mit einem produktiven Browserflag.
- Timeout nach Commit plus Reload wiederholt unveränderte Bytes und erhält Bestätigung; gespeicherte Daten sind nach neuer Anmeldung vorhanden. Echte serverseitige Kandidatenablehnung liefert den hashgebundenen `rejected`-Vertrag, erlaubt anschließend Korrektur und blockiert keinen erneuten Load. Unbekannte Fehler oder veränderte Bestätigungen erhalten dagegen die offenen Anfragebytes.
- Alle unterstützten direkten CRUD-/Bulkpfade, Lösch-/Share-/Assign- und Bypass-Berechtigungen prüfen; aktive Schlüssel, RowVersion, Paketabhängigkeiten und normale Benutzerrollen dokumentieren.
- Quellprovenienz, Originalbelege, Korrekturhistorie, vorbereitete Bestellungen und historische Verkaufspreise über einen Veranstaltungswechsel wiederfinden.

## Lokales Einrichtungswerkzeug (15.10.2026)

`server/Deploy` ist ein separates .NET-10-Konsolenprojekt; es wird nicht ins Plug-in-Paket aufgenommen. Die offiziellen Abhängigkeiten Microsoft.Identity.Client 4.83.0 und Newtonsoft.Json 13.0.3 sind samt transitiven Versionen in Lockfiles festgehalten. Das Werkzeug liest ausschließlich den unveränderten Vertrag, das Original `import/2026.json` und das bereits geprüfte nupkg. Abweichende SHA-256-Werte stoppen vor Anmeldung. Feste Workspace-ID: `45deaf94-5661-4110-8f16-3d2678c09f04`.

Aus dem Repository-Verzeichnis, nachdem der separate Code-Review abgeschlossen ist:

```sh
# Vollständig offline: keine Anmeldung, keine Provider-Anfragen, keine Änderungen.
bash server/Deploy/run.sh --phase inspect --dry-run

# Read-only; zeigt genau einmal AUTH_URL für das Öffnen durch Root in DuckDuckGo.
bash server/Deploy/run.sh --phase inspect

# Phasen einzeln nach Prüfung des vorherigen Ergebnisses starten.
bash server/Deploy/run.sh --phase tables
bash server/Deploy/run.sh --phase seed
bash server/Deploy/run.sh --phase backend
bash server/Deploy/run.sh --phase verify
```

Ohne Argumente gilt `inspect`. Weitere Eingaben: `--url`, `--contract`, `--seed`, `--package`; das Ziel und die Datei-Inhalte sind fest auf den freigegebenen Stand begrenzt. `.local-state` ist als Seed ausgeschlossen. Die Schema-2-Kopie entsteht ausschließlich im Arbeitsspeicher: Revision 0, leere operationIds/operationRequests; nur `localPath` wird aus dieser Kopie entfernt. Der tatsächliche Servervalidator prüft sie. Original-IDs, Werte und sonstige Provenienz bleiben erhalten. Der Datensatz gehört ausschließlich dem angemeldeten Vorstand. Es gibt keine Rollen-/Teamfreigabe, keine Lösch-/Updatefunktion und keine Speicherung von Tokens, Anmeldecodes oder Credentials.

Die Anmeldung verwendet Microsofts dokumentierten öffentlichen SDK-Beispielclient ausschließlich für dieses lokale Sandbox-Werkzeug, mit mandantenspezifischer Authority, `user_impersonation`, MSAL-PKCE und Loopback. Der Prozess startet selbst keinen Browser; Root öffnet die öffentliche `AUTH_URL` im genehmigten DuckDuckGo und übernimmt bei einer zusätzlichen Einwilligung. Token und MSAL-Cache bleiben nur im Speicher dieses Prozesses. Jede Phase startet eine neue Anmeldung. Nach der Anmeldung müssen Mandant, Account, Issuer, Dataverse-Organisation, aktiver Systemuser und dessen Entra-Objekt-ID übereinstimmen; außerdem werden Deutsch und EUR gelesen. Fehler enthalten eigene Fehlercodes und bei HTTP-Ablehnung höchstens zusätzlich einen streng geprüften Dataverse-Code aus `error.code` (exakt `0x` plus acht ASCII-Hexzeichen). Dafür werden maximal 8 KiB Antwortdaten ausgewertet; malformed/fehlende/überlange Diagnosen bleiben beim generischen HTTP-Status. Remote-Fehlermeldungen, Antwortbodies, URLs, Header und Tokenwerte werden nie ausgegeben.

Das Werkzeug vergleicht vorhandene Ressourcen und stoppt bei abweichenden Definitionen oder mehrfachen Identitäten. Nach jedem POST wird die kanonische Ressource erneut gelesen; auch bei Timeout/HTTP-Fehler wird zuerst nachgelesen und nie blind erneut geschrieben. Ein noch nicht sichtbares Ergebnis stoppt den Lauf. Später kann die Phase erneut aufgerufen werden. Fehlende Solution-Zugehörigkeit, inaktiver Schlüssel, fehlende Typen/API-Metadaten sowie unvollständige oder deaktivierte Guards verhindern die Metadatenfreigabe. Der Offline-Bericht zählt sechs erforderliche einzelne Guard-Paare und zehn Abdeckungsnachweise getrennt. Im angemeldeten Lauf werden die zehn Pfade als `guard_coverage` mit getrennten Feldern für `availability`, `metadataCoverage` und `runtimeAcceptance:pending_root_live_check` ausgegeben. Fehlende Bulk-Filter bleiben `availability_unconfirmed`; UpsertMultiple bleibt bei beiden C/U-Multiple-Filtern `potentially_supported`. Jede Zuordnung erhält eine blockierende `root_runtime_check_required`-Lücke. Es gibt keinen Schalter zum Wegattestieren. Dadurch bleibt `metadataReady` auch bei vollständigen Guard-Metadaten bis zur gesonderten Root-Laufzeitabnahme falsch; dieses Werkzeug speichert keine Laufzeitatteste und gibt die App nicht frei. Rückgabecodes: 0 erfolgreicher Lauf (bei inspect dürfen Ressourcen fehlen), 1 Fehler/Drift, 2 offene Verifikationslücken.

Lokale Wiederherstellung, Tests und Build (nur offizielle NuGet-Quelle; absolute Cachepfade):

```sh
export DOTNET_CLI_HOME="$(pwd)/../dotnet-home"
export NUGET_PACKAGES="$(pwd)/../nuget"
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 DOTNET_GENERATE_ASPNET_CERTIFICATE=false
../dotnet10/dotnet restore server/Deploy.Tests --configfile server/NuGet.Config --locked-mode
../dotnet10/dotnet build server/Deploy.Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet10/dotnet server/Deploy.Tests/bin/Debug/net10.0/Kitchen.Deploy.Tests.dll
```

Die Payloads folgen den offiziellen [Tabellenmetadaten](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-definitions-using-web-api), [Lookup-Beziehungen](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-relationships-using-web-api), [PluginPackage-Feldern](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/pluginpackage?view=dataverse-latest), [Custom-API-Deep-Inserts](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/create-custom-api-with-code) und [Nachrichtenfiltern](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/sdkmessagefilter?view=dataverse-latest). Tabellen-, Beziehungs-, Schlüssel-, Paket- und API-Payloads wurden inzwischen im konkreten Tenant angenommen und unabhängig nachgelesen. Das beweist weder App-Veröffentlichung noch vollständige Benutzerabnahme. Die OAuth-Grundlage ist [Microsofts Dataverse-OAuth-Dokumentation](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/authenticate-oauth), der Browseraufruf folgt [MSAL-Systembrowseroptionen](https://learn.microsoft.com/en-us/entra/msal/dotnet/acquiring-tokens/using-web-browsers).


## Feste Fortsetzung der Ablehnungsprüfung

`server/Acceptance` unterstützt `--phase denials-only`. Ohne `--execute` bleibt dieser Aufruf vollständig offline. Nach unabhängiger Prüfung darf Root die ausführende Variante einmal gezielt starten:

```sh
../dotnet10/dotnet build server/Acceptance --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
../dotnet10/dotnet server/Acceptance/bin/Debug/net10.0/Kitchen.Acceptance.dll --phase denials-only
# Erst nach Prüfung und ausdrücklich beabsichtigter Provider-Prüfung:
../dotnet10/dotnet server/Acceptance/bin/Debug/net10.0/Kitchen.Acceptance.dll --phase denials-only --execute
```

Die Fortsetzung prüft erneut Identität, Tabellen, Schlüssel, v5-Paket, Typen/APIs, alle sechs Guards, feste interne Schritte, Administratorrolle und Prüfdatensätze. Zusätzlich verlangt sie genau Revision1, Receipt-Gesamtzahl3 (zwei Prüf-Receipts und ein echtes Commit-Receipt), Fingerprint `8050006306b60bda077c3086a809c6b7d311ec8f5f6d1cc055f16914b5e7c0c6`, den unveränderten erwarteten Küchenzustand und das eindeutige Receipt des bereits bestätigten Vorgangs. Der Request-Hash muss `8e9c02522e69ce5f05a7389b182bda4670510de85d9a9af4d3d8d44cea77ab4c` sein. Der wirkliche Load muss dazu passen. Es gibt keinen Schalter für einen abweichenden Zwischenstand und keinen neuen Commit, Replay oder Konfliktversuch. Den früheren vollständigen `runtime`-Aufruf nicht wiederholen.

Die Phase führt 24 unterstützte feste Ablehnungsversuche aus, jeweils mit dem exakt gleichen geprüften Vorherzustand und unabhängigem Nachlesen. Erfolg einer verbotenen Mutation, unbekannte Antwort, Routingfehler, Timeout, fehlendes Nachlesen oder jede Zustandsänderung stoppen sofort ohne Wiederholung. Für DeleteMultiple werden ausschließlich zwei getrennte Verfügbarkeitseinträge `documented_unsupported_standard_table`, `Executed=false`, `GuardExecutionProved=false` ausgegeben: Microsoft beschränkt diese Nachricht auf elastische Tabellen. Weder vorhandene Filter noch eine allgemeine CSDL-Bindung ändern diese Einordnung. Es gibt keinen weiteren DeleteMultiple-POST und keine pauschale405-Erfolgsregel.

Erst nach allen24 tatsächlichen Ablehnungen lautet `supportedDenialsComplete=true`; `RootReleaseAllowed` bleibt für diese Teilphase false. Root kombiniert den neuen Bericht ausdrücklich mit den historischen Save-/Replay-/Konfliktnachweisen aus25963. Veröffentlichung, Browser/Reload und Teams bleiben gesonderte offene Abnahmen. Aktuell ist diese Fortsetzung noch nicht live ausgeführt.
