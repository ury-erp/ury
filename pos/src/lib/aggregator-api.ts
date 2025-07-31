import { call } from './frappe-sdk';

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
    return response.message;
  } catch (error: any) {
    if (error._server_messages) {
      const messages = JSON.parse(error._server_messages);
      const message = JSON.parse(messages[0]);
      throw new Error(message.message);
    }
    console.error('Failed to fetch aggregators:', error);
    throw error;
  }
} 