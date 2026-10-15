# Microsoft-Bereitstellung: lokal gebaut, noch nicht im Tenant eingerichtet

Diese Arbeitsversion enthält einen echten kompilierten Dataverse-Plug-in-Server und einen typisierten Browseradapter. **Fortschreibung 15.10.2026:** Der Nutzer hat das bestehende Zunft-Team als Zugriffsgruppe ausdrücklich freigegeben. Die Umgebung „Zunftküche“ mit Dataverse wurde daraufhin erstellt und im Admin Center als bereit bestätigt: 5684204c-3254-ec15-93f4-276ec50cc65b, https://org1d76e28a.crm17.dynamics.com, EU/EFTA (zugeteilte Region Schweiz), Sandbox. Die App soll zunächst ausschließlich vom Konto Vorstand@Schelmenzunft.onmicrosoft.com verwendet werden. Es bestehen noch keine registrierten Küchentabellen, APIs, Guards oder veröffentlichten Apps. Weitere Rollen, App-Pässe und Verbindungen wurden noch nicht eingerichtet. Die produktive App bleibt ohne echte generierte Dienste gesperrt. Die lokale Arbeitsversion arbeitet weiter wie bisher. Aktueller Stand: deployment-status-2026-10-15.json.

## Vertrag und Grenzen

Ein stabiler GUID-Datensatz `zk_kitchenworkspace` speichert den gesamten Küchenbestand einschließlich archivierter Veranstaltungen. Diese ID ist unabhängig von `state.event.id`. Zwei gleichberechtigte Bearbeiter dürfen das komplette Dokument ändern; eine Leserrolle darf nur lesen. Der Server prüft das gespeicherte Schema und schützenswerte Historie, führt aber **keinen TypeScript-Reducer erneut aus**. Der angegebene Operationstyp ist Auditmetadatum und keine Einschränkung der Bearbeiterrechte.

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

Der Serverlauf liest die vorhandene lokale `import/2026.json`, erzeugt lokale Reducer-Testzustände unter `server/Tests/obj`, führt die echten C#-Validatoren und den realen Guard mit künstlichen SDK-Kontexten unter .NET 8 aus und kompiliert dieselben Validatoren zusammen mit den tatsächlichen `IPlugin`-Implementierungen für .NET Framework 4.6.2. Der NuGet-Plug-in-Packagepfad ist `server/artifacts/Zunftkueche.Dataverse.1.0.0.nupkg`. `verify-package.py` prüft, dass ausschließlich `Kitchen.Dataverse.dll` und die ausdrücklich paketierte `Newtonsoft.Json.dll` enthalten sind; SDK-Assemblies, Originaldaten und Testfixtures sind ausgeschlossen. Der SHA-256-Wert steht in `package-verification.json`.

Microsoft erlaubt abhängige Assemblies im Plug-in-NuGet-Package. Die unsignierte DLL darf nicht als einzeln registrierte Assembly behandelt werden; für den vorgesehenen Packagepfad ist Strong Naming nicht erforderlich. Kein ILMerge. Quellen: [Build and package plug-in code](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/build-and-package), [optimistic concurrency](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/optimistic-concurrency).

## Registrierungsdefinition und Reihenfolge nach Freigabe

`server/deployment/registration.json` ist eine vollständige lokale Spezifikation für Tabellenattribute, Schlüssel, APIs, Plug-in-Typen, Guard-Schritte und Rollen; **kein bereits importiertes Solution-ZIP**. Eine freigegebene Umgebung und ein genehmigter Zugriffskreis bleiben Voraussetzung für die Umsetzung.

1. Genehmigte Standard-Dataverse-Umgebung und Zugriffsgruppe, Code Apps, Lizenzen, Publisher `zk`, Bereitstellungsrechte und verantwortlichen Betreiber bestätigen. Kein Wechsel auf eine unbeschränkte Default-/Developer-Umgebung als Umgehung.
2. Standardtabellen entsprechend JSON anlegen: Workspace benutzer-/teambesessen mit optimistischer Parallelität; Receipts organisationsbesessen. `zk_actor` ist eine servergeschriebene GUID-Zeichenkette, kein zusätzlicher Benutzer-Lookup. Der Receipt-Workspace-Lookup verwendet `Restrict` für Löschung. Den zusammengesetzten Schlüssel `(zk_workspace, zk_operationid)` anlegen und den Indexstatus **Active** verifizieren.
3. Einen geprüften initialen Schema-2-Workspace mit stabiler GUID und Kitchen-Team-Eigentümer in einer kontrollierten Kopie normalisieren und importieren, **bevor** die Write-Guards aktiviert werden und bevor gewöhnliche Benutzer Zugriff erhalten. Load/Commit erzeugen bei fehlenden Daten niemals automatisch einen Workspace. Dabei sämtliche Original-IDs, Werte und `source`-Provenienz erhalten. Absolute `localPath`-Felder nur in dieser geprüften Cloud-Kopie entfernen; Originaldateien und lokale Originaldaten unverändert behalten. Für spätere Provisionierung wäre ein gesondert geprüfter administrativer Ablauf nötig.
4. Das echte Plug-in-Package im Sandboxmodus installieren. APIs an `KitchenLoadPlugin` bzw. `KitchenCommitPlugin` binden, globale Action, `AllowedCustomProcessingStepType=None`, `WorkflowSdkStepEnabled=false`. Beide laufen synchron als aufrufender Benutzer, ohne Impersonation. `ExecutePrivilegeName` anhand tatsächlicher `Privilege.Name`-Metadaten verifizieren; lokale Sollwerte stehen in der JSON-Datei. `IsPrivate=false` ermöglicht Metadatengenerierung und ersetzt keine Berechtigungsprüfung.
5. `KitchenWriteGuardPlugin` synchron Stage 20, Rank 1, Calling User, ohne Attributfilter auf **allen unterstützten** Mutationsnachrichten beider Tabellen registrieren: Create/Update/Delete/Upsert sowie CreateMultiple/UpdateMultiple/UpsertMultiple/DeleteMultiple. Verfügbarkeit über `SdkMessageFilter` prüfen. Nicht unterstützte Nachrichten und ihre Nichtaufrufbarkeit dokumentieren. Bei einer unterstützten ungeschützten Schreibmöglichkeit keine Bearbeiterrolle freigeben. Der Guard erlaubt ausschließlich das Workspace-Update und das Erstellen eines Receipts aus dem erwarteten laufenden Commit-Kontext. Receipt-Update/-Delete und Bulkpfade bleiben auch innerhalb dieses Kontextes gesperrt.
6. Leser: Workspace Read im Kitchen-Team. Bearbeiter: Workspace Read/Write/AppendTo über dasselbe Team sowie Receipt Read/Create/Append auf Organisationsebene. Keine gewöhnlichen Create/Delete/Assign/Share-Rechte am Workspace, keine Receipt Write/Delete-Rechte, keine Plug-in-/Business-Logic-Bypass-Privilegien. API-Privilegbesitz und konkreter Datensatzzugriff separat prüfen. Beide Bearbeiter erhalten vollständige Küchenbearbeitung; keine durch den Browser gewählte Rolle.
7. App-Sharing und Umgebungszugang zusätzlich einrichten. Die unten genannten Liveprüfungen zuerst mit gewöhnlichen Konten durchführen.

## Echte Code-Apps-Dienste anschließen

Installiert sind `@microsoft/power-apps` 1.5.0 und CLI 1.3.0. Erst nach tatsächlicher API-Bereitstellung und freigegebenem Verbindungsaufbau:

```sh
pa app find-dataverse-api --search zk_Kitchen --json
pa app add dataverse-api --api-name zk_KitchenLoad
pa app add dataverse-api --api-name zk_KitchenCommit
```

Die CLI erzeugt reale Schemas, Dienste, `power.config.json` und Datenquellenmetadaten. Namen/Pfade und die Parameterreihenfolge in den erzeugten Dateien prüfen. Dann in der App-Initialisierung **vor** dem React-Mount konfigurieren:

```ts
import { configureMicrosoftRuntime } from './data/microsoft-runtime.ts';
// Pfade durch die tatsächlich von der CLI erzeugten Pfade ersetzen.
import { zk_KitchenLoadService } from './generated/services/zk_KitchenLoadService';
import { zk_KitchenCommitService } from './generated/services/zk_KitchenCommitService';
configureMicrosoftRuntime('<genehmigte stabile Workspace-GUID>', {
  load: zk_KitchenLoadService,
  commit: zk_KitchenCommitService,
});
```

Diese Importbeispiele sind keine vorgetäuschten vorhandenen Dateien. Der lokale Adapter nimmt die tatsächlichen generierten Serviceklassen typisiert entgegen. Die Klassen verwenden ihr echtes `getClient(dataSourcesInfo)` und die vom SDK/Generator unterstützte Transportform; es werden keine Datenquellenmetadaten konstruiert oder private SDK-Interna importiert. Die aktuelle SDK-Typdefinition liefert `IOperationResult.data`, nicht ein frei geratenes `value`. Nach Generierung den tatsächlichen `ResultJson`-Output mit der SDK-Version testen. [Offizieller Code-Apps-Custom-API-Ablauf](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/add-dataverse-action-function)

## Ausstehende Liveabnahme

Lokale Tests beweisen Validierung, Serialisierung, Fehlerbehandlung und dass CAS/Receiptdaten an den Speicheradapter übergeben werden. Sie beweisen **keine Dataverse-Transaktionen, registrierten Rollen oder Benutzerakzeptanz**. Vor Freigabe separat nachweisen:

- Leser lädt Daten, alle UI-Mutationen sind gesperrt und direkte Commit-/CRUD-/Bulkversuche werden serverseitig verweigert.
- Beide Bearbeiter können ausschließlich berechtigte Workspaces lesen/schreiben; dritte unberechtigte Identität bleibt ausgeschlossen.
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

Die Anmeldung verwendet Microsofts dokumentierten öffentlichen SDK-Beispielclient ausschließlich für dieses lokale Sandbox-Werkzeug, mit mandantenspezifischer Authority, `user_impersonation`, MSAL-PKCE und Loopback. Der Prozess startet selbst keinen Browser; Root öffnet die öffentliche `AUTH_URL` im genehmigten DuckDuckGo und übernimmt bei einer zusätzlichen Einwilligung. Token und MSAL-Cache bleiben nur im Speicher dieses Prozesses. Jede Phase startet eine neue Anmeldung. Nach der Anmeldung müssen Mandant, Account, Issuer, Dataverse-Organisation, aktiver Systemuser und dessen Entra-Objekt-ID übereinstimmen; außerdem werden Deutsch und EUR gelesen. Fehler enthalten ausschließlich eigene Fehlercodes, keine Antwortbodies oder Tokenwerte.

Das Werkzeug vergleicht vorhandene Ressourcen und stoppt bei abweichenden Definitionen oder mehrfachen Identitäten. Nach jedem POST wird die kanonische Ressource erneut gelesen; auch bei Timeout/HTTP-Fehler wird zuerst nachgelesen und nie blind erneut geschrieben. Ein noch nicht sichtbares Ergebnis stoppt den Lauf. Später kann die Phase erneut aufgerufen werden. Fehlende Solution-Zugehörigkeit, inaktiver Schlüssel, fehlende Typen/API-Metadaten sowie unvollständige oder deaktivierte Guards verhindern die Metadatenfreigabe. Nicht vorhandene Bulk-Filter werden als `unavailable_*_requires_runtime_confirmation` dokumentiert: das Werkzeug behauptet deren Nichtaufrufbarkeit nicht. Root muss diese im echten Tenant prüfen; die Lücke lässt sich nicht per Schalter wegattestieren. `metadataReady` ist nur bei `verify` ohne Lücken wahr; tatsächliche Runtime-/Browserabnahme bleibt immer separat. Rückgabecodes: 0 erfolgreicher Lauf (bei inspect dürfen Ressourcen fehlen), 1 Fehler/Drift, 2 offene Verifikationslücken.

Lokale Wiederherstellung, Tests und Build (nur offizielle NuGet-Quelle; absolute Cachepfade):

```sh
export DOTNET_CLI_HOME="$(pwd)/../dotnet-home"
export NUGET_PACKAGES="$(pwd)/../nuget"
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 DOTNET_GENERATE_ASPNET_CERTIFICATE=false
../dotnet10/dotnet restore server/Deploy.Tests --configfile server/NuGet.Config --locked-mode
../dotnet10/dotnet run --project server/Deploy.Tests --no-restore -p:UseSharedCompilation=false
../dotnet10/dotnet build server/Deploy --no-restore -p:UseSharedCompilation=false
```

Die Payloads folgen den offiziellen [Tabellenmetadaten](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-definitions-using-web-api), [Lookup-Beziehungen](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-relationships-using-web-api), [PluginPackage-Feldern](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/pluginpackage?view=dataverse-latest), [Custom-API-Deep-Inserts](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/create-custom-api-with-code) und [Nachrichtenfiltern](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/sdkmessagefilter?view=dataverse-latest). Die erste Paketregistrierung und die Annahme dieser Payloads durch den konkreten Tenant sind trotz erfolgreicher lokaler Tests erst durch Root live zu bestätigen. Die OAuth-Grundlage ist [Microsofts Dataverse-OAuth-Dokumentation](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/authenticate-oauth), der Browseraufruf folgt [MSAL-Systembrowseroptionen](https://learn.microsoft.com/en-us/entra/msal/dotnet/acquiring-tokens/using-web-browsers).
