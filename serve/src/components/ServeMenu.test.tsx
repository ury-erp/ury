import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { menuItem, storeState, storeMocks } = vi.hoisted(() => {
  const menuItem = {
    id: 'ITEM-BIR',
    item: 'ITEM-BIR',
    item_name: 'Chicken Biryani',
    name: 'Chicken Biryani',
    price: 250,
    image: null as string | null,
    course: 'Main',
    course_label: 'Main',
    special_dish: 0 as const,
  }
  const storeMocks = {
    addToOrder: vi.fn(),
    removeFromOrder: vi.fn(),
    updateQuantity: vi.fn(),
    fetchMenuItems: vi.fn(),
    setSelectedItem: vi.fn((item: typeof menuItem | null) => {
      storeState.selectedItem = item
    }),
    setSelectedCategory: vi.fn(),
    setSearchQuery: vi.fn(),
    setQuickFilter: vi.fn(),
  }
  const storeState = {
    activeOrders: [] as Array<
      typeof menuItem & { quantity: number; uniqueId: string; invoiceItemName?: string }
    >,
    selectedItem: null as typeof menuItem | null,
  }
  return { menuItem, storeState, storeMocks }
})

vi.mock('../store/serve-store', () => ({
  useServeStore: () => ({
    menuItems: [menuItem],
    menuLoading: false,
    selectedCategory: '',
    setSelectedCategory: storeMocks.setSelectedCategory,
    searchQuery: '',
    setSearchQuery: storeMocks.setSearchQuery,
    categories: [{ name: 'Main', label: 'Main' }],
    fetchMenuItems: storeMocks.fetchMenuItems,
    addToOrder: storeMocks.addToOrder,
    removeFromOrder: storeMocks.removeFromOrder,
    updateQuantity: storeMocks.updateQuantity,
    get activeOrders() {
      return storeState.activeOrders
    },
    setSelectedItem: storeMocks.setSelectedItem,
    get selectedItem() {
      return storeState.selectedItem
    },
    isOrderInteractionDisabled: () => false,
    quickFilter: 'all',
    setQuickFilter: storeMocks.setQuickFilter,
    posProfile: { show_image: 0, branch: 'BR', company: 'CO' },
  }),
}))

vi.mock('../lib/availability-api', () => ({
  getItemAvailability: vi.fn().mockResolvedValue({ sellable: true, available_qty: 99 }),
  getAvailabilityMessage: vi.fn(),
}))

vi.mock('@ury/core', async () => {
  const actual = await vi.importActual<typeof import('@ury/core')>('@ury/core')
  return {
    ...actual,
    formatCurrency: (n: number) => `Rs. ${n}`,
    db: { getDoc: vi.fn().mockResolvedValue({ item: 'ITEM-BIR' }) },
  }
})

import ServeMenu from './ServeMenu'

function getCard() {
  return screen.getByRole('button', { name: /Chicken Biryani/ })
}

/** jsdom lacks PointerEvent and createEvent drops clientX — synthesize both. */
function dispatchPointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  coords: { x: number; y: number }
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
    clientX: coords.x,
    clientY: coords.y,
  })
  Object.defineProperty(event, 'pointerType', { value: 'touch' })
  fireEvent(target, event)
}

describe('ServeMenu quantity ergonomics', () => {
  beforeEach(() => {
    storeState.activeOrders = []
    storeState.selectedItem = null
    storeMocks.addToOrder.mockReset()
    storeMocks.removeFromOrder.mockReset()
    storeMocks.updateQuantity.mockReset()
    storeMocks.fetchMenuItems.mockReset()
    storeMocks.setSelectedItem.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('single tap quick-adds exactly once and Options overlay is gone', async () => {
    const user = userEvent.setup()
    render(<ServeMenu canAddItems />)

    await user.click(getCard())
    expect(storeMocks.addToOrder).toHaveBeenCalledTimes(1)
    expect(storeMocks.addToOrder).toHaveBeenCalledWith(
      expect.objectContaining({ item: 'ITEM-BIR', quantity: 1 })
    )
    expect(
      screen.queryByRole('button', { name: 'Options for Chicken Biryani' })
    ).not.toBeInTheDocument()
    expect(getCard()).toHaveAttribute('aria-keyshortcuts', 'Shift+Enter')
  })

  it('double-click opens the configurator without a second quick-add', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<ServeMenu canAddItems />)

    await user.dblClick(getCard())
    expect(storeMocks.addToOrder).toHaveBeenCalledTimes(1)
    expect(storeMocks.setSelectedItem).toHaveBeenCalledWith(
      expect.objectContaining({ item: 'ITEM-BIR' })
    )

    rerender(<ServeMenu canAddItems />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add to order' })).toBeInTheDocument()
    })
  })

  it('long-press opens the configurator without quick-add', async () => {
    vi.useFakeTimers()
    const { rerender } = render(<ServeMenu canAddItems />)
    const card = getCard()

    dispatchPointer(card, 'pointerdown', { x: 10, y: 10 })
    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(storeMocks.addToOrder).not.toHaveBeenCalled()
    expect(storeMocks.setSelectedItem).toHaveBeenCalledWith(
      expect.objectContaining({ item: 'ITEM-BIR' })
    )

    dispatchPointer(card, 'pointerup', { x: 10, y: 10 })
    fireEvent.click(card)
    expect(storeMocks.addToOrder).not.toHaveBeenCalled()

    vi.useRealTimers()
    rerender(<ServeMenu canAddItems />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add to order' })).toBeInTheDocument()
    })
  })

  it('long-press cancelled by pointer move does not open configurator', async () => {
    vi.useFakeTimers()
    render(<ServeMenu canAddItems />)
    const card = getCard()

    dispatchPointer(card, 'pointerdown', { x: 10, y: 10 })
    dispatchPointer(card, 'pointermove', { x: 40, y: 10 })
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    dispatchPointer(card, 'pointerup', { x: 40, y: 10 })

    expect(storeMocks.setSelectedItem).not.toHaveBeenCalled()
    expect(storeMocks.addToOrder).not.toHaveBeenCalled()
  })

  it('Shift+Enter opens the configurator for keyboard users', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<ServeMenu canAddItems />)

    getCard().focus()
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(storeMocks.setSelectedItem).toHaveBeenCalledWith(
      expect.objectContaining({ item: 'ITEM-BIR' })
    )
    expect(storeMocks.addToOrder).not.toHaveBeenCalled()

    rerender(<ServeMenu canAddItems />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add to order' })).toBeInTheDocument()
    })
  })

  it('shows qty from activeOrders including loaded invoice rows', async () => {
    storeState.activeOrders = [
      {
        ...menuItem,
        quantity: 2,
        uniqueId: 'inv:row-1',
        invoiceItemName: 'row-1',
      },
      {
        ...menuItem,
        quantity: 1,
        uniqueId: 'draft|1',
      },
    ]
    render(<ServeMenu canAddItems canReduce canRemove />)

    await waitFor(() => {
      expect(screen.getByRole('group', { name: 'Chicken Biryani quantity 3' })).toBeInTheDocument()
    })
  })

  it('decrements draft lines without canReduce', async () => {
    const user = userEvent.setup()
    storeState.activeOrders = [
      {
        ...menuItem,
        quantity: 2,
        uniqueId: 'draft|1',
      },
    ]
    render(<ServeMenu canAddItems canReduce={false} canRemove={false} />)

    await user.click(screen.getByRole('button', { name: 'Decrease Chicken Biryani' }))
    expect(storeMocks.updateQuantity).toHaveBeenCalledWith('draft|1', 1)
  })

  it('blocks decrement of confirmed-only qty when canReduce is false', async () => {
    storeState.activeOrders = [
      {
        ...menuItem,
        quantity: 2,
        uniqueId: 'inv:row-1',
        invoiceItemName: 'row-1',
      },
    ]
    render(<ServeMenu canAddItems canReduce={false} canRemove={false} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Decrease Chicken Biryani' })).toBeDisabled()
    })
  })

  it('blocks remove of confirmed line when canRemove is false', async () => {
    storeState.activeOrders = [
      {
        ...menuItem,
        quantity: 1,
        uniqueId: 'inv:row-1',
        invoiceItemName: 'row-1',
      },
    ]
    render(<ServeMenu canAddItems canReduce canRemove={false} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Decrease Chicken Biryani' })).toBeDisabled()
    })
  })
})
