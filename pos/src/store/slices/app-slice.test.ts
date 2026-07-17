import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import { createAppSlice, type AppSlice } from './app-slice';
import { createMenuSlice, type MenuSlice } from './menu-slice';
import { createSelectionSlice, type SelectionSlice } from './selection-slice';
import { createCartSlice, type CartSlice } from './cart-slice';

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

describe('app slice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    // Reset to default app-slice state
    useTestStore.setState({
      isInitializing: true,
      loading: false,
      profileLoading: false,
      error: null,
      posProfile: null,
      currency: 'INR',
      currencySymbol: null,
      paymentModes: ['Cash'],
      // Also reset cross-slice state used by resetOrderState
      selectedCustomer: null,
      selectedTable: null,
      selectedRoom: null,
      selectedAggregator: null,
      isUpdatingOrder: false,
      orderId: null,
      activeOrders: [],
      selectedItem: null,
      orderLoading: false,
      selectedOrderType: 'Take Away',
      orderComment: '',
      menuLoading: false,
    });
  });

  // ─── Initial state ────────────────────────────────────────────────

  describe('initial state', () => {
    it('isInitializing defaults to true', () => {
      expect(useTestStore.getState().isInitializing).toBe(true);
    });

    it('loading defaults to false', () => {
      expect(useTestStore.getState().loading).toBe(false);
    });

    it('profileLoading defaults to false', () => {
      expect(useTestStore.getState().profileLoading).toBe(false);
    });

    it('error defaults to null', () => {
      expect(useTestStore.getState().error).toBeNull();
    });

    it('posProfile defaults to null', () => {
      expect(useTestStore.getState().posProfile).toBeNull();
    });

    it('currency defaults to INR when storage has no value', () => {
      expect(useTestStore.getState().currency).toBe('INR');
    });

    it('currencySymbol defaults to null when storage has no value', () => {
      expect(useTestStore.getState().currencySymbol).toBeNull();
    });

    it('paymentModes defaults to ["Cash"]', () => {
      expect(useTestStore.getState().paymentModes).toEqual(['Cash']);
    });
  });

  // ─── fetchPosProfile ──────────────────────────────────────────────

  describe('fetchPosProfile', () => {
    it('fetches profile from API when no cache exists', async () => {
      const { getCombinedPosProfile } = await import('../../lib/pos-profile-api');
      const mockProfile = { name: 'POS-001', currency: 'USD' };
      vi.mocked(getCombinedPosProfile).mockResolvedValueOnce(mockProfile as any);

      await useTestStore.getState().fetchPosProfile();

      expect(getCombinedPosProfile).toHaveBeenCalledOnce();
      expect(useTestStore.getState().posProfile).toEqual(mockProfile);
      expect(useTestStore.getState().currency).toBe('USD');
      expect(useTestStore.getState().profileLoading).toBe(false);
    });

    it('caches profile in sessionStorage after fetch', async () => {
      const { getCombinedPosProfile } = await import('../../lib/pos-profile-api');
      const mockProfile = { name: 'POS-002', currency: 'EUR' };
      vi.mocked(getCombinedPosProfile).mockResolvedValueOnce(mockProfile as any);

      await useTestStore.getState().fetchPosProfile();

      expect(sessionStorage.getItem('posProfile')).toBe(JSON.stringify(mockProfile));
    });

    it('uses sessionStorage cache when available', async () => {
      const { getCombinedPosProfile } = await import('../../lib/pos-profile-api');
      const cachedProfile = { name: 'POS-CACHED', currency: 'GBP' };
      sessionStorage.setItem('posProfile', JSON.stringify(cachedProfile));

      await useTestStore.getState().fetchPosProfile();

      expect(getCombinedPosProfile).not.toHaveBeenCalled();
      expect(useTestStore.getState().posProfile).toEqual(cachedProfile);
      expect(useTestStore.getState().currency).toBe('GBP');
    });

    it('falls back to API when cached JSON is invalid', async () => {
      const { getCombinedPosProfile } = await import('../../lib/pos-profile-api');
      sessionStorage.setItem('posProfile', '{invalid-json');
      const mockProfile = { name: 'POS-FALLBACK', currency: 'INR' };
      vi.mocked(getCombinedPosProfile).mockResolvedValueOnce(mockProfile as any);

      await useTestStore.getState().fetchPosProfile();

      // Invalid cache should be removed
      expect(sessionStorage.getItem('posProfile')).not.toBe('{invalid-json');
      // API should be called as fallback
      expect(getCombinedPosProfile).toHaveBeenCalledOnce();
      expect(useTestStore.getState().posProfile).toEqual(mockProfile);
    });

    it('fetches currency symbol when storage has none', async () => {
      const { getCombinedPosProfile, getCurrencyInfo } = await import('../../lib/pos-profile-api');
      const { storage } = await import('../../lib/storage');
      vi.mocked(getCombinedPosProfile).mockResolvedValueOnce({ name: 'POS-001', currency: 'USD' } as any);
      vi.mocked(storage.getItem).mockReturnValue(null);
      vi.mocked(getCurrencyInfo).mockResolvedValueOnce({ symbol: '$' });

      await useTestStore.getState().fetchPosProfile();

      expect(getCurrencyInfo).toHaveBeenCalledWith('USD');
    });

    it('skips currency symbol fetch when storage already has one', async () => {
      const { getCombinedPosProfile, getCurrencyInfo } = await import('../../lib/pos-profile-api');
      const { storage } = await import('../../lib/storage');
      vi.mocked(getCombinedPosProfile).mockResolvedValueOnce({ name: 'POS-001', currency: 'USD' } as any);
      vi.mocked(storage.getItem).mockImplementation((key: string) =>
        key === 'currencySymbol' ? '₹' : null,
      );

      await useTestStore.getState().fetchPosProfile();

      expect(getCurrencyInfo).not.toHaveBeenCalled();
    });

    it('sets error on API failure', async () => {
      const { getCombinedPosProfile } = await import('../../lib/pos-profile-api');
      vi.mocked(getCombinedPosProfile).mockRejectedValueOnce(new Error('Network error'));

      await useTestStore.getState().fetchPosProfile();

      expect(useTestStore.getState().error).toBe('Failed to fetch POS profile');
      expect(useTestStore.getState().profileLoading).toBe(false);
    });

    it('defaults currency to INR when profile has no currency field', async () => {
      const { getCombinedPosProfile } = await import('../../lib/pos-profile-api');
      vi.mocked(getCombinedPosProfile).mockResolvedValueOnce({ name: 'POS-NO-CUR' } as any);

      await useTestStore.getState().fetchPosProfile();

      expect(useTestStore.getState().currency).toBe('INR');
    });
  });

  // ─── fetchCurrencySymbol ──────────────────────────────────────────

  describe('fetchCurrencySymbol', () => {
    it('sets currencySymbol from API response', async () => {
      const { getCurrencyInfo } = await import('../../lib/pos-profile-api');
      vi.mocked(getCurrencyInfo).mockResolvedValueOnce({ symbol: '€' });

      await useTestStore.getState().fetchCurrencySymbol();

      expect(useTestStore.getState().currencySymbol).toBe('€');
    });

    it('stores currencySymbol in storage on success', async () => {
      const { getCurrencyInfo } = await import('../../lib/pos-profile-api');
      const { storage } = await import('../../lib/storage');
      vi.mocked(getCurrencyInfo).mockResolvedValueOnce({ symbol: '€' });

      await useTestStore.getState().fetchCurrencySymbol();

      expect(storage.setItem).toHaveBeenCalledWith('currencySymbol', '€');
    });

    it('uses currency code from state when calling API', async () => {
      const { getCurrencyInfo } = await import('../../lib/pos-profile-api');
      vi.mocked(getCurrencyInfo).mockResolvedValueOnce({ symbol: '¥' });
      useTestStore.setState({ currency: 'JPY' });

      await useTestStore.getState().fetchCurrencySymbol();

      expect(getCurrencyInfo).toHaveBeenCalledWith('JPY');
    });

    it('falls back to currency code on API failure', async () => {
      const { getCurrencyInfo } = await import('../../lib/pos-profile-api');
      const { storage } = await import('../../lib/storage');
      vi.mocked(getCurrencyInfo).mockRejectedValueOnce(new Error('API down'));
      useTestStore.setState({ currency: 'GBP' });

      await useTestStore.getState().fetchCurrencySymbol();

      expect(useTestStore.getState().currencySymbol).toBe('GBP');
      expect(storage.setItem).toHaveBeenCalledWith('currencySymbol', 'GBP');
    });
  });

  // ─── fetchPaymentModes ────────────────────────────────────────────

  describe('fetchPaymentModes', () => {
    it('updates paymentModes on success', async () => {
      const { getPaymentModes } = await import('../../lib/payment-api');
      vi.mocked(getPaymentModes).mockResolvedValueOnce(['Cash', 'Card', 'UPI']);

      await useTestStore.getState().fetchPaymentModes();

      expect(useTestStore.getState().paymentModes).toEqual(['Cash', 'Card', 'UPI']);
    });

    it('silently ignores API failure without setting error', async () => {
      const { getPaymentModes } = await import('../../lib/payment-api');
      vi.mocked(getPaymentModes).mockRejectedValueOnce(new Error('Server error'));
      const prevError = useTestStore.getState().error;

      await useTestStore.getState().fetchPaymentModes();

      expect(useTestStore.getState().error).toBe(prevError);
      // paymentModes should remain unchanged
      expect(useTestStore.getState().paymentModes).toEqual(['Cash']);
    });
  });

  // ─── resetOrderState ──────────────────────────────────────────────

  describe('resetOrderState', () => {
    it('resets selection and cart state to defaults', () => {
      useTestStore.setState({
        selectedCustomer: { name: 'John' } as any,
        selectedTable: 'T1',
        selectedRoom: 'R1',
        selectedAggregator: { name: 'Swiggy' } as any,
        isUpdatingOrder: true,
        orderId: 'ORD-001',
        activeOrders: [{ id: '1' }] as any,
        selectedItem: { id: 'item-1' } as any,
        orderLoading: true,
        error: 'some error',
        selectedOrderType: 'Dine In' as any,
        orderComment: 'Extra spicy',
      });

      useTestStore.getState().resetOrderState();

      const s = useTestStore.getState();
      expect(s.selectedCustomer).toBeNull();
      expect(s.selectedTable).toBeNull();
      expect(s.selectedRoom).toBeNull();
      expect(s.selectedAggregator).toBeNull();
      expect(s.isUpdatingOrder).toBe(false);
      expect(s.orderId).toBeNull();
      expect(s.activeOrders).toEqual([]);
      expect(s.selectedItem).toBeNull();
      expect(s.orderLoading).toBe(false);
      expect(s.error).toBeNull();
      expect(s.selectedOrderType).toBe('Take Away');
      expect(s.orderComment).toBe('');
    });

    it('calls fetchMenuItems after resetting state', () => {
      const spy = vi.spyOn(useTestStore.getState(), 'fetchMenuItems');

      useTestStore.getState().resetOrderState();

      expect(spy).toHaveBeenCalledOnce();
      spy.mockRestore();
    });
  });

  // ─── isMenuInteractionDisabled ────────────────────────────────────

  describe('isMenuInteractionDisabled', () => {
    it('returns false when neither menuLoading nor profileLoading', () => {
      useTestStore.setState({ menuLoading: false, profileLoading: false });
      expect(useTestStore.getState().isMenuInteractionDisabled()).toBe(false);
    });

    it('returns true when menuLoading is true', () => {
      useTestStore.setState({ menuLoading: true, profileLoading: false });
      expect(useTestStore.getState().isMenuInteractionDisabled()).toBe(true);
    });

    it('returns true when profileLoading is true', () => {
      useTestStore.setState({ menuLoading: false, profileLoading: true });
      expect(useTestStore.getState().isMenuInteractionDisabled()).toBe(true);
    });

    it('returns true when both menuLoading and profileLoading are true', () => {
      useTestStore.setState({ menuLoading: true, profileLoading: true });
      expect(useTestStore.getState().isMenuInteractionDisabled()).toBe(true);
    });
  });

  // ─── isOrderInteractionDisabled ───────────────────────────────────

  describe('isOrderInteractionDisabled', () => {
    it('returns false when orderLoading is false', () => {
      useTestStore.setState({ orderLoading: false });
      expect(useTestStore.getState().isOrderInteractionDisabled()).toBe(false);
    });

    it('returns true when orderLoading is true', () => {
      useTestStore.setState({ orderLoading: true });
      expect(useTestStore.getState().isOrderInteractionDisabled()).toBe(true);
    });
  });

  // ─── initializeApp ────────────────────────────────────────────────

  describe('initializeApp', () => {
    it('sets isInitializing to false on success', async () => {
      // All mocked dependencies resolve successfully by default
      await useTestStore.getState().initializeApp();

      expect(useTestStore.getState().isInitializing).toBe(false);
      expect(useTestStore.getState().error).toBeNull();
    });

    it('calls all four sub-fetches', async () => {
      const fetchPosProfileSpy = vi.spyOn(useTestStore.getState(), 'fetchPosProfile');
      const fetchMenuItemsSpy = vi.spyOn(useTestStore.getState(), 'fetchMenuItems');
      const fetchCategoriesSpy = vi.spyOn(useTestStore.getState(), 'fetchCategories');
      const fetchPaymentModesSpy = vi.spyOn(useTestStore.getState(), 'fetchPaymentModes');

      await useTestStore.getState().initializeApp();

      expect(fetchPosProfileSpy).toHaveBeenCalledOnce();
      expect(fetchMenuItemsSpy).toHaveBeenCalledOnce();
      expect(fetchCategoriesSpy).toHaveBeenCalledOnce();
      expect(fetchPaymentModesSpy).toHaveBeenCalledOnce();

      fetchPosProfileSpy.mockRestore();
      fetchMenuItemsSpy.mockRestore();
      fetchCategoriesSpy.mockRestore();
      fetchPaymentModesSpy.mockRestore();
    });

    it('sets error when fetchPosProfile rejects', async () => {
      // fetchPosProfile catches its own errors, so we must make the method itself reject
      const spy = vi.spyOn(useTestStore.getState(), 'fetchPosProfile').mockRejectedValueOnce(new Error('fail'));

      await useTestStore.getState().initializeApp();

      expect(useTestStore.getState().error).toBe('Failed to initialize app. Please refresh the page.');
      expect(useTestStore.getState().isInitializing).toBe(false);
      spy.mockRestore();
    });

    it('sets error when fetchPaymentModes rejects', async () => {
      // fetchPaymentModes catches its own errors, so we must make the method itself reject
      const spy = vi.spyOn(useTestStore.getState(), 'fetchPaymentModes').mockRejectedValueOnce(new Error('fail'));

      await useTestStore.getState().initializeApp();

      expect(useTestStore.getState().error).toBe('Failed to initialize app. Please refresh the page.');
      expect(useTestStore.getState().isInitializing).toBe(false);
      spy.mockRestore();
    });

    it('clears error at the start of initialization', async () => {
      useTestStore.setState({ error: 'previous error' });

      await useTestStore.getState().initializeApp();

      expect(useTestStore.getState().error).toBeNull();
    });
  });
});
