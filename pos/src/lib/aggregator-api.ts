import { call, repositories } from '@ury/core';

export interface Aggregator {
  customer: string;
}

export interface GetAggregatorsResponse {
  message: Aggregator[];
}

export async function getAggregators(): Promise<Aggregator[]> {
  try {
    const response = await call.get<GetAggregatorsResponse>(
      'ury.ury_pos.api.getAggregator'
    );
    const aggregators = response.message;

    if (aggregators && aggregators.length > 0) {
      await repositories.aggregators.putMany(
        aggregators.map(a => ({
          name: a.customer,
          customer: a.customer,
          enabled: true,
        }))
      );
    }

    return aggregators;
  } catch (error: any) {
    // Repository fallback
    const cachedAggs = await repositories.aggregators.findEnabled();
    if (cachedAggs && cachedAggs.length > 0) {
      return cachedAggs.map(a => ({ customer: a.customer }));
    }

    if (error._server_messages) {
      const messages = JSON.parse(error._server_messages);
      const message = JSON.parse(messages[0]);
      throw new Error(message.message);
    }
    console.error('Failed to fetch aggregators:', error);
    throw error;
  }
}