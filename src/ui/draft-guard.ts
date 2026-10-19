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
