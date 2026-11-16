import type { Area } from './model';
export interface ContextChoice {
  area: Area;
  seasonId: string;
}
export interface FormField {
  name: string;
  value: string;
  checked: boolean;
}
export interface LocalDraft<T> {
  version: 1;
  at: string;
  context: ContextChoice;
  form: string;
  fields: FormField[];
  lineCount: number;
  data: T;
}
/** Browser-only recovery, scoped to SharePoint site, test mode and signed-in identity. */
export class LocalState {
  private storage?: Storage;
  private key: string;
  public constructor(root: HTMLElement, scope: string, user: string) {
    this.key =
      'zk-local-v1:' + encodeURIComponent(scope) + ':' + encodeURIComponent(user.split(' · ').pop()!.toLowerCase());
    try {
      this.storage = root.ownerDocument.defaultView?.localStorage;
    } catch {
      /* Storage may be disabled in Teams. Keep the form usable. */
    }
  }
  public read<T>(kind: string): T | undefined {
    try {
      const raw = this.storage?.getItem(this.key + ':' + kind);
      return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
      return undefined;
    }
  }
  public write(kind: string, value: unknown): boolean {
    try {
      if (!this.storage) return false;
      this.storage.setItem(this.key + ':' + kind, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
  public remove(kind: string): void {
    try {
      this.storage?.removeItem(this.key + ':' + kind);
    } catch {
      /* No claim that local storage is available. */
    }
  }
}
export function formFields(form: HTMLFormElement): FormField[] {
  return Array.from(form.querySelectorAll<HTMLInputElement>('input[name],select[name],textarea[name]'))
    .filter(
      el =>
        !['file', 'password', 'submit', 'button'].includes(el.type) &&
        !['confirmed', 'reviewed', 'reviewAll'].includes(el.name)
    )
    .map(el => ({ name: el.name, value: el.value, checked: el.checked || false }));
}
export function restoreFields(form: HTMLFormElement, fields: FormField[]): void {
  for (const confirm of Array.from(
    form.querySelectorAll<HTMLInputElement>('[name=confirmed],[name=reviewed],[name=reviewAll]')
  ))
    confirm.checked = false;
  const remaining = [...fields];
  for (const el of Array.from(form.querySelectorAll<HTMLInputElement>('input[name],select[name],textarea[name]'))) {
    if (el.type === 'file' || ['confirmed', 'reviewed', 'reviewAll'].includes(el.name)) continue;
    const index = remaining.findIndex(f => f.name === el.name);
    if (index < 0) continue;
    const f = remaining.splice(index, 1)[0];
    el.value = f.value;
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = f.checked;
  }
}
