/**
 * @file order.repository.ts
 * @description CRUD Repository implementation for 'orders' collection.
 */

import { BaseRepository } from './base.repository';
import type { OrderEntity, IOrderRepository } from '../types';
import type { UryPosDatabase } from '../db';

export class OrderRepository
  extends BaseRepository<OrderEntity, string>
  implements IOrderRepository
{
  constructor(dbInstance: UryPosDatabase) {
    super(dbInstance.orders, dbInstance);
  }

  /** Find orders by lifecycle status */
  async findByStatus(status: OrderEntity['status']): Promise<OrderEntity[]> {
    return this.table.where('status').equals(status).toArray();
  }

  /** Find active order for a given table */
  async findByTable(table: string): Promise<OrderEntity | undefined> {
    const direct = await this.table
      .where('table')
      .equals(table)
      .filter(order => order.status !== 'Paid' && order.status !== 'Cancelled')
      .first();
    if (direct) return direct;

    // Table merge parity: if the requested table is a child of a merged
    // cluster (e.g. F5 merged into F1), the active order lives on the master
    // table. Resolve the cluster and return the active master order.
    const tableEntity = await this.dbInstance.restaurantTables.get(table);
    if (!tableEntity?.merged_with) return undefined;

    const partners = (tableEntity.merged_with || '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    const cluster = Array.from(new Set([table, ...partners]));

    const clusterOrders = await this.table
      .where('table')
      .anyOf(cluster)
      .filter(order => order.status !== 'Paid' && order.status !== 'Cancelled')
      .toArray();

    if (clusterOrders.length === 0) return undefined;

    // If multiple active orders exist, prefer the one whose table is the
    // cluster anchor (the table whose merged_with lists the most partners).
    // Otherwise fall back to the earliest-created order, matching the
    // backend `_sync_active_order_with_merge_cluster` primary selection.
    const clusterEntities = await this.dbInstance.restaurantTables
      .where('name')
      .anyOf(cluster)
      .toArray();
    const anchor = clusterEntities
      .map(t => ({
        name: t.name,
        partnerCount: (t.merged_with || '').split(',').filter(Boolean).length,
      }))
      .sort((a, b) => b.partnerCount - a.partnerCount)[0]?.name;

    const anchorOrder = anchor
      ? clusterOrders.find(o => o.table === anchor)
      : undefined;

    return (
      anchorOrder ||
      clusterOrders.sort((a, b) =>
        (a.createdAt || '').localeCompare(b.createdAt || '')
      )[0]
    );
  }

  /** Update order status to Paid and lock order locally */
  async markPaid(id: string): Promise<void> {
    await this.upsertStatus(id, 'Paid');
  }

  /** Update order status to Cancelled and lock order locally */
  async markCancelled(id: string): Promise<void> {
    await this.upsertStatus(id, 'Cancelled');
  }

  /**
   * Update an order's lifecycle status and lock the record when it reaches a
   * terminal state (Paid/Cancelled). Returns the updated entity, or null if
   * no matching record exists.
   */
  async upsertStatus(
    id: string,
    status: OrderEntity['status']
  ): Promise<OrderEntity | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    existing.status = status;
    if (status === 'Paid' || status === 'Cancelled') {
      (existing as any).is_locked = 1;
    }
    existing.updatedAt = new Date().toISOString();
    await this.put(existing);
    return existing;
  }

  /**
   * Purges fully paid/synced orders from IndexedDB to maintain minimal storage footprint.
   * Only active draft/unbilled orders and pending offline orders remain stored locally.
   */
  async purgeSyncedPaidOrders(): Promise<number> {
    const syncedPaid = await this.table
      .filter(
        order =>
          ((order.status as string) === 'Paid' ||
            (order.status as string) === 'Cancelled' ||
            (order.status as string) === 'Consolidated' ||
            (order.status as string) === 'Return') &&
          (order.sync_status === 'synced' || !order.sync_status)
      )
      .toArray();

    if (syncedPaid.length === 0) return 0;

    const idsToDelete = syncedPaid.map(o => o.id);
    await this.table.bulkDelete(idsToDelete);
    return idsToDelete.length;
  }
}
