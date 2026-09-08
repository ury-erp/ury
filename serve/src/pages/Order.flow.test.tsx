import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'

let tableParam = 'T-101'

const {
  navigate,
  syncOrder,
  printOrder,
  tableTransfer,
  captainTransfer,
  getCaptainContext,
  canCancelOrder,
  cancelOrder,
  showToastError,
  showToastSuccess,
  serveMenuCalls,
  store,
  contextState,
  captainState,
  splitDialogState,
} = vi.hoisted(() => {
  type ServeMenuProps = {
    canAddItems: boolean
    canReduce?: boolean
    canRemove?: boolean
  }

  const navigate = vi.fn()
  const syncOrder = vi.fn()
  const printOrder = vi.fn()
  const tableTransfer = vi.fn()
  const captainTransfer = vi.fn()
  const getCaptainContext = vi.fn()
  const canCancelOrder = vi.fn().mockResolvedValue(false)
  const cancelOrder = vi.fn()
  const showToastError = vi.fn()
  const showToastSuccess = vi.fn()
  const serveMenuCalls: ServeMenuProps[] = []
  const splitDialogState = { open: false, items: [] as unknown[] }

  const store = {
    activeOrders: [] as Array<{
      id: string
      item: string
      name: string
      price: number
      quantity: number
      uniqueId: string
      invoiceItemName?: string
    }>,
    menuItems: [] as Array<{
      id: string
      item: string
      name: string
      disabled?: 0 | 1 | boolean
      image?: string | null
    }>,
    addToOrder: vi.fn(),
    removeFromOrder: vi.fn(),
    updateQuantity: vi.fn(),
    updateItemComment: vi.fn(),
    isUpdatingOrder: false,
    orderId: null as string | null,
    posProfile: {
      name: 'POS-Main',
      branch: 'Main',
      cashier: 'cashier1',
      owner: 'owner1',
      print_format: 'Standard',
    },
    orderComment: '',
    setOrderComment: vi.fn((c: string) => {
      store.orderComment = c
    }),
    noOfPax: 2,
    setNoOfPax: vi.fn((n: number) => {
      store.noOfPax = n
    }),
    lastModifiedTime: null as string | null,
    selectedRoom: 'Hall A',
    selectedCustomer: null as { id: string; name: string; phone: string } | null,
    setSelectedCustomer: vi.fn((c: typeof store.selectedCustomer) => {
      store.selectedCustomer = c
    }),
    clearTableOrder: vi.fn(),
    loadTableOrder: vi.fn(),
    isOrderInteractionDisabled: () => false,
    submitting: false,
    setSubmitting: vi.fn((v: boolean) => {
      store.submitting = v
    }),
    selectedOrderType: 'Dine In' as string,
    setSelectedOrderType: vi.fn((t: string) => {
      store.selectedOrderType = t
    }),
    startTakeaway: vi.fn(),
    hasUnsentDraft: vi.fn(() => false),
    needsReconcile: false,
    setNeedsReconcile: vi.fn((v: boolean) => {
      store.needsReconcile = v
    }),
  }

  const contextState = {
    context: {
      table: { name: 'T-101', restaurant_room: 'Hall A' },
      order: null as null | {
        name: string
        items?: Array<{
          name: string
          item_name: string
          qty: number
          item_code?: string
          rate?: number
        }>
        waiter?: string
        custom_merged_tables?: string
        status?: string
        invoice_printed?: number
      },
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
    },
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
    isContextLoading: false,
    isContextRefreshing: false,
    contextError: null as string | null,
    isOrderReady: true,
    alreadyOrderedLines: [] as unknown[],
    newOrChangedLines: [] as unknown[],
    reductionPendingLines: [] as unknown[],
    refetchContext: vi.fn().mockResolvedValue(undefined),
    refreshContext: vi.fn().mockResolvedValue(null),
  }

  const captainState = {
    capabilities: { canSettlePayment: true },
    context: {
      pos_profile: { remove_items: false },
    },
  }

  return {
    navigate,
    syncOrder,
    printOrder,
    tableTransfer,
    captainTransfer,
    getCaptainContext,
    canCancelOrder,
    cancelOrder,
    showToastError,
    showToastSuccess,
    serveMenuCalls,
    store,
    contextState,
    captainState,
    splitDialogState,
  }
})

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useParams: () => ({ table: tableParam }),
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
    TablePickerDialog: (props: {
      open: boolean
      onConfirm?: (table: string) => void | Promise<void>
    }) =>
      props.open ? (
        <button type="button" onClick={() => void props.onConfirm?.('T-202')}>
          Confirm table transfer
        </button>
      ) : null,
    UserPickerDialog: (props: {
      open: boolean
      onConfirm?: (user: string) => void | Promise<void>
    }) =>
      props.open ? (
        <button type="button" onClick={() => void props.onConfirm?.('captain2')}>
          Confirm captain transfer
        </button>
      ) : null,
    ConfirmDialog: (props: {
      open: boolean
      title?: string
      onConfirm?: () => void | Promise<void>
    }) =>
      props.open ? (
        <div data-testid="confirm-dialog">
          <p>{props.title}</p>
          <button type="button" onClick={() => void props.onConfirm?.()}>
            Confirm cancel
          </button>
        </div>
      ) : null,
    CommentDialog: (props: {
      open: boolean
      title?: string
      initialComment?: string
      onSave?: (comment: string) => void
      onOpenChange?: (open: boolean) => void
    }) =>
      props.open ? (
        <div data-testid="comment-dialog" data-initial={props.initialComment ?? ''}>
          <p>{props.title}</p>
          <button
            type="button"
            onClick={() => {
              props.onSave?.('Kitchen note')
              props.onOpenChange?.(false)
            }}
          >
            Save comment
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
  useCaptainContext: () => captainState,
}))

vi.mock('../hooks/useTableOrderContext', () => ({
  useTableOrderContext: () => contextState,
}))

vi.mock('../store/root-store', () => ({
  useRootStore: (selector: (s: { user: { name: string } }) => unknown) =>
    selector({ user: { name: 'captain1' } }),
}))

vi.mock('../store/serve-store', () => ({
  useServeStore: (selector?: (s: typeof store) => unknown) =>
    typeof selector === 'function' ? selector(store) : store,
}))

vi.mock('../components/ServeMenu', () => ({
  default: (props: ComponentProps<'div'> & {
    canAddItems: boolean
    canReduce?: boolean
    canRemove?: boolean
  }) => {
    serveMenuCalls.push({
      canAddItems: props.canAddItems,
      canReduce: props.canReduce,
      canRemove: props.canRemove,
    })
    return (
      <div
        data-testid="serve-menu"
        data-can-reduce={String(Boolean(props.canReduce))}
        data-can-remove={String(Boolean(props.canRemove))}
      />
    )
  },
}))

vi.mock('../components/CaptainActionsMenu', () => ({
  default: (props: {
    showPrintBill?: boolean
    onPrintBill?: () => void | Promise<void>
    isPrintingBill?: boolean
    showTransferTable?: boolean
    onTransferTable?: () => void | Promise<void>
    showTransferCaptain?: boolean
    onTransferCaptain?: () => void
    showCancel?: boolean
    onCancel?: () => void
    cancelDisabled?: boolean
    showSplit?: boolean
    onSplit?: () => void
    splitDisabled?: boolean
  }) => (
    <>
      {props.showPrintBill ? (
        <button type="button" onClick={() => void props.onPrintBill?.()}>
          Print Bill
        </button>
      ) : null}
      {props.showTransferTable ? (
        <button type="button" onClick={() => void props.onTransferTable?.()}>
          Transfer Table
        </button>
      ) : null}
      {props.showTransferCaptain ? (
        <button type="button" onClick={() => props.onTransferCaptain?.()}>
          Transfer Captain
        </button>
      ) : null}
      {props.showSplit ? (
        <button
          type="button"
          onClick={() => props.onSplit?.()}
          disabled={props.splitDisabled}
        >
          Split
        </button>
      ) : null}
      {props.showCancel ? (
        <button
          type="button"
          onClick={() => props.onCancel?.()}
          disabled={props.cancelDisabled}
        >
          Cancel
        </button>
      ) : null}
    </>
  ),
}))

// Real CaptainOrderLine — covers confirmed increment / blocked remove.
vi.mock('../components/SplitOrderDialog', () => ({
  SplitOrderDialog: (props: { open: boolean; items: unknown[] }) => {
    splitDialogState.open = props.open
    splitDialogState.items = props.items
    return props.open ? <div data-testid="split-dialog">Split dialog</div> : null
  },
}))

vi.mock('../lib/order-api', () => ({
  syncOrder: (...args: unknown[]) => syncOrder(...args),
  captainTransfer: (...args: unknown[]) => captainTransfer(...args),
  reprintKot: vi.fn(),
  tableTransfer: (...args: unknown[]) => tableTransfer(...args),
}))

vi.mock('../lib/captain-context-api', () => ({
  getCaptainContext: (...args: unknown[]) => getCaptainContext(...args),
}))

vi.mock('../lib/cancel-api', () => ({
  canCancelOrder: (...args: unknown[]) => canCancelOrder(...args),
  cancelOrder: (...args: unknown[]) => cancelOrder(...args),
}))

vi.mock('../lib/serve-extras-api', () => ({
  getCustomerFavouriteItems: vi.fn().mockResolvedValue([]),
}))

vi.mock('../lib/customer-api', () => ({
  addCustomer: vi.fn(),
  searchCustomers: vi.fn().mockResolvedValue([]),
}))

vi.mock('../lib/print', () => ({
  printOrder: (...args: unknown[]) => printOrder(...args),
}))

vi.mock('../lib/invoice-api', () => ({
  resolvePrintFormat: vi.fn(() => 'Standard'),
}))

vi.mock('../lib/table-api', () => ({
  getVacantTablesForBranch: vi.fn().mockResolvedValue([
    { name: 'T-202', restaurant_room: 'Hall A' },
  ]),
}))

vi.mock('../lib/captain-table-api', () => ({
  getBranchCaptains: vi.fn().mockResolvedValue([{ name: 'captain2', label: 'Captain Two' }]),
}))

import OrderPage from './Order'

const cartItem = {
  id: 'ITEM-1',
  item: 'ITEM-1',
  name: 'Soup',
  price: 120,
  quantity: 1,
  uniqueId: 'draft|1',
}

const menuSoup = {
  id: 'ITEM-1',
  item: 'ITEM-1',
  name: 'Soup',
  disabled: 0 as const,
  image: '/files/soup.jpg',
}

const confirmedSoupLine = {
  uniqueId: 'confirmed|1',
  id: 'ITEM-1',
  name: 'Soup',
  price: 120,
  baseQty: 2,
  curQty: 2,
  delta: 0,
  confirmedQty: 2,
}

function resetFixtures(opts: {
  table?: string
  existingOrder?: boolean
  customer?: { id: string; name: string; phone: string } | null
  noOfPax?: number
  reduceItems?: boolean
  removeItems?: boolean
  withCart?: boolean
  printBill?: boolean
  transferTable?: boolean
  transferCaptain?: boolean
  cancelAllowed?: boolean
  confirmedLines?: boolean
  orderItems?: Array<{
    name: string
    item_name: string
    qty: number
    item_code?: string
    rate?: number
  }>
  orderStatus?: string
  invoicePrinted?: number
} = {}) {
  tableParam = opts.table ?? 'T-101'
  serveMenuCalls.length = 0
  navigate.mockReset()
  syncOrder.mockReset()
  printOrder.mockReset()
  tableTransfer.mockReset()
  captainTransfer.mockReset()
  getCaptainContext.mockReset()
  getCaptainContext.mockResolvedValue({ opening_state: { pos_open: true } })
  canCancelOrder.mockReset()
  canCancelOrder.mockResolvedValue(Boolean(opts.cancelAllowed))
  cancelOrder.mockReset()
  showToastError.mockReset()
  showToastSuccess.mockReset()
  splitDialogState.open = false
  splitDialogState.items = []

  store.activeOrders = opts.withCart === false ? [] : [cartItem]
  store.menuItems = [menuSoup]
  store.isUpdatingOrder = Boolean(opts.existingOrder)
  store.orderId = opts.existingOrder ? 'INV-1' : null
  store.noOfPax = opts.noOfPax ?? 2
  store.selectedCustomer = opts.customer === undefined ? null : opts.customer
  store.submitting = false
  store.needsReconcile = false
  store.selectedOrderType = 'Dine In'
  store.orderComment = ''
  store.hasUnsentDraft = vi.fn(() => false)
  store.startTakeaway = vi.fn()
  store.updateQuantity = vi.fn()
  store.removeFromOrder = vi.fn()
  store.setOrderComment = vi.fn((c: string) => {
    store.orderComment = c
  })

  const reduce = opts.reduceItems ?? true
  const remove = opts.removeItems ?? false
  const printBill = opts.printBill ?? false
  const transferTable = opts.transferTable ?? false
  const transferCaptain = opts.transferCaptain ?? false
  contextState.isContextLoading = false
  contextState.isContextRefreshing = false
  contextState.contextError = null
  contextState.isOrderReady = true
  contextState.alreadyOrderedLines = opts.confirmedLines ? [confirmedSoupLine] : []
  contextState.newOrChangedLines = []
  contextState.reductionPendingLines = []
  contextState.refetchContext = vi.fn().mockResolvedValue(undefined)
  contextState.refreshContext = vi.fn().mockImplementation(async () => contextState.context)
  contextState.context = {
    table: { name: tableParam, restaurant_room: 'Hall A' },
    order: opts.existingOrder
      ? {
          name: 'INV-1',
          items: opts.orderItems ?? [
            { name: 'row-1', item_name: 'Soup', qty: 2, item_code: 'ITEM-1', rate: 120 },
          ],
          waiter: 'captain1',
          custom_merged_tables: '',
          status: opts.orderStatus ?? 'Draft',
          invoice_printed: opts.invoicePrinted ?? 0,
        }
      : null,
    assignment: { waiter: 'captain1', is_mine: true },
    permissions: {
      view: true,
      modify: true,
      reduce_items: reduce,
      remove_items: remove,
      transfer_table: transferTable,
      transfer_captain: transferCaptain,
      print_bill: printBill,
      reprint_kot: false,
      settle: false,
      cancel: false,
    },
  }
  contextState.permissions = contextState.context.permissions
}

describe('Order page flow', () => {
  beforeEach(() => {
    resetFixtures()
  })

  it('opens a new table on the menu (Review Order CTA)', () => {
    resetFixtures({ existingOrder: false, withCart: true })
    render(<OrderPage />)

    expect(screen.getByRole('heading', { name: `Table ${tableParam}` })).toBeInTheDocument()
    expect(screen.getByText('New order')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review Order' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send Order' })).not.toBeInTheDocument()
  })

  it('opens an existing table on review (Update Order CTA)', () => {
    resetFixtures({ existingOrder: true, withCart: true })
    render(<OrderPage />)

    expect(screen.getByText('Updating order')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update Order' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Review Order' })).not.toBeInTheDocument()
    expect(screen.getAllByPlaceholderText('Search customer').length).toBeGreaterThan(0)
  })

  it('Review Order switches from menu into customer review', async () => {
    const user = userEvent.setup()
    resetFixtures({ existingOrder: false, withCart: true })
    render(<OrderPage />)

    expect(screen.getByRole('button', { name: 'Review Order' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Review Order' }))

    expect(screen.getByRole('button', { name: 'Send Order' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Review Order' })).not.toBeInTheDocument()
    expect(screen.getAllByPlaceholderText('Search customer').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Pax').length).toBeGreaterThan(0)
  })

  it('blocks sync when no customer is selected', async () => {
    const user = userEvent.setup()
    resetFixtures({
      existingOrder: false,
      withCart: true,
      customer: null,
      noOfPax: 2,
    })
    render(<OrderPage />)

    await user.click(screen.getByRole('button', { name: 'Review Order' }))
    await user.click(screen.getByRole('button', { name: 'Send Order' }))

    expect(showToastError).toHaveBeenCalledWith('Select a customer first.')
    expect(syncOrder).not.toHaveBeenCalled()
  })

  it('blocks sync when pax is not a positive integer', async () => {
    const user = userEvent.setup()
    resetFixtures({
      existingOrder: false,
      withCart: true,
      customer: { id: 'CUST-1', name: 'Ada', phone: '999' },
      noOfPax: 1.5,
    })
    render(<OrderPage />)

    await user.click(screen.getByRole('button', { name: 'Review Order' }))
    await user.click(screen.getByRole('button', { name: 'Send Order' }))

    expect(showToastError).toHaveBeenCalledWith('Enter number of guests.')
    expect(syncOrder).not.toHaveBeenCalled()
  })

  it('blocks sync when pax is below one', async () => {
    const user = userEvent.setup()
    resetFixtures({
      existingOrder: false,
      withCart: true,
      customer: { id: 'CUST-1', name: 'Ada', phone: '999' },
      noOfPax: 0,
    })
    render(<OrderPage />)

    await user.click(screen.getByRole('button', { name: 'Review Order' }))
    await user.click(screen.getByRole('button', { name: 'Send Order' }))

    expect(showToastError).toHaveBeenCalledWith('Enter number of guests.')
    expect(syncOrder).not.toHaveBeenCalled()
  })

  it('passes table quantity role flags into ServeMenu', () => {
    resetFixtures({
      existingOrder: false,
      withCart: true,
      reduceItems: true,
      removeItems: false,
    })
    render(<OrderPage />)

    expect(serveMenuCalls.length).toBeGreaterThan(0)
    expect(serveMenuCalls.every((c) => c.canReduce === true)).toBe(true)
    expect(serveMenuCalls.every((c) => c.canRemove === false)).toBe(true)

    const menus = screen.getAllByTestId('serve-menu')
    expect(menus.length).toBeGreaterThan(0)
    for (const menu of menus) {
      expect(menu).toHaveAttribute('data-can-reduce', 'true')
      expect(menu).toHaveAttribute('data-can-remove', 'false')
    }
  })

  it('passes remove permission when table context allows remove_items', () => {
    resetFixtures({
      existingOrder: true,
      withCart: true,
      reduceItems: true,
      removeItems: true,
    })
    render(<OrderPage />)

    expect(serveMenuCalls.some((c) => c.canReduce === true && c.canRemove === true)).toBe(true)
    for (const menu of screen.getAllByTestId('serve-menu')) {
      expect(menu).toHaveAttribute('data-can-reduce', 'true')
      expect(menu).toHaveAttribute('data-can-remove', 'true')
    }
  })

  it('blocks Split when there is an unsent draft (T2)', async () => {
    const user = userEvent.setup()
    resetFixtures({ existingOrder: true, withCart: true })
    store.hasUnsentDraft = vi.fn(() => true)
    render(<OrderPage />)

    const splitBtn = screen.getByRole('button', { name: 'Split' })
    expect(splitBtn).not.toBeDisabled()
    await user.click(splitBtn)

    expect(showToastError).toHaveBeenCalledWith('Update the order before splitting.')
    expect(splitDialogState.open).toBe(false)
    expect(screen.queryByTestId('split-dialog')).not.toBeInTheDocument()
    expect(contextState.refetchContext).not.toHaveBeenCalled()
  })

  it('disables Split for a single qty-1 server line (T3)', () => {
    resetFixtures({
      existingOrder: true,
      withCart: true,
      orderItems: [{ name: 'row-1', item_name: 'Soup', qty: 1, item_code: 'ITEM-1', rate: 120 }],
    })
    render(<OrderPage />)

    expect(screen.getByRole('button', { name: 'Split' })).toBeDisabled()
  })

  it('aborts submit when a new cart line is disabled on the menu (T4)', async () => {
    const user = userEvent.setup()
    resetFixtures({
      existingOrder: false,
      withCart: true,
      customer: { id: 'CUST-1', name: 'Ada', phone: '999' },
    })
    store.menuItems = [{ id: 'ITEM-1', item: 'ITEM-1', name: 'Soup', disabled: 1 }]
    render(<OrderPage />)

    await user.click(screen.getByRole('button', { name: 'Review Order' }))
    await user.click(screen.getByRole('button', { name: 'Send Order' }))

    expect(showToastError).toHaveBeenCalledWith('Soup is unavailable')
    expect(syncOrder).not.toHaveBeenCalled()
  })

  it('allows submit for a historic invoice line even if off-menu (T4)', async () => {
    const user = userEvent.setup()
    resetFixtures({
      existingOrder: true,
      withCart: true,
      customer: { id: 'CUST-1', name: 'Ada', phone: '999' },
    })
    store.activeOrders = [{ ...cartItem, invoiceItemName: 'row-1' }]
    store.menuItems = []
    syncOrder.mockResolvedValue({ message: { name: 'INV-1', status: 'Draft' } })
    render(<OrderPage />)

    await user.click(screen.getByRole('button', { name: 'Update Order' }))

    await waitFor(() => {
      expect(syncOrder).toHaveBeenCalled()
    })
    expect(showToastError).not.toHaveBeenCalledWith(expect.stringMatching(/unavailable|not on this menu/))
  })

  it('sends comments as empty string when the order note is cleared (T5)', async () => {
    const user = userEvent.setup()
    resetFixtures({
      existingOrder: true,
      withCart: true,
      customer: { id: 'CUST-1', name: 'Ada', phone: '999' },
    })
    store.orderComment = ''
    store.activeOrders = [{ ...cartItem, invoiceItemName: 'row-1' }]
    syncOrder.mockResolvedValue({ message: { name: 'INV-1', status: 'Draft' } })
    render(<OrderPage />)

    await user.click(screen.getByRole('button', { name: 'Update Order' }))

    await waitFor(() => {
      expect(syncOrder).toHaveBeenCalled()
    })
    expect(syncOrder).toHaveBeenCalledWith(expect.objectContaining({ comments: '' }))
  })

  it('refetches table context after a successful bill print (T6)', async () => {
    const user = userEvent.setup()
    resetFixtures({ existingOrder: true, withCart: true, printBill: true })
    printOrder.mockResolvedValue(undefined)
    render(<OrderPage />)

    await user.click(screen.getByRole('button', { name: 'Print Bill' }))

    await waitFor(() => {
      expect(printOrder).toHaveBeenCalled()
    })
    expect(showToastSuccess).toHaveBeenCalledWith('Printed')
    expect(contextState.refreshContext).toHaveBeenCalled()
    expect(contextState.refetchContext).not.toHaveBeenCalled()
    expect(contextState.isContextLoading).toBe(false)
  })

  it('opens Split with silent refresh and keeps the dialog mounted', async () => {
    const user = userEvent.setup()
    resetFixtures({ existingOrder: true, withCart: true })
    let resolveRefresh: (value: typeof contextState.context) => void = () => undefined
    contextState.refreshContext = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve
        })
    )
    render(<OrderPage />)

    await user.click(screen.getByRole('button', { name: 'Split' }))

    expect(splitDialogState.open).toBe(true)
    expect(screen.getByTestId('split-dialog')).toBeInTheDocument()
    expect(contextState.refreshContext).toHaveBeenCalled()
    expect(contextState.refetchContext).not.toHaveBeenCalled()
    expect(contextState.isContextLoading).toBe(false)
    expect(screen.queryByText('Loading table…')).not.toBeInTheDocument()

    resolveRefresh(contextState.context)
    await waitFor(() => expect(splitDialogState.open).toBe(true))
  })

  it('aborts submit when opening preflight reports pos_open false', async () => {
    const user = userEvent.setup()
    resetFixtures({
      existingOrder: false,
      withCart: true,
      customer: { id: 'CUST-1', name: 'Ada', phone: '999' },
    })
    getCaptainContext.mockResolvedValue({ opening_state: { pos_open: false } })
    render(<OrderPage />)

    await user.click(screen.getByRole('button', { name: 'Review Order' }))
    await user.click(screen.getByRole('button', { name: 'Send Order' }))

    await waitFor(() => {
      expect(getCaptainContext).toHaveBeenCalled()
    })
    expect(showToastError).toHaveBeenCalledWith(
      'POS is closed. Ask a cashier or manager to open it.'
    )
    expect(syncOrder).not.toHaveBeenCalled()
  })

  it('proceeds with submit when opening preflight rejects', async () => {
    const user = userEvent.setup()
    resetFixtures({
      existingOrder: false,
      withCart: true,
      customer: { id: 'CUST-1', name: 'Ada', phone: '999' },
    })
    getCaptainContext.mockRejectedValue(new Error('network'))
    syncOrder.mockResolvedValue({ message: { name: 'INV-1', status: 'Draft' } })
    render(<OrderPage />)

    await user.click(screen.getByRole('button', { name: 'Review Order' }))
    await user.click(screen.getByRole('button', { name: 'Send Order' }))

    await waitFor(() => {
      expect(syncOrder).toHaveBeenCalled()
    })
  })

  it('aborts submit when refreshed permissions.modify is false', async () => {
    const user = userEvent.setup()
    resetFixtures({
      existingOrder: false,
      withCart: true,
      customer: { id: 'CUST-1', name: 'Ada', phone: '999' },
    })
    contextState.refreshContext = vi.fn().mockResolvedValue({
      ...contextState.context,
      permissions: { ...contextState.context.permissions, modify: false },
    })
    render(<OrderPage />)

    await user.click(screen.getByRole('button', { name: 'Review Order' }))
    await user.click(screen.getByRole('button', { name: 'Send Order' }))

    await waitFor(() => {
      expect(contextState.refreshContext).toHaveBeenCalled()
    })
    expect(showToastError).toHaveBeenCalledWith('This order is no longer yours to edit.')
    expect(syncOrder).not.toHaveBeenCalled()
  })

  it('aborts table transfer when refreshed transfer_table is false', async () => {
    const user = userEvent.setup()
    resetFixtures({
      existingOrder: true,
      withCart: true,
      transferTable: true,
    })
    contextState.refreshContext = vi.fn().mockResolvedValue({
      ...contextState.context,
      permissions: { ...contextState.context.permissions, transfer_table: false },
    })
    render(<OrderPage />)

    await user.click(screen.getByRole('button', { name: 'Transfer Table' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Confirm table transfer' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Confirm table transfer' }))

    await waitFor(() => {
      expect(contextState.refreshContext).toHaveBeenCalled()
    })
    expect(showToastError).toHaveBeenCalledWith('You can no longer transfer this table.')
    expect(tableTransfer).not.toHaveBeenCalled()
  })

  it('aborts captain transfer when refreshed transfer_captain is false', async () => {
    const user = userEvent.setup()
    resetFixtures({
      existingOrder: true,
      withCart: true,
      transferCaptain: true,
    })
    contextState.refreshContext = vi.fn().mockResolvedValue({
      ...contextState.context,
      permissions: { ...contextState.context.permissions, transfer_captain: false },
    })
    render(<OrderPage />)

    await user.click(screen.getByRole('button', { name: 'Transfer Captain' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Confirm captain transfer' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Confirm captain transfer' }))

    await waitFor(() => {
      expect(contextState.refreshContext).toHaveBeenCalled()
    })
    expect(showToastError).toHaveBeenCalledWith('You can no longer transfer this order.')
    expect(captainTransfer).not.toHaveBeenCalled()
  })

  it('increments a confirmed line via canModify only (qty+1)', async () => {
    const user = userEvent.setup()
    resetFixtures({
      existingOrder: true,
      withCart: true,
      confirmedLines: true,
      reduceItems: true,
      removeItems: false,
    })
    render(<OrderPage />)

    const increaseBtns = screen.getAllByRole('button', { name: 'Increase' })
    expect(increaseBtns.length).toBeGreaterThan(0)
    await user.click(increaseBtns[0])

    expect(store.updateQuantity).toHaveBeenCalledWith('confirmed|1', 3)
  })

  it('shows remove control disabled without remove_items on confirmed lines', () => {
    resetFixtures({
      existingOrder: true,
      withCart: true,
      confirmedLines: true,
      reduceItems: true,
      removeItems: false,
    })
    render(<OrderPage />)

    const removeBtns = screen.getAllByRole('button', { name: 'Remove item (not permitted)' })
    expect(removeBtns.length).toBeGreaterThan(0)
    for (const removeBtn of removeBtns) {
      expect(removeBtn).toBeDisabled()
      expect(removeBtn).toHaveAttribute(
        'title',
        'Removing a sent item is not permitted for this profile'
      )
    }
    expect(store.removeFromOrder).not.toHaveBeenCalled()
  })

  it('allows remove on confirmed lines when remove_items is granted', async () => {
    const user = userEvent.setup()
    resetFixtures({
      existingOrder: true,
      withCart: true,
      confirmedLines: true,
      reduceItems: true,
      removeItems: true,
    })
    render(<OrderPage />)

    const removeBtns = screen.getAllByRole('button', { name: 'Remove item' })
    expect(removeBtns[0]).not.toBeDisabled()
    await user.click(removeBtns[0])
    expect(store.removeFromOrder).toHaveBeenCalledWith('confirmed|1')
  })

  it('exposes Split from the actions menu and keeps unsent-draft guard', async () => {
    const user = userEvent.setup()
    resetFixtures({ existingOrder: true, withCart: true })
    store.hasUnsentDraft = vi.fn(() => true)
    render(<OrderPage />)

    const splitBtn = screen.getByRole('button', { name: 'Split' })
    expect(splitBtn).not.toBeDisabled()
    await user.click(splitBtn)

    expect(showToastError).toHaveBeenCalledWith('Update the order before splitting.')
    expect(splitDialogState.open).toBe(false)
  })

  it('exposes Cancel from the actions menu behind cancelAllowed', async () => {
    const user = userEvent.setup()
    resetFixtures({ existingOrder: true, withCart: true, cancelAllowed: true })
    render(<OrderPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
    expect(screen.getByText('Cancel order')).toBeInTheDocument()
  })

  it('hides Cancel from the actions menu when cancel is not allowed', async () => {
    resetFixtures({ existingOrder: true, withCart: true, cancelAllowed: false })
    render(<OrderPage />)

    await waitFor(() => {
      expect(canCancelOrder).toHaveBeenCalled()
    })
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('opens the order note dialog from the comment icon and shows has-note state', async () => {
    const user = userEvent.setup()
    resetFixtures({ existingOrder: true, withCart: true })
    store.orderComment = 'Hold the salt'
    render(<OrderPage />)

    expect(screen.getByTestId('order-note-indicator')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add order note' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit order note' }))
    expect(screen.getByTestId('comment-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('comment-dialog')).toHaveAttribute('data-initial', 'Hold the salt')
  })

  it('opens an empty order note dialog when no note exists', async () => {
    const user = userEvent.setup()
    resetFixtures({ existingOrder: false, withCart: true })
    render(<OrderPage />)

    expect(screen.queryByTestId('order-note-indicator')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add order note' }))
    expect(screen.getByTestId('comment-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('comment-dialog')).toHaveAttribute('data-initial', '')
  })
})
