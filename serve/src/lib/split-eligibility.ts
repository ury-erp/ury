/** Invoice statuses that must not be split (RN `billSplitUtils` baseline). */
const BLOCKED_SPLIT_STATUSES = ['Paid', 'Consolidated', 'Return'] as const

export type SplitEligibilityInvoice = {
  invoice_printed?: number | string | null
  status?: string | null
} | null | undefined

export type SplitEligibilityItem = {
  qty?: number | string | null
}

/**
 * Pure port of RN `canSplitBill` (`rn-table-order/hooks/billSplitUtils.js`).
 *
 * Requires a current invoice id, at least two lines or one line with qty > 1,
 * a printable flag of 0 or 1 (undefined treated as 0), and status not in the
 * blocked set.
 */
export function canSplitBill(
  invoice: SplitEligibilityInvoice,
  invoiceItems: SplitEligibilityItem[] | SplitEligibilityItem[][] | null | undefined,
  currentEditingInvoice: string | null | undefined
): boolean {
  if (!currentEditingInvoice) {
    return false
  }

  const items = Array.isArray((invoiceItems as SplitEligibilityItem[] | undefined)?.[0])
    ? (invoiceItems as SplitEligibilityItem[][])[0]
    : Array.isArray(invoiceItems)
      ? (invoiceItems as SplitEligibilityItem[])
      : []
  if (!items.length) {
    return false
  }

  const splittable = items.length >= 2 || items.some((item) => Number(item.qty) > 1)
  if (!splittable) {
    return false
  }

  // Backend may return 0/1 as strings; undefined means unprinted draft
  const printed = Number(invoice?.invoice_printed ?? 0)
  if (printed !== 0 && printed !== 1) {
    return false
  }

  const status = invoice?.status
  if (status && (BLOCKED_SPLIT_STATUSES as readonly string[]).includes(status)) {
    return false
  }

  return true
}
