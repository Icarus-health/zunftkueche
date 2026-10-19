import { useState } from 'react';
import { selectOriginalFiles } from '../data/backup.ts';
import type { OriginalBackup } from '../data/backup.ts';
import type { KitchenState } from '../domain/state.ts';

export function BackupPanel({ state, busy, canConfigure, canClose, onBackup }: {
  state: KitchenState;
  busy: boolean;
  canConfigure: boolean;
  canClose: boolean;
  onBackup: (originals: OriginalBackup[]) => Promise<string[]>;
}) {
  const [originals, setOriginals] = useState<OriginalBackup[]>([]);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  async function select(files: File[]) {
    setWorking(true);
    try {
      setOriginals(await selectOriginalFiles(state, files));
      setMessage('Passende Originale ausgewählt.');
    } catch (error) {
      setOriginals([]);
      setMessage((error as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function download() {
    setWorking(true);
    setMessage('');
    try {
      const missing = await onBackup(originals);
      setMessage(missing.length
        ? `Unvollständige Sicherung heruntergeladen. ${missing.length} fehlende Nachweise sind in der Datei vermerkt.`
        : 'Vollständige Sicherung des Küchen-Kernbestands heruntergeladen. Separater Dokument-/Entwurfspeicher ist nicht enthalten.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setWorking(false);
    }
  }
  return <section className="panel">
    <h2>Datensicherung</h2>
    <p>CSV und Druckdateien sind Auswertungen. Die Sicherung liest den vollständigen Arbeitsbereich und seine Wiederholungsbelege mit Eigentümerprüfung.</p>
    <p>Wählen Sie historische Originaldateien auf diesem Gerät aus; nur exakt passende Dateihashes werden übernommen. Die Dateien werden nicht hochgeladen.</p>
    <p>Der Umfang „Küchen-Kernbestand“ enthält noch keinen separaten Dokument-/Entwurfspeicher; dieser ist in dieser Version nicht eingeführt. Fehlende Pflichtquellen oder Originale bleiben ausdrücklich unvollständig.</p>
    {canConfigure && canClose ? <>
      <label>Originaldateien für die Sicherung<input type="file" multiple disabled={busy || working}
        onChange={event => { void select(Array.from(event.target.files ?? [])); }} />{originals.length} passende Originale</label>
      <button className="button secondary" disabled={busy || working} onClick={download}>Küchen-Kernbestand sichern</button>
    </> : <p>Datensicherung benötigt bestätigte Eigentümerrechte.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
