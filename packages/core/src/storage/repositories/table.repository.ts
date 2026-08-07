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
