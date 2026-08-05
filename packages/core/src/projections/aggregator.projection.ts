/**
 * @file aggregator.projection.ts
 * @description Aggregator Projection Engine. Computes delivery platform read models from repositories.
 */

import { repositories, type AggregatorEntity } from '../storage';
import { projectionBus } from './projection.bus';

export interface AggregatorProjectionItem {
  name: string;
  customer: string;
  isEnabled: boolean;
}

export interface AggregatorProjectionData {
  aggregators: AggregatorProjectionItem[];
  enabledCount: number;
}

/**
 * Computes and returns the Aggregator Projection read model from repositories.
 */
export async function getAggregatorProjection(repos = repositories): Promise<AggregatorProjectionData> {
  const rawAggs: AggregatorEntity[] = await repos.aggregators.getAll();

  const aggregators: AggregatorProjectionItem[] = rawAggs.map((a: AggregatorEntity) => ({
    name: a.name,
    customer: a.customer,
    isEnabled: Boolean(a.enabled),
  }));

  const enabledCount = aggregators.filter(a => a.isEnabled).length;

  return {
    aggregators,
    enabledCount,
  };
}

/**
 * Emits aggregator projection update event.
 */
export function notifyAggregatorsProjectionUpdated(): void {
  projectionBus.emit('AGGREGATORS_UPDATED');
}
