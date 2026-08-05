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
}
