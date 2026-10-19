import { useState } from 'react';
import type { ScreenProps } from '../App.tsx';
import { buildClosureChecklist } from '../domain/event-close.ts';
import { Modal, euros } from './shared.tsx';
import { AuditStamp } from './CorrectionDialog.tsx';
import { NetEvidenceEditor } from './NetEvidenceEditor.tsx';

type ClosureAction = 'close' | 'reopen' | 'lesson';

export function EventClosure({ scope, ...props }: ScreenProps & { scope: string }) {
  const { state, busy, canClose, commit } = props;
  const [action, setAction] = useState<ClosureAction | null>(null);
  const [editingEvidence, setEditingEvidence] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const closed = state.event.status === 'Abgeschlossen';
  const saved = state.closureHistory?.at(-1)?.snapshot;
  const check = closed && saved?.scope === scope ? saved : buildClosureChecklist(state, scope);

  function start(next: ClosureAction) {
    setText('');
    setError('');
    setAction(next);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!action) return;
    const type = action === 'lesson' ? 'lesson.add' : `event.${action}`;
    const payload = action === 'close'
      ? { eventId: state.event.id, revision: state.revision, confirmedScope: scope, note: text }
      : action === 'reopen'
        ? { eventId: state.event.id, reason: text }
        : { eventId: state.event.id, text };
    try {
      if (await commit(type, payload)) setAction(null);
      else setError('Noch nicht gespeichert.');
    } catch (error) {
      setError((error as Error).message);
    }
  }

  return (
    <section className="form-card">
      <h2>Abschlussprüfung · {state.event.status}</h2>
      <p>
        Umfang {scope} · {closed && saved?.scope === scope ? 'Gespeicherter Schlussstand' : 'Datenrevision'}{' '}
        {check.revision} · {check.complete ? 'Checkliste vollständig' : 'Angaben noch offen'}
      </p>
      <p>
        <strong>{check.resultCents === null ? 'Nettoergebnis offen' : `Nettoerlöse minus Verbrauch: ${euros(check.resultCents)}`}</strong>
        <br />{check.resultReason}
      </p>
      {canClose ? (
        <div className="flow-actions">
          <button className="button secondary" disabled={busy} onClick={() => start(closed ? 'reopen' : 'close')}>
            {closed ? 'Mit Grund wieder öffnen' : 'Prüfung abschließen'}
          </button>
          <button className="button secondary" disabled={busy || closed} onClick={() => setEditingEvidence(true)}>
            Nettogrundlage bestätigen
          </button>
          <button className="button secondary" disabled={busy || closed} onClick={() => start('lesson')}>
            Erfahrung ergänzen
          </button>
        </div>
      ) : <p>Abschluss, Nettobewertung, Wiederöffnung und Erfahrungen benötigen Eigentümerrechte.</p>}

      {check.open.length > 0 && <details className="history-details"><summary>Offene Punkte ({check.open.length})</summary><ul>{check.open.map(reason => <li key={reason}>{reason}</li>)}</ul></details>}
      <details className="history-details"><summary>Nettogrundlagen ({state.economicEvidence?.length ?? 0})</summary>
      {state.economicEvidence?.map(entry => (
        <div className="detail-row" key={entry.operationId}>
          <div>
            <h3>Nettogrundlage · {entry.scope} · Ausgangsrevision {entry.sourceRevision}</h3>
            <p>Nettoerlöse {euros(entry.netRevenueCents)} · bewerteter Nettoverbrauch {euros(entry.netConsumptionCents)}</p>
            <p>Umsatzquelle: {entry.sourceReason}</p>
            <p>Verbrauch / Bewertung: {entry.valuationReason}</p>
            <AuditStamp entry={entry} />
          </div>
        </div>
      ))}
      </details>
      <details className="history-details"><summary>Abschlussverlauf ({state.closureHistory?.length ?? 0})</summary>
      {state.closureHistory?.map(entry => (
        <div key={entry.operationId}>
          <strong>{entry.action === 'close' ? 'Abgeschlossen' : 'Wieder geöffnet'}</strong>
          <p>{entry.reason}</p>
          {entry.snapshot && <p>Schlussstand: {entry.snapshot.scope} · Revision {entry.snapshot.revision} · {entry.snapshot.open.length} offene Punkte</p>}
          <AuditStamp entry={entry} />
        </div>
      ))}
      </details>
      <details className="history-details"><summary>Erfahrungen ({state.lessons.length})</summary>
      {state.lessons.map(lesson => (
        <div key={lesson.id}><p>{lesson.note}</p>{lesson.operationId && <AuditStamp entry={lesson} />}</div>
      ))}
      </details>
      {editingEvidence && <NetEvidenceEditor {...props} scope={scope} onClose={() => setEditingEvidence(false)} />}
      {action && (
        <Modal title={action === 'close' ? 'Prüfung ausdrücklich bestätigen' : action === 'reopen' ? 'Wieder öffnen mit Grund' : 'Erfahrung festhalten'} onClose={() => setAction(null)}>
          <form onSubmit={save}>
            <fieldset disabled={busy}>
              {action === 'close' && <p>Die {check.open.length} offenen Punkte bleiben im Schlussstand sichtbar. Der Abschluss bestätigt die Prüfung. Änderungen erfordern danach eine Wiederöffnung.</p>}
              <label>
                {action === 'lesson' ? 'Erfahrung' : 'Prüfnotiz / Grund'}
                <textarea required maxLength={1000} value={text} onChange={event => setText(event.target.value)} />
              </label>
              {error && <p role="alert">{error}</p>}
              <button className="button primary">Bestätigen und speichern</button>
            </fieldset>
          </form>
        </Modal>
      )}
    </section>
  );
}
