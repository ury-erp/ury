import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ury/core', () => ({
  call: { get: vi.fn(), post: vi.fn() },
  storage: { setItem: vi.fn(), getItem: vi.fn() },
  siteCurrencyCode: () => null,
  currencyDisplaySymbol: () => '',
}));
vi.mock('../lib/menu-api', () => ({
  getRestaurantMenu: vi.fn(async () => []),
  getAggregatorMenu: vi.fn(async () => []),
}));
vi.mock('../lib/pos-profile-api', () => ({
  getCombinedPosProfile: vi.fn(),
  getCurrencyInfo: vi.fn(),
}));
vi.mock('../lib/menu-course-api', () => ({ getMenuCourses: vi.fn(async () => []) }));
vi.mock('../lib/customer-api', () => ({
  getCustomerGroups: vi.fn(async () => []),
  getCustomerTerritories: vi.fn(async () => []),
}));
vi.mock('../lib/payment-api', () => ({ getPaymentModes: vi.fn(async () => []) }));
const getTableOrderMock = vi.fn();
vi.mock('../lib/order-api', () => ({
  getTableOrder: (...a: unknown[]) => getTableOrderMock(...a),
}));

import { usePOSStore } from './pos-store';

const walkIn = { customer: 'CUST-WALK', customer_name: 'Walk-In Customer', mobile_number: '000' };
const regular = { customer: 'CUST-REG', customer_name: 'Regular', mobile_number: '999' };
const WALK_IN = { id: 'CUST-WALK', name: 'Walk-In Customer', phone: '000' };
const REGULAR = { id: 'CUST-REG', name: 'Regular', phone: '999' };
const PICKED = { id: 'CUST-PICK', name: 'Picked', phone: '123' };

function setProfile(config: object) {
  usePOSStore.setState({ posProfile: { name: 'P', ...config } as never });
}

describe('pos-store default customer', () => {
  beforeEach(() => {
    getTableOrderMock.mockReset();
    usePOSStore.setState({
      selectedCustomer: null,
      customerSource: 'auto',
      isUpdatingOrder: false,
      selectedOrderType: 'Dine In',
      selectedTable: null,
      activeOrders: [],
      orderId: null,
    });
    setProfile({ order_type_customer_map: { 'Take Away': walkIn }, default_customer: regular });
  });

  it('sets the order-type default when the order type changes on a new order', () => {
    usePOSStore.getState().setSelectedOrderType('Take Away');
    expect(usePOSStore.getState().selectedCustomer).toEqual(WALK_IN);
    expect(usePOSStore.getState().customerSource).toBe('auto');
  });

  it('falls back to the profile default when the type has no entry', () => {
    usePOSStore.getState().setSelectedOrderType('Delivery');
    expect(usePOSStore.getState().selectedCustomer).toEqual(REGULAR);
  });

  it('clears the customer when nothing is configured', () => {
    setProfile({ order_type_customer_map: {}, default_customer: null });
    usePOSStore.setState({ selectedCustomer: WALK_IN });
    usePOSStore.getState().setSelectedOrderType('Delivery');
    expect(usePOSStore.getState().selectedCustomer).toBeNull();
  });

  it('follows the default across order types while the customer is auto-set', () => {
    const s = usePOSStore.getState();
    s.setSelectedOrderType('Take Away');
    expect(usePOSStore.getState().selectedCustomer).toEqual(WALK_IN);
    usePOSStore.getState().setSelectedOrderType('Delivery');
    expect(usePOSStore.getState().selectedCustomer).toEqual(REGULAR);
  });

  it('keeps a manually picked customer when the order type changes', () => {
    usePOSStore.getState().setSelectedCustomer(PICKED);
    usePOSStore.getState().setSelectedOrderType('Take Away');
    expect(usePOSStore.getState().selectedCustomer).toEqual(PICKED);
    expect(usePOSStore.getState().customerSource).toBe('manual');
  });

  it('keeps a manually cleared customer when the order type changes', () => {
    usePOSStore.getState().setSelectedCustomer(null);
    usePOSStore.getState().setSelectedOrderType('Take Away');
    expect(usePOSStore.getState().selectedCustomer).toBeNull();
  });

  it('never changes the customer of an order being updated', () => {
    usePOSStore.setState({ selectedCustomer: PICKED, isUpdatingOrder: true, customerSource: 'order' });
    usePOSStore.getState().setSelectedOrderType('Take Away');
    expect(usePOSStore.getState().selectedCustomer).toEqual(PICKED);
  });

  it('never changes a customer loaded from an existing order', () => {
    usePOSStore.setState({ selectedCustomer: PICKED, customerSource: 'order', isUpdatingOrder: false });
    usePOSStore.getState().setSelectedOrderType('Take Away');
    expect(usePOSStore.getState().selectedCustomer).toEqual(PICKED);
  });

  it('does not resolve a customer for Aggregators', () => {
    usePOSStore.getState().setSelectedOrderType('Aggregators');
    expect(usePOSStore.getState().selectedCustomer).toBeNull();
  });

  it('applyAutoCustomer preselects on profile load and respects manual picks', () => {
    usePOSStore.setState({ selectedOrderType: 'Take Away' });
    usePOSStore.getState().applyAutoCustomer();
    expect(usePOSStore.getState().selectedCustomer).toEqual(WALK_IN);

    usePOSStore.getState().setSelectedCustomer(PICKED);
    usePOSStore.getState().applyAutoCustomer();
    expect(usePOSStore.getState().selectedCustomer).toEqual(PICKED);
  });

  it('resetOrderState returns to the default for the default order type', () => {
    usePOSStore.getState().setSelectedCustomer(PICKED);
    usePOSStore.getState().resetOrderState();
    // DEFAULT_ORDER_TYPE is Take Away
    expect(usePOSStore.getState().selectedCustomer).toEqual(WALK_IN);
    expect(usePOSStore.getState().customerSource).toBe('auto');
  });

  it('clearTableOrder returns to the default for the current order type', () => {
    usePOSStore.setState({ selectedOrderType: 'Delivery', selectedCustomer: PICKED, customerSource: 'manual' });
    usePOSStore.getState().clearTableOrder();
    expect(usePOSStore.getState().selectedCustomer).toEqual(REGULAR);
    expect(usePOSStore.getState().customerSource).toBe('auto');
  });

  it('loading an existing table order keeps that order\'s customer', async () => {
    getTableOrderMock.mockResolvedValue({
      message: {
        name: 'INV-1',
        customer: 'CUST-OLD',
        customer_name: 'Old Customer',
        mobile_number: '555',
        items: [{ item_code: 'I', item_name: 'Item', rate: 1, qty: 1, amount: 1 }],
      },
    });
    usePOSStore.setState({ selectedOrderType: 'Take Away' });
    await usePOSStore.getState().loadTableOrder('T1');
    const state = usePOSStore.getState();
    expect(state.selectedCustomer).toEqual({ id: 'CUST-OLD', name: 'Old Customer', phone: '555' });
    expect(state.customerSource).toBe('order');
    state.setSelectedOrderType('Delivery');
    expect(usePOSStore.getState().selectedCustomer?.id).toBe('CUST-OLD');
  });

  it('entering an empty table preselects the default for the current order type', async () => {
    getTableOrderMock.mockResolvedValue({ message: null });
    usePOSStore.setState({ selectedOrderType: 'Take Away', selectedCustomer: PICKED, customerSource: 'manual' });
    await usePOSStore.getState().loadTableOrder('T2');
    expect(usePOSStore.getState().selectedCustomer).toEqual(WALK_IN);
    expect(usePOSStore.getState().customerSource).toBe('auto');
  });
});
