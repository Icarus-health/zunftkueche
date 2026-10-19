import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { DraftGuard, DraftNavigation } from '../ui/draft-guard.ts';

const navigation = new DraftNavigation<HTMLElement>();
/** Run a local/global transition only after its dirty editors release it. */
export function requestDraftNavigation(action: () => void, within?: HTMLElement | null, excluding?: HTMLElement | null) {
  navigation.request(action, within ?? undefined, excluding);
}
export function useDraftGuard({dirty, onDiscard, element, pending}: {dirty: boolean; onDiscard: () => void; element?: RefObject<HTMLElement | null>; pending?:()=>boolean}) {
  const [guard] = useState(() => new DraftGuard());
  const [, update] = useState(0);
  const latest = useRef({dirty, onDiscard, pending});
  latest.current = {dirty, onDiscard, pending};
  const redraw = () => update(n => n + 1);
  const pendingNow=pending?.()??false;
  useLayoutEffect(()=>{if(pendingNow)guard.keepEditing();},[guard,pendingNow]);
  useLayoutEffect(() => {
    if (!dirty&&!pending) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if(!latest.current.dirty&&!latest.current.pending?.())return;
      event.preventDefault(); event.returnValue = '';
    };
    const navigate = (action: () => void) => {
      guard.requestClose(latest.current.dirty, () => {
        if(latest.current.dirty)latest.current.onDiscard(); action();
      },latest.current.pending?.());
      redraw();
    };
    window.addEventListener('beforeunload', beforeUnload);
    const unregister = navigation.add({element: () => element?.current ?? null, request: navigate});
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      unregister();
    };
  }, [dirty, guard, element, !!pending]);
  return {
    confirming: !pendingNow&&guard.confirming,
    requestClose() { guard.requestClose(latest.current.dirty, latest.current.onDiscard,latest.current.pending?.()); redraw(); },
    confirmDiscard() { guard.confirmDiscard(latest.current.pending?.()); redraw(); },
    keepEditing() { guard.keepEditing(); redraw(); },
  };
}
