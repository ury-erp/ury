import { create } from 'zustand'
import { storage } from '@ury/core'
import { getRestaurantMenu, type MenuItem as APIMenuItem } from '../lib/menu-api'
import { getCurrencyInfo, getCombinedPosProfile, type PosProfileCombined } from '../lib/pos-profile-api'
import { getTableOrder, type TableOrder } from '../lib/order-api'
import { getCustomerGroups, getCustomerTerritories } from '../lib/customer-api'
import { DEFAULT_ORDER_TYPE, DINE_IN, TAKEAWAY, type OrderType } from '../data/order-types'

const MIN_QUANTITY = 0.001
const MAX_QUANTITY = 999

/** draftTable sentinel for takeaway carts (no restaurant table). */
export const TAKEAWAY_DRAFT_KEY = 'takeaway'

function draftKeyForCart(state: { selectedTable: string | null; selectedOrderType: OrderType }): string | null {
  if (state.selectedTable) return state.selectedTable
  if (state.selectedOrderType === TAKEAWAY) return TAKEAWAY_DRAFT_KEY
  return null
}

export interface MenuItem extends Omit<APIMenuItem, 'rate' | 'item_image' | 'disabled'> {
  id: string
  name: string
  image: string | null
  price: number
  quantity?: number
  description?: string
  special_dish?: 1 | 0
  category?: string
  disabled?: 0 | 1 | boolean
  variants?: Array<{ id: string; name: string; price: number }>
  addons?: Array<{ id: string; name: string; price: number }>
  selectedVariant?: { id: string; name: string; price: number }
  selectedAddons?: Array<{ id: string; name: string; price: number }>
  uniqueId?: string
  tax_rate?: number
  course_label?: string
  /** POS Invoice Item row name when loaded from server — keeps cart keys stable. */
  invoiceItemName?: string
}

export interface Customer {
  id: string
  name: string
  phone: string
}

export interface OrderItem extends MenuItem {
  quantity: number
  comment?: string
}

export interface Category {
  name: string
  label: string
}

/** Snapshot of last server-loaded order used by hasUnsentDraft. */
export interface DraftBaseline {
  lines: Array<{ uniqueId: string; quantity: number; comment: string }>
  customerId: string | null
  noOfPax: number
  orderComment: string
}


function generateUniqueId(item: OrderItem, indexHint = 0): string {
  if (item.invoiceItemName) return `inv:${item.invoiceItemName}`
  const variant = item.selectedVariant?.id || ''
  const addons = (item.selectedAddons || []).map((a) => a.id).sort().join(',')
  const rate = Number(item.price) || 0
  return `${item.id}|${variant}|${addons}|${rate}|${item.comment || ''}|${indexHint}`
}

function normalizeDisabled(value: unknown): 0 | 1 | boolean | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === true) return 1
  if (value === 0 || value === '0' || value === false) return 0
  return Boolean(value)
}

function mapMenuItems(items: APIMenuItem[]): MenuItem[] {
  return items.map((item) => ({
    ...item,
    id: item.item,
    name: item.item_name,
    image: item.item_image || null,
    price: Number(item.rate) || 0,
    disabled: normalizeDisabled((item as { disabled?: unknown }).disabled),
  }))
}

interface ServeState {
  menuItems: MenuItem[]
  categories: Category[]
  activeOrders: OrderItem[]
  selectedCategory: string
  selectedTable: string | null
  selectedRoom: string | null
  draftTable: string | null
  searchQuery: string
  selectedCustomer: Customer | null
  selectedOrderType: OrderType
  quickFilter: 'all' | 'special'
  selectedItem: MenuItem | null
  menuLoading: boolean
  orderLoading: boolean
  profileLoading: boolean
  error: string | null
  currency: string
  currencySymbol: string | null
  isUpdatingOrder: boolean
  orderId: string | null
  posProfile: PosProfileCombined | null
  customerGroups: string[]
  territories: string[]
  tableOrder: TableOrder | null
  isInitializing: boolean
  orderComment: string
  noOfPax: number
  lastModifiedTime: string | null
  submitting: boolean
  needsReconcile: boolean
  setNeedsReconcile: (value: boolean) => void
  loadGeneration: number
  draftBaseline: DraftBaseline | null

  initializeApp: () => Promise<void>
  fetchPosProfile: () => Promise<void>
  fetchMenuItems: () => Promise<void>
  addToOrder: (item: OrderItem) => Promise<void>
  removeFromOrder: (uniqueId: string) => Promise<void>
  updateQuantity: (uniqueId: string, quantity: number) => Promise<void>
  updateItemComment: (uniqueId: string, comment: string) => void
  clearOrder: () => Promise<void>
  setSelectedCategory: (category: string) => void
  setSearchQuery: (query: string) => void
  setSelectedCustomer: (customer: Customer | null) => void
  setSelectedTable: (table: string | null, room: string | null, doNotLoadOrder?: boolean) => void
  setSelectedOrderType: (type: OrderType) => void
  /** Enter takeaway mode: TAKEAWAY type, clear stale table/room; keep takeaway draft if present. */
  startTakeaway: () => void
  setQuickFilter: (filter: 'all' | 'special') => void
  setSelectedItem: (item: MenuItem | null) => void
  setOrderComment: (comment: string) => void
  setNoOfPax: (pax: number) => void
  setSubmitting: (value: boolean) => void
  fetchCustomerGroups: () => Promise<void>
  fetchTerritories: () => Promise<void>
  loadTableOrder: (table: string, opts?: { force?: boolean }) => Promise<void>
  clearTableOrder: (opts?: { preserveDraft?: boolean }) => void
  discardDraft: () => void
  hasUnsentDraft: () => boolean
  /** Current draft destination: table name, `takeaway`, or null. */
  getDraftDestination: () => string | null
  resetOrderState: () => void
  isOrderInteractionDisabled: () => boolean
  validateQuantity: (quantity: number) => boolean
}


function snapshotBaseline(
  orders: OrderItem[],
  customer: Customer | null,
  noOfPax: number,
  orderComment: string
): DraftBaseline {
  return {
    lines: orders.map((item) => ({
      uniqueId: item.uniqueId || generateUniqueId(item),
      quantity: item.quantity,
      comment: item.comment || '',
    })),
    customerId: customer?.id ?? null,
    noOfPax,
    orderComment: orderComment || '',
  }
}

function baselinesDiffer(baseline: DraftBaseline, state: {
  activeOrders: OrderItem[]
  selectedCustomer: Customer | null
  noOfPax: number
  orderComment: string
}): boolean {
  if ((state.selectedCustomer?.id ?? null) !== baseline.customerId) return true
  if (state.noOfPax !== baseline.noOfPax) return true
  if ((state.orderComment || '') !== baseline.orderComment) return true
  if (state.activeOrders.length !== baseline.lines.length) return true
  const baseMap = new Map(baseline.lines.map((l) => [l.uniqueId, l]))
  for (const item of state.activeOrders) {
    const uid = item.uniqueId || ''
    const base = baseMap.get(uid)
    if (!base) return true
    if (base.quantity !== item.quantity) return true
    if ((base.comment || '') !== (item.comment || '')) return true
  }
  return false
}

export const useServeStore = create<ServeState>((set, get) => ({
  menuItems: [],
  categories: [],
  activeOrders: [],
  selectedCategory: '',
  selectedTable: null,
  selectedRoom: null,
  draftTable: null,
  searchQuery: '',
  selectedCustomer: null,
  selectedOrderType: DEFAULT_ORDER_TYPE,
  quickFilter: 'all',
  selectedItem: null,
  menuLoading: false,
  orderLoading: false,
  profileLoading: false,
  error: null,
  currency: 'INR',
  currencySymbol: null,
  isUpdatingOrder: false,
  orderId: null,
  posProfile: null,
  customerGroups: [],
  territories: [],
  tableOrder: null,
  isInitializing: false,
  orderComment: '',
  noOfPax: 1,
  lastModifiedTime: null,
  submitting: false,
  needsReconcile: false,
  setNeedsReconcile: (value) => set({ needsReconcile: value }),
  loadGeneration: 0,
  draftBaseline: null,

  initializeApp: async () => {
    set({ isInitializing: true, error: null })
    try {
      await get().fetchPosProfile()
      if (get().posProfile?.name) {
        await get().fetchMenuItems()
      }
    } catch (error) {
      set({ error: (error as Error).message })
    } finally {
      set({ isInitializing: false })
    }
  },

  fetchPosProfile: async () => {
    set({ profileLoading: true })
    try {
      const profile = await getCombinedPosProfile()
      set({ posProfile: profile })
      if (profile.currency) {
        const info = await getCurrencyInfo(profile.currency)
        storage.setItem('currencySymbol', info.symbol || profile.currency)
        set({ currency: profile.currency, currencySymbol: info.symbol })
      }
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    } finally {
      set({ profileLoading: false })
    }
  },

  fetchMenuItems: async () => {
    const { posProfile, selectedRoom, selectedOrderType } = get()
    if (!posProfile?.name) return
    set({ menuLoading: true })
    try {
      const items = await getRestaurantMenu(posProfile.name, selectedRoom, selectedOrderType)
      const mapped = mapMenuItems(items)
      const courses = Array.from(new Set(mapped.map((i) => i.course).filter(Boolean)))
      set({
        menuItems: mapped,
        categories: courses.map((name) => ({ name: name as string, label: name as string })),
        menuLoading: false,
      })
    } catch (error) {
      set({ error: (error as Error).message, menuLoading: false })
      throw error
    }
  },

  addToOrder: async (item) => {
    if (!get().validateQuantity(item.quantity)) return
    const uniqueId = item.uniqueId || generateUniqueId(item)
    const existingIndex = get().activeOrders.findIndex((row) => row.uniqueId === uniqueId)
    const draftTable = draftKeyForCart(get())
    if (existingIndex >= 0 && !item.invoiceItemName) {
      const existing = get().activeOrders[existingIndex]
      const next = [...get().activeOrders]
      next[existingIndex] = {
        ...existing,
        quantity: existing.quantity + item.quantity,
        comment: item.comment !== undefined ? item.comment : existing.comment,
      }
      set({ activeOrders: next, draftTable })
      return
    }
    set({
      activeOrders: [...get().activeOrders, { ...item, uniqueId }],
      draftTable,
    })
  },

  removeFromOrder: async (uniqueId) => {
    set({ activeOrders: get().activeOrders.filter((item) => item.uniqueId !== uniqueId) })
  },

  updateQuantity: async (uniqueId, quantity) => {
    if (!Number.isFinite(quantity) || quantity < 0) return
    if (quantity === 0) {
      await get().removeFromOrder(uniqueId)
      return
    }
    if (!get().validateQuantity(quantity)) return
    set({
      activeOrders: get().activeOrders.map((item) =>
        item.uniqueId === uniqueId ? { ...item, quantity } : item
      ),
    })
  },

  updateItemComment: (uniqueId, comment) => {
    set({
      activeOrders: get().activeOrders.map((item) =>
        item.uniqueId === uniqueId ? { ...item, comment } : item
      ),
    })
  },

  clearOrder: async () => set({ activeOrders: [] }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedCustomer: (customer) => set({ selectedCustomer: customer }),
  setSelectedOrderType: (type) => {
    set({ selectedOrderType: type })
    void get().fetchMenuItems()
  },
  setQuickFilter: (filter) => set({ quickFilter: filter }),
  setSelectedItem: (item) => set({ selectedItem: item }),
  setOrderComment: (comment) => set({ orderComment: comment }),
  setNoOfPax: (pax) => set({ noOfPax: pax }),
  setSubmitting: (value) => set({ submitting: value }),

  setSelectedTable: (table, room, doNotLoadOrder = false) => {
    set({ selectedTable: table, selectedRoom: room, ...(table ? { selectedOrderType: DINE_IN } : {}) })
    if (table) {
      if (!doNotLoadOrder) void get().loadTableOrder(table)
    }
    if (room) void get().fetchMenuItems()
  },

  startTakeaway: () => {
    const state = get()
    const preserveTakeawayDraft =
      state.hasUnsentDraft() &&
      (state.draftTable === TAKEAWAY_DRAFT_KEY ||
        (!state.draftTable && !state.selectedTable))

    set({
      selectedOrderType: TAKEAWAY,
      selectedTable: null,
      selectedRoom: null,
      draftTable: preserveTakeawayDraft
        ? TAKEAWAY_DRAFT_KEY
        : state.hasUnsentDraft()
          ? state.draftTable
          : null,
    })
    void get().fetchMenuItems()
  },

  fetchCustomerGroups: async () => {
    const groups = await getCustomerGroups()
    set({ customerGroups: groups.map((g: { name: string }) => g.name) })
  },

  fetchTerritories: async () => {
    const terrs = await getCustomerTerritories()
    set({ territories: terrs.map((row: { name: string }) => row.name) })
  },

  loadTableOrder: async (table, opts) => {
    const generation = get().loadGeneration + 1
    set({ orderLoading: true, error: null, loadGeneration: generation })
    try {
      const response = await getTableOrder(table)
      if (get().loadGeneration !== generation) {
        if (opts?.force) throw new Error('Order changed while reloading. Try again.')
        return
      }
      const order = response.message
      if (order?.name && order.items?.length) {
        const orderItems: OrderItem[] = order.items.map((item, index) => {
          const mapped: OrderItem = {
            id: item.item_code,
            name: item.item_name,
            price: item.rate,
            quantity: item.qty,
            image: item.image || null,
            item: item.item_code,
            item_name: item.item_name,
            course: '',
            description: item.description || '',
            special_dish: 0,
            tax_rate: 0,
            comment: item.comment || '',
            invoiceItemName: item.name,
          }
          return { ...mapped, uniqueId: generateUniqueId(mapped, index) }
        })
        const selectedCustomer = order.customer
          ? { id: order.customer, name: order.customer_name, phone: order.mobile_number }
          : null
        const noOfPax = order.no_of_pax || 1
        const orderComment = order.custom_comments || ''
        set({
          tableOrder: response,
          activeOrders: orderItems,
          selectedCustomer,
          isUpdatingOrder: true,
          orderId: order.name,
          noOfPax,
          lastModifiedTime: order.modified || null,
          orderComment,
          draftTable: table,
          draftBaseline: snapshotBaseline(orderItems, selectedCustomer, noOfPax, orderComment),
          error: null,
        })
      } else {
        // Explicit reconcile must apply server empty state; otherwise preserve local draft.
        const keepDraft =
          !opts?.force &&
          get().draftTable === table &&
          (get().hasUnsentDraft() || get().activeOrders.some((i) => !i.invoiceItemName))
        if (!keepDraft) {
          set({
            tableOrder: null,
            activeOrders: [],
            selectedCustomer: null,
            isUpdatingOrder: false,
            orderId: null,
            noOfPax: 1,
            lastModifiedTime: null,
            orderComment: '',
            draftTable: table,
            draftBaseline: null,
            error: null,
          })
        } else {
          set({ tableOrder: null, isUpdatingOrder: false, orderId: null, error: null })
        }
      }
    } catch (error) {
      if (get().loadGeneration !== generation) {
        if (opts?.force) throw new Error('Order changed while reloading. Try again.')
        return
      }
      // Keep the in-progress draft — never clear cart on fetch failure.
      set({
        error: error instanceof Error ? error.message : 'Failed to load table order',
      })
      throw error instanceof Error ? error : new Error('Failed to load table order')
    } finally {
      if (get().loadGeneration === generation) set({ orderLoading: false })
    }
  },

  clearTableOrder: (opts) => {
    if (opts?.preserveDraft && get().hasUnsentDraft()) return
    set({
      needsReconcile: false,
      tableOrder: null,
      activeOrders: [],
      selectedCustomer: null,
      isUpdatingOrder: false,
      orderId: null,
      noOfPax: 1,
      lastModifiedTime: null,
      orderComment: '',
      draftTable: null,
      draftBaseline: null,
    })
  },

  discardDraft: () => {
    set({
      needsReconcile: false,
      activeOrders: [],
      selectedCustomer: null,
      isUpdatingOrder: false,
      orderId: null,
      noOfPax: 1,
      lastModifiedTime: null,
      orderComment: '',
      draftTable: null,
      tableOrder: null,
      draftBaseline: null,
    })
  },

  hasUnsentDraft: () => {
    const state = get()
    const { activeOrders, isUpdatingOrder, draftTable, draftBaseline } = state
    if (state.needsReconcile) return true
    if (!draftTable && activeOrders.length === 0) return false
    if (!isUpdatingOrder) return activeOrders.length > 0
    if (activeOrders.some((item) => !item.invoiceItemName)) return true
    if (!draftBaseline) return activeOrders.length > 0
    return baselinesDiffer(draftBaseline, state)
  },

  getDraftDestination: () => {
    const state = get()
    if (!state.hasUnsentDraft()) return null
    if (state.draftTable) return state.draftTable
    if (!state.selectedTable && state.activeOrders.length > 0) return TAKEAWAY_DRAFT_KEY
    return state.selectedTable
  },

  resetOrderState: () => {
    set({
      needsReconcile: false,
      selectedCustomer: null,
      selectedTable: null,
      selectedRoom: null,
      isUpdatingOrder: false,
      orderId: null,
      activeOrders: [],
      selectedItem: null,
      orderComment: '',
      noOfPax: 1,
      lastModifiedTime: null,
      selectedOrderType: DEFAULT_ORDER_TYPE,
      draftTable: null,
      draftBaseline: null,
    })
    void get().fetchMenuItems()
  },

  isOrderInteractionDisabled: () => get().orderLoading || get().submitting || get().needsReconcile,
  validateQuantity: (quantity) =>
    Number.isFinite(quantity) && quantity >= MIN_QUANTITY && quantity <= MAX_QUANTITY,
}))
