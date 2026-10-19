import { useEffect, useRef } from 'react';
export function DiscardChangesDialog({onDiscard, onKeepEditing}: {
  onDiscard: () => void; onKeepEditing: () => void;
}) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    keep.current?.focus();
    return () => previous?.focus();
  }, []);
  return <div className="discard-layer" onKeyDown={e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); onKeepEditing(); }
    if (e.key === 'Tab') {
      const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('button');
      const target = e.shiftKey ? buttons[0] : buttons[1];
      if (document.activeElement === target) {
        e.preventDefault(); (e.shiftKey ? buttons[1] : buttons[0]).focus();
      }
    }
  }}>
    <section className="discard-dialog" role="alertdialog" aria-modal="true" aria-labelledby="discard-title" aria-describedby="discard-description">
      <h2 id="discard-title">Offene Eingaben verwerfen?</h2>
      <p id="discard-description">Deine Änderungen sind noch nicht gespeichert. Du kannst weiterarbeiten oder die Eingaben ausdrücklich verwerfen.</p>
      <div className="modal-actions">
        <button ref={keep} className="button primary" type="button" onClick={onKeepEditing}>Weiterarbeiten</button>
        <button className="button secondary" type="button" onClick={onDiscard}>Eingaben verwerfen</button>
      </div>
    </section>
  </div>;
}
