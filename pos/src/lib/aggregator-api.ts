import { call } from './frappe-sdk-retry';
import { getErrorMessage } from './error-utils';

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
  } catch (error) {
    throw new Error(`Failed to fetch aggregators: ${getErrorMessage(error)}`);
  }
}