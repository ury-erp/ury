/** The backend expects a percentage, never the displayed currency discount. */
export function paymentDiscountPercentage(percentage: number): number | null {
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new RangeError('Invalid discount percentage');
  }
  return percentage > 0 ? percentage : null;
}

export function invoiceDisplayTotals(invoice: {
  grand_total: number;
  rounded_total?: number | null;
  custom_merged_total?: number | null;
}) {
  const merged = invoice.custom_merged_total ?? 0;
  // A zero rounded_total is ERPNext's unrounded case, not a zero-value bill.
  return {
    grandTotal: invoice.grand_total + merged,
    roundedTotal: (invoice.rounded_total || invoice.grand_total) + merged,
  };
}
