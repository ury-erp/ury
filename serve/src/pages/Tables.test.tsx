import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DINE_IN, TAKEAWAY } from '../data/order-types'
import { TAKEAWAY_DRAFT_KEY, useServeStore } from '../store/serve-store'

const navigate = vi.fn()
const refetch = vi.fn()
const {
  getRooms,
  getTables,
  getActiveTableOrders,
  getUserFullNames,
  mergeTablesBatch,
  unmergeTables,
  getVacantTablesForBranch,
  tableTransfer,
  captainTransfer,
  getBranchCaptains,
  showToastError,
  showToastSuccess,
} = vi.hoisted(() => ({
  getRooms: vi.fn(),
  getTables: vi.fn(),
  getActiveTableOrders: vi.fn(),
  getUserFullNames: vi.fn(),
  mergeTablesBatch: vi.fn(),
  unmergeTables: vi.fn(),
  getVacantTablesForBranch: vi.fn(),
  tableTransfer: vi.fn(),
  captainTransfer: vi.fn(),
  getBranchCaptains: vi.fn(),
  showToastError: vi.fn(),
  showToastSuccess: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}))

vi.mock('@ury/ui', async () => {
  const actual = await vi.importActual<typeof import('@ury/ui')>('@ury/ui')
  return {
    ...actual,
    showToast: {
      success: showToastSuccess,
      error: showToastError,
    },
    Spinner: ({ message }: { message?: string }) => <div>{message ?? 'Loading'}</div>,
    MultiSelectTableDialog: ({
      open,
      onConfirm,
      sourceName,
    }: {
      open: boolean
      onConfirm: (names: string[]) => Promise<void>
      sourceName: string
    }) =>
      open ? (
        <div role="dialog" aria-label="merge-tables">
          <button type="button" onClick={() => void onConfirm(['T2'])}>
            Confirm merge {sourceName}
          </button>
        </div>
      ) : null,
  }
})

vi.mock('@ury/core', async () => {
  const actual = await vi.importActual<typeof import('@ury/core')>('@ury/core')
  return {
    ...actual,
    formatCurrency: (n: number) => `₹${n}`,
  }
})

vi.mock('../hooks/useCaptainContext', () => ({
  useCaptainContext: vi.fn(),
}))

vi.mock('../lib/table-api', async () => {
  const actual = await vi.importActual<typeof import('../lib/table-api')>('../lib/table-api')
  return {
    ...actual,
    getRooms: (...args: unknown[]) => getRooms(...args),
    getTables: (...args: unknown[]) => getTables(...args),
    mergeTablesBatch: (...args: unknown[]) => mergeTablesBatch(...args),
    unmergeTables: (...args: unknown[]) => unmergeTables(...args),
    getVacantTablesForBranch: (...args: unknown[]) => getVacantTablesForBranch(...args),
  }
})

vi.mock('../lib/order-api', () => ({
  tableTransfer: (...args: unknown[]) => tableTransfer(...args),
  captainTransfer: (...args: unknown[]) => captainTransfer(...args),
}))

vi.mock('../lib/captain-table-api', () => ({
  getActiveTableOrders: (...args: unknown[]) => getActiveTableOrders(...args),
  getUserFullNames: (...args: unknown[]) => getUserFullNames(...args),
  getBranchCaptains: (...args: unknown[]) => getBranchCaptains(...args),
}))

vi.mock('../operations', () => ({
  OperationalTools: () => null,
}))

import TablesPage from './Tables'
import { useCaptainContext } from '../hooks/useCaptainContext'

const mockedUseCaptainContext = vi.mocked(useCaptainContext)

type StubOpts = {
  rooms?: Array<{ name: string | null; branch: string }>
  multipleCashier?: boolean
  canAccessOther?: boolean
  canSettlePayment?: boolean
  canTransferCaptain?: boolean
  contextError?: string | null
}

function stubContext(opts: StubOpts = {}) {
  const rooms = opts.rooms ?? [{ name: 'Hall A', branch: 'Main' }]
  const multipleCashier = opts.multipleCashier ?? true

  mockedUseCaptainContext.mockReturnValue({
    context: {
      user: 'captain1',
      roles: ['URY Captain'],
      branch: 'Main',
      rooms,
      pos_profile: {
        name: 'POS-Main',
        transfer_role_permissions: false,
        role_allowed_for_billing: false,
        role_restricted_for_table_order: false,
        remove_items: false,
        show_image: false,
        custom_enable_kot_reprint: false,
        custom_enable_multiple_cashier: multipleCashier,
      },
      role_restricted_for_table_order: false,
      opening_state: { pos_open: true },
    },
    user: { name: 'captain1', roles: ['URY Captain'] },
    roles: ['URY Captain'],
    branch: 'Main',
    rooms: rooms as never,
    posProfile: null,
    capabilities: {
      canTakeTableOrders: true,
      canAccessOtherCaptainsTables: opts.canAccessOther ?? false,
      canSettlePayment: opts.canSettlePayment ?? false,
      canApplyDiscount: false,
      canCancelOrder: false,
      canTransferCaptain: opts.canTransferCaptain ?? false,
      canTransferTable: false,
      canPrintBill: true,
      canReprintKot: false,
    },
    openingState: { pos_open: true },
    isLoading: false,
    error: opts.contextError ?? null,
    refetch,
  } as never)
}

async function seedTableDraft() {
  useServeStore.setState({
    selectedTable: 'T1',
    selectedRoom: 'Hall A',
    selectedOrderType: DINE_IN,
    draftTable: 'T1',
    needsReconcile: false,
  })
  await useServeStore.getState().addToOrder({
    id: 'ITEM-1',
    item: 'ITEM-1',
    item_name: 'Soup',
    name: 'Soup',
    price: 5,
    quantity: 1,
    image: null,
    course: '',
  })
}

async function seedTakeawayDraft() {
  useServeStore.getState().startTakeaway()
  await useServeStore.getState().addToOrder({
    id: 'ITEM-TW',
    item: 'ITEM-TW',
    item_name: 'Wrap',
    name: 'Wrap',
    price: 9,
    quantity: 1,
    image: null,
    course: '',
  })
}

describe('TablesPage room selection + ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useServeStore.getState().discardDraft()
    useServeStore.setState({
      selectedTable: null,
      selectedRoom: null,
      draftTable: null,
      activeOrders: [],
      needsReconcile: false,
      selectedOrderType: TAKEAWAY,
      posProfile: null,
    })
    getRooms.mockResolvedValue([
      { name: 'Hall A', branch: 'Main' },
      { name: 'Hall B', branch: 'Main' },
    ])
    getTables.mockResolvedValue([
      {
        name: 'T1',
        occupied: 0,
        latest_invoice_time: null,
        is_take_away: 0,
        restaurant_room: 'Hall A',
        table_shape: 'Square',
      },
      {
        name: 'T2',
        occupied: 0,
        latest_invoice_time: null,
        is_take_away: 0,
        restaurant_room: 'Hall A',
        table_shape: 'Square',
      },
    ])
    getActiveTableOrders.mockResolvedValue(new Map())
    getUserFullNames.mockResolvedValue(new Map())
  })

  it('multi-cashier shows only assigned rooms (not all branch rooms)', async () => {
    stubContext({
      rooms: [{ name: 'Hall A', branch: 'Main' }],
      multipleCashier: true,
    })

    render(<TablesPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hall A' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Hall B' })).not.toBeInTheDocument()
  })

  it('multi-cashier null assignment shows all branch rooms', async () => {
    stubContext({
      rooms: [{ name: null, branch: 'Main' }],
      multipleCashier: true,
    })

    render(<TablesPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hall A' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Hall B' })).toBeInTheDocument()
    })
  })

  it('single-cashier shows all branch rooms regardless of assignment', async () => {
    stubContext({
      rooms: [{ name: 'Hall A', branch: 'Main' }],
      multipleCashier: false,
    })

    render(<TablesPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hall A' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Hall B' })).toBeInTheDocument()
    })
  })

  it('retry on rooms failure reloads getRooms (not only context refetch)', async () => {
    const user = userEvent.setup()
    getRooms.mockRejectedValueOnce(new Error('rooms down')).mockResolvedValueOnce([
      { name: 'Hall A', branch: 'Main' },
    ])
    stubContext()

    render(<TablesPage />)

    await waitFor(() => {
      expect(screen.getByText('rooms down')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => {
      expect(getRooms).toHaveBeenCalledTimes(2)
    })
    expect(refetch).not.toHaveBeenCalled()
  })

  it('ignores stale table responses after room change', async () => {
    const user = userEvent.setup()
    let resolveHallA: (value: unknown) => void = () => undefined
    const hallAPromise = new Promise((resolve) => {
      resolveHallA = resolve
    })

    stubContext({
      rooms: [
        { name: 'Hall A', branch: 'Main' },
        { name: 'Hall B', branch: 'Main' },
      ],
      multipleCashier: true,
    })
    getRooms.mockResolvedValue([
      { name: 'Hall A', branch: 'Main' },
      { name: 'Hall B', branch: 'Main' },
    ])

    getTables.mockImplementation((room: string) => {
      if (room === 'Hall A') {
        return hallAPromise.then(() => [
          {
            name: 'STALE-A',
            occupied: 0,
            latest_invoice_time: null,
            is_take_away: 0,
            restaurant_room: 'Hall A',
            table_shape: 'Square',
          },
        ])
      }
      return Promise.resolve([
        {
          name: 'FRESH-B',
          occupied: 0,
          latest_invoice_time: null,
          is_take_away: 0,
          restaurant_room: 'Hall B',
          table_shape: 'Square',
        },
      ])
    })

    render(<TablesPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hall B' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Hall B' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /FRESH-B/i })).toBeInTheDocument()
    })

    resolveHallA([])

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /FRESH-B/i })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /STALE-A/i })).not.toBeInTheDocument()
  })

  it('blocks other-captain tables unless backend capability allows access', async () => {
    const user = userEvent.setup()
    stubContext({ canAccessOther: false })
    getTables.mockResolvedValue([
      {
        name: 'T9',
        occupied: 1,
        latest_invoice_time: '2026-09-08 10:00:00',
        is_take_away: 0,
        restaurant_room: 'Hall A',
        table_shape: 'Square',
      },
    ])
    getActiveTableOrders.mockResolvedValue(
      new Map([
        [
          'T9',
          {
            invoiceName: 'INV-1',
            waiter: 'other-captain',
            grandTotal: 100,
            invoicePrinted: false,
          },
        ],
      ])
    )
    getUserFullNames.mockResolvedValue(new Map([['other-captain', 'Other Captain']]))

    render(<TablesPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /T9/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /T9/i }))

    expect(navigate).not.toHaveBeenCalled()
    expect(showToastError).toHaveBeenCalled()
  })

  it('shows takeaway only when canSettlePayment is true', async () => {
    stubContext({ canSettlePayment: true })
    render(<TablesPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Takeaway order' })).toBeInTheDocument()
    })
  })

  it('hides takeaway when billing capability is absent', async () => {
    stubContext({ canSettlePayment: false })
    render(<TablesPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hall A' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Takeaway order' })).not.toBeInTheDocument()
  })
})

describe('TablesPage draft confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useServeStore.getState().discardDraft()
    useServeStore.setState({
      selectedTable: null,
      selectedRoom: null,
      draftTable: null,
      activeOrders: [],
      needsReconcile: false,
      selectedOrderType: TAKEAWAY,
      posProfile: null,
    })
    getRooms.mockResolvedValue([{ name: 'Hall A', branch: 'Main' }])
    getTables.mockResolvedValue([
      {
        name: 'T1',
        occupied: 0,
        latest_invoice_time: null,
        is_take_away: 0,
        restaurant_room: 'Hall A',
        table_shape: 'Square',
      },
      {
        name: 'T2',
        occupied: 0,
        latest_invoice_time: null,
        is_take_away: 0,
        restaurant_room: 'Hall A',
        table_shape: 'Square',
      },
    ])
    getActiveTableOrders.mockResolvedValue(new Map())
    getUserFullNames.mockResolvedValue(new Map())
    stubContext({ canSettlePayment: true })
  })

  it('asks to discard table draft before opening takeaway, then starts clean takeaway', async () => {
    const user = userEvent.setup()
    await seedTableDraft()
    render(<TablesPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Takeaway order' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Takeaway order' }))
    expect(navigate).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/unsent changes on T1/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Discard & open' }))

    expect(navigate).toHaveBeenCalledWith('/takeaway')
    const state = useServeStore.getState()
    expect(state.activeOrders).toHaveLength(0)
    expect(state.selectedOrderType).toBe(TAKEAWAY)
    expect(state.selectedTable).toBeNull()
    expect(state.selectedRoom).toBeNull()
  })

  it('asks to discard takeaway draft before opening another table', async () => {
    const user = userEvent.setup()
    await seedTakeawayDraft()
    // Stale room that must not leak into a confirmed switch without discard.
    useServeStore.setState({ selectedRoom: 'Hall Stale', selectedTable: 'T-STALE' })
    render(<TablesPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /T2/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /T2/i }))
    expect(navigate).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/unsent changes on Takeaway/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Discard & open' }))

    expect(navigate).toHaveBeenCalledWith('/table/T2')
    expect(useServeStore.getState().activeOrders).toHaveLength(0)
    expect(useServeStore.getState().hasUnsentDraft()).toBe(false)
  })

  it('returns to the same takeaway draft without discard confirm', async () => {
    const user = userEvent.setup()
    await seedTakeawayDraft()
    useServeStore.setState({ selectedRoom: 'Hall Stale', selectedTable: 'T-STALE' })
    render(<TablesPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Takeaway order' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Takeaway order' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(navigate).toHaveBeenCalledWith('/takeaway')
    const state = useServeStore.getState()
    expect(state.activeOrders).toHaveLength(1)
    expect(state.draftTable).toBe(TAKEAWAY_DRAFT_KEY)
    expect(state.selectedTable).toBeNull()
    expect(state.selectedRoom).toBeNull()
  })

  it('blocks alternate table open when takeaway draft is uncertain (no discard)', async () => {
    const user = userEvent.setup()
    await seedTakeawayDraft()
    useServeStore.setState({ needsReconcile: true })
    render(<TablesPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /T2/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /T2/i }))

    expect(navigate).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(showToastError).toHaveBeenCalled()
    expect(useServeStore.getState().needsReconcile).toBe(true)
    expect(useServeStore.getState().activeOrders).toHaveLength(1)
    expect(useServeStore.getState().draftTable).toBe(TAKEAWAY_DRAFT_KEY)
  })
})

describe('TablesPage actions menu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useServeStore.getState().discardDraft()
    useServeStore.setState({
      selectedTable: null,
      selectedRoom: null,
      draftTable: null,
      activeOrders: [],
      needsReconcile: false,
      selectedOrderType: TAKEAWAY,
      posProfile: null,
    })
    getRooms.mockResolvedValue([{ name: 'Hall A', branch: 'Main' }])
    getVacantTablesForBranch.mockResolvedValue([
      {
        name: 'T2',
        occupied: 0,
        latest_invoice_time: null,
        is_take_away: 0,
        restaurant_room: 'Hall A',
        table_shape: 'Square',
      },
    ])
    getBranchCaptains.mockResolvedValue([{ name: 'captain2', label: 'Captain Two' }])
    mergeTablesBatch.mockResolvedValue(undefined)
    unmergeTables.mockResolvedValue(undefined)
    tableTransfer.mockResolvedValue(undefined)
    captainTransfer.mockResolvedValue(undefined)
  })

  it('exposes transfer table and transfer captain for an occupied table', async () => {
    const user = userEvent.setup()
    stubContext({ canTransferCaptain: true, canAccessOther: true })
    getTables.mockResolvedValue([
      {
        name: 'T9',
        occupied: 1,
        latest_invoice_time: '2026-09-08 10:00:00',
        is_take_away: 0,
        restaurant_room: 'Hall A',
        table_shape: 'Square',
      },
    ])
    getActiveTableOrders.mockResolvedValue(
      new Map([
        [
          'T9',
          {
            invoiceName: 'INV-9',
            waiter: 'captain1',
            grandTotal: 40,
            invoicePrinted: false,
          },
        ],
      ])
    )
    getUserFullNames.mockResolvedValue(new Map([['captain1', 'Captain One']]))

    render(<TablesPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /T9/i })).toBeInTheDocument()
    })

    const actions = screen.getAllByRole('button', { name: 'Table actions' })
    await user.click(actions[0])

    expect(screen.getByRole('button', { name: 'Transfer table' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Transfer captain' })).toBeInTheDocument()
  })

  it('hides captain transfer without the capability', async () => {
    const user = userEvent.setup()
    stubContext({ canTransferCaptain: false, canAccessOther: true })
    getTables.mockResolvedValue([
      {
        name: 'T9',
        occupied: 1,
        latest_invoice_time: '2026-09-08 10:00:00',
        is_take_away: 0,
        restaurant_room: 'Hall A',
        table_shape: 'Square',
      },
    ])
    getActiveTableOrders.mockResolvedValue(
      new Map([
        [
          'T9',
          {
            invoiceName: 'INV-9',
            waiter: 'captain1',
            grandTotal: 40,
            invoicePrinted: false,
          },
        ],
      ])
    )
    getUserFullNames.mockResolvedValue(new Map())

    render(<TablesPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /T9/i })).toBeInTheDocument()
    })

    await user.click(screen.getAllByRole('button', { name: 'Table actions' })[0])

    expect(screen.getByRole('button', { name: 'Transfer table' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Transfer captain' })).not.toBeInTheDocument()
  })

  it('runs merge from the table actions menu', async () => {
    const user = userEvent.setup()
    stubContext()
    getTables.mockResolvedValue([
      {
        name: 'T1',
        occupied: 0,
        latest_invoice_time: null,
        is_take_away: 0,
        restaurant_room: 'Hall A',
        table_shape: 'Square',
      },
      {
        name: 'T2',
        occupied: 0,
        latest_invoice_time: null,
        is_take_away: 0,
        restaurant_room: 'Hall A',
        table_shape: 'Square',
      },
    ])
    getActiveTableOrders.mockResolvedValue(new Map())
    getUserFullNames.mockResolvedValue(new Map())

    render(<TablesPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /T1/i })).toBeInTheDocument()
    })

    const actionButtons = screen.getAllByRole('button', { name: 'Table actions' })
    await user.click(actionButtons[0])
    await user.click(screen.getByRole('button', { name: 'Merge tables' }))

    const dialog = await screen.findByRole('dialog', { name: 'merge-tables' })
    await user.click(within(dialog).getByRole('button', { name: /Confirm merge T1/i }))

    await waitFor(() => {
      expect(mergeTablesBatch).toHaveBeenCalledWith('T1', ['T2'])
    })
    expect(showToastSuccess).toHaveBeenCalled()
  })

  it('runs unmerge from the table actions menu', async () => {
    const user = userEvent.setup()
    stubContext()
    getTables.mockResolvedValue([
      {
        name: 'T1',
        occupied: 0,
        latest_invoice_time: null,
        is_take_away: 0,
        restaurant_room: 'Hall A',
        table_shape: 'Square',
        merged_with: 'T2',
      },
      {
        name: 'T2',
        occupied: 0,
        latest_invoice_time: null,
        is_take_away: 0,
        restaurant_room: 'Hall A',
        table_shape: 'Square',
        merged_with: 'T1',
      },
    ])
    getActiveTableOrders.mockResolvedValue(new Map())
    getUserFullNames.mockResolvedValue(new Map())

    render(<TablesPage />)

    await waitFor(() => {
      expect(screen.getByTitle('T1')).toBeInTheDocument()
    })

    const t1Card = screen.getByTitle('T1').closest('[role="button"]')
    expect(t1Card).not.toBeNull()
    await user.click(within(t1Card as HTMLElement).getByRole('button', { name: 'Table actions' }))
    await user.click(screen.getByRole('button', { name: 'Unmerge tables' }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Unmerge' }))

    await waitFor(() => {
      expect(unmergeTables).toHaveBeenCalledWith('T1')
    })
    expect(showToastSuccess).toHaveBeenCalled()
  })

  it('keeps free and occupied cards on the same height class', async () => {
    stubContext({ canAccessOther: true })
    getTables.mockResolvedValue([
      {
        name: 'T1',
        occupied: 0,
        latest_invoice_time: null,
        is_take_away: 0,
        restaurant_room: 'Hall A',
        table_shape: 'Square',
        no_of_seats: 4,
      },
      {
        name: 'T9',
        occupied: 1,
        latest_invoice_time: '2026-09-08 10:00:00',
        is_take_away: 0,
        restaurant_room: 'Hall A',
        table_shape: 'Square',
        no_of_seats: 4,
      },
    ])
    getActiveTableOrders.mockResolvedValue(
      new Map([
        [
          'T9',
          {
            invoiceName: 'INV-9',
            waiter: 'captain1',
            grandTotal: 40,
            invoicePrinted: false,
          },
        ],
      ])
    )
    getUserFullNames.mockResolvedValue(new Map())

    render(<TablesPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /T1/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /T9/i })).toBeInTheDocument()
    })

    const freeCard = screen.getByRole('button', { name: /T1/i })
    const occupiedCard = screen.getByRole('button', { name: /T9/i })
    expect(freeCard.className).toMatch(/min-h-\[11\.5rem\]/)
    expect(occupiedCard.className).toMatch(/min-h-\[11\.5rem\]/)
  })
})
