import { call } from '@ury/core';

export interface EligiblePerformer {
  name: string;
  employee_name: string;
  designation: string | null;
}

/**
 * Employees this terminal may record an order for. Returns an empty list when
 * the POS Profile has the feature off; the backend re-checks the caller's role
 * on every order, so this is a convenience list, not an authorisation result.
 */
export async function listEligiblePerformers(
  posProfile: string,
  search?: string,
  limit = 20
): Promise<EligiblePerformer[]> {
  const res = await call.get(
    'ury.ury.api.ury_order_attribution.list_eligible_performers',
    { pos_profile: posProfile, search: search || undefined, limit }
  );
  return (res.message ?? []) as EligiblePerformer[];
}
