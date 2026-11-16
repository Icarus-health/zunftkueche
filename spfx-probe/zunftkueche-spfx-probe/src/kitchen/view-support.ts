// Gemeinsame Hilfen für view.ts und die Aktionsmodule.
import type { WwDraftSnapshot } from './ww/controller';
import type { IngredientDraft } from './ingredient-form';
import type { Article, InventorySession, Order, Stored, Supplier } from './model';
import type { ImportKind } from './csv';
import type { Editing } from './forms';
import type { WorkspaceView } from './workspace';

export type View = WorkspaceView;
export interface ImportItem {
  kind: ImportKind;
  value: Article | Supplier;
  done: boolean;
}
export const uuid = (): string => crypto.randomUUID();
export const message = (error: unknown): string =>
  error instanceof Error ? error.message : 'Verbindung fehlgeschlagen. Bitte neu laden und gespeicherten Stand prüfen.';

export interface RecoveryData {
  view: View;
  orderReview?: boolean;
  editing?: Editing;
  draft?: Order;
  previous?: Stored<Order>;
  copySource?: Stored<Order>;
  receiving?: { previous: Stored<Order>; id: string; deliveryId?: string };
  inventory?: InventorySession;
  inventoryPrevious?: Stored<InventorySession>;
  quickIngredient?: IngredientDraft;
  operationId: string;
  ww?: WwDraftSnapshot;
  masterEtag?: string;
  countEdits: Array<[string, string]>;
}
export function ownEntry(state: unknown): boolean {
  return !!state && typeof state === 'object' && (state as { zunftkueche?: unknown }).zunftkueche === true;
}
