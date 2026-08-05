/**
 * @file sync-queue.repository.ts
 * @description CRUD Repository implementation for 'sync_queue' collection.
 */

import { BaseRepository } from './base.repository';
import type { SyncQueueEntity, ISyncQueueRepository } from '../types';
import type { UryPosDatabase } from '../db';

export class SyncQueueRepository
  extends BaseRepository<SyncQueueEntity, string>
  implements ISyncQueueRepository
{
  constructor(dbInstance: UryPosDatabase) {
    super(dbInstance.sync_queue, dbInstance);
  }

  /** Find all pending queue items sorted by priority and timestamp */
  async findPending(): Promise<SyncQueueEntity[]> {
    return this.table
      .where('status')
      .equals('PENDING')
      .sortBy('priority');
  }

  /** Get next batch of pending queue items for sync execution */
  async getNextBatch(batchSize: number): Promise<SyncQueueEntity[]> {
    return this.table
      .where('status')
      .equals('PENDING')
      .limit(batchSize)
      .toArray();
  }
}
