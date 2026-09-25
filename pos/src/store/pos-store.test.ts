import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ury/core', () => ({
  storage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

vi.mock('../lib/menu-api', () => ({
  getRestaurantMenu: vi.fn(),
  getAggregatorMenu: vi.fn(),
}));

vi.mock('../lib/pos-profile-api', () => ({
  getCurrencyInfo: vi.fn(),
  getCombinedPosProfile: vi.fn(),
}));

vi.mock('../lib/menu-course-api', () => ({
  getMenuCourses: vi.fn(),
}));

vi.mock('../lib/customer-api', () => ({
  getCustomerGroups: vi.fn(),
  getCustomerTerritories: vi.fn(),
}));

vi.mock('../lib/order-api', () => ({
  getTableOrder: vi.fn(),
}));

vi.mock('../lib/payment-api', () => ({
  getPaymentModes: vi.fn(),
}));

import { usePOSStore, OrderItem } from './pos-store';
import { getTableOrder } from '../lib/order-api';

const baseItem = (overrides: Partial<OrderItem> = {}): OrderItem => ({
  id: 'ITEM-1',
  name: 'Burger',
  image: null,
  price: 100,
  quantity: 1,
  item: 'ITEM-1',
  item_name: 'Burger',
  item_image: null,
  course: 'Mains',
  tax_rate: 0,
  ...overrides,
} as OrderItem);

const resetStore = () => {
  usePOSStore.setState({
    menuItems: [],
    categories: [],
    activeOrders: [],
    selectedCategory: '',
    selectedTable: null,
    selectedRoom: null,
    searchQuery: '',
    selectedCustomer: null,
    quickFilter: 'all',
    selectedItem: null,
    cartId: null,
    loading: false,
    menuLoading: false,
    orderLoading: false,
    profileLoading: false,
    error: null,
    paymentModes: ['Cash'],
    orders: [],
    selectedAggregator: null,
    isUpdatingOrder: false,
    orderId: null,
    posProfile: null,
    customerGroups: [],
    territories: [],
    tableOrder: null,
    isInitializing: true,
    orderComment: '',
    noOfPax: 1,
    lastModifiedTime: null,
    showVoluntaryClosing: false,
  });
};

describe('pos-store', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  describe('addToOrder', () => {
    it('adds a new item to an empty cart', async () => {
      await usePOSStore.getState().addToOrder(baseItem());
      const orders = usePOSStore.getState().activeOrders;
      expect(orders).toHaveLength(1);
      expect(orders[0].quantity).toBe(1);
      expect(orders[0].uniqueId).toBe('ITEM-1-default-no-addons');
    });

    it('assigns reservationLineKey equal to uniqueId for a new line', async () => {
      await usePOSStore.getState().addToOrder(baseItem());
      const orders = usePOSStore.getState().activeOrders;
      expect(orders[0].reservationLineKey).toBe(orders[0].uniqueId);
    });

    it('preserves an existing reservationLineKey if already set on the incoming item', async () => {
      await usePOSStore.getState().addToOrder(baseItem({ reservationLineKey: 'ROW-123' }));
      const orders = usePOSStore.getState().activeOrders;
      expect(orders[0].reservationLineKey).toBe('ROW-123');
    });

    it('merges quantities when the same item (no variant/addons) is added again', async () => {
      await usePOSStore.getState().addToOrder(baseItem({ quantity: 2 }));
      await usePOSStore.getState().addToOrder(baseItem({ quantity: 3 }));
      const orders = usePOSStore.getState().activeOrders;
      expect(orders).toHaveLength(1);
      expect(orders[0].quantity).toBe(5);
    });

    it('treats items with different selected variants as distinct lines', async () => {
      await usePOSStore.getState().addToOrder(
        baseItem({ selectedVariant: { id: 'V1', name: 'Small', price: 90 } })
      );
      await usePOSStore.getState().addToOrder(
        baseItem({ selectedVariant: { id: 'V2', name: 'Large', price: 120 } })
      );
      expect(usePOSStore.getState().activeOrders).toHaveLength(2);
    });

    it('treats items with different addon sets as distinct lines', async () => {
      await usePOSStore.getState().addToOrder(
        baseItem({ selectedAddons: [{ id: 'A1', name: 'Cheese', price: 10, category: 'sides' }] })
      );
      await usePOSStore.getState().addToOrder(
        baseItem({ selectedAddons: [{ id: 'A2', name: 'Bacon', price: 20, category: 'sides' }] })
      );
      expect(usePOSStore.getState().activeOrders).toHaveLength(2);
    });

    it('generates the same uniqueId regardless of addon order (sorted)', async () => {
      await usePOSStore.getState().addToOrder(
        baseItem({
          selectedAddons: [
            { id: 'A2', name: 'Bacon', price: 20, category: 'sides' },
            { id: 'A1', name: 'Cheese', price: 10, category: 'sides' },
          ],
        })
      );
      await usePOSStore.getState().addToOrder(
        baseItem({
          selectedAddons: [
            { id: 'A1', name: 'Cheese', price: 10, category: 'sides' },
            { id: 'A2', name: 'Bacon', price: 20, category: 'sides' },
          ],
        })
      );
      // Same addon set in different order should merge into one line.
      expect(usePOSStore.getState().activeOrders).toHaveLength(1);
      expect(usePOSStore.getState().activeOrders[0].quantity).toBe(2);
    });

    it('rejects an item with quantity above MAX_QUANTITY (99) and sets an error', async () => {
      await usePOSStore.getState().addToOrder(baseItem({ quantity: 100 }));
      expect(usePOSStore.getState().activeOrders).toHaveLength(0);
      expect(usePOSStore.getState().error).toMatch(/Quantity must be between/);
    });

    it('rejects merging when total quantity would exceed MAX_QUANTITY', async () => {
      await usePOSStore.getState().addToOrder(baseItem({ quantity: 90 }));
      await usePOSStore.getState().addToOrder(baseItem({ quantity: 20 }));
      const orders = usePOSStore.getState().activeOrders;
      expect(orders).toHaveLength(1);
      expect(orders[0].quantity).toBe(90);
      expect(usePOSStore.getState().error).toMatch(/exceed 99/);
    });

    it('allows quantity 0 (MIN_QUANTITY) to be added', async () => {
      await usePOSStore.getState().addToOrder(baseItem({ quantity: 0 }));
      expect(usePOSStore.getState().activeOrders).toHaveLength(1);
      expect(usePOSStore.getState().activeOrders[0].quantity).toBe(0);
    });

    it('rejects a negative quantity', async () => {
      await usePOSStore.getState().addToOrder(baseItem({ quantity: -1 }));
      expect(usePOSStore.getState().activeOrders).toHaveLength(0);
      expect(usePOSStore.getState().error).toMatch(/Quantity must be between/);
    });

    it('updates the comment on merge when a new comment is explicitly provided', async () => {
      await usePOSStore.getState().addToOrder(baseItem({ quantity: 1, comment: 'no onions' }));
      await usePOSStore.getState().addToOrder(baseItem({ quantity: 1, comment: 'extra spicy' }));
      expect(usePOSStore.getState().activeOrders[0].comment).toBe('extra spicy');
    });

    it('keeps the existing comment on merge when the new item has no comment field', async () => {
      await usePOSStore.getState().addToOrder(baseItem({ quantity: 1, comment: 'no onions' }));
      const second = baseItem({ quantity: 1 });
      delete (second as any).comment;
      await usePOSStore.getState().addToOrder(second);
      expect(usePOSStore.getState().activeOrders[0].comment).toBe('no onions');
    });
  });

  describe('removeFromOrder', () => {
    it('removes the matching line by uniqueId', async () => {
      await usePOSStore.getState().addToOrder(baseItem());
      const uniqueId = usePOSStore.getState().activeOrders[0].uniqueId!;
      await usePOSStore.getState().removeFromOrder(uniqueId);
      expect(usePOSStore.getState().activeOrders).toHaveLength(0);
    });

    it('is a no-op when the uniqueId does not exist', async () => {
      await usePOSStore.getState().addToOrder(baseItem());
      await usePOSStore.getState().removeFromOrder('does-not-exist');
      expect(usePOSStore.getState().activeOrders).toHaveLength(1);
    });
  });

  describe('updateQuantity', () => {
    it('updates the quantity for a matching line', async () => {
      await usePOSStore.getState().addToOrder(baseItem({ quantity: 1 }));
      const uniqueId = usePOSStore.getState().activeOrders[0].uniqueId!;
      await usePOSStore.getState().updateQuantity(uniqueId, 5);
      expect(usePOSStore.getState().activeOrders[0].quantity).toBe(5);
    });

    it('rejects an out-of-range quantity and leaves the cart unchanged', async () => {
      await usePOSStore.getState().addToOrder(baseItem({ quantity: 1 }));
      const uniqueId = usePOSStore.getState().activeOrders[0].uniqueId!;
      await usePOSStore.getState().updateQuantity(uniqueId, 100);
      expect(usePOSStore.getState().activeOrders[0].quantity).toBe(1);
      expect(usePOSStore.getState().error).toMatch(/Quantity must be between/);
    });

    it('allows setting quantity down to 0', async () => {
      await usePOSStore.getState().addToOrder(baseItem({ quantity: 3 }));
      const uniqueId = usePOSStore.getState().activeOrders[0].uniqueId!;
      await usePOSStore.getState().updateQuantity(uniqueId, 0);
      expect(usePOSStore.getState().activeOrders[0].quantity).toBe(0);
    });
  });

  describe('updateItemComment', () => {
    it('updates only the comment, leaving quantity and price untouched', async () => {
      await usePOSStore.getState().addToOrder(baseItem({ quantity: 2, price: 100 }));
      const uniqueId = usePOSStore.getState().activeOrders[0].uniqueId!;
      usePOSStore.getState().updateItemComment(uniqueId, 'well done');
      const item = usePOSStore.getState().activeOrders[0];
      expect(item.comment).toBe('well done');
      expect(item.quantity).toBe(2);
      expect(item.price).toBe(100);
    });
  });

  describe('clearOrder', () => {
    it('empties the cart', async () => {
      await usePOSStore.getState().addToOrder(baseItem());
      await usePOSStore.getState().clearOrder();
      expect(usePOSStore.getState().activeOrders).toHaveLength(0);
    });
  });

  describe('getCartTotals / getItemPrice', () => {
    it('computes subtotal, tax, and total for a single item with no tax', async () => {
      await usePOSStore.getState().addToOrder(baseItem({ price: 100, quantity: 2, tax_rate: 0 }));
      const totals = usePOSStore.getState().getCartTotals();
      expect(totals.subtotal).toBe(200);
      expect(totals.tax).toBe(0);
      expect(totals.total).toBe(200);
      expect(totals.itemCount).toBe(2);
    });

    it('applies tax_rate as a percentage on the line total', async () => {
      await usePOSStore.getState().addToOrder(baseItem({ price: 100, quantity: 2, tax_rate: 10 }));
      const totals = usePOSStore.getState().getCartTotals();
      expect(totals.subtotal).toBe(200);
      expect(totals.tax).toBe(20);
      expect(totals.total).toBe(220);
    });

    it('uses the selected variant price instead of the base price when computing totals', async () => {
      await usePOSStore.getState().addToOrder(
        baseItem({ price: 100, quantity: 1, selectedVariant: { id: 'V1', name: 'Large', price: 150 } })
      );
      const totals = usePOSStore.getState().getCartTotals();
      expect(totals.subtotal).toBe(150);
    });

    it('adds addon prices on top of the base/variant price per unit', async () => {
      await usePOSStore.getState().addToOrder(
        baseItem({
          price: 100,
          quantity: 3,
          selectedAddons: [
            { id: 'A1', name: 'Cheese', price: 10 },
            { id: 'A2', name: 'Bacon', price: 20 },
          ],
        })
      );
      const totals = usePOSStore.getState().getCartTotals();
      // (100 + 10 + 20) * 3 = 390
      expect(totals.subtotal).toBe(390);
    });

    it('sums totals across multiple distinct lines with different tax rates', async () => {
      await usePOSStore.getState().addToOrder(baseItem({ id: 'A', price: 100, quantity: 1, tax_rate: 5 }));
      await usePOSStore.getState().addToOrder(baseItem({ id: 'B', price: 50, quantity: 2, tax_rate: 10 }));
      const totals = usePOSStore.getState().getCartTotals();
      // subtotal: 100 + 100 = 200; tax: 100*0.05 + 100*0.10 = 5 + 10 = 15
      expect(totals.subtotal).toBe(200);
      expect(totals.tax).toBe(15);
      expect(totals.total).toBe(215);
    });

    it('returns zeroed totals for an empty cart', () => {
      const totals = usePOSStore.getState().getCartTotals();
      expect(totals).toEqual({ subtotal: 0, tax: 0, total: 0, itemCount: 0 });
    });

    // getCartTotals rounds the final returned subtotal/tax/total to currency
    // precision (2 decimal places) so binary floating point artifacts (e.g.
    // 0.1 + 0.2 !== 0.3) don't leak into the UI/receipt.
    it('rounds subtotal to currency precision instead of leaving raw float drift', async () => {
      // 0.1 + 0.2 is the canonical binary-float example: exactly representable
      // inputs sum to 0.30000000000000004, not 0.3.
      await usePOSStore.getState().addToOrder(baseItem({ id: 'C', price: 0.1, quantity: 1, tax_rate: 0 }));
      await usePOSStore.getState().addToOrder(baseItem({ id: 'D', price: 0.2, quantity: 1, tax_rate: 0 }));
      const totals = usePOSStore.getState().getCartTotals();
      expect(totals.subtotal).toBe(0.3);
    });

    it('rounds tax to currency precision instead of leaving raw float drift', async () => {
      // 3 items at 33.33 with 5% tax: subtotal = 99.99, tax = 99.99 * 0.05 =
      // 4.9995 which floats as 4.999500000000001 without rounding.
      await usePOSStore.getState().addToOrder(baseItem({ id: 'E', price: 33.33, quantity: 3, tax_rate: 5 }));
      const totals = usePOSStore.getState().getCartTotals();
      expect(totals.subtotal).toBe(99.99);
      expect(totals.tax).toBe(5);
      expect(totals.total).toBe(104.99);
    });

    it('getItemPrice returns variant+addons price for an order item', () => {
      const item = baseItem({
        price: 100,
        selectedVariant: { id: 'V1', name: 'Large', price: 150 },
        selectedAddons: [{ id: 'A1', name: 'Cheese', price: 10 }],
      });
      expect(usePOSStore.getState().getItemPrice(item)).toBe(160);
    });
  });

  describe('itemExistsInCart / getItemQuantityFromCart', () => {
    it('itemExistsInCart reflects cart membership by uniqueId', async () => {
      await usePOSStore.getState().addToOrder(baseItem());
      const uniqueId = usePOSStore.getState().activeOrders[0].uniqueId!;
      expect(usePOSStore.getState().itemExistsInCart(uniqueId)).toBe(true);
      expect(usePOSStore.getState().itemExistsInCart('nope')).toBe(false);
    });

    it('getItemQuantityFromCart returns the quantity for a matching menu item', async () => {
      await usePOSStore.getState().addToOrder(baseItem({ quantity: 4 }));
      const menuItem = { id: 'ITEM-1', name: 'Burger', image: null, price: 100 } as any;
      expect(usePOSStore.getState().getItemQuantityFromCart(menuItem)).toBe(4);
    });

    it('getItemQuantityFromCart returns 0 for an item not in the cart', () => {
      const menuItem = { id: 'ITEM-999', name: 'Not there', image: null, price: 100 } as any;
      expect(usePOSStore.getState().getItemQuantityFromCart(menuItem)).toBe(0);
    });
  });

  describe('validateQuantity', () => {
    it('accepts boundary values 0 and 99', () => {
      expect(usePOSStore.getState().validateQuantity(0)).toBe(true);
      expect(usePOSStore.getState().validateQuantity(99)).toBe(true);
    });

    it('rejects 100, -1, and NaN', () => {
      expect(usePOSStore.getState().validateQuantity(100)).toBe(false);
      expect(usePOSStore.getState().validateQuantity(-1)).toBe(false);
      expect(usePOSStore.getState().validateQuantity(NaN)).toBe(false);
    });
  });

  describe('customer/table/order-type selection state', () => {
    it('setSelectedCustomer stores the customer', () => {
      usePOSStore.getState().setSelectedCustomer({ id: 'C1', name: 'Jane', phone: '123' });
      expect(usePOSStore.getState().selectedCustomer).toEqual({ id: 'C1', name: 'Jane', phone: '123' });
    });

    it('setSelectedCustomer(null) clears the customer', () => {
      usePOSStore.getState().setSelectedCustomer({ id: 'C1', name: 'Jane', phone: '123' });
      usePOSStore.getState().setSelectedCustomer(null);
      expect(usePOSStore.getState().selectedCustomer).toBeNull();
    });

    it('setSelectedTable with doNotLoadOrder=true does not call getTableOrder', () => {
      usePOSStore.getState().setSelectedTable('T1', 'R1', true);
      expect(usePOSStore.getState().selectedTable).toBe('T1');
      expect(usePOSStore.getState().selectedRoom).toBe('R1');
      expect(getTableOrder).not.toHaveBeenCalled();
    });

    it('setSelectedTable(null, null) clears table/room and clears the table order/cart', async () => {
      await usePOSStore.getState().addToOrder(baseItem());
      usePOSStore.getState().setSelectedTable('T1', 'R1', true);
      usePOSStore.getState().setSelectedTable(null, null);
      expect(usePOSStore.getState().selectedTable).toBeNull();
      expect(usePOSStore.getState().selectedRoom).toBeNull();
      expect(usePOSStore.getState().activeOrders).toHaveLength(0);
      expect(usePOSStore.getState().isUpdatingOrder).toBe(false);
    });

    it('setSelectedOrderType resets the cart and update-in-progress state', async () => {
      await usePOSStore.getState().addToOrder(baseItem());
      usePOSStore.getState().setOrderForUpdate('ORDER-1');
      usePOSStore.getState().setSelectedOrderType('Dine In' as any);
      expect(usePOSStore.getState().activeOrders).toHaveLength(0);
      expect(usePOSStore.getState().isUpdatingOrder).toBe(false);
      expect(usePOSStore.getState().orderId).toBeNull();
      expect(usePOSStore.getState().selectedOrderType).toBe('Dine In');
    });

    it('setOrderForUpdate sets isUpdatingOrder true when given a non-null id', () => {
      usePOSStore.getState().setOrderForUpdate('ORDER-2');
      expect(usePOSStore.getState().isUpdatingOrder).toBe(true);
      expect(usePOSStore.getState().orderId).toBe('ORDER-2');
    });

    it('setOrderForUpdate(null) sets isUpdatingOrder false', () => {
      usePOSStore.getState().setOrderForUpdate('ORDER-2');
      usePOSStore.getState().setOrderForUpdate(null);
      expect(usePOSStore.getState().isUpdatingOrder).toBe(false);
      expect(usePOSStore.getState().orderId).toBeNull();
    });
  });

  describe('loadTableOrder', () => {
    it('populates activeOrders and customer from a fetched table order', async () => {
      (getTableOrder as any).mockResolvedValue({
        message: {
          name: 'ORD-1',
          customer: 'CUST-1',
          customer_name: 'Jane',
          mobile_number: '9999999999',
          no_of_pax: 2,
          modified: '2026-01-01 10:00:00',
          custom_comments: 'window seat',
          items: [
            {
              item_code: 'ITEM-1',
              item_name: 'Burger',
              rate: 100,
              qty: 2,
              amount: 200,
              image: null,
              description: '',
              comment: '',
              name: 'invoice-item-1',
              reservation_line_key: 'RLK-1',
            },
          ],
        },
      });

      await usePOSStore.getState().loadTableOrder('T1');
      const state = usePOSStore.getState();
      expect(state.activeOrders).toHaveLength(1);
      expect(state.activeOrders[0].quantity).toBe(2);
      expect(state.activeOrders[0].reservationLineKey).toBe('RLK-1');
      expect(state.activeOrders[0].invoiceItemName).toBe('invoice-item-1');
      expect(state.selectedCustomer).toEqual({ id: 'CUST-1', name: 'Jane', phone: '9999999999' });
      expect(state.isUpdatingOrder).toBe(true);
      expect(state.orderId).toBe('ORD-1');
      expect(state.noOfPax).toBe(2);
      expect(state.orderComment).toBe('window seat');
    });

    it('falls back to locally generated uniqueId as reservationLineKey when server has none', async () => {
      (getTableOrder as any).mockResolvedValue({
        message: {
          name: 'ORD-2',
          customer: null,
          items: [
            {
              item_code: 'ITEM-2',
              item_name: 'Fries',
              rate: 50,
              qty: 1,
              amount: 50,
              image: null,
              description: '',
              comment: '',
              name: 'invoice-item-2',
              reservation_line_key: null,
            },
          ],
        },
      });

      await usePOSStore.getState().loadTableOrder('T2');
      const item = usePOSStore.getState().activeOrders[0];
      expect(item.reservationLineKey).toBe(item.uniqueId);
    });

    it('resets to an empty cart when the fetched order has no items', async () => {
      (getTableOrder as any).mockResolvedValue({ message: { name: 'ORD-3', items: [] } });
      await usePOSStore.getState().addToOrder(baseItem());
      await usePOSStore.getState().loadTableOrder('T3');
      const state = usePOSStore.getState();
      expect(state.activeOrders).toHaveLength(0);
      expect(state.tableOrder).toBeNull();
      expect(state.orderId).toBeNull();
    });

    it('resets to an empty/error cart state when the API call rejects', async () => {
      (getTableOrder as any).mockRejectedValue(new Error('network error'));
      await usePOSStore.getState().addToOrder(baseItem());
      await usePOSStore.getState().loadTableOrder('T4');
      const state = usePOSStore.getState();
      expect(state.activeOrders).toHaveLength(0);
      expect(state.error).toBe('Failed to load table order');
      expect(state.orderLoading).toBe(false);
    });
  });

  describe('clearTableOrder', () => {
    it('resets order-related state to defaults', async () => {
      await usePOSStore.getState().addToOrder(baseItem());
      usePOSStore.getState().setOrderForUpdate('ORDER-1');
      usePOSStore.getState().clearTableOrder();
      const state = usePOSStore.getState();
      expect(state.tableOrder).toBeNull();
      expect(state.activeOrders).toHaveLength(0);
      expect(state.selectedCustomer).toBeNull();
      expect(state.isUpdatingOrder).toBe(false);
      expect(state.orderId).toBeNull();
      expect(state.noOfPax).toBe(1);
      expect(state.orderComment).toBe('');
    });
  });

  describe('resetOrderState', () => {
    it('resets cart, customer, table, and order-type state after an order', async () => {
      await usePOSStore.getState().addToOrder(baseItem());
      usePOSStore.getState().setSelectedCustomer({ id: 'C1', name: 'Jane', phone: '123' });
      usePOSStore.getState().setSelectedTable('T1', 'R1', true);
      usePOSStore.getState().setOrderForUpdate('ORDER-1');
      usePOSStore.getState().setOrderComment('note');
      usePOSStore.getState().setNoOfPax(4);

      usePOSStore.getState().resetOrderState();

      const state = usePOSStore.getState();
      expect(state.activeOrders).toHaveLength(0);
      expect(state.selectedCustomer).toBeNull();
      expect(state.selectedTable).toBeNull();
      expect(state.selectedRoom).toBeNull();
      expect(state.selectedAggregator).toBeNull();
      expect(state.isUpdatingOrder).toBe(false);
      expect(state.orderId).toBeNull();
      expect(state.orderComment).toBe('');
      expect(state.noOfPax).toBe(1);
    });
  });

  describe('processPayment', () => {
    it('creates a paid order and clears the cart', async () => {
      usePOSStore.setState({ cartId: 'CART-1' });
      await usePOSStore.getState().addToOrder(baseItem({ price: 100, quantity: 2 }));
      await usePOSStore.getState().processPayment('Cash', 200);

      const state = usePOSStore.getState();
      expect(state.orders).toHaveLength(1);
      expect(state.orders[0].status).toBe('paid');
      expect(state.orders[0].totalAmount).toBe(200);
      expect(state.orders[0].paidAmount).toBe(200);
      expect(state.orders[0].paymentMode).toBe('Cash');
      expect(state.activeOrders).toHaveLength(0);
    });

    it('records the selected customer id on the order when present', async () => {
      usePOSStore.setState({ cartId: 'CART-1' });
      usePOSStore.getState().setSelectedCustomer({ id: 'C1', name: 'Jane', phone: '123' });
      await usePOSStore.getState().processPayment('Cash', 50);
      expect(usePOSStore.getState().orders[0].customerId).toBe('C1');
    });
  });

  describe('updateOrderStatus', () => {
    it('updates the status of the matching order only', async () => {
      usePOSStore.setState({ cartId: 'CART-1' });
      await usePOSStore.getState().processPayment('Cash', 100);
      const orderId = usePOSStore.getState().orders[0].id;
      await usePOSStore.getState().updateOrderStatus(orderId, 'completed');
      expect(usePOSStore.getState().orders[0].status).toBe('completed');
    });
  });

  describe('isMenuInteractionDisabled / isOrderInteractionDisabled', () => {
    it('reflects menuLoading/profileLoading and orderLoading flags', () => {
      usePOSStore.setState({ menuLoading: true, profileLoading: false, orderLoading: false });
      expect(usePOSStore.getState().isMenuInteractionDisabled()).toBe(true);
      expect(usePOSStore.getState().isOrderInteractionDisabled()).toBe(false);

      usePOSStore.setState({ menuLoading: false, profileLoading: false, orderLoading: true });
      expect(usePOSStore.getState().isMenuInteractionDisabled()).toBe(false);
      expect(usePOSStore.getState().isOrderInteractionDisabled()).toBe(true);
    });
  });
});
