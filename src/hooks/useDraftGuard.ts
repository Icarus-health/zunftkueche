import { useEffect, useRef, useState } from 'react';
import { DraftGuard } from '../ui/draft-guard.ts';

const navigationGuards = new Set<(action: () => void) => void>();
/** Run navigation only after each dirty editor has explicitly released it. */
export function requestDraftNavigation(action: () => void) {
  const guards = [...navigationGuards];
  const next = () => {
    const guard = guards.shift();
    if (guard) guard(next); else action();
  };
  next();
}
export function useDraftGuard({dirty, onDiscard}: {dirty: boolean; onDiscard: () => void}) {
  const [guard] = useState(() => new DraftGuard());
  const [, update] = useState(0);
  const latest = useRef({dirty, onDiscard});
  latest.current = {dirty, onDiscard};
  const redraw = () => update(n => n + 1);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault(); event.returnValue = '';
    };
    const navigate = (action: () => void) => {
      guard.requestClose(latest.current.dirty, () => {
        latest.current.onDiscard(); action();
      });
      redraw();
    };
    window.addEventListener('beforeunload', beforeUnload);
    navigationGuards.add(navigate);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      navigationGuards.delete(navigate);
    };
  }, [dirty, guard]);
  return {
    confirming: guard.confirming,
    requestClose() { guard.requestClose(latest.current.dirty, latest.current.onDiscard); redraw(); },
    confirmDiscard() { guard.confirmDiscard(); redraw(); },
    keepEditing() { guard.keepEditing(); redraw(); },
  };
}
