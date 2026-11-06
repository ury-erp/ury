/**
 * @file base.repository.ts
 * @description Generic Abstract Base Repository implementing standard IndexedDB CRUD
 * operations using Dexie. Strict CRUD only, zero business logic.
 */

import type { Table } from 'dexie';
import type { IBaseRepository, QueryOptions } from '../types';
import type { UryPosDatabase } from '../db';

export abstract class BaseRepository<T extends object, K = string>
  implements IBaseRepository<T, K>
{
  protected table: Table<T, K>;
  readonly dbInstance: UryPosDatabase;

  constructor(table: Table<T, K>, dbInstance: UryPosDatabase) {
    this.table = table;
    this.dbInstance = dbInstance;
  }

  /**
   * Get a single record by primary key ID
   */
  async getById(id: K): Promise<T | undefined> {
    return this.table.get(id as any);
  }

  /**
   * Get all records in table
   */
  async getAll(options?: QueryOptions<T>): Promise<T[]> {
    if (!options) {
      return this.table.toArray();
    }
    return this.query(options);
  }

  /**
   * Insert or update a single record
   */
  async put(item: T): Promise<K> {
    const res = await this.table.put(item);
    return res as unknown as K;
  }

  /**
   * Bulk insert or update records
   */
  async putMany(items: T[]): Promise<K[]> {
    const res = await this.table.bulkPut(items, { allKeys: true });
    return res as unknown as K[];
  }

  /**
   * Delete a record by primary key ID
   */
  async delete(id: K): Promise<void> {
    await this.table.delete(id as any);
  }

  /**
   * Clear all records in table
   */
  async clear(): Promise<void> {
    await this.table.clear();
  }

  /**
   * Count records matching query or total count
   */
  async count(query?: Partial<T>): Promise<number> {
    if (!query || Object.keys(query).length === 0) {
      return this.table.count();
    }
    return this.table.filter(item => {
      return Object.entries(query).every(
        ([key, val]) => item[key as keyof T] === val
      );
    }).count();
  }

  /**
   * Query records with filters, limit, offset, and sorting
   */
  async query(options: QueryOptions<T>): Promise<T[]> {
    let collection = this.table.toCollection();

    if (options.where && Object.keys(options.where).length > 0) {
      collection = this.table.filter(item => {
        return Object.entries(options.where!).every(
          ([key, val]) => item[key as keyof T] === val
        );
      });
    }

    if (options.orderBy) {
      if (options.orderDirection === 'desc') {
        collection = collection.reverse();
      }
    }

    if (options.offset) {
      collection = collection.offset(options.offset);
    }

    if (options.limit) {
      collection = collection.limit(options.limit);
    }

    return collection.toArray();
  }

  /**
   * Execute operations within an atomic Dexie transaction
   */
  async runTransaction<R>(mode: 'r' | 'rw', fn: () => Promise<R>): Promise<R> {
    const modeString = mode === 'rw' ? 'rw' : 'r';
    return this.dbInstance.transaction(modeString, this.table, async () => {
      return fn();
    });
  }
}
