import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** A confirmation must not become a labelable descendant of the invoking field. */
export function DialogPortal({children}: {children: ReactNode}) {
  return createPortal(children, document.body);
}
export function isolateDialogBackground(layer: HTMLElement) {
  const siblings = Array.from(layer.parentElement?.children ?? [])
    .filter((element): element is HTMLElement => element !== layer && 'inert' in element);
  const previous = siblings.map(element => ({element, inert: element.inert}));
  for (const {element} of previous) element.inert = true;
  return () => { for (const {element, inert} of previous) element.inert = inert; };
}

export function DiscardChangesDialog({onDiscard, onKeepEditing}: {
  onDiscard: () => void; onKeepEditing: () => void;
}) {
  const keep = useRef<HTMLButtonElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const restoreBackground = layer.current ? isolateDialogBackground(layer.current) : () => {};
    keep.current?.focus();
    return () => {
      restoreBackground();
      // React may still be removing the containing modal's inert attribute.
      queueMicrotask(() => { if (previous?.isConnected) previous.focus(); });
    };
  }, []);
  return <DialogPortal><div ref={layer} className="discard-layer" onKeyDown={e => {
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
  </div></DialogPortal>;
}
