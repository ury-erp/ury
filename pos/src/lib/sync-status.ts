/**
 * @file sync-status.ts
 * @description Helpers for determining the offline sync badge state of orders and tables.
 *
 * The POS distinguishes three sync badge states:
 *   - synced:   backed by the server (or no local command is known to be stuck).
 *   - pending:  created or modified while offline and queued for backend replay.
 *   - failed:   a queued command for this entity has reached FAILED status.
 *
 * The helper never patches the core UI to hide issues; it reflects the local
 * IndexedDB / command-queue state honestly.
 */

import { repositories, type OrderEntity } from '@ury/core';
import type { POSInvoice } from './invoice-api';

export type SyncBadgeState = 'synced' | 'pending' | 'failed';

/**
 * Returns true if the order id is a temporary client-side id (TEMP-*).
 * Temp ids are always pending until the sync_order command completes.
 */
function isTemporaryId(id: string): boolean {
  return id.startsWith('TEMP-');
}

/**
 * Scans the sync_queue repository for FAILED commands that reference the given
 * order id. A command can reference an order through:
 *   - entity_id / temporary_id metadata
 *   - payload keys: invoice, invoice_id, source_invoice, primary_invoice, secondary_invoice
 */
async function hasFailedCommandForOrder(orderId: string): Promise<boolean> {
  try {
    const commands = await repositories.syncQueue.getAll();
    return commands.some((cmd) => {
      if (cmd.status !== 'FAILED') return false;

      const metadataMatch =
        cmd.entity_id === orderId ||
        cmd.temporary_id === orderId ||
        cmd.command_id === orderId;

      if (metadataMatch) return true;

      const payload = (cmd.payload || {}) as Record<string, unknown>;
      const payloadRefs = [
        payload.invoice,
        payload.invoice_id,
        payload.source_invoice,
        payload.primary_invoice,
        payload.secondary_invoice,
        payload.temp_id,
      ];

      return payloadRefs.some((ref) => ref === orderId);
    });
  } catch (err) {
    console.warn(`[sync-status] Failed to read sync queue for ${orderId}:`, err);
    return false;
  }
}

/**
 * Determines the sync badge state for a POSInvoice as shown in the Orders list
 * and order detail panel.
 *
 * Order of precedence:
 *   1. If there is a FAILED command referencing this order → 'failed'.
 *   2. If the local order is marked pending or uses a TEMP-* id → 'pending'.
 *   3. Otherwise → 'synced'.
 */
export async function getOrderSyncBadgeState(
  order: Pick<POSInvoice, 'name' | 'sync_status'>
): Promise<SyncBadgeState> {
  const hasFailed = await hasFailedCommandForOrder(order.name);
  if (hasFailed) return 'failed';

  if (order.sync_status === 'pending' || isTemporaryId(order.name)) {
    return 'pending';
  }

  return 'synced';
}

/**
 * Determines the sync badge state for a table by looking up its active local
 * order. Returns 'synced' when there is no active local order.
 */
export async function getTableSyncBadgeState(tableName: string): Promise<SyncBadgeState> {
  try {
    const order = await repositories.orders.findByTable(tableName);
    if (!order) return 'synced';
    return getOrderSyncBadgeState(mapOrderEntityToPOSInvoiceStub(order));
  } catch (err) {
    console.warn(`[sync-status] Failed to read active order for table ${tableName}:`, err);
    return 'synced';
  }
}

function mapOrderEntityToPOSInvoiceStub(order: OrderEntity): Pick<POSInvoice, 'name' | 'sync_status'> {
  return {
    name: order.id,
    sync_status: order.sync_status,
  };
}
