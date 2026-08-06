/**
 * @file aggregator-item.repository.ts
 * @description CRUD Repository implementation for 'aggregator_items' collection,
 * providing per-aggregator catalog lookups and bulk replacement.
 */

import { BaseRepository } from './base.repository';
import type { AggregatorItemEntity, IAggregatorItemRepository } from '../types';
import type { UryPosDatabase } from '../db';

export class AggregatorItemRepository
  extends BaseRepository<AggregatorItemEntity, string>
  implements IAggregatorItemRepository
{
  constructor(dbInstance: UryPosDatabase) {
    super(dbInstance.aggregator_items, dbInstance);
  }

  /** Find all cached items for a specific aggregator partner */
  async findByAggregator(aggregator: string): Promise<AggregatorItemEntity[]> {
    return this.table.where('aggregator').equals(aggregator).toArray();
  }

  /** Replace the cached catalog for an aggregator partner */
  async putManyByAggregator(
    aggregator: string,
    items: Array<Omit<AggregatorItemEntity, 'id' | 'aggregator' | 'updatedAt'>>
  ): Promise<string[]> {
    const timestamp = new Date().toISOString();
    const entities: AggregatorItemEntity[] = items.map(item => ({
      id: `${aggregator}::${item.item}`,
      aggregator,
      item: item.item,
      item_name: item.item_name,
      rate: item.rate,
      item_image: item.item_image ?? null,
      updatedAt: timestamp,
    }));

    await this.runTransaction('rw', async () => {
      await this.table.where('aggregator').equals(aggregator).delete();
      await this.table.bulkPut(entities);
    });

    return entities.map(e => e.id);
  }
}
