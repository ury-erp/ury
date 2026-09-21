import type { SyncOrderResponse } from './order-api'
import { getSyncedInvoiceName, isSyncFailure } from './order-api'
import { apiErrorMessage } from './api-error'

/**
 * Backend `sync_order` (`ury_order.py`):
 * - Success → `return invoice.as_dict()` (always includes POS Invoice `name`)
 * - Soft reject → `return {"status": "Failure"}` (no invoice name)
 * - Hard fail (e.g. KOT creation after 3e879f4b) → `frappe.throw`, request rolls back
 * Frappe wraps the return value as `{ message: <return> }` from `call.post`.
 */

export type SyncOutcome =
  | { kind: 'success'; invoiceName: string }
  | { kind: 'failure' }
  | { kind: 'uncertain' }

/** Unwrap `{ message }` from call.post, or accept the raw sync return. */
export function unwrapSyncMessage(result: unknown): SyncOrderResponse | null | undefined {
  if (result == null) return result
  if (typeof result !== 'object') return null
  if ('message' in result) {
    return (result as { message: SyncOrderResponse }).message
  }
  return result as SyncOrderResponse
}

export function classifySyncOutcome(result: unknown): SyncOutcome {
  const message = unwrapSyncMessage(result)
  if (isSyncFailure(message)) return { kind: 'failure' }
  const invoiceName = getSyncedInvoiceName(message ?? null)
  if (invoiceName) return { kind: 'success', invoiceName }
  return { kind: 'uncertain' }
}

/**
 * Thrown sync errors: KOT routing failures roll the invoice back, so treat as
 * definitive failure (not "uncertain — ticket may exist"). Other throws stay
 * uncertain so a flaky network response cannot open a resend path.
 */
export function classifySyncThrownError(error: unknown): {
  kind: 'failure' | 'uncertain'
  message: string
} {
  const message = apiErrorMessage(error, 'Send result unclear. Do not resend until verified.')
  if (/Failed to create kitchen order ticket/i.test(message) || /KOT Creation Failed/i.test(message)) {
    return {
      kind: 'failure',
      message:
        message ||
        'Kitchen ticket could not be created. The order was not saved — fix kitchen routing, then send again.',
    }
  }
  return { kind: 'uncertain', message }
}

/**
 * Takeaway has no table invoice to reload — never clear the resend gate after
 * an uncertain/failed sync. Table reload may clear the gate only when the
 * fetch actually succeeded.
 */
export function mayClearReconcileGate(opts: {
  isTakeaway: boolean
  reloadSucceeded: boolean
}): boolean {
  if (opts.isTakeaway) return false
  return opts.reloadSucceeded
}

export type ReconcileReason = 'failure' | 'uncertain'

export function reconcileBannerCopy(opts: {
  isTakeaway: boolean
  reason: ReconcileReason
}): { title: string; action: 'reload' | 'leave' } {
  if (opts.isTakeaway) {
    return {
      title:
        opts.reason === 'failure'
          ? 'Send failed. Do not resend — verify the takeaway in POS, then leave.'
          : 'Send result unclear. Do not resend — a kitchen ticket may already exist. Verify in POS, then leave.',
      action: 'leave',
    }
  }
  return {
    title:
      opts.reason === 'failure'
        ? 'Send failed. Your draft is kept. Reload from server when ready (replaces local draft).'
        : 'Send result unclear. Your draft is kept. Reload from server before sending again.',
    action: 'reload',
  }
}
