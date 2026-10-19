import { useState } from 'react';
import type { ScreenProps } from '../App.tsx';
import type { PlanLine } from '../domain/kitchen.ts';
import { parseQuantity } from '../domain/kitchen.ts';
import { Modal, shownAmount, amount } from './shared.tsx';

interface AllocationDraft { day: string; time: string | null; raw: string; }

export function AllocationEditor({ line, busy, commit, onClose }: ScreenProps & { line: PlanLine; onClose: () => void }) {
  const initial = line.allocations ?? [
    { day: 'Freitag', time: null, quantity: 0 },
    { day: 'Samstag', time: null, quantity: 0 },
  ];
  const [rows, setRows] = useState<AllocationDraft[]>(initial.map(part => ({ ...part, raw: amount(part.quantity) })));
  const [error, setError] = useState('');
  const values = rows.map(row => {
    try { return parseQuantity(row.raw); } catch { return null; }
  });
  const sum = values.some(value => value === null) ? null : values.reduce<number>((total, value) => total + value!, 0);

  function update(index: number, patch: Partial<AllocationDraft>) {
    setRows(rows.map((row, current) => current === index ? { ...row, ...patch } : row));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (values.some(value => value === null)) throw new Error('Alle Teilmengen ausdrücklich eingeben.');
      const allocations = rows.map((row, index) => ({ day: row.day, time: row.time, quantity: values[index] }));
      if (await commit('plan.allocate', { id: line.id, allocations })) onClose();
      else setError('Noch nicht gespeichert.');
    } catch (error) { setError((error as Error).message); }
  }

  return (
    <Modal title={`Menge verteilen · ${line.name}`} onClose={onClose}>
      <form onSubmit={save}>
        <fieldset disabled={busy}>
          <p>Unveränderte Einkaufsmenge: {shownAmount(line.quantity)} {line.unit} · verteilt: {shownAmount(sum)}</p>
          {sum !== null && line.quantity !== null && <p role="status">{sum > line.quantity ? `Überdeckung: ${amount(sum - line.quantity)}` : `Noch nicht verteilt: ${amount(line.quantity - sum)}`}</p>}
          {rows.map((row, index) => (
            <div className="recipe-line" key={index}>
              <label>Tag<select value={row.day} onChange={event => update(index, { day: event.target.value })}>{['Mittwoch', 'Freitag', 'Samstag', 'Sonntag', 'Allgemein'].map(day => <option key={day}>{day}</option>)}</select></label>
              <label>Zeitfenster<input type="time" value={row.time ?? ''} onChange={event => update(index, { time: event.target.value || null })} /></label>
              <label>Teilmenge<input required inputMode="decimal" value={row.raw} onChange={event => update(index, { raw: event.target.value })} /></label>
              <button type="button" className="text-button" onClick={() => setRows(rows.filter((_, current) => current !== index))}>Zeitfenster entfernen</button>
            </div>
          ))}
          <button type="button" className="text-button" disabled={rows.length >= 20} onClick={() => setRows([...rows, { day: 'Freitag', time: null, raw: '' }])}>Weiteres Zeitfenster</button>
          <p>Bestellungen verwenden diese bestätigten Teilmengen. Die ursprüngliche Einkaufsmenge und frühere Bestellfassungen bleiben erhalten.</p>
          {error && <p role="alert">{error}</p>}
          <button className="button primary">Verteilung bestätigen</button>
        </fieldset>
      </form>
    </Modal>
  );
}
