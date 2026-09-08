import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    setSelectedItem: vi.fn(),
    setSelectedCategory: vi.fn(),
    setSearchQuery: vi.fn(),
    setQuickFilter: vi.fn(),
  }
  const storeState = {
    activeOrders: [] as Array<typeof menuItem & { quantity: number; uniqueId: string; invoiceItemName?: string }>,
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
    selectedItem: null,
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
    db: { getDoc: vi.fn() },
  }
})

import ServeMenu from './ServeMenu'

describe('ServeMenu quantity ergonomics', () => {
  beforeEach(() => {
    storeState.activeOrders = []
    storeMocks.addToOrder.mockReset()
    storeMocks.removeFromOrder.mockReset()
    storeMocks.updateQuantity.mockReset()
    storeMocks.fetchMenuItems.mockReset()
  })

  it('tap-to-add calls addToOrder and Options stays available', async () => {
    const user = userEvent.setup()
    render(<ServeMenu canAddItems />)

    await user.click(screen.getByRole('button', { name: 'Chicken Biryani' }))
    expect(storeMocks.addToOrder).toHaveBeenCalledWith(
      expect.objectContaining({ item: 'ITEM-BIR', quantity: 1 })
    )
    expect(screen.getByRole('button', { name: 'Options for Chicken Biryani' })).toBeInTheDocument()
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
})
