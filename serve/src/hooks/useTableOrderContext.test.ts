import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getTableOrderContextMock = vi.fn()

vi.mock('../lib/table-order-context-api', () => ({
  getTableOrderContext: (...args: unknown[]) => getTableOrderContextMock(...args),
}))

const setSelectedTable = vi.fn()
const clearTableOrder = vi.fn()

vi.mock('../store/serve-store', () => ({
  useServeStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      orderLoading: false,
      activeOrders: [],
      setSelectedTable,
      clearTableOrder,
    }),
}))

import { useTableOrderContext } from './useTableOrderContext'

const baseContext = {
  table: { name: 'T-101', restaurant_room: 'Hall A' },
  order: null,
  assignment: { waiter: 'captain1', is_mine: true },
  permissions: {
    view: true,
    modify: true,
    reduce_items: true,
    remove_items: false,
    transfer_table: false,
    transfer_captain: false,
    print_bill: false,
    reprint_kot: false,
    settle: false,
    cancel: false,
  },
}

describe('useTableOrderContext refreshContext', () => {
  beforeEach(() => {
    getTableOrderContextMock.mockReset()
    setSelectedTable.mockReset()
    clearTableOrder.mockReset()
  })

  it('returns fresh context without flipping isContextLoading', async () => {
    getTableOrderContextMock.mockResolvedValue(baseContext)

    const { result } = renderHook(() => useTableOrderContext('T-101'))

    await waitFor(() => expect(result.current.isContextLoading).toBe(false))
    expect(result.current.context).toEqual(baseContext)

    const refreshed = {
      ...baseContext,
      permissions: { ...baseContext.permissions, modify: false },
    }
    getTableOrderContextMock.mockResolvedValueOnce(refreshed)

    let returned: unknown
    await act(async () => {
      returned = await result.current.refreshContext()
    })

    expect(returned).toEqual(refreshed)
    expect(result.current.context).toEqual(refreshed)
    expect(result.current.isContextLoading).toBe(false)
    expect(result.current.isContextRefreshing).toBe(false)
    expect(result.current.contextError).toBeNull()
  })

  it('on failure returns null and keeps previous context and contextError', async () => {
    getTableOrderContextMock.mockResolvedValue(baseContext)

    const { result } = renderHook(() => useTableOrderContext('T-101'))
    await waitFor(() => expect(result.current.isContextLoading).toBe(false))

    getTableOrderContextMock.mockRejectedValueOnce(new Error('network'))

    let returned: unknown = 'unset'
    await act(async () => {
      returned = await result.current.refreshContext()
    })

    expect(returned).toBeNull()
    expect(result.current.context).toEqual(baseContext)
    expect(result.current.isContextLoading).toBe(false)
    expect(result.current.contextError).toBeNull()
  })
})
