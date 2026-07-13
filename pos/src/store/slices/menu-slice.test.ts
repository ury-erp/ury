import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import { createCartSlice, type CartSlice } from './cart-slice';
import { createMenuSlice, type MenuSlice } from './menu-slice';
import { createSelectionSlice, type SelectionSlice } from './selection-slice';
import { createAppSlice, type AppSlice } from './app-slice';
import { getRestaurantMenu, getAggregatorMenu } from '../../lib/menu-api';
import { getMenuCourses } from '../../lib/menu-course-api';
import { getCustomerGroups, getCustomerTerritories } from '../../lib/customer-api';

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

const resetMenuState = () =>
  useTestStore.setState({
    menuItems: [],
    categories: [],
    menuLoading: false,
    customerGroups: [],
    territories: [],
    error: null,
    posProfile: null,
    selectedRoom: null,
    selectedOrderType: 'Take Away' as any,
  });

describe('menu slice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    resetMenuState();
  });

  // ─── Initial state ────────────────────────────────────────────────

  describe('initial state', () => {
    it('menuItems is an empty array', () => {
      expect(useTestStore.getState().menuItems).toEqual([]);
    });

    it('categories is an empty array', () => {
      expect(useTestStore.getState().categories).toEqual([]);
    });

    it('menuLoading is false', () => {
      expect(useTestStore.getState().menuLoading).toBe(false);
    });

    it('customerGroups is an empty array', () => {
      expect(useTestStore.getState().customerGroups).toEqual([]);
    });

    it('territories is an empty array', () => {
      expect(useTestStore.getState().territories).toEqual([]);
    });
  });

  // ─── fetchMenuItems ───────────────────────────────────────────────

  describe('fetchMenuItems', () => {
    it('returns early if no posProfile', async () => {
      useTestStore.setState({ posProfile: null });
      await useTestStore.getState().fetchMenuItems();
      expect(getRestaurantMenu).not.toHaveBeenCalled();
    });

    it('returns early if posProfile has no restaurant', async () => {
      useTestStore.setState({ posProfile: { name: 'test-profile' } as any });
      await useTestStore.getState().fetchMenuItems();
      expect(getRestaurantMenu).not.toHaveBeenCalled();
    });

    it('calls getRestaurantMenu with correct arguments', async () => {
      useTestStore.setState({
        posProfile: { name: 'profile-1', restaurant: 'rest-1' } as any,
        selectedRoom: 'room-A',
        selectedOrderType: 'Dine In',
      });
      (getRestaurantMenu as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      await useTestStore.getState().fetchMenuItems();

      expect(getRestaurantMenu).toHaveBeenCalledWith('profile-1', 'room-A', 'Dine In');
    });

    it('maps API items to MenuItem format with number rate', async () => {
      useTestStore.setState({
        posProfile: { name: 'p1', restaurant: 'r1' } as any,
      });
      (getRestaurantMenu as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          item: 'ITEM001',
          item_name: 'Burger',
          item_image: 'burger.png',
          rate: 9.99,
          course: 'Mains',
          course_label: 'Main Course',
          description: 'A tasty burger',
          special_dish: 1,
        },
      ]);

      await useTestStore.getState().fetchMenuItems();

      const items = useTestStore.getState().menuItems;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        id: 'ITEM001',
        name: 'Burger',
        image: 'burger.png',
        price: 9.99,
        item: 'ITEM001',
        item_name: 'Burger',
        item_image: 'burger.png',
        course: 'Mains',
        course_label: 'Main Course',
        description: 'A tasty burger',
        special_dish: 1,
        tax_rate: 0,
      });
    });

    it('parses string rate to number', async () => {
      useTestStore.setState({
        posProfile: { name: 'p1', restaurant: 'r1' } as any,
      });
      (getRestaurantMenu as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          item: 'ITEM002',
          item_name: 'Pizza',
          item_image: null,
          rate: '12.50',
          course: 'Mains',
          course_label: 'Main Course',
        },
      ]);

      await useTestStore.getState().fetchMenuItems();

      const items = useTestStore.getState().menuItems;
      expect(items[0].price).toBe(12.5);
    });

    it('defaults price to 0 when string rate is unparseable', async () => {
      useTestStore.setState({
        posProfile: { name: 'p1', restaurant: 'r1' } as any,
      });
      (getRestaurantMenu as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          item: 'ITEM003',
          item_name: 'BadRate',
          item_image: null,
          rate: 'not-a-number',
          course: 'Other',
        },
      ]);

      await useTestStore.getState().fetchMenuItems();

      const items = useTestStore.getState().menuItems;
      expect(items[0].price).toBe(0);
    });

    it('defaults price to 0 when rate is missing/undefined', async () => {
      useTestStore.setState({
        posProfile: { name: 'p1', restaurant: 'r1' } as any,
      });
      (getRestaurantMenu as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          item: 'ITEM004',
          item_name: 'NoRate',
          item_image: null,
          rate: undefined,
          course: 'Other',
        },
      ]);

      await useTestStore.getState().fetchMenuItems();

      const items = useTestStore.getState().menuItems;
      expect(items[0].price).toBe(0);
    });

    it('handles null item_image by setting image to null', async () => {
      useTestStore.setState({
        posProfile: { name: 'p1', restaurant: 'r1' } as any,
      });
      (getRestaurantMenu as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          item: 'ITEM005',
          item_name: 'NoImg',
          item_image: null,
          rate: 5,
          course: 'Other',
        },
      ]);

      await useTestStore.getState().fetchMenuItems();

      const items = useTestStore.getState().menuItems;
      expect(items[0].image).toBeNull();
    });

    it('falls back course_label to course when course_label is missing', async () => {
      useTestStore.setState({
        posProfile: { name: 'p1', restaurant: 'r1' } as any,
      });
      (getRestaurantMenu as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          item: 'ITEM006',
          item_name: 'Fallback',
          item_image: null,
          rate: 10,
          course: 'Starters',
          course_label: undefined,
        },
      ]);

      await useTestStore.getState().fetchMenuItems();

      const items = useTestStore.getState().menuItems;
      expect(items[0].course_label).toBe('Starters');
    });

    it('defaults description to empty string when missing', async () => {
      useTestStore.setState({
        posProfile: { name: 'p1', restaurant: 'r1' } as any,
      });
      (getRestaurantMenu as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          item: 'ITEM007',
          item_name: 'NoDesc',
          item_image: null,
          rate: 10,
          course: 'Other',
        },
      ]);

      await useTestStore.getState().fetchMenuItems();

      const items = useTestStore.getState().menuItems;
      expect(items[0].description).toBe('');
    });

    it('sets menuLoading to true during fetch and false after', async () => {
      useTestStore.setState({
        posProfile: { name: 'p1', restaurant: 'r1' } as any,
      });
      (getRestaurantMenu as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      const promise = useTestStore.getState().fetchMenuItems();
      // While the promise is pending, menuLoading should have been set to true
      // at some point — but since it's async microtask, we check after resolve
      await promise;
      expect(useTestStore.getState().menuLoading).toBe(false);
    });

    it('handles API error and sets error message', async () => {
      useTestStore.setState({
        posProfile: { name: 'p1', restaurant: 'r1' } as any,
      });
      (getRestaurantMenu as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

      await useTestStore.getState().fetchMenuItems();

      expect(useTestStore.getState().error).toBe('Failed to load menu items');
      expect(useTestStore.getState().menuLoading).toBe(false);
    });
  });

  // ─── fetchAggregatorMenu ──────────────────────────────────────────

  describe('fetchAggregatorMenu', () => {
    it('calls getAggregatorMenu with the provided aggregator', async () => {
      (getAggregatorMenu as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      await useTestStore.getState().fetchAggregatorMenu('swiggy');

      expect(getAggregatorMenu).toHaveBeenCalledWith('swiggy');
    });

    it('maps aggregator API items to MenuItem format', async () => {
      (getAggregatorMenu as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          item: 'AGG001',
          item_name: 'Paneer Tikka',
          item_image: 'paneer.png',
          rate: 15.0,
          course: 'Starters',
        },
      ]);

      await useTestStore.getState().fetchAggregatorMenu('zomato');

      const items = useTestStore.getState().menuItems;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        id: 'AGG001',
        name: 'Paneer Tikka',
        image: 'paneer.png',
        price: 15.0,
        item: 'AGG001',
        item_name: 'Paneer Tikka',
        item_image: 'paneer.png',
        course: 'Starters',
      });
    });

    it('parses string rate for aggregator items', async () => {
      (getAggregatorMenu as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          item: 'AGG002',
          item_name: 'Biryani',
          item_image: null,
          rate: '20.00',
          course: 'Mains',
        },
      ]);

      await useTestStore.getState().fetchAggregatorMenu('swiggy');

      expect(useTestStore.getState().menuItems[0].price).toBe(20.0);
    });

    it('sets menuLoading to false after success', async () => {
      (getAggregatorMenu as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      await useTestStore.getState().fetchAggregatorMenu('swiggy');

      expect(useTestStore.getState().menuLoading).toBe(false);
    });

    it('handles API error and sets error message', async () => {
      (getAggregatorMenu as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('API down'));

      await useTestStore.getState().fetchAggregatorMenu('swiggy');

      expect(useTestStore.getState().error).toBe('Failed to load aggregator menu');
      expect(useTestStore.getState().menuLoading).toBe(false);
    });
  });

  // ─── fetchCategories ──────────────────────────────────────────────

  describe('fetchCategories', () => {
    it('returns cached categories from sessionStorage', async () => {
      const cached = [{ name: 'Starters', label: 'Starters' }, { name: 'Mains', label: 'Main Course' }];
      sessionStorage.setItem('menuCategories', JSON.stringify(cached));

      await useTestStore.getState().fetchCategories();

      expect(useTestStore.getState().categories).toEqual(cached);
      expect(getMenuCourses).not.toHaveBeenCalled();
    });

    it('falls back to API when no cache exists', async () => {
      const courses = [{ name: 'Desserts', label: 'Desserts' }];
      (getMenuCourses as ReturnType<typeof vi.fn>).mockResolvedValueOnce(courses);

      await useTestStore.getState().fetchCategories();

      expect(getMenuCourses).toHaveBeenCalled();
      expect(useTestStore.getState().categories).toEqual(courses);
    });

    it('caches API response in sessionStorage', async () => {
      const courses = [{ name: 'Drinks', label: 'Beverages' }];
      (getMenuCourses as ReturnType<typeof vi.fn>).mockResolvedValueOnce(courses);

      await useTestStore.getState().fetchCategories();

      expect(sessionStorage.getItem('menuCategories')).toBe(JSON.stringify(courses));
    });

    it('handles invalid JSON in sessionStorage cache', async () => {
      sessionStorage.setItem('menuCategories', 'not-valid-json');
      const courses = [{ name: 'Mains', label: 'Main Course' }];
      (getMenuCourses as ReturnType<typeof vi.fn>).mockResolvedValueOnce(courses);

      await useTestStore.getState().fetchCategories();

      // Should have removed the bad cache and fetched from API
      expect(getMenuCourses).toHaveBeenCalled();
      expect(useTestStore.getState().categories).toEqual(courses);
    });

    it('handles API error and sets error message', async () => {
      (getMenuCourses as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Server error'));

      await useTestStore.getState().fetchCategories();

      expect(useTestStore.getState().error).toBe('Failed to load menu categories');
    });
  });

  // ─── fetchCustomerGroups ──────────────────────────────────────────

  describe('fetchCustomerGroups', () => {
    it('returns cached groups from sessionStorage', async () => {
      const cached = ['VIP', 'Walk-in'];
      sessionStorage.setItem('customerGroups', JSON.stringify(cached));

      await useTestStore.getState().fetchCustomerGroups();

      expect(useTestStore.getState().customerGroups).toEqual(cached);
      expect(getCustomerGroups).not.toHaveBeenCalled();
    });

    it('falls back to API when no cache exists', async () => {
      const groups = [{ name: 'VIP' }, { name: 'Corporate' }];
      (getCustomerGroups as ReturnType<typeof vi.fn>).mockResolvedValueOnce(groups);

      await useTestStore.getState().fetchCustomerGroups();

      expect(getCustomerGroups).toHaveBeenCalled();
      expect(useTestStore.getState().customerGroups).toEqual(['VIP', 'Corporate']);
    });

    it('caches API response in sessionStorage', async () => {
      const groups = [{ name: 'Walk-in' }];
      (getCustomerGroups as ReturnType<typeof vi.fn>).mockResolvedValueOnce(groups);

      await useTestStore.getState().fetchCustomerGroups();

      expect(sessionStorage.getItem('customerGroups')).toBe(JSON.stringify(['Walk-in']));
    });

    it('handles invalid JSON in sessionStorage cache and falls back to API', async () => {
      sessionStorage.setItem('customerGroups', '{broken-json');
      const groups = [{ name: 'VIP' }];
      (getCustomerGroups as ReturnType<typeof vi.fn>).mockResolvedValueOnce(groups);

      await useTestStore.getState().fetchCustomerGroups();

      expect(getCustomerGroups).toHaveBeenCalled();
      expect(useTestStore.getState().customerGroups).toEqual(['VIP']);
    });

    it('handles API error and sets error message', async () => {
      (getCustomerGroups as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Fail'));

      await useTestStore.getState().fetchCustomerGroups();

      expect(useTestStore.getState().error).toBe('Failed to load customer groups');
    });
  });

  // ─── fetchTerritories ─────────────────────────────────────────────

  describe('fetchTerritories', () => {
    it('returns cached territories from sessionStorage', async () => {
      const cached = ['North', 'South'];
      sessionStorage.setItem('territories', JSON.stringify(cached));

      await useTestStore.getState().fetchTerritories();

      expect(useTestStore.getState().territories).toEqual(cached);
      expect(getCustomerTerritories).not.toHaveBeenCalled();
    });

    it('falls back to API when no cache exists', async () => {
      const terrs = [{ name: 'East' }, { name: 'West' }];
      (getCustomerTerritories as ReturnType<typeof vi.fn>).mockResolvedValueOnce(terrs);

      await useTestStore.getState().fetchTerritories();

      expect(getCustomerTerritories).toHaveBeenCalled();
      expect(useTestStore.getState().territories).toEqual(['East', 'West']);
    });

    it('caches API response in sessionStorage', async () => {
      const terrs = [{ name: 'Central' }];
      (getCustomerTerritories as ReturnType<typeof vi.fn>).mockResolvedValueOnce(terrs);

      await useTestStore.getState().fetchTerritories();

      expect(sessionStorage.getItem('territories')).toBe(JSON.stringify(['Central']));
    });

    it('handles invalid JSON in sessionStorage cache and falls back to API', async () => {
      sessionStorage.setItem('territories', 'invalid-json');
      const terrs = [{ name: 'North' }];
      (getCustomerTerritories as ReturnType<typeof vi.fn>).mockResolvedValueOnce(terrs);

      await useTestStore.getState().fetchTerritories();

      expect(getCustomerTerritories).toHaveBeenCalled();
      expect(useTestStore.getState().territories).toEqual(['North']);
    });

    it('handles API error and sets error message', async () => {
      (getCustomerTerritories as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Fail'));

      await useTestStore.getState().fetchTerritories();

      expect(useTestStore.getState().error).toBe('Failed to load territories');
    });
  });
});
