import type { Area, Workspace } from '../model';
import { documents } from './model.ts';
import type { Bill, BillLineRole } from './model';
import { cents } from './domain.ts';

export function billTypeLabel(bill: Bill): string {
  if (bill.billType === 'credit') return 'Gutschrift';
  if (!bill.billType && (bill.gross ?? 0) < 0) return 'Negativer Altbeleg';
  return 'Rechnung';
}

export function linkedBill(bill: Bill, workspace: Workspace): Bill {
  const link = documents(workspace.ww, 'billLink')
    .filter(row => row.confirmed && row.billId === bill.id && row.scope === bill.scope && row.area === bill.area)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  return link
    ? {
        ...bill,
        orderIds: link.orderIds,
        creditForId: link.creditForId ?? bill.creditForId,
        costAssignment: link.costAssignment === undefined ? bill.costAssignment : link.costAssignment,
        returnIds: link.returnIds ?? bill.returnIds
      }
    : bill;
}

export function relatedBills(bill: Bill, workspace: Workspace): Bill[] {
  return documents(workspace.ww, 'bill').filter(
    row =>
      row.id !== bill.id &&
      row.confirmed &&
      row.billType !== 'credit' &&
      (row.gross ?? 0) >= 0 &&
      row.scope === bill.scope &&
      row.area === bill.area &&
      row.supplierId === bill.supplierId
  );
}

export function returnMovements(bill: Bill, workspace: Workspace): ReturnType<typeof documents<'movement'>> {
  return documents(workspace.ww, 'movement').filter(
    row => row.confirmed && row.type === 'return' && row.scope === bill.scope && row.area === bill.area
  );
}

export function billGrossForArea(bill: Bill, area: Area): number | undefined {
  if (bill.costAssignment?.mode === 'open') return undefined;
  if (bill.costAssignment?.mode === 'split')
    return area === 'Küche'
      ? bill.costAssignment.kitchen
      : area === 'Marktplatz'
        ? (bill.costAssignment.market ?? 0)
        : bill.costAssignment.scheuer;
  return bill.area === area ? (bill.gross ?? undefined) : undefined;
}

export function purchaseTotals(
  bills: Bill[],
  area?: Area
): {
  invoices: number;
  credits: number;
  legacy: number;
  gross: number;
  lines: Partial<Record<BillLineRole, { charged: number; credited: number; unknown: number }>>;
} {
  let invoices = 0,
    credits = 0,
    legacy = 0;
  const lines: Partial<Record<BillLineRole, { charged: number; credited: number; unknown: number }>> = {};
  for (const bill of bills.filter(row => row.confirmed)) {
    const gross = area === undefined ? bill.gross : billGrossForArea(bill, area);
    if (gross === null || gross === undefined) continue;
    if (bill.billType === 'credit') credits = cents(credits + gross);
    else if (gross < 0) legacy = cents(legacy + gross);
    else invoices = cents(invoices + gross);
    if (area !== undefined && bill.costAssignment) continue;
    for (const line of bill.lines) {
      if (!line.role) continue;
      const total = lines[line.role] ?? { charged: 0, credited: 0, unknown: 0 };
      if (line.totalNet === null) total.unknown++;
      else if (line.totalNet >= 0) total.charged = cents(total.charged + line.totalNet);
      else total.credited = cents(total.credited + line.totalNet);
      lines[line.role] = total;
    }
  }
  return { invoices, credits, legacy, gross: cents(invoices + credits + legacy), lines };
}
