import { describe, expect, it } from 'vitest'
import {
  classifySyncOutcome,
  mayClearReconcileGate,
  reconcileBannerCopy,
  unwrapSyncMessage,
} from './sync-outcome'

describe('sync_order outcome classification (backend semantics)', () => {
  it('treats invoice.as_dict()-shaped success (with name) as success', () => {
    // Mirrors ury_order.sync_order success: return invoice.as_dict()
    const wrapped = {
      message: {
        name: 'ACC-POS-2026-00042',
        customer: 'CUST-0001',
        items: [{ name: 'row-1', item_code: 'ITEM', qty: 1, rate: 10 }],
        status: 'Draft',
      },
    }
    const unwrapped = unwrapSyncMessage(wrapped)
    expect(unwrapped && 'name' in unwrapped ? unwrapped.name : null).toBe('ACC-POS-2026-00042')
    expect(classifySyncOutcome(wrapped)).toEqual({
      kind: 'success',
      invoiceName: 'ACC-POS-2026-00042',
    })
  })

  it('treats { status: Failure } as failure (no clear/navigate)', () => {
    expect(classifySyncOutcome({ message: { status: 'Failure' } })).toEqual({
      kind: 'failure',
    })
  })

  it('treats missing invoice name as uncertain (do not clear draft)', () => {
    expect(classifySyncOutcome({ message: { status: 'Draft' } })).toEqual({
      kind: 'uncertain',
    })
    expect(classifySyncOutcome({ message: null })).toEqual({ kind: 'uncertain' })
    expect(classifySyncOutcome(undefined)).toEqual({ kind: 'uncertain' })
  })

  it('never clears reconcile gate for takeaway', () => {
    expect(mayClearReconcileGate({ isTakeaway: true, reloadSucceeded: true })).toBe(false)
    expect(mayClearReconcileGate({ isTakeaway: false, reloadSucceeded: true })).toBe(true)
    expect(mayClearReconcileGate({ isTakeaway: false, reloadSucceeded: false })).toBe(false)
  })

  it('takeaway banner requires leave without resend; table offers reload', () => {
    expect(reconcileBannerCopy({ isTakeaway: true, reason: 'uncertain' }).action).toBe('leave')
    expect(reconcileBannerCopy({ isTakeaway: false, reason: 'failure' }).action).toBe('reload')
  })
})
