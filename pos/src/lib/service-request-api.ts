import { call } from '@ury/core';
import type { ServiceRequestPayload } from './realtime';

export type ServiceRequest = ServiceRequestPayload;

// frappe-js-sdk's call.get/post resolve to the raw response body, so the
// whitelisted method's return value sits under `message` (see table-api.ts).
interface FrappeResponse<T> {
  message: T;
}

/**
 * Open (unresolved) service requests for the cashier's branch.
 *
 * Fetched on mount and on reconnect, not only listened for: realtime delivers
 * what happens while the terminal is connected, so a bill requested while the
 * POS was closed or reloading would otherwise never be seen by anyone.
 */
export async function getOpenServiceRequests(): Promise<ServiceRequest[]> {
  try {
    const response = await call.get<FrappeResponse<ServiceRequest[]>>(
      'ury.ury.api.service_requests.get_open_service_requests'
    );
    return response?.message || [];
  } catch (error) {
    console.error('Failed to fetch open service requests:', error);
    return [];
  }
}

export async function resolveServiceRequest(
  name: string,
  status: 'Acknowledged' | 'Resolved' = 'Resolved',
): Promise<{ name: string; status: string }> {
  const response = await call.post<FrappeResponse<{ name: string; status: string }>>(
    'ury.ury.api.service_requests.resolve_service_request',
    { name, status }
  );
  return response.message;
}

/**
 * Marks requests as seen. Called when the cashier opens the alert list,
 * which is what lets the customer's own screen say the bill is on its way.
 */
export async function acknowledgeServiceRequests(
  names: string[],
): Promise<{ name: string; status: string }[]> {
  if (names.length === 0) return [];
  const response = await call.post<FrappeResponse<{ name: string; status: string }[]>>(
    'ury.ury.api.service_requests.acknowledge_service_requests',
    { names }
  );
  return response.message || [];
}
