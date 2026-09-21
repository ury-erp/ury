import { describe, expect, it } from 'vitest'
import { canSplitBill } from './split-eligibility'

describe('canSplitBill', () => {
  const invoice = { invoice_printed: 0, status: 'Draft' }

  it('requires a current editing invoice', () => {
    expect(canSplitBill(invoice, [{ qty: 2 }], null)).toBe(false)
    expect(canSplitBill(invoice, [{ qty: 2 }], undefined)).toBe(false)
    expect(canSplitBill(invoice, [{ qty: 2 }], '')).toBe(false)
  })

  it('rejects empty item lists', () => {
    expect(canSplitBill(invoice, [], 'INV-1')).toBe(false)
    expect(canSplitBill(invoice, null, 'INV-1')).toBe(false)
  })

  it('rejects a single qty-1 line', () => {
    expect(canSplitBill(invoice, [{ qty: 1 }], 'INV-1')).toBe(false)
  })

  it('allows a single line with qty > 1', () => {
    expect(canSplitBill(invoice, [{ qty: 2 }], 'INV-1')).toBe(true)
    expect(canSplitBill(invoice, [{ qty: '3' }], 'INV-1')).toBe(true)
  })

  it('allows two or more lines even at qty 1', () => {
    expect(canSplitBill(invoice, [{ qty: 1 }, { qty: 1 }], 'INV-1')).toBe(true)
  })

  it('unwraps a nested items array (RN shape)', () => {
    expect(canSplitBill(invoice, [[{ qty: 2 }]], 'INV-1')).toBe(true)
  })

  it('rejects Paid, Consolidated, and Return', () => {
    for (const status of ['Paid', 'Consolidated', 'Return'] as const) {
      expect(canSplitBill({ ...invoice, status }, [{ qty: 2 }], 'INV-1')).toBe(false)
    }
  })

  it('allows other statuses including undefined', () => {
    expect(canSplitBill({ invoice_printed: 0 }, [{ qty: 2 }], 'INV-1')).toBe(true)
    expect(canSplitBill({ invoice_printed: 0, status: 'Draft' }, [{ qty: 2 }], 'INV-1')).toBe(true)
  })

  it('accepts invoice_printed 0 or 1 (including string forms)', () => {
    expect(canSplitBill({ invoice_printed: 0, status: 'Draft' }, [{ qty: 2 }], 'INV-1')).toBe(true)
    expect(canSplitBill({ invoice_printed: 1, status: 'Draft' }, [{ qty: 2 }], 'INV-1')).toBe(true)
    expect(canSplitBill({ invoice_printed: '0', status: 'Draft' }, [{ qty: 2 }], 'INV-1')).toBe(true)
    expect(canSplitBill({ invoice_printed: '1', status: 'Draft' }, [{ qty: 2 }], 'INV-1')).toBe(true)
  })

  it('rejects non-binary invoice_printed values', () => {
    expect(canSplitBill({ invoice_printed: 2, status: 'Draft' }, [{ qty: 2 }], 'INV-1')).toBe(false)
    expect(canSplitBill({ invoice_printed: 'yes', status: 'Draft' }, [{ qty: 2 }], 'INV-1')).toBe(false)
  })
})
