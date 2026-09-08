import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getCaptainContextMock = vi.fn()
const derivePOSCapabilitiesMock = vi.fn()

vi.mock('../lib/captain-context-api', () => ({
  getCaptainContext: (...args: unknown[]) => getCaptainContextMock(...args),
}))

vi.mock('@ury/core', async () => {
  const actual = await vi.importActual<typeof import('@ury/core')>('@ury/core')
  return {
    ...actual,
    derivePOSCapabilities: (...args: unknown[]) => derivePOSCapabilitiesMock(...args),
  }
})

import { useCaptainContext } from './useCaptainContext'

describe('useCaptainContext', () => {
  beforeEach(() => {
    getCaptainContextMock.mockReset()
    derivePOSCapabilitiesMock.mockReset()
    derivePOSCapabilitiesMock.mockReturnValue({
      canTakeTableOrders: true,
      canAccessOtherCaptainsTables: false,
      canTransferCaptain: false,
      canOpenPOS: false,
      canClosePOS: false,
    })
  })

  it('loads captain context and keeps open/close POS capabilities false', async () => {
    getCaptainContextMock.mockResolvedValue({
      user: 'captain@example.com',
      roles: ['URY Captain'],
      branch: 'Test Branch',
      rooms: [{ name: 'Main Hall', branch: 'Test Branch' }],
      pos_profile: {
        name: 'POS-MAIN',
        transfer_role_permissions: true,
        role_allowed_for_billing: false,
        role_restricted_for_table_order: false,
        remove_items: false,
        show_image: false,
        custom_enable_kot_reprint: false,
        custom_enable_multiple_cashier: true,
      },
      role_restricted_for_table_order: false,
      opening_state: { pos_open: true },
    })

    const { result } = renderHook(() => useCaptainContext())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBeNull()
    expect(result.current.openingState).toEqual({ pos_open: true })
    expect(result.current.context?.pos_profile?.custom_enable_multiple_cashier).toBe(true)
    expect(derivePOSCapabilitiesMock).toHaveBeenCalled()
    const caps = result.current.capabilities
    expect(caps?.canOpenPOS).toBe(false)
    expect(caps?.canClosePOS).toBe(false)
  })

  it('surfaces fetch errors and clears context', async () => {
    getCaptainContextMock.mockRejectedValue(new Error('network'))

    const { result } = renderHook(() => useCaptainContext())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toMatch(/network/i)
    expect(result.current.context).toBeNull()
    expect(result.current.openingState).toBeNull()
  })

  it('shims transfer_role_permissions so elevated managers keep transfer capability', async () => {
    derivePOSCapabilitiesMock.mockImplementation(
      (_user: unknown, profile: { transfer_role_permissions?: { role: string }[] }) => ({
        canTakeTableOrders: true,
        canAccessOtherCaptainsTables: Boolean(profile?.transfer_role_permissions?.length),
        canTransferCaptain: Boolean(profile?.transfer_role_permissions?.length),
        canOpenPOS: false,
        canClosePOS: false,
      })
    )

    getCaptainContextMock.mockResolvedValue({
      user: 'manager@example.com',
      roles: ['URY Manager'],
      branch: 'Test Branch',
      rooms: [],
      pos_profile: {
        name: 'POS-MAIN',
        transfer_role_permissions: true,
        role_allowed_for_billing: false,
        role_restricted_for_table_order: false,
        remove_items: false,
        show_image: false,
        custom_enable_kot_reprint: false,
        custom_enable_multiple_cashier: false,
      },
      role_restricted_for_table_order: false,
      opening_state: { pos_open: true },
    })

    const { result } = renderHook(() => useCaptainContext())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.capabilities?.canTransferCaptain).toBe(true)
    expect(result.current.capabilities?.canAccessOtherCaptainsTables).toBe(true)
  })
})
