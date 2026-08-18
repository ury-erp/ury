/**
 * @file table.repository.ts
 * @description CRUD Repository implementation for 'tables' collection.
 */

import { BaseRepository } from './base.repository';
import type { TableEntity, ITableRepository } from '../types';
import type { UryPosDatabase } from '../db';

export class TableRepository
  extends BaseRepository<TableEntity, string>
  implements ITableRepository
{
  constructor(dbInstance: UryPosDatabase) {
    super(dbInstance.restaurantTables, dbInstance);
  }

  /** Find tables belonging to a specific room */
  async findByRoom(room: string): Promise<TableEntity[]> {
    return this.table.where('restaurant_room').equals(room).toArray();
  }

  /** Find all currently occupied tables */
  async findOccupied(): Promise<TableEntity[]> {
    return this.table.where('occupied').equals(1).toArray();
  }

  /** Mark table occupied or free */
  async setOccupied(name: string, occupied: boolean): Promise<void> {
    const existing = await this.getById(name);
    if (existing) {
      existing.occupied = occupied ? 1 : 0;
      await this.put(existing);
    }
  }

  /**
   * Computes the full merge cluster for a primary table using the local
   * `merged_with` CSV cached on the table record. Mirrors the backend
   * `_get_table_group` behavior used by `cancel_order` to release tables.
   */
  async getClusterTables(primary: string): Promise<string[]> {
    const primaryEntity = await this.getById(primary);
    if (!primaryEntity) return [primary];

    const partners = (primaryEntity.merged_with || '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const cluster = new Set<string>([primary]);
    for (const partner of partners) {
      cluster.add(partner);
    }
    return Array.from(cluster);
  }

  /**
   * Releases every table in a merge cluster: marks them unoccupied and clears
   * the `merged_with` linkage. This matches the backend `release_merge_cluster_tables`
   * TABLE_RELEASE_FIELDS update performed during cancellation.
   */
  async releaseCluster(tableNames: string[]): Promise<void> {
    for (const name of tableNames) {
      const existing = await this.getById(name);
      if (existing) {
        existing.occupied = 0;
        existing.merged_with = null;
        existing.latest_invoice_time = null;
        existing.active_orders = null;
        await this.put(existing);
      }
    }
  }

  /**
   * Merges an anchor table with one or more target tables locally.
   * - Anchor stores the comma-separated list of target names in `merged_with`.
   * - Each target points back to the anchor.
   * - Every table in the cluster is marked occupied (1).
   *
   * This mirrors the online `merge_tables_batch` response shape so that the
   * reactive table layout and `TableCard` rendering work identically offline.
   */
  async mergeCluster(anchor: string, targets: string[]): Promise<void> {
    if (targets.length === 0) return;

    const targetCsv = targets.map(t => t.trim()).filter(Boolean).join(',');
    const anchorEntity = await this.getById(anchor);
    if (anchorEntity) {
      anchorEntity.merged_with = targetCsv;
      anchorEntity.occupied = 1;
      await this.put(anchorEntity);
    }

    for (const target of targets) {
      const targetEntity = await this.getById(target);
      if (targetEntity) {
        targetEntity.merged_with = anchor;
        targetEntity.occupied = 1;
        await this.put(targetEntity);
      }
    }
  }

  /**
   * Unmerges the cluster containing the given table.
   * - Clears `merged_with` for every table in the cluster.
   * - Marks tables with an active local order as occupied and the rest as free.
   *
   * `activeOrderTables` is the set of tables that should remain occupied because
   * they hold open invoices. When omitted, occupation is preserved as-is.
   */
  async unmergeCluster(table: string, activeOrderTables?: string[]): Promise<void> {
    const cluster = await this.getClusterTables(table);
    const activeSet = activeOrderTables ? new Set(activeOrderTables) : undefined;
    for (const name of cluster) {
      const existing = await this.getById(name);
      if (existing) {
        existing.merged_with = null;
        if (activeSet !== undefined) {
          existing.occupied = activeSet.has(name) ? 1 : 0;
        }
        await this.put(existing);
      }
    }
  }

  /** Update table transfer state */
  async transferTable(source: string, target: string): Promise<void> {
    await this.setOccupied(source, false);
    await this.setOccupied(target, true);
  }
}
