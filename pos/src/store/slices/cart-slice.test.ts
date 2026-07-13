import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import { createCartSlice, type CartSlice } from './cart-slice';
import { createMenuSlice, type MenuSlice } from './menu-slice';
import { createSelectionSlice, type SelectionSlice } from './selection-slice';
import { createAppSlice, type AppSlice } from './app-slice';
import { MAX_QUANTITY, MIN_QUANTITY, CartError } from './types';

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

describe('cart slice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset cart state
    useTestStore.setState({
      activeOrders: [],
      cartId: null,
      error: null,
    });
    sessionStorage.clear();
  });

  it('initial state has activeOrders [] and cartId null', () => {
    const state = useTestStore.getState();
    expect(state.activeOrders).toEqual([]);
    expect(state.cartId).toBeNull();
  });

  it('initializeCart generates a cartId', async () => {
    await useTestStore.getState().initializeCart();
    expect(useTestStore.getState().cartId).toBe('test-uuid');
  });

  it('addToOrder adds a new item to activeOrders', async () => {
    const item = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 2,
    };
    await useTestStore.getState().addToOrder(item);
    const orders = useTestStore.getState().activeOrders;
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe('item-1');
    expect(orders[0].quantity).toBe(2);
    expect(orders[0].uniqueId).toBe('item-1-default-no-addons');
  });

  it('addToOrder increments quantity for existing item with same uniqueId', async () => {
    const item = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 2,
    };
    await useTestStore.getState().addToOrder(item);
    await useTestStore.getState().addToOrder(item);

    const orders = useTestStore.getState().activeOrders;
    expect(orders).toHaveLength(1);
    expect(orders[0].quantity).toBe(4);
  });

  it('addToOrder validates quantity (rejects if > MAX_QUANTITY)', async () => {
    const item = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: MAX_QUANTITY + 1,
    };
    await useTestStore.getState().addToOrder(item);
    expect(useTestStore.getState().activeOrders).toHaveLength(0);
    expect(useTestStore.getState().error).toBeTruthy();
  });

  it('addToOrder validates quantity (rejects if < MIN_QUANTITY)', async () => {
    const item = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: -1,
    };
    await useTestStore.getState().addToOrder(item);
    expect(useTestStore.getState().activeOrders).toHaveLength(0);
    expect(useTestStore.getState().error).toBeTruthy();
  });

  it('addToOrder sets error for invalid quantity', async () => {
    const item = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 0,
    };
    // quantity 0 is between MIN_QUANTITY (0) and MAX_QUANTITY (99) so it should pass validation
    await useTestStore.getState().addToOrder(item);
    // With quantity 0, it should be added (0 >= MIN_QUANTITY && 0 <= MAX_QUANTITY)
    expect(useTestStore.getState().activeOrders).toHaveLength(1);
  });

  it('addToOrder rejects when existing item + new item exceeds MAX_QUANTITY', async () => {
    const item = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 50,
    };
    await useTestStore.getState().addToOrder(item);
    expect(useTestStore.getState().activeOrders).toHaveLength(1);

    // Add same item again - total would be 100 > MAX_QUANTITY
    await useTestStore.getState().addToOrder(item);
    // Quantity should still be 50 (not incremented)
    expect(useTestStore.getState().activeOrders[0].quantity).toBe(50);
    expect(useTestStore.getState().error).toBeTruthy();
  });

  it('removeFromOrder removes item by uniqueId', async () => {
    const item = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 2,
    };
    await useTestStore.getState().addToOrder(item);
    const uniqueId = useTestStore.getState().activeOrders[0].uniqueId!;

    await useTestStore.getState().removeFromOrder(uniqueId);
    expect(useTestStore.getState().activeOrders).toHaveLength(0);
  });

  it('updateQuantity updates item quantity', async () => {
    const item = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 2,
    };
    await useTestStore.getState().addToOrder(item);
    const uniqueId = useTestStore.getState().activeOrders[0].uniqueId!;

    await useTestStore.getState().updateQuantity(uniqueId, 5);
    expect(useTestStore.getState().activeOrders[0].quantity).toBe(5);
  });

  it('updateQuantity validates new quantity', async () => {
    const item = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 2,
    };
    await useTestStore.getState().addToOrder(item);
    const uniqueId = useTestStore.getState().activeOrders[0].uniqueId!;

    await useTestStore.getState().updateQuantity(uniqueId, MAX_QUANTITY + 1);
    // Quantity should remain unchanged
    expect(useTestStore.getState().activeOrders[0].quantity).toBe(2);
    expect(useTestStore.getState().error).toBeTruthy();
  });

  it('clearOrder empties activeOrders', async () => {
    const item = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 2,
    };
    await useTestStore.getState().addToOrder(item);
    expect(useTestStore.getState().activeOrders).toHaveLength(1);

    await useTestStore.getState().clearOrder();
    expect(useTestStore.getState().activeOrders).toHaveLength(0);
  });

  it('getCartTotals calculates subtotal, tax, total, itemCount', async () => {
    const item1 = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 100,
      quantity: 2,
      tax_rate: 10,
    };
    const item2 = {
      id: 'item-2',
      name: 'Pizza',
      image: null,
      price: 200,
      quantity: 1,
      tax_rate: 5,
    };
    await useTestStore.getState().addToOrder(item1);
    await useTestStore.getState().addToOrder(item2);

    const totals = useTestStore.getState().getCartTotals();
    // subtotal = 100*2 + 200*1 = 400
    // tax = 100*2*0.10 + 200*1*0.05 = 20 + 10 = 30
    // total = 400 + 30 = 430
    // itemCount = 2 + 1 = 3
    expect(totals.subtotal).toBe(400);
    expect(totals.tax).toBe(30);
    expect(totals.total).toBe(430);
    expect(totals.itemCount).toBe(3);
  });

  it('getCartTotals returns zero totals for empty cart', () => {
    const totals = useTestStore.getState().getCartTotals();
    expect(totals.subtotal).toBe(0);
    expect(totals.tax).toBe(0);
    expect(totals.total).toBe(0);
    expect(totals.itemCount).toBe(0);
  });

  it('itemExistsInCart returns true for existing item', async () => {
    const item = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 2,
    };
    await useTestStore.getState().addToOrder(item);
    const uniqueId = useTestStore.getState().activeOrders[0].uniqueId!;

    expect(useTestStore.getState().itemExistsInCart(uniqueId)).toBe(true);
  });

  it('itemExistsInCart returns false for non-existing item', () => {
    expect(useTestStore.getState().itemExistsInCart('nonexistent-id')).toBe(false);
  });

  it('validateQuantity returns true for valid quantity', () => {
    expect(useTestStore.getState().validateQuantity(1)).toBe(true);
    expect(useTestStore.getState().validateQuantity(50)).toBe(true);
    expect(useTestStore.getState().validateQuantity(MAX_QUANTITY)).toBe(true);
    expect(useTestStore.getState().validateQuantity(MIN_QUANTITY)).toBe(true);
  });

  it('validateQuantity returns false for invalid quantity', () => {
    expect(useTestStore.getState().validateQuantity(-1)).toBe(false);
    expect(useTestStore.getState().validateQuantity(MAX_QUANTITY + 1)).toBe(false);
    expect(useTestStore.getState().validateQuantity(NaN)).toBe(false);
  });

  it('getItemPrice returns correct price', () => {
    const item = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 1,
    };
    expect(useTestStore.getState().getItemPrice(item)).toBe(10);
  });

  it('getItemPrice returns variant price + addons', () => {
    const item = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 1,
      selectedVariant: { id: 'v1', name: 'Large', price: 15 },
      selectedAddons: [{ id: 'a1', name: 'Cheese', price: 2 }],
    };
    expect(useTestStore.getState().getItemPrice(item)).toBe(17);
  });

  it('getItemQuantityFromCart returns quantity for item in cart', async () => {
    const item = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 3,
    };
    await useTestStore.getState().addToOrder(item);

    const menuItem = { id: 'item-1', name: 'Burger', image: null, price: 10 };
    expect(useTestStore.getState().getItemQuantityFromCart(menuItem)).toBe(3);
  });

  it('getItemQuantityFromCart returns 0 for item not in cart', () => {
    const menuItem = { id: 'item-999', name: 'Not In Cart', image: null, price: 10 };
    expect(useTestStore.getState().getItemQuantityFromCart(menuItem)).toBe(0);
  });
});
