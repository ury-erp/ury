import { call, apiRegistry } from '@ury/core';

export interface Aggregator {
  customer: string;
}

export interface GetAggregatorsResponse {
  message: Aggregator[];
}

export async function getAggregators(): Promise<Aggregator[]> {
  const endpoint = apiRegistry.getUrl('GET_AGGREGATOR');
  const response = await call.get<GetAggregatorsResponse>(endpoint);
  return response.message;
}