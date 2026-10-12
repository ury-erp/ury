import { call } from '@ury/core';

export interface BillingQuote {
  subtotal: number;
  manual_discount_amount: number;
  tax_amount: number;
  service_charge: number;
  service_charge_percentage: number;
  grand_total: number;
  rounded_total: number;
  currency: string;
  policy: {
    name?: string;
    policy_name?: string;
    discount_type?: 'Percentage' | 'Amount';
    value?: number;
    amount?: number;
    remaining_limit?: number | null;
    reason?: string;
  };
  merged_policy?: BillingQuote['policy'];
}

export async function getInvoiceBillingQuote(invoice: string, manualDiscountPercentage?: number): Promise<BillingQuote> {
  const response = await call.get<{ message: BillingQuote }>(
    'ury.ury.api.pos_billing.get_invoice_billing_quote',
    { invoice, manual_discount_percentage: manualDiscountPercentage || 0 },
  );
  return response.message;
}
