/**
 * @file aggregator.repository.ts
 * @description CRUD Repository implementation for 'aggregators' collection.
 */

import { BaseRepository } from './base.repository';
import type { AggregatorEntity, IAggregatorRepository } from '../types';
import type { UryPosDatabase } from '../db';

export class AggregatorRepository
  extends BaseRepository<AggregatorEntity, string>
  implements IAggregatorRepository
{
  constructor(dbInstance: UryPosDatabase) {
    super(dbInstance.aggregators, dbInstance);
  }

  /** Find all active/enabled aggregator channels */
  async findEnabled(): Promise<AggregatorEntity[]> {
    return this.table.filter(a => Boolean(a.enabled)).toArray();
  }
}
