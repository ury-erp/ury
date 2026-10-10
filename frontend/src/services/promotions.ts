import { call } from '@ury/core';

export interface OfferRule {
  name: string;
  title: string | null;
  apply_on: string | null;
  price_or_product_discount: string | null;
  rate_or_discount: string | null;
  discount_percentage: number | null;
  discount_amount: number | null;
  coupon_code_based: number;
  min_qty: number | null;
  min_amt: number | null;
  valid_from: string | null;
  valid_upto: string | null;
  applicable_for: string | null;
}

export interface ActiveOffers {
  automatic: OfferRule[];
  coupon: OfferRule[];
  as_of: string;
  company: string | null;
}

export const promotionsService = {
  async active(): Promise<ActiveOffers> {
    const res = await call<{ message: ActiveOffers }>('ury.ury.api.promotions.get_active_offers');
    return res.message ?? (res as unknown as ActiveOffers);
  },
};
