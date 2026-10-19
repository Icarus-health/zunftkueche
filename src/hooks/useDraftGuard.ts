import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { DraftGuard, DraftNavigation } from '../ui/draft-guard.ts';

const navigation = new DraftNavigation<HTMLElement>();
/** Run a local/global transition only after its dirty editors release it. */
export function requestDraftNavigation(action: () => void, within?: HTMLElement | null, excluding?: HTMLElement | null) {
  navigation.request(action, within ?? undefined, excluding);
}
export function useDraftGuard({dirty, onDiscard, element}: {dirty: boolean; onDiscard: () => void; element?: RefObject<HTMLElement | null>}) {
  const [guard] = useState(() => new DraftGuard());
  const [, update] = useState(0);
  const latest = useRef({dirty, onDiscard});
  latest.current = {dirty, onDiscard};
  const redraw = () => update(n => n + 1);
  useLayoutEffect(() => {
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
    const unregister = navigation.add({element: () => element?.current ?? null, request: navigate});
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      unregister();
    };
  }, [dirty, guard, element]);
  return {
    confirming: guard.confirming,
    requestClose() { guard.requestClose(latest.current.dirty, latest.current.onDiscard); redraw(); },
    confirmDiscard() { guard.confirmDiscard(); redraw(); },
    keepEditing() { guard.keepEditing(); redraw(); },
  };
}
