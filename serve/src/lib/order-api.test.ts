import { beforeEach, describe, expect, it, vi } from 'vitest'

const callGet = vi.fn()
const callPost = vi.fn()

vi.mock('@ury/core', () => ({
  call: {
    get: (...args: unknown[]) => callGet(...args),
    post: (...args: unknown[]) => callPost(...args),
  },
  db: {},
}))

import {
  getTableOrder,
  syncOrder,
  splitBill,
  tableTransfer,
  captainTransfer,
  reprintKot,
  getSplitGroup,
  getSyncedInvoiceName,
  isSyncFailure,
  type SyncOrderRequest,
} from './order-api'

beforeEach(() => {
  callGet.mockReset()
  callPost.mockReset()
})

describe('getTableOrder', () => {
  it('requests the order invoice for a table and returns the raw response', async () => {
    callGet.mockResolvedValue({ message: { name: 'POS-1' } })
    const result = await getTableOrder('T-01')
    expect(callGet).toHaveBeenCalledWith('ury.ury.doctype.ury_order.ury_order.get_order_invoice', {
      table: 'T-01',
    })
    expect(result).toEqual({ message: { name: 'POS-1' } })
  })

  it('passes through a null message when no active order exists', async () => {
    callGet.mockResolvedValue({ message: null })
    const result = await getTableOrder('T-99')
    expect(result.message).toBeNull()
  })
})

describe('syncOrder', () => {
  const baseRequest: SyncOrderRequest = {
    table: 'T-01',
    items: [],
    no_of_pax: 1,
    pos_profile: 'Main',
    invoice: null,
    order_type: 'Dine In',
    last_invoice: null,
  }

  it('posts the request shape unchanged to sync_order', async () => {
    callPost.mockResolvedValue({ message: { name: 'POS-1' } })
    await syncOrder(baseRequest)
    expect(callPost).toHaveBeenCalledWith('ury.ury.doctype.ury_order.ury_order.sync_order', baseRequest)
  })

  it('handles an empty cart (no items)', async () => {
    callPost.mockResolvedValue({ message: { name: 'POS-2', items: [] } })
    const res = await syncOrder({ ...baseRequest, items: [] })
    expect(res.message).toMatchObject({ name: 'POS-2', items: [] })
  })

  it('resolves with a Failure status object on backend rejection', async () => {
    callPost.mockResolvedValue({ message: { status: 'Failure' } })
    const res = await syncOrder(baseRequest)
    expect(res.message).toEqual({ status: 'Failure' })
  })

  it('propagates rejection when the underlying call throws', async () => {
    callPost.mockRejectedValue(new Error('network down'))
    await expect(syncOrder(baseRequest)).rejects.toThrow('network down')
  })

  it('sends zero-qty line items through without mutation', async () => {
    const withZeroQty: SyncOrderRequest = {
      ...baseRequest,
      items: [{ item: 'ITEM-1', item_name: 'Water', rate: 0, qty: 0 }],
    }
    callPost.mockResolvedValue({ message: { name: 'POS-3' } })
    await syncOrder(withZeroQty)
    expect(callPost.mock.calls[0][1].items).toEqual([
      { item: 'ITEM-1', item_name: 'Water', rate: 0, qty: 0 },
    ])
  })
})

describe('getSyncedInvoiceName', () => {
  it('returns null for null/undefined input', () => {
    expect(getSyncedInvoiceName(null)).toBeNull()
    expect(getSyncedInvoiceName(undefined)).toBeNull()
  })

  it('returns null when name is missing or blank', () => {
    expect(getSyncedInvoiceName({} as never)).toBeNull()
    expect(getSyncedInvoiceName({ name: '   ' } as never)).toBeNull()
    expect(getSyncedInvoiceName({ name: 123 } as never)).toBeNull()
  })

  it('returns the trimmed name on success', () => {
    expect(getSyncedInvoiceName({ name: 'POS-7' } as never)).toBe('POS-7')
  })
})

describe('isSyncFailure', () => {
  it('is false for non-object / null input', () => {
    expect(isSyncFailure(null)).toBe(false)
    expect(isSyncFailure(undefined)).toBe(false)
  })

  it('is false when status is present but not Failure', () => {
    expect(isSyncFailure({ status: 'Success' } as never)).toBe(false)
  })
})

describe('splitBill', () => {
  it('maps source invoice, items, and optional customer into the request', async () => {
    callPost.mockResolvedValue({
      message: { source_invoice: 'POS-1', new_invoice: 'POS-2' },
    })
    const result = await splitBill('POS-1', [{ name: 'row-1', qty: 2 }], 'CUST-1')
    expect(callPost).toHaveBeenCalledWith('ury.ury.doctype.ury_order.ury_order.split_bill', {
      source_invoice: 'POS-1',
      items_to_move: [{ name: 'row-1', qty: 2 }],
      customer: 'CUST-1',
    })
    expect(result).toEqual({ source_invoice: 'POS-1', new_invoice: 'POS-2' })
  })

  it('omits customer when not provided (undefined, not null/empty string)', async () => {
    callPost.mockResolvedValue({ message: { source_invoice: 'POS-1', new_invoice: 'POS-2' } })
    await splitBill('POS-1', [])
    expect(callPost).toHaveBeenCalledWith('ury.ury.doctype.ury_order.ury_order.split_bill', {
      source_invoice: 'POS-1',
      items_to_move: [],
      customer: undefined,
    })
  })

  it('treats an empty-string customer the same as absent', async () => {
    callPost.mockResolvedValue({ message: { source_invoice: 'POS-1', new_invoice: 'POS-2' } })
    await splitBill('POS-1', [{ name: 'row-1', qty: 0 }], '')
    expect(callPost.mock.calls[0][1].customer).toBeUndefined()
  })
})

describe('tableTransfer', () => {
  it('posts table, newTable, and invoice and resolves void', async () => {
    callPost.mockResolvedValue({ message: 'ok' })
    const result = await tableTransfer('T-01', 'T-02', 'POS-1')
    expect(callPost).toHaveBeenCalledWith('ury.ury.doctype.ury_order.ury_order.table_transfer', {
      table: 'T-01',
      newTable: 'T-02',
      invoice: 'POS-1',
    })
    expect(result).toBeUndefined()
  })
})

describe('captainTransfer', () => {
  it('posts currentCaptain, newCaptain, and invoice', async () => {
    callPost.mockResolvedValue({ message: 'ok' })
    await captainTransfer('waiter-a', 'waiter-b', 'POS-1')
    expect(callPost).toHaveBeenCalledWith('ury.ury.doctype.ury_order.ury_order.captain_transfer', {
      currentCaptain: 'waiter-a',
      newCaptain: 'waiter-b',
      invoice: 'POS-1',
    })
  })

  it('propagates errors from the underlying call', async () => {
    callPost.mockRejectedValue(new Error('forbidden'))
    await expect(captainTransfer('a', 'b', 'POS-1')).rejects.toThrow('forbidden')
  })
})

describe('reprintKot', () => {
  it('posts invoice_number to the reprint_kot endpoint', async () => {
    callPost.mockResolvedValue({ message: 'ok' })
    await reprintKot('POS-1')
    expect(callPost).toHaveBeenCalledWith('ury.ury.api.ury_kot_reprint.reprint_kot', {
      invoice_number: 'POS-1',
    })
  })
})

describe('getSplitGroup', () => {
  it('unwraps a message array from the response envelope', async () => {
    callGet.mockResolvedValue({ message: [{ name: 'POS-1' }, { name: 'POS-2' }] })
    const result = await getSplitGroup('POS-1')
    expect(callGet).toHaveBeenCalledWith('ury.ury_pos.api.get_split_group', { invoice: 'POS-1' })
    expect(result).toEqual([{ name: 'POS-1' }, { name: 'POS-2' }])
  })

  it('falls back to the raw response when there is no message field', async () => {
    callGet.mockResolvedValue([{ name: 'POS-3' }])
    const result = await getSplitGroup('POS-3')
    expect(result).toEqual([{ name: 'POS-3' }])
  })

  it('returns an empty array when the resolved message is not an array', async () => {
    callGet.mockResolvedValue({ message: null })
    const result = await getSplitGroup('POS-4')
    expect(result).toEqual([])
  })

  it('returns an empty array when response is undefined-shaped', async () => {
    callGet.mockResolvedValue({})
    const result = await getSplitGroup('POS-5')
    expect(result).toEqual([])
  })
})
