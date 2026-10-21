import { call } from '@ury/core';

export type KotItemState = 'QUEUED' | 'IN_PREPARATION' | 'READY' | 'SERVED';

export interface OrderKotStatus {
  /** item_code -> least-advanced kitchen state across the order's live KOTs. */
  items: Record<string, KotItemState>;
  kots: Array<{ name: string; order_status: string }>;
}

/** Read-only: `ury/ury/api/ury_order_kot_status.py`. */
export async function getOrderKotStatus(invoice: string): Promise<OrderKotStatus> {
  const res = await call.get<{ message: OrderKotStatus }>('ury.ury.api.ury_order_kot_status.get_order_kot_status', { invoice });
  return res.message;
}
