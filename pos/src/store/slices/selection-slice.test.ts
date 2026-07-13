import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import { createCartSlice, type CartSlice } from './cart-slice';
import { createMenuSlice, type MenuSlice } from './menu-slice';
import { createSelectionSlice, type SelectionSlice } from './selection-slice';
import { createAppSlice, type AppSlice } from './app-slice';
import { getTableOrder } from '../../lib/order-api';
import { getRestaurantMenu } from '../../lib/menu-api';

vi.mock('../../i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('../../lib/menu-api', () => ({
  getRestaurantMenu: vi.fn().mockResolvedValue([]),
  getAggregatorMenu: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../lib/menu-course-api', () => ({
  getMenuCourses: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../lib/customer-api', () => ({
  getCustomerGroups: vi.fn().mockResolvedValue([]),
  getCustomerTerritories: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../lib/order-api', () => ({
  getTableOrder: vi.fn().mockResolvedValue({ message: null }),
}));
vi.mock('../../lib/pos-profile-api', () => ({
  getCombinedPosProfile: vi.fn().mockResolvedValue({}),
  getCurrencyInfo: vi.fn().mockResolvedValue({ symbol: '₹' }),
}));
vi.mock('../../lib/payment-api', () => ({
  getPaymentModes: vi.fn().mockResolvedValue(['Cash']),
}));
vi.mock('../../lib/storage', () => ({
  storage: { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn() },
}));
vi.mock('../../data/order-types', () => ({
  DEFAULT_ORDER_TYPE: 'Take Away',
}));
vi.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

type TestStore = CartSlice & MenuSlice & SelectionSlice & AppSlice;

const useTestStore = create<TestStore>()((...a) => ({
  ...createAppSlice(...a),
  ...createMenuSlice(...a),
  ...createSelectionSlice(...a),
  ...createCartSlice(...a),
}));

/** Helper to reset all selection-related state back to defaults */
const resetSelectionState = () =>
  useTestStore.setState({
    selectedCategory: '',
    searchQuery: '',
    selectedCustomer: null,
    selectedTable: null,
    selectedRoom: null,
    selectedOrderType: 'Take Away',
    quickFilter: 'all',
    selectedItem: null,
    selectedAggregator: null,
    orderComment: '',
    tableOrder: null,
    isUpdatingOrder: false,
    orderId: null,
    orderLoading: false,
    activeOrders: [],
    error: null,
  });

describe('selection slice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    resetSelectionState();
  });

  // ─── 1. Initial state ────────────────────────────────────────────────
  describe('initial state', () => {
    it('has correct default values', () => {
      // Create a fresh store to verify true initial state
      const freshStore = create<TestStore>()((...a) => ({
        ...createAppSlice(...a),
        ...createMenuSlice(...a),
        ...createSelectionSlice(...a),
        ...createCartSlice(...a),
      }));
      const s = freshStore.getState();
      expect(s.selectedCategory).toBe('');
      expect(s.searchQuery).toBe('');
      expect(s.selectedCustomer).toBeNull();
      expect(s.selectedTable).toBeNull();
      expect(s.selectedRoom).toBeNull();
      expect(s.selectedOrderType).toBe('Take Away');
      expect(s.quickFilter).toBe('all');
      expect(s.selectedItem).toBeNull();
      expect(s.selectedAggregator).toBeNull();
      expect(s.orderComment).toBe('');
      expect(s.tableOrder).toBeNull();
      expect(s.isUpdatingOrder).toBe(false);
      expect(s.orderId).toBeNull();
      expect(s.orderLoading).toBe(false);
    });
  });

  // ─── 2. setSelectedCategory ──────────────────────────────────────────
  describe('setSelectedCategory', () => {
    it('sets the selected category', () => {
      useTestStore.getState().setSelectedCategory('Beverages');
      expect(useTestStore.getState().selectedCategory).toBe('Beverages');
    });

    it('can overwrite a previously set category', () => {
      useTestStore.getState().setSelectedCategory('Beverages');
      useTestStore.getState().setSelectedCategory('Food');
      expect(useTestStore.getState().selectedCategory).toBe('Food');
    });
  });

  // ─── 3. setSearchQuery ───────────────────────────────────────────────
  describe('setSearchQuery', () => {
    it('sets the search query', () => {
      useTestStore.getState().setSearchQuery('burger');
      expect(useTestStore.getState().searchQuery).toBe('burger');
    });

    it('can clear the search query with empty string', () => {
      useTestStore.getState().setSearchQuery('burger');
      useTestStore.getState().setSearchQuery('');
      expect(useTestStore.getState().searchQuery).toBe('');
    });
  });

  // ─── 4. setSelectedCustomer ──────────────────────────────────────────
  describe('setSelectedCustomer', () => {
    it('sets a customer', () => {
      const customer = { id: 'C001', name: 'John Doe', phone: '555-1234' };
      useTestStore.getState().setSelectedCustomer(customer);
      expect(useTestStore.getState().selectedCustomer).toEqual(customer);
    });

    it('can set customer to null', () => {
      const customer = { id: 'C001', name: 'John Doe', phone: '555-1234' };
      useTestStore.getState().setSelectedCustomer(customer);
      useTestStore.getState().setSelectedCustomer(null);
      expect(useTestStore.getState().selectedCustomer).toBeNull();
    });
  });

  // ─── 5. setQuickFilter ───────────────────────────────────────────────
  describe('setQuickFilter', () => {
    it('sets quickFilter to "special"', () => {
      useTestStore.getState().setQuickFilter('special');
      expect(useTestStore.getState().quickFilter).toBe('special');
    });

    it('sets quickFilter back to "all"', () => {
      useTestStore.getState().setQuickFilter('special');
      useTestStore.getState().setQuickFilter('all');
      expect(useTestStore.getState().quickFilter).toBe('all');
    });
  });

  // ─── 6. setSelectedItem ──────────────────────────────────────────────
  describe('setSelectedItem', () => {
    it('sets a menu item', () => {
      const item = { id: 'I001', name: 'Burger', image: null, price: 10 };
      useTestStore.getState().setSelectedItem(item as any);
      expect(useTestStore.getState().selectedItem).toEqual(item);
    });

    it('can set selected item to null', () => {
      const item = { id: 'I001', name: 'Burger', image: null, price: 10 };
      useTestStore.getState().setSelectedItem(item as any);
      useTestStore.getState().setSelectedItem(null);
      expect(useTestStore.getState().selectedItem).toBeNull();
    });
  });

  // ─── 7. setSelectedAggregator ────────────────────────────────────────
  describe('setSelectedAggregator', () => {
    it('sets an aggregator', () => {
      const aggregator = { customer: 'Swiggy' };
      useTestStore.getState().setSelectedAggregator(aggregator);
      expect(useTestStore.getState().selectedAggregator).toEqual(aggregator);
    });

    it('can set aggregator to null', () => {
      const aggregator = { customer: 'Swiggy' };
      useTestStore.getState().setSelectedAggregator(aggregator);
      useTestStore.getState().setSelectedAggregator(null);
      expect(useTestStore.getState().selectedAggregator).toBeNull();
    });
  });

  // ─── 8. setOrderComment ──────────────────────────────────────────────
  describe('setOrderComment', () => {
    it('sets the order comment', () => {
      useTestStore.getState().setOrderComment('No onions');
      expect(useTestStore.getState().orderComment).toBe('No onions');
    });

    it('can clear the order comment', () => {
      useTestStore.getState().setOrderComment('No onions');
      useTestStore.getState().setOrderComment('');
      expect(useTestStore.getState().orderComment).toBe('');
    });
  });

  // ─── 9. setSelectedTable ─────────────────────────────────────────────
  describe('setSelectedTable', () => {
    it('sets selectedTable and selectedRoom', () => {
      useTestStore.getState().setSelectedTable('T1', 'R1');
      expect(useTestStore.getState().selectedTable).toBe('T1');
      expect(useTestStore.getState().selectedRoom).toBe('R1');
    });

    it('calls loadTableOrder when table is set', async () => {
      vi.mocked(getTableOrder).mockResolvedValueOnce({ message: null });
      useTestStore.getState().setSelectedTable('T1', null);
      // Allow the async loadTableOrder to complete
      await vi.waitFor(() => {
        expect(getTableOrder).toHaveBeenCalledWith('T1');
      });
    });

    it('calls clearTableOrder when table is null', () => {
      // First set some table order data
      useTestStore.setState({
        tableOrder: { message: { name: 'ORD-001' } } as any,
        isUpdatingOrder: true,
        orderId: 'ORD-001',
        activeOrders: [{ id: 'x' }] as any,
      });
      useTestStore.getState().setSelectedTable(null, null);
      expect(useTestStore.getState().tableOrder).toBeNull();
      expect(useTestStore.getState().isUpdatingOrder).toBe(false);
      expect(useTestStore.getState().orderId).toBeNull();
      expect(useTestStore.getState().activeOrders).toEqual([]);
    });

    it('does NOT call loadTableOrder when doNotLoadOrder is true', async () => {
      useTestStore.getState().setSelectedTable('T1', null, true);
      // Give a tick for any accidental call
      await new Promise((r) => setTimeout(r, 10));
      expect(getTableOrder).not.toHaveBeenCalled();
    });

    it('calls fetchMenuItems when room is set and posProfile is available', async () => {
      // fetchMenuItems returns early without posProfile.restaurant, so set one
      useTestStore.setState({
        posProfile: { name: 'TestProfile', restaurant: 'Rest1' } as any,
      });
      vi.mocked(getRestaurantMenu).mockResolvedValueOnce([]);

      useTestStore.getState().setSelectedTable('T1', 'MainHall');

      await vi.waitFor(() => {
        expect(getRestaurantMenu).toHaveBeenCalled();
      });
    });
  });

  // ─── 10. setSelectedOrderType ────────────────────────────────────────
  describe('setSelectedOrderType', () => {
    it('calls clearOrder and sets the new order type', async () => {
      // Add some items to the order so we can verify they are cleared
      useTestStore.setState({ activeOrders: [{ id: 'x', uniqueId: 'uid' }] as any });
      useTestStore.getState().setSelectedOrderType('Dine In');
      // clearOrder is async; wait for it
      await vi.waitFor(() => {
        expect(useTestStore.getState().activeOrders).toEqual([]);
      });
      expect(useTestStore.getState().selectedOrderType).toBe('Dine In');
    });

    it('resets isUpdatingOrder and orderId', () => {
      useTestStore.setState({ isUpdatingOrder: true, orderId: 'ORD-001' });
      useTestStore.getState().setSelectedOrderType('Dine In');
      expect(useTestStore.getState().isUpdatingOrder).toBe(false);
      expect(useTestStore.getState().orderId).toBeNull();
    });

    it('calls fetchMenuItems for non-Aggregators type', async () => {
      useTestStore.setState({
        posProfile: { name: 'TestProfile', restaurant: 'Rest1' } as any,
      });
      vi.mocked(getRestaurantMenu).mockResolvedValueOnce([]);

      useTestStore.getState().setSelectedOrderType('Dine In');

      await vi.waitFor(() => {
        expect(getRestaurantMenu).toHaveBeenCalled();
      });
    });

    it('does NOT call fetchMenuItems for Aggregators type', async () => {
      useTestStore.setState({
        posProfile: { name: 'TestProfile', restaurant: 'Rest1' } as any,
      });
      useTestStore.getState().setSelectedOrderType('Aggregators' as any);
      // Give a tick for any accidental call
      await new Promise((r) => setTimeout(r, 10));
      expect(getRestaurantMenu).not.toHaveBeenCalled();
    });
  });

  // ─── 11. loadTableOrder ──────────────────────────────────────────────
  describe('loadTableOrder', () => {
    it('loads order with items successfully', async () => {
      vi.mocked(getTableOrder).mockResolvedValueOnce({
        message: {
          name: 'ORD-001',
          items: [
            {
              item_code: 'Burger',
              item_name: 'Burger',
              rate: 10,
              qty: 2,
              amount: 20,
              image: '',
              description: 'Delicious',
              comment: 'No pickles',
            },
          ],
          customer: 'C001',
          customer_name: 'John',
          mobile_number: '555-1234',
        } as any,
      });

      await useTestStore.getState().loadTableOrder('T1');

      const state = useTestStore.getState();
      expect(state.tableOrder).not.toBeNull();
      expect(state.activeOrders).toHaveLength(1);
      expect(state.activeOrders[0].id).toBe('Burger');
      expect(state.activeOrders[0].quantity).toBe(2);
      expect(state.activeOrders[0].comment).toBe('No pickles');
      expect(state.selectedCustomer).toEqual({
        id: 'C001',
        name: 'John',
        phone: '555-1234',
      });
      expect(state.isUpdatingOrder).toBe(true);
      expect(state.orderId).toBe('ORD-001');
    });

    it('sets no active orders when order has no items', async () => {
      vi.mocked(getTableOrder).mockResolvedValueOnce({
        message: {
          name: 'ORD-002',
          items: [],
          customer: null,
          customer_name: '',
          mobile_number: '',
        } as any,
      });

      await useTestStore.getState().loadTableOrder('T2');

      const state = useTestStore.getState();
      expect(state.tableOrder).toBeNull();
      expect(state.activeOrders).toEqual([]);
      expect(state.selectedCustomer).toBeNull();
      expect(state.isUpdatingOrder).toBe(false);
      expect(state.orderId).toBeNull();
    });

    it('handles null message (no order)', async () => {
      vi.mocked(getTableOrder).mockResolvedValueOnce({ message: null });

      await useTestStore.getState().loadTableOrder('T3');

      const state = useTestStore.getState();
      expect(state.tableOrder).toBeNull();
      expect(state.activeOrders).toEqual([]);
      expect(state.selectedCustomer).toBeNull();
    });

    it('handles API error', async () => {
      vi.mocked(getTableOrder).mockRejectedValueOnce(new Error('Network error'));

      await useTestStore.getState().loadTableOrder('T4');

      const state = useTestStore.getState();
      expect(state.error).toBe('Failed to load table order');
      expect(state.tableOrder).toBeNull();
      expect(state.activeOrders).toEqual([]);
      expect(state.selectedCustomer).toBeNull();
      expect(state.isUpdatingOrder).toBe(false);
      expect(state.orderId).toBeNull();
    });

    it('sets orderLoading to true during load and false after', async () => {
      let resolveApi: (val: any) => void;
      const apiPromise = new Promise((resolve) => {
        resolveApi = resolve;
      });
      vi.mocked(getTableOrder).mockReturnValueOnce(apiPromise as any);

      const loadPromise = useTestStore.getState().loadTableOrder('T5');

      // While the API call is pending, orderLoading should be true
      expect(useTestStore.getState().orderLoading).toBe(true);

      // Resolve the API call
      resolveApi!({ message: null });
      await loadPromise;

      expect(useTestStore.getState().orderLoading).toBe(false);
    });

    it('sets orderLoading to false even on error', async () => {
      vi.mocked(getTableOrder).mockRejectedValueOnce(new Error('fail'));
      await useTestStore.getState().loadTableOrder('T6');
      expect(useTestStore.getState().orderLoading).toBe(false);
    });

    it('clears error before loading', async () => {
      useTestStore.setState({ error: 'some previous error' });
      vi.mocked(getTableOrder).mockResolvedValueOnce({ message: null });
      await useTestStore.getState().loadTableOrder('T7');
      expect(useTestStore.getState().error).toBeNull();
    });

    it('maps order item fields correctly', async () => {
      vi.mocked(getTableOrder).mockResolvedValueOnce({
        message: {
          name: 'ORD-003',
          items: [
            {
              item_code: 'Pizza',
              item_name: 'Margherita',
              rate: 15.5,
              qty: 1,
              amount: 15.5,
              image: 'pizza.jpg',
              description: 'Classic',
              comment: '',
            },
          ],
          customer: null,
          customer_name: '',
          mobile_number: '',
        } as any,
      });

      await useTestStore.getState().loadTableOrder('T8');

      const item = useTestStore.getState().activeOrders[0];
      expect(item.id).toBe('Pizza');
      expect(item.name).toBe('Margherita');
      expect(item.price).toBe(15.5);
      expect(item.quantity).toBe(1);
      expect(item.amount).toBe(15.5);
      expect(item.image).toBe('pizza.jpg');
      expect(item.description).toBe('Classic');
      expect(item.course).toBe('');
      expect(item.special_dish).toBe(0);
      expect(item.tax_rate).toBe(0);
      expect(item.uniqueId).toBe('Pizza-default-no-addons');
    });

    it('does not set customer when order has no customer', async () => {
      vi.mocked(getTableOrder).mockResolvedValueOnce({
        message: {
          name: 'ORD-004',
          items: [
            { item_code: 'X', item_name: 'X', rate: 1, qty: 1, amount: 1 },
          ],
          customer: '',
          customer_name: '',
          mobile_number: '',
        } as any,
      });

      await useTestStore.getState().loadTableOrder('T9');
      // Empty string customer is falsy, so selectedCustomer should be null
      expect(useTestStore.getState().selectedCustomer).toBeNull();
    });
  });

  // ─── 12. clearTableOrder ─────────────────────────────────────────────
  describe('clearTableOrder', () => {
    it('clears all table-order-related state', () => {
      useTestStore.setState({
        tableOrder: { message: { name: 'ORD-001' } } as any,
        activeOrders: [{ id: 'x' }] as any,
        selectedCustomer: { id: 'C001', name: 'John', phone: '555' },
        isUpdatingOrder: true,
        orderId: 'ORD-001',
      });

      useTestStore.getState().clearTableOrder();

      const state = useTestStore.getState();
      expect(state.tableOrder).toBeNull();
      expect(state.activeOrders).toEqual([]);
      expect(state.selectedCustomer).toBeNull();
      expect(state.isUpdatingOrder).toBe(false);
      expect(state.orderId).toBeNull();
    });
  });

  // ─── 13. setOrderForUpdate ───────────────────────────────────────────
  describe('setOrderForUpdate', () => {
    it('sets isUpdatingOrder to true and orderId when orderId is provided', () => {
      useTestStore.getState().setOrderForUpdate('ORD-100');
      expect(useTestStore.getState().isUpdatingOrder).toBe(true);
      expect(useTestStore.getState().orderId).toBe('ORD-100');
    });

    it('sets isUpdatingOrder to false and orderId to null when null is passed', () => {
      useTestStore.getState().setOrderForUpdate('ORD-100');
      useTestStore.getState().setOrderForUpdate(null);
      expect(useTestStore.getState().isUpdatingOrder).toBe(false);
      expect(useTestStore.getState().orderId).toBeNull();
    });
  });
});
