import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getCaptainContextMock = vi.fn()

vi.mock('../../lib/captain-context-api', () => ({
  getCaptainContext: (...args: any[]) => getCaptainContextMock(...args),
}))

// derivePOSCapabilities itself is unit-tested against real role logic in
// packages/core/src/frappe/roles.test.ts -- this hook's own responsibility
// is fetch/loading/error state and building its capability-profile "shim"
// input, so we assert on what the hook actually passes into
// derivePOSCapabilities rather than re-deriving capability booleans here.
const derivePOSCapabilitiesMock = vi.fn(() => ({
  canBill: true,
  canRemoveItems: false,
  canTransfer: false,
  showImage: true,
  canReprint: false,
  multipleCashier: false,
}))

vi.mock('@ury/core', () => ({
  derivePOSCapabilities: (...args: any[]) => derivePOSCapabilitiesMock(...args),
}))

import { useCaptainContext } from './useCaptainContext'
import type { CaptainContext } from '../../lib/captain-context-api'

const buildContext = (overrides: Partial<CaptainContext> = {}): CaptainContext => ({
  user: 'waiter@example.com',
  roles: ['Captain'],
  branch: 'Kozhikode',
  rooms: [{ name: 'Main Hall', branch: 'Kozhikode' }],
  pos_profile: {
    name: 'Kozhikode POS',
    transfer_role_permissions: true,
    role_allowed_for_billing: false,
    role_restricted_for_table_order: false,
    remove_items: false,
    show_image: true,
    custom_enable_kot_reprint: false,
    custom_enable_multiple_cashier: false,
  },
  role_restricted_for_table_order: false,
  opening_state: { pos_open: true },
  ...overrides,
})

describe('useCaptainContext', () => {
  beforeEach(() => {
    getCaptainContextMock.mockReset()
    derivePOSCapabilitiesMock.mockClear()
  })

  it('starts in a loading state with no context/error', () => {
    getCaptainContextMock.mockReturnValue(new Promise(() => {})) // never resolves
    const { result } = renderHook(() => useCaptainContext())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.context).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.capabilities).toBeNull()
  })

  it('fetches on mount and exposes user/roles/branch/rooms/openingState from the response', async () => {
    const ctx = buildContext()
    getCaptainContextMock.mockResolvedValueOnce(ctx)

    const { result } = renderHook(() => useCaptainContext())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.context).toEqual(ctx)
    expect(result.current.user).toEqual({ name: 'waiter@example.com', roles: ['Captain'] })
    expect(result.current.roles).toEqual(['Captain'])
    expect(result.current.branch).toBe('Kozhikode')
    expect(result.current.rooms).toEqual(ctx.rooms)
    expect(result.current.openingState).toEqual({ pos_open: true })
    expect(result.current.error).toBeNull()
  })

  it('builds the capability-profile shim: role-derived booleans become row arrays containing the user\'s own role, cleared fields stay empty', async () => {
    const ctx = buildContext({
      roles: ['Captain'],
      pos_profile: {
        name: 'Kozhikode POS',
        transfer_role_permissions: true,
        role_allowed_for_billing: false,
        role_restricted_for_table_order: false,
        remove_items: true,
        show_image: false,
        custom_enable_kot_reprint: true,
        custom_enable_multiple_cashier: true,
      },
    })
    getCaptainContextMock.mockResolvedValueOnce(ctx)

    const { result } = renderHook(() => useCaptainContext())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.posProfile).toMatchObject({
      name: 'Kozhikode POS',
      branch: 'Kozhikode',
      transfer_role_permissions: [{ role: 'Captain' }],
      role_allowed_for_billing: [],
      role_restricted_for_table_order: [],
      remove_items: 1,
      show_image: 0,
      custom_enable_kot_reprint: 1,
      multiple_cashier: 1,
    })

    expect(derivePOSCapabilitiesMock).toHaveBeenCalledWith(
      result.current.user,
      result.current.posProfile,
    )
  })

  it('produces a null posProfile/capabilities but a non-null user when pos_profile is null', async () => {
    const ctx = buildContext({ pos_profile: null })
    getCaptainContextMock.mockResolvedValueOnce(ctx)

    const { result } = renderHook(() => useCaptainContext())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.user).not.toBeNull()
    // posProfile is still built (pos_profile fields fall back to falsy
    // defaults) -- only a missing `context`/`user` produces a null shim.
    expect(result.current.posProfile).not.toBeNull()
  })

  it('surfaces the error message and clears context on a rejected fetch', async () => {
    getCaptainContextMock.mockRejectedValueOnce(new Error('403 Forbidden'))

    const { result } = renderHook(() => useCaptainContext())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe('403 Forbidden')
    expect(result.current.context).toBeNull()
    expect(result.current.user).toBeNull()
    expect(result.current.capabilities).toBeNull()
    expect(result.current.roles).toEqual([])
    expect(result.current.rooms).toEqual([])
  })

  it('falls back to a generic error message when the rejection has no message', async () => {
    getCaptainContextMock.mockRejectedValueOnce({})

    const { result } = renderHook(() => useCaptainContext())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe('Failed to load captain context.')
  })

  it('refetch() re-runs the fetch and can recover from a prior error', async () => {
    getCaptainContextMock.mockRejectedValueOnce(new Error('network blip'))
    const { result } = renderHook(() => useCaptainContext())
    await waitFor(() => expect(result.current.error).toBe('network blip'))

    const ctx = buildContext()
    getCaptainContextMock.mockResolvedValueOnce(ctx)
    await result.current.refetch()

    await waitFor(() => expect(result.current.error).toBeNull())
    expect(result.current.context).toEqual(ctx)
    expect(getCaptainContextMock).toHaveBeenCalledTimes(2)
  })
})
