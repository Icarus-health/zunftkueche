# Küchenzugriff für Schreiber

Der Helfer `server/Access` ist ausschließlich für `Schreiber@Schelmenzunft.onmicrosoft.com` in der bestehenden Zunftküchen-Umgebung bestimmt. Er verwendet die geprüfte administrative Anmeldung als Vorstand. Er erstellt keinen Benutzer und übernimmt weder App-Freigabe noch Teams-Richtlinie, Lizenzierung oder Plattform-Basisrolle.

Die eigene Rolle **Zunftküche Bearbeiter** enthält genau:

| Tabelle | Privilegien | Tiefe |
| --- | --- | --- |
| `zk_kitchenworkspace` | Read, Write, AppendTo | Basic |
| `zk_kitchenoperation` | Read, Create, Append | Global |

Die direkte Freigabe betrifft ausschließlich Workspace `45deaf94-5661-4110-8f16-3d2678c09f04` mit ReadAccess, WriteAccess und AppendToAccess. Eigentümer bleibt Vorstand. Der Helfer liest keine Zustandsinhalte und führt keine Küchen-Commits aus. Er prüft Eigentümer und Revision (mindestens 2, innerhalb des Laufs unverändert) vor und nach Freigabeschritten.

## Aufruf

Im Repository mit dem vorhandenen .NET-10-SDK bauen; vorher unabhängig geprüften Commit verwenden:

```sh
DOTNET_CLI_HOME=../dotnet-home ../dotnet10/dotnet restore server/Access/Tests --locked-mode
DOTNET_CLI_HOME=../dotnet-home ../dotnet10/dotnet build server/Access/Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
DOTNET_CLI_HOME=../dotnet-home ../dotnet10/dotnet server/Access/Tests/bin/Debug/net10.0/Kitchen.Access.Tests.dll
```

Ohne Argumente: ausschließlich lokaler Plan, keine Anmeldung oder Provideraufrufe.

```sh
../dotnet10/dotnet server/Access/bin/Debug/net10.0/Kitchen.Access.dll
```

Nach unabhängiger Prüfung zuerst tatsächlichen Bestand lesen:

```sh
../dotnet10/dotnet server/Access/bin/Debug/net10.0/Kitchen.Access.dll --inspect
```

Erst nach Bewertung dieses Ergebnisses freigeben:

```sh
../dotnet10/dotnet server/Access/bin/Debug/net10.0/Kitchen.Access.dll --execute
```

Die Anmeldung gibt ausschließlich eine öffentliche `AUTH_URL` aus; Root öffnet diese normal in DuckDuckGo. Kein Browser wird automatisch geöffnet. Tokens bleiben im Arbeitsspeicher. Es gibt keine alternativen Ziel-, Benutzer-, Rollen- oder Privilegienargumente.

## Einmalige Vorbereitung der gemessenen unzugewiesenen Rolle

Der tatsächliche erste Rollen-POST legte Rolle `660a97b9-a8c8-f111-a05c-7ced8d5f6c91` mit neun Plattform-Standardprivilegien an. Der normale Ausführungsmodus stoppte vor Zuweisung und Workspace-Freigabe. Für genau diesen gemessenen Zustand gibt es nach unabhängiger Prüfung einen getrennten Aufruf:

```sh
../dotnet10/dotnet server/Access/bin/Debug/net10.0/Kitchen.Access.dll --prepare-existing-role
```

Dieser Modus prüft die festen Schreiber-AAD-/Dataverse-/Geschäftsbereich-IDs, Vorstand als Workspace-Eigentümer und exakt Revision 2. Schreiber muss weiterhin keine direkten oder über Teams zugewiesenen Rollen, effektiven Privilegien oder Workspace-Rechte haben. Die feste Rolle muss unverwaltet, ohne Vorlage und übergeordnete Rolle, ihre eigene Wurzel sowie keinem Benutzer oder Team zugewiesen sein; abgeleitete Rollen sind ebenfalls ausgeschlossen. Alle neun beobachteten Standardprivilegien müssen mit ID, Name, Global-Tiefe, Geschäftsbereich und leerem Datensatzfilter exakt übereinstimmen.

Erst dann erfolgt **ein** [ReplacePrivilegesRole](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/replaceprivilegesrole)-POST mit genau den sechs oben genannten, aus tatsächlichen Tabellenmetadaten aufgelösten Rechten. Danach werden Privilegien, Identitäten, Eigentümer/Revision und fehlende Zuweisungen unabhängig gelesen. Ein unklarer Schreibausgang erlaubt nur diese Lesekontrolle, keinen Wiederholungsversuch. Verbleibende oder erneut hinzugefügte Standardrechte, Teilmengen, Drift oder unbekannte Ergebnisse stoppen. Eine bereits vorbereitete Sechs-Rechte-Rolle wird durch diesen Modus nicht erneut geschrieben.

Der Vorbereitungsschritt erstellt und löscht nichts, weist niemanden zu und teilt keinen Workspace. `rolePrepared=true` bedeutet ausschließlich eine exakt zurückgelesene unzugewiesene Rolle; `kitchenAccessReady` bleibt false. Root prüft anschließend separat mit `--inspect` und nutzt erst danach den ursprünglichen `--execute`-Modus für die freigegebenen Zuweisungs-/Freigabeschritte. Es gibt keine atomare Sperre gegen externe Administratoren; Root benötigt ein kontrolliertes Fenster ohne weitere Rollenverwaltung.

## Verhalten und Grenzen des ursprünglichen Ausführungsmodus

- Identität, Geschäftsbereich, vorhandene direkte Rollen und Teamrollen, deren tatsächliche Privilegientiefen sowie effektiver Recordzugriff werden vor jeder ersten Mutation gelesen. API-Ausführungsprivilegien werden mit tatsächlichen Read-/Write-Privilegien aus Tabellenmetadaten verglichen.
- Eine vorhandene passende Rolle muss bereits exakt sechs Rechte enthalten. Eine leere oder abweichende vorhandene Rolle wird nicht verändert. Eine neu angelegte Rolle muss zuerst leer zurückgelesen werden; unerwartete Plattform-Standardprivilegien führen zum Stopp und erfordern eine neue Bewertung.
- Höchstens vier additive POSTs: Rolle erstellen, sechs Privilegien hinzufügen, nur Schreiber zuordnen, nur Workspace freigeben. Jeder Schritt wird unabhängig zurückgelesen. Ein Fehler führt niemals zu einem automatischen Retry. Ein unklarer Schreibausgang wird ausschließlich durch passenden Readback bestätigt; sonst Stopp.
- Bestehende Rollen werden weder entfernt noch verändert. Bereits vorhandene weitergehende Küchenrechte oder Workspace-Rechte führen zum Stopp. Andere bestehende Plattformrechte bleiben bestehen; die Ausgabe behauptet keine vollständige Least-Privilege-Zertifizierung des Benutzers.
- Ein leerer Rollenbestand beweist nicht, dass die App bereits startbar ist. **App Opener** bleibt eine getrennte, gegebenenfalls notwendige Plattformentscheidung: tatsächliche vorhandene Rolle und ihre Rechte prüfen, bevor Root sie separat zuweist. Der Helfer kopiert keine Basisrolle und gewährt keine App-Maker-, Administrations- oder Bypass-Rechte.
- Ein positiver Abschluss bestätigt die sechs Rollenprivilegien, Zuweisung und effektiven Workspace-Zugriff. Er ersetzt keine echte App-Prüfung unter Schreiber. Insbesondere `Load(canWrite=true)` und eine vereinbarte Bearbeitung mit korrektem Receipt-Akteur sind separat zu bestätigen.
- Es gibt keine rollenübergreifende atomare Transaktion oder CAS-Zusage. Root führt den Lauf in einem kontrollierten Fenster ohne gleichzeitige Rollenverwaltung aus. Bei einem Teilabschluss bleiben bestätigte additive Änderungen bestehen; es wird nichts zurückgerollt oder gelöscht. Insbesondere eine nach Stopp vorhandene unvollständige Rolle wird im nächsten Lauf nicht automatisch vervollständigt.

Offizielle API-Grundlagen: [AddPrivilegesRole](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/addprivilegesrole), [RetrieveRolePrivilegesRole](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveroleprivilegesrole), [RolePrivilege](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/roleprivilege), [GrantAccess](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/grantaccess), [RetrievePrincipalAccess](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveprincipalaccess), [RetrieveUserPrivileges und Einschränkung der Team-Tiefen](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveuserprivileges), [Rollen und App Opener](https://learn.microsoft.com/en-us/power-platform/admin/security-roles-privileges).
