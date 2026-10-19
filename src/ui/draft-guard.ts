/** A close request never owns or clears the draft itself. */
export class DraftGuard {
  confirming = false;
  private action: (() => void) | null = null;
  requestClose(dirty: boolean, action: () => void) {
    if (!dirty) { action(); return; }
    this.action = action;
    this.confirming = true;
  }
  keepEditing() { this.action = null; this.confirming = false; }
  confirmDiscard() {
    const action = this.action;
    this.keepEditing();
    action?.();
  }
}
export function draftFingerprint(controls: readonly {type: string; value: string; checked?: boolean}[]) {
  return JSON.stringify(controls.map(({type, value, checked}) =>
    type === 'checkbox' || type === 'radio' ? [type, Boolean(checked)] : [type, value]));
}

/** Navigation is scoped to the editor being removed; unrelated drafts stay intact. */
export class DraftNavigation<Element = unknown> {
  private guards = new Set<{
    element: () => Element | null;
    request: (action: () => void) => void;
  }>();
  add(guard: {element: () => Element | null; request: (action: () => void) => void}) {
    this.guards.add(guard);
    return () => { this.guards.delete(guard); };
  }
  request(action: () => void, within?: {contains: (element: Element | null) => boolean}, excluding?: Element | null) {
    const guards = [...this.guards].filter(guard => {
      const element = guard.element();
      return (!excluding || element !== excluding) && (!within || within.contains(element));
    });
    const next = () => {
      const guard = guards.shift();
      if (guard && this.guards.has(guard)) guard.request(next);
      else if (guard) next();
      else action();
    };
    next();
  }
}
