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
    return this.table
      .where('table')
      .equals(table)
      .filter(order => order.status !== 'Paid' && order.status !== 'Cancelled')
      .first();
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
}
