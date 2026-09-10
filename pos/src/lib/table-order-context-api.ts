import { call } from '@ury/core';
import type { POSInvoice } from './order-api';

/**
 * Mirrors the permission map returned by the backend
 * `get_table_order_context()` (`ury/ury/doctype/ury_order/ury_order.py`).
 * This is the server-authoritative source for what the Captain order
 * screen may render/allow for THIS table — not `useCaptainContext()`'s
 * session-level `capabilities`, which know nothing about a specific
 * table/invoice's ownership or billed state.
 */
export interface TableOrderPermissions {
  view: boolean;
  modify: boolean;
  reduce_items: boolean;
  remove_items: boolean;
  transfer_table: boolean;
  transfer_captain: boolean;
  print_bill: boolean;
  reprint_kot: boolean;
  settle: boolean;
  cancel: boolean;
}

export interface TableOrderContextTable {
  name: string;
  branch?: string;
  restaurant_room?: string;
  [key: string]: unknown;
}

export interface TableOrderContextAssignment {
  waiter: string | null;
  is_mine: boolean;
}

export interface TableOrderContext {
  table: TableOrderContextTable | null;
  /** `POS Invoice.as_dict()` when an active order exists on this table, else null. */
  order: POSInvoice | null;
  assignment: TableOrderContextAssignment | null;
  permissions: TableOrderPermissions;
}

export interface TableOrderContextResponse {
  message: TableOrderContext;
}

export const getTableOrderContext = async (table: string): Promise<TableOrderContext> => {
  const res = await call.get<TableOrderContextResponse>(
    'ury.ury.doctype.ury_order.ury_order.get_table_order_context',
    { table }
  );
  return res.message;
};
