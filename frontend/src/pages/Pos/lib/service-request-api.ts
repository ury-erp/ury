import { call } from '@ury/core';

/**
 * Client for the staff-facing URY Service Request endpoints
 * (`ury.ury.api.service_requests`). Distinct from the guest-facing
 * `request_bill()` call in self_ordering.py — these are the Captain-side
 * list/acknowledge/resolve operations.
 */

export type ServiceRequestType = 'Bill' | 'Assistance';
export type ServiceRequestStatus = 'Open' | 'Acknowledged' | 'Resolved';

export interface ServiceRequest {
  name: string;
  request_type: ServiceRequestType;
  table: string;
  status: ServiceRequestStatus;
  requested_at: string;
}

/**
 * Fetches open/acknowledged service requests for the given branch, oldest
 * first. Meant to be polled (see `useServiceRequestPoll`) rather than
 * called once — there is no realtime "service request" socket channel yet.
 */
export const listOpenServiceRequests = async (
  branch: string
): Promise<ServiceRequest[]> => {
  const response = await call.get<{ message: ServiceRequest[] }>(
    'ury.ury.api.service_requests.list_open_service_requests',
    { branch }
  );

  return response.message ?? [];
};

export const acknowledgeServiceRequest = async (
  name: string
): Promise<ServiceRequest> => {
  const response = await call.post<{ message: ServiceRequest }>(
    'ury.ury.api.service_requests.acknowledge_service_request',
    { name }
  );

  return response.message;
};

export const resolveServiceRequest = async (
  name: string
): Promise<ServiceRequest> => {
  const response = await call.post<{ message: ServiceRequest }>(
    'ury.ury.api.service_requests.resolve_service_request',
    { name }
  );

  return response.message;
};
