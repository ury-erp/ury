import { db } from '@ury/core';
import { DOCTYPES } from '../../data/doctypes';
import { parseMergedWith } from '../../lib/table-utils';

/**
 * Bulk data needed to render the Captain table grid: which table is
 * occupied by which order/waiter, its running total, and whether the bill
 * has already been printed (locked for further edits by a non-billing
 * Captain).
 *
 * DELIBERATE DESIGN CHOICE: the existing table-listing API
 * (`getTables()` in `pos/src/lib/table-api.ts`, reused as-is here) returns
 * `occupied` / `latest_invoice_time` / `merged_with` but does NOT carry
 * `waiter` or a running total — those only exist on the POS Invoice. The
 * per-table alternative, `get_table_order_context(table)`
 * (`ury.ury.doctype.ury_order.ury_order.get_table_order_context`), would
 * require one backend round-trip per visible table card (N+1) and also
 * does a permission/ownership computation we don't need just to *render*
 * a grid.
 *
 * Instead this fetches all active (`docstatus = 0`) POS Invoices for the
 * branch in a single bulk read — the same `db.getDocList(DOCTYPES.POS_INVOICE, ...)`
 * pattern already used for bulk invoice reads in `pos/src/lib/invoice-api.ts`
 * (`getMergeBillCandidates`, `getLinkedMergeSecondaries`) — and joins the
 * rows to tables client-side by `restaurant_table` / `custom_merged_tables`.
 * One call per branch (not per room, not per table) is enough to annotate
 * every table card with waiter/ownership/total/billed-state.
 */
export interface ActiveTableOrder {
  invoiceName: string;
  waiter: string;
  grandTotal: number;
  invoicePrinted: boolean;
}

interface ActiveInvoiceRow {
  name: string;
  restaurant_table: string | null;
  custom_merged_tables: string | null;
  waiter: string;
  grand_total: number;
  invoice_printed: number;
}

export async function getActiveTableOrders(
  branch: string
): Promise<Map<string, ActiveTableOrder>> {
  const rows = (await db.getDocList(DOCTYPES.POS_INVOICE, {
    fields: [
      'name',
      'restaurant_table',
      'custom_merged_tables',
      'waiter',
      'grand_total',
      'invoice_printed',
    ],
    filters: [
      ['branch', '=', branch],
      ['docstatus', '=', 0],
    ],
    limit: 0,
    asDict: true,
  } as unknown as Parameters<typeof db.getDocList>[1])) as ActiveInvoiceRow[];

  const map = new Map<string, ActiveTableOrder>();

  for (const row of rows) {
    const info: ActiveTableOrder = {
      invoiceName: row.name,
      waiter: row.waiter,
      grandTotal: row.grand_total,
      invoicePrinted: row.invoice_printed === 1,
    };

    if (row.restaurant_table) {
      map.set(row.restaurant_table, info);
    }
    for (const partnerTable of parseMergedWith(row.custom_merged_tables)) {
      map.set(partnerTable, info);
    }
  }

  return map;
}

/**
 * Bulk-resolves `full_name` for a set of user ids (e.g. the distinct
 * `waiter` values found in {@link getActiveTableOrders}), so occupied table
 * cards can show a human name instead of a raw user id/email. One call for
 * the whole set, not one per table. Mirrors the `db.getDocList('User', ...)`
 * pattern already used in `pos/src/components/CaptainTransferDialog.tsx`.
 */
export async function getUserFullNames(
  userNames: string[]
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(userNames.filter(Boolean)));
  if (unique.length === 0) return new Map();

  const rows = (await db.getDocList('User', {
    fields: ['name', 'full_name'],
    filters: [['name', 'in', unique]],
    limit: unique.length,
    asDict: true,
  } as unknown as Parameters<typeof db.getDocList>[1])) as Array<{
    name: string;
    full_name?: string;
  }>;

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.name, row.full_name || row.name);
  }
  return map;
}
