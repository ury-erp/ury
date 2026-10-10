import { call } from '@ury/core';

export interface CouponCheck {
  valid: boolean;
  reason?: 'unknown' | 'not_started' | 'expired' | 'exhausted' | 'other_customer';
  name?: string;
  coupon_code?: string;
  description?: string | null;
  pricing_rule?: string | null;
  /** null when the coupon has no usage limit at all. */
  remaining_uses?: number | null;
  valid_from?: string;
  valid_upto?: string;
}

export interface CouponTotals {
  grand_total: number;
  rounded_total: number;
  discount_amount: number;
  net_total: number;
  coupon_code: string | null;
  applied_rules: string[];
}

export interface Offer {
  name: string;
  title: string | null;
  rate_or_discount: string | null;
  discount_percentage: number | null;
  discount_amount: number | null;
  min_amt: number | null;
  valid_upto: string | null;
}

const unwrap = <T,>(res: any): T => res?.message ?? res;

/**
 * Offers and coupons.
 *
 * Every number here is read back from the invoice after ERPNext repriced it.
 * The POS never computes what an offer is worth: a second opinion about a
 * total is the one thing a till must not have.
 */
export const promotionsApi = {
  async activeOffers(posProfile: string): Promise<{ automatic: Offer[]; coupon: Offer[] }> {
    return unwrap(await call.post('ury.ury.api.promotions.get_active_offers', { pos_profile: posProfile }));
  },

  async checkCoupon(couponCode: string, invoice?: string): Promise<CouponCheck> {
    return unwrap(
      await call.post('ury.ury.api.promotions.check_coupon', { coupon_code: couponCode, invoice }),
    );
  },

  async applyCoupon(invoice: string, couponCode: string): Promise<CouponTotals> {
    return unwrap(
      await call.post('ury.ury.api.promotions.apply_coupon', { invoice, coupon_code: couponCode }),
    );
  },

  async removeCoupon(invoice: string): Promise<CouponTotals> {
    return unwrap(await call.post('ury.ury.api.promotions.remove_coupon', { invoice }));
  },
};
