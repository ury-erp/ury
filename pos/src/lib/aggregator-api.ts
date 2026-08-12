import { call, apiRegistry } from '@ury/core';

export interface Aggregator {
  customer: string;
}

export interface GetAggregatorsResponse {
  message: Aggregator[];
}

export async function getAggregators(posProfile?: string): Promise<Aggregator[]> {
  const endpoint = apiRegistry.getUrl('GET_AGGREGATOR');
  const response = await call.get<GetAggregatorsResponse>(endpoint, posProfile ? { pos_profile: posProfile } : undefined);
  return response.message;
}