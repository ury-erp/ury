import { call } from '@ury/core';

export interface CustomerLoyalty {
  enrolled: boolean;
  loyalty_program: string | null;
  loyalty_points: number;
  conversion_factor: number;
  redeemable_amount: number;
  tier_name: string | null;
}

const NOT_ENROLLED: CustomerLoyalty = {
  enrolled: false,
  loyalty_program: null,
  loyalty_points: 0,
  conversion_factor: 0,
  redeemable_amount: 0,
  tier_name: null,
};

/**
 * Points and their cash value for one customer.
 *
 * Resolves to "not enrolled" on any failure rather than throwing. Most
 * customers at a restaurant till are walk-ins with no loyalty at all, and
 * this runs every time one is picked — an error here would put a dialog in
 * front of a cashier over something that is not part of the sale.
 */
export async function getCustomerLoyalty(
  customer: string,
  posProfile: string,
): Promise<CustomerLoyalty> {
  if (!customer) return NOT_ENROLLED;
  try {
    const res = await call<{ message: CustomerLoyalty }>(
      'ury.ury.api.loyalty.get_customer_loyalty',
      { customer, pos_profile: posProfile },
    );
    return res?.message ?? NOT_ENROLLED;
  } catch {
    return NOT_ENROLLED;
  }
}

/** The most points that may be spent on a bill of this size. */
export function maxRedeemablePoints(loyalty: CustomerLoyalty, billTotal: number): number {
  if (!loyalty.enrolled || loyalty.conversion_factor <= 0) return 0;
  // ERPNext refuses a redemption worth more than the bill, so the cap is the
  // smaller of what they hold and what the bill can absorb. Floored, because
  // a fraction of a point is not a thing anyone can spend.
  const affordable = Math.floor(billTotal / loyalty.conversion_factor);
  return Math.max(0, Math.min(loyalty.loyalty_points, affordable));
}
