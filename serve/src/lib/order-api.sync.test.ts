import { describe, expect, it } from 'vitest'
import { getSyncedInvoiceName, isSyncFailure } from './order-api'

describe('sync result helpers', () => {
  it('requires invoice name before treating sync as success', () => {
    expect(getSyncedInvoiceName({ status: 'Failure' })).toBeNull()
    expect(getSyncedInvoiceName({} as never)).toBeNull()
    expect(getSyncedInvoiceName({ name: 'POS-1' } as never)).toBe('POS-1')
    expect(isSyncFailure({ status: 'Failure' })).toBe(true)
    expect(isSyncFailure({ name: 'POS-1' } as never)).toBe(false)
  })
})
