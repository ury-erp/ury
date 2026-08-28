import { call } from '@ury/core';

export interface StockReservationRow {
  name: string;
  reservation_group: string;
  order_ref: string;
  policy?: string;
  status: 'Reserved' | 'Fulfilled' | 'Released' | 'Expired' | 'Cancelled';
  reason?: string;
  branch: string;
  company: string;
  warehouse: string;
  top_level_item: string;
  component_item: string;
  qty: number;
  expires_at?: string;
  actor?: string;
  audit_log?: string;
  creation?: string;
}

const normalizeList = <T>(payload: unknown): T[] => {
  const message = (payload as any)?.message ?? payload;
  return Array.isArray(message) ? (message as T[]) : [];
};

const normalizeStockReservation = (row: any): StockReservationRow => ({
  name: String(row.name || ''),
  reservation_group: String(row.reservation_group || ''),
  order_ref: String(row.order_ref || ''),
  policy: row.policy,
  status: row.status,
  reason: row.reason,
  branch: String(row.branch || ''),
  company: String(row.company || ''),
  warehouse: String(row.warehouse || ''),
  top_level_item: String(row.top_level_item || ''),
  component_item: String(row.component_item || ''),
  qty: Number(row.qty ?? 0),
  expires_at: row.expires_at,
  actor: row.actor,
  audit_log: row.audit_log,
  creation: row.creation,
});

export const stockReservationService = {
  async listReservations(branch: string): Promise<StockReservationRow[]> {
    if (!branch || branch === 'all') return [];
    const res = await call<any>('frappe.client.get_list', {
      doctype: 'URY Stock Reservation',
      filters: { branch, status: ['in', ['Reserved', 'Fulfilled', 'Released', 'Expired', 'Cancelled']] },
      fields: [
        'name',
        'reservation_group',
        'order_ref',
        'policy',
        'status',
        'reason',
        'branch',
        'company',
        'warehouse',
        'top_level_item',
        'component_item',
        'qty',
        'expires_at',
        'actor',
        'audit_log',
        'creation',
      ],
      order_by: 'expires_at desc, status asc',
      limit_page_length: 0,
    });
    return normalizeList<any>(res).map(normalizeStockReservation);
  },

  async releaseReservation(name: string, reason?: string): Promise<string[]> {
    const res = await call<any>('ury.ury.api.ury_reservation_service.release_reservation', {
      reservation_name: name,
      reason,
    });
    return (res?.message ?? res) || [];
  },

  async cancelReservation(name: string, reason?: string): Promise<string[]> {
    const res = await call<any>('ury.ury.api.ury_reservation_service.cancel_reservation', {
      reservation_name: name,
      reason,
    });
    return (res?.message ?? res) || [];
  },
};
