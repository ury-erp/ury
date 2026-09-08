import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const validatePOSCloseMock = vi.fn()
const useCaptainContextMock = vi.fn()

vi.mock('../lib/pos-opening-api', () => ({
  validatePOSClose: (...args: unknown[]) => validatePOSCloseMock(...args),
}))

vi.mock('../hooks/useCaptainContext', () => ({
  useCaptainContext: () => useCaptainContextMock(),
}))

vi.mock('../operations', () => ({
  OpeningChecklist: ({
    user,
    posProfile,
    onReady,
  }: {
    user: string
    posProfile: string
    onReady: () => void
  }) => (
    <div>
      <span>Checklist for {user} / {posProfile}</span>
      <button type="button" onClick={onReady}>
        Complete checklist
      </button>
    </div>
  ),
}))

vi.mock('./ServiceRequestPanel', () => ({
  default: () => <div>Service requests</div>,
}))

import ServeRouteGuard, { isSuccessfulPOSCloseMessage } from './ServeRouteGuard'

const baseContext = {
  user: 'captain@example.com',
  roles: ['URY Captain'],
  branch: 'Test Branch',
  rooms: [{ name: 'Main Hall', branch: 'Test Branch' }],
  pos_profile: {
    name: 'POS-MAIN',
    transfer_role_permissions: false,
    role_allowed_for_billing: false,
    role_restricted_for_table_order: false,
    remove_items: false,
    show_image: false,
    custom_enable_kot_reprint: false,
    custom_enable_multiple_cashier: false,
  },
  role_restricted_for_table_order: false,
  opening_state: { pos_open: true },
}

function mockCaptain(overrides: Record<string, unknown> = {}) {
  useCaptainContextMock.mockReturnValue({
    capabilities: { canTakeTableOrders: true },
    openingState: { pos_open: true },
    branch: 'Test Branch',
    context: baseContext,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  })
}

describe('isSuccessfulPOSCloseMessage', () => {
  it('accepts only explicit Success', () => {
    expect(isSuccessfulPOSCloseMessage('Success')).toBe(true)
    expect(isSuccessfulPOSCloseMessage('Failed')).toBe(false)
    expect(isSuccessfulPOSCloseMessage(undefined)).toBe(false)
    expect(isSuccessfulPOSCloseMessage(null)).toBe(false)
    expect(isSuccessfulPOSCloseMessage({ ok: true })).toBe(false)
    expect(isSuccessfulPOSCloseMessage('')).toBe(false)
  })
})

describe('ServeRouteGuard', () => {
  beforeEach(() => {
    validatePOSCloseMock.mockReset()
    useCaptainContextMock.mockReset()
    mockCaptain()
    validatePOSCloseMock.mockResolvedValue({ message: 'Success' })
  })

  it('fails closed while close validation is pending', async () => {
    let resolveClose: (value: { message: string }) => void = () => undefined
    validatePOSCloseMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveClose = resolve
        })
    )

    render(
      <ServeRouteGuard>
        <div>Protected</div>
      </ServeRouteGuard>
    )

    expect(screen.getByText(/Checking Serve access/i)).toBeInTheDocument()
    expect(screen.queryByText('Protected')).not.toBeInTheDocument()

    await act(async () => {
      resolveClose({ message: 'Success' })
    })

    expect(await screen.findByText('Checklist for captain@example.com / POS-MAIN')).toBeInTheDocument()
  })

  it('fails closed on malformed close response', async () => {
    validatePOSCloseMock.mockResolvedValue({ message: { unexpected: true } })

    render(
      <ServeRouteGuard>
        <div>Protected</div>
      </ServeRouteGuard>
    )

    expect(await screen.findByText(/POS close required/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Could not confirm prior-day POS close/i)
    ).toBeInTheDocument()
    expect(screen.queryByText('Protected')).not.toBeInTheDocument()
  })

  it('blocks when prior day close Failed', async () => {
    validatePOSCloseMock.mockResolvedValue({ message: 'Failed' })

    render(
      <ServeRouteGuard>
        <div>Protected</div>
      </ServeRouteGuard>
    )

    expect(await screen.findByText(/POS close required/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Previous POS day is not closed/i)
    ).toBeInTheDocument()
  })

  it('blocks when POS is not open (multi-cashier room gate surfaces here)', async () => {
    mockCaptain({ openingState: { pos_open: false } })

    render(
      <ServeRouteGuard>
        <div>Protected</div>
      </ServeRouteGuard>
    )

    expect(await screen.findByText(/POS is not open/i)).toBeInTheDocument()
    expect(screen.queryByText('Protected')).not.toBeInTheDocument()
  })

  it('blocks when opening state is unknown', async () => {
    mockCaptain({ openingState: null })

    render(
      <ServeRouteGuard>
        <div>Protected</div>
      </ServeRouteGuard>
    )

    expect(await screen.findByText(/Opening state unknown/i)).toBeInTheDocument()
  })

  it('resets checklist when user or profile identity changes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <ServeRouteGuard>
        <div>Protected</div>
      </ServeRouteGuard>
    )

    expect(
      await screen.findByText('Checklist for captain@example.com / POS-MAIN')
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Complete checklist/i }))
    expect(await screen.findByText('Protected')).toBeInTheDocument()

    mockCaptain({
      context: {
        ...baseContext,
        user: 'other@example.com',
        pos_profile: { ...baseContext.pos_profile, name: 'POS-OTHER' },
      },
    })
    validatePOSCloseMock.mockResolvedValue({ message: 'Success' })

    rerender(
      <ServeRouteGuard>
        <div>Protected</div>
      </ServeRouteGuard>
    )

    expect(
      await screen.findByText('Checklist for other@example.com / POS-OTHER')
    ).toBeInTheDocument()
    expect(screen.queryByText('Protected')).not.toBeInTheDocument()
  })

  it('does not render opening or closing forms', async () => {
    const user = userEvent.setup()
    render(
      <ServeRouteGuard>
        <div>Protected</div>
      </ServeRouteGuard>
    )

    await user.click(
      await screen.findByRole('button', { name: /Complete checklist/i })
    )

    expect(await screen.findByText('Protected')).toBeInTheDocument()
    expect(screen.queryByText(/Opening Entry/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Close POS/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/balance_details/i)).not.toBeInTheDocument()
  })

  it('renders children after successful close + checklist', async () => {
    const user = userEvent.setup()
    render(
      <ServeRouteGuard>
        <div>Protected content</div>
      </ServeRouteGuard>
    )

    await user.click(
      await screen.findByRole('button', { name: /Complete checklist/i })
    )

    expect(await screen.findByText('Protected content')).toBeInTheDocument()
    expect(screen.getByText('Service requests')).toBeInTheDocument()
    await waitFor(() => expect(validatePOSCloseMock).toHaveBeenCalledWith('POS-MAIN'))
  })
})
