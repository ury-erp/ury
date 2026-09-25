import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';

const callPostMock = vi.fn();

vi.mock('@ury/core', () => ({
  call: {
    post: (...args: any[]) => callPostMock(...args),
  },
}));

const getPOSInvoicesMock = vi.fn();
const getPOSInvoiceItemsMock = vi.fn();
const getSplitGroupMock = vi.fn();
const mapSplitGroupInvoiceToPOSInvoiceMock = vi.fn();
const searchPosInvoiceMock = vi.fn();

vi.mock('../../lib/invoice-api', () => ({
  getPOSInvoices: (...args: any[]) => getPOSInvoicesMock(...args),
  getPOSInvoiceItems: (...args: any[]) => getPOSInvoiceItemsMock(...args),
  getSplitGroup: (...args: any[]) => getSplitGroupMock(...args),
  mapSplitGroupInvoiceToPOSInvoice: (...args: any[]) => mapSplitGroupInvoiceToPOSInvoiceMock(...args),
  searchPosInvoice: (...args: any[]) => searchPosInvoiceMock(...args),
}));

import { createOrdersSlice, OrdersSlice, POSInvoice } from './orders-slice';

const buildOrder = (overrides: Partial<POSInvoice> = {}): POSInvoice => ({
  name: 'POS-INV-001',
  invoice_printed: 0,
  grand_total: 100,
  restaurant_table: null,
  cashier: 'cashier-1',
  waiter: 'waiter-1',
  net_total: 90,
  posting_time: '10:00:00',
  total_taxes_and_charges: 10,
  customer: 'Walk-in',
  status: 'Draft',
  mobile_number: '',
  posting_date: '2026-01-01',
  rounded_total: 100,
  order_type: 'Dine In' as any,
  ...overrides,
});

const makeStore = () => create<OrdersSlice>()((...a) => createOrdersSlice(...a));

describe('orders-slice', () => {
  beforeEach(() => {
    callPostMock.mockReset();
    getPOSInvoicesMock.mockReset();
    getPOSInvoiceItemsMock.mockReset();
    getSplitGroupMock.mockReset();
    mapSplitGroupInvoiceToPOSInvoiceMock.mockReset();
    searchPosInvoiceMock.mockReset();
    sessionStorage.clear();
  });

  describe('initial state', () => {
    it('starts with an empty/default state', () => {
      const store = makeStore();
      const state = store.getState();
      expect(state.orders).toEqual([]);
      expect(state.orderLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.pagination).toEqual({ currentPage: 1, hasNextPage: false, itemsPerPage: 10 });
      expect(state.selectedStatus).toBe('Draft');
      expect(state.selectedOrder).toBeNull();
      expect(state.selectedOrderItems).toEqual([]);
      expect(state.selectedOrderTaxes).toEqual([]);
      expect(state.selectedOrderLoading).toBe(false);
      expect(state.selectedOrderError).toBeNull();
      expect(state.orderSearchQuery).toBe('');
    });
  });

  describe('fetchOrders', () => {
    it('fetches default orders and updates pagination from the API', async () => {
      const order = buildOrder();
      getPOSInvoicesMock.mockResolvedValueOnce({ invoices: [order], hasMore: true });
      const store = makeStore();

      await store.getState().fetchOrders();

      expect(getPOSInvoicesMock).toHaveBeenCalledWith({
        status: 'Draft',
        limit: 10,
        limit_start: 0,
        paid_limit: undefined,
      });
      const state = store.getState();
      expect(state.orders).toEqual([order]);
      expect(state.pagination).toEqual({ currentPage: 1, hasNextPage: true, itemsPerPage: 10 });
      expect(state.orderLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('computes limit_start from the requested page', async () => {
      getPOSInvoicesMock.mockResolvedValueOnce({ invoices: [], hasMore: false });
      const store = makeStore();

      await store.getState().fetchOrders(3);

      expect(getPOSInvoicesMock).toHaveBeenCalledWith(
        expect.objectContaining({ limit_start: 20, limit: 10 })
      );
      expect(store.getState().pagination.currentPage).toBe(3);
    });

    it('reads paid_limit from the posProfile in sessionStorage', async () => {
      sessionStorage.setItem('posProfile', JSON.stringify({ paid_limit: 500 }));
      getPOSInvoicesMock.mockResolvedValueOnce({ invoices: [], hasMore: false });
      const store = makeStore();

      await store.getState().fetchOrders();

      expect(getPOSInvoicesMock).toHaveBeenCalledWith(
        expect.objectContaining({ paid_limit: 500 })
      );
    });

    it('uses the search API when orderSearchQuery is set, resetting pagination', async () => {
      const order = buildOrder({ name: 'POS-INV-SEARCH' });
      searchPosInvoiceMock.mockResolvedValueOnce({ data: [order] });
      const store = makeStore();
      store.getState().setOrderSearchQuery('  some query  ');

      await store.getState().fetchOrders(5);

      expect(searchPosInvoiceMock).toHaveBeenCalledWith('  some query  ', 'Draft');
      expect(getPOSInvoicesMock).not.toHaveBeenCalled();
      const state = store.getState();
      expect(state.orders).toEqual([order]);
      expect(state.pagination).toEqual({ currentPage: 1, hasNextPage: false, itemsPerPage: 10 });
    });

    it('falls back to an empty array when search returns no data', async () => {
      searchPosInvoiceMock.mockResolvedValueOnce({});
      const store = makeStore();
      store.getState().setOrderSearchQuery('abc');

      await store.getState().fetchOrders();

      expect(store.getState().orders).toEqual([]);
    });

    it('does not use the search API for a whitespace-only query', async () => {
      getPOSInvoicesMock.mockResolvedValueOnce({ invoices: [], hasMore: false });
      const store = makeStore();
      store.getState().setOrderSearchQuery('   ');

      await store.getState().fetchOrders();

      expect(searchPosInvoiceMock).not.toHaveBeenCalled();
      expect(getPOSInvoicesMock).toHaveBeenCalled();
    });

    it('sets error and clears loading when the fetch fails with an Error', async () => {
      getPOSInvoicesMock.mockRejectedValueOnce(new Error('network down'));
      const store = makeStore();

      await store.getState().fetchOrders();

      const state = store.getState();
      expect(state.error).toBe('network down');
      expect(state.orderLoading).toBe(false);
    });

    it('sets a generic error message when a non-Error is thrown', async () => {
      getPOSInvoicesMock.mockRejectedValueOnce('boom');
      const store = makeStore();

      await store.getState().fetchOrders();

      expect(store.getState().error).toBe('Failed to fetch orders');
    });
  });

  describe('pagination', () => {
    it('goToNextPage advances the page when hasNextPage is true', async () => {
      getPOSInvoicesMock
        .mockResolvedValueOnce({ invoices: [], hasMore: true })
        .mockResolvedValueOnce({ invoices: [], hasMore: false });
      const store = makeStore();
      await store.getState().fetchOrders(1);

      await store.getState().goToNextPage();

      expect(getPOSInvoicesMock).toHaveBeenCalledTimes(2);
      expect(store.getState().pagination.currentPage).toBe(2);
    });

    it('goToNextPage is a no-op when hasNextPage is false', async () => {
      const store = makeStore();
      // default pagination: hasNextPage false
      await store.getState().goToNextPage();
      expect(getPOSInvoicesMock).not.toHaveBeenCalled();
    });

    it('goToNextPage is a no-op while orderLoading is true', async () => {
      const store = makeStore();
      store.setState({ orderLoading: true, pagination: { currentPage: 1, hasNextPage: true, itemsPerPage: 10 } });

      await store.getState().goToNextPage();

      expect(getPOSInvoicesMock).not.toHaveBeenCalled();
    });

    it('goToPreviousPage decrements the page when currentPage > 1', async () => {
      getPOSInvoicesMock.mockResolvedValue({ invoices: [], hasMore: false });
      const store = makeStore();
      store.setState({ pagination: { currentPage: 3, hasNextPage: false, itemsPerPage: 10 } });

      await store.getState().goToPreviousPage();

      expect(getPOSInvoicesMock).toHaveBeenCalledWith(expect.objectContaining({ limit_start: 10 }));
      expect(store.getState().pagination.currentPage).toBe(2);
    });

    it('goToPreviousPage is a no-op on the first page', async () => {
      const store = makeStore();
      await store.getState().goToPreviousPage();
      expect(getPOSInvoicesMock).not.toHaveBeenCalled();
    });
  });

  describe('setSelectedStatus', () => {
    it('updates status, clears the selected order, and refetches page 1', async () => {
      getPOSInvoicesMock.mockResolvedValueOnce({ invoices: [], hasMore: false });
      const store = makeStore();
      store.setState({
        selectedOrder: buildOrder(),
        selectedOrderItems: [{ item_code: 'x' } as any],
        pagination: { currentPage: 4, hasNextPage: true, itemsPerPage: 10 },
      });

      await store.getState().setSelectedStatus('Paid');

      const state = store.getState();
      expect(state.selectedStatus).toBe('Paid');
      expect(state.selectedOrder).toBeNull();
      expect(state.selectedOrderItems).toEqual([]);
      expect(getPOSInvoicesMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'Paid', limit_start: 0 }));
      expect(state.pagination.currentPage).toBe(1);
    });
  });

  describe('selectOrder', () => {
    it('fetches items/taxes and merges split-group data when the order is part of a split', async () => {
      const order = buildOrder({ name: 'POS-INV-001' });
      const items = [{ item_code: 'ITEM-1' } as any];
      const taxes = [{ account_head: 'VAT' } as any];
      getPOSInvoiceItemsMock.mockResolvedValueOnce({ items, taxes });
      const splitInvoice = { name: 'POS-INV-001', split_index: 1 };
      getSplitGroupMock.mockResolvedValueOnce({ invoices: [splitInvoice], current: order.name, group: 'grp-1' });
      const mergedFields = { split_index: 1, split_total: 2 };
      mapSplitGroupInvoiceToPOSInvoiceMock.mockReturnValueOnce(mergedFields);

      const store = makeStore();
      store.setState({ orders: [order] });

      await store.getState().selectOrder(order);

      const state = store.getState();
      expect(state.selectedOrder).toEqual({ ...order, ...mergedFields });
      expect(state.selectedOrderItems).toEqual(items);
      expect(state.selectedOrderTaxes).toEqual(taxes);
      expect(state.selectedOrderLoading).toBe(false);
      expect(state.orders[0]).toEqual({ ...order, ...mergedFields });
    });

    it('keeps the order unmodified when it has no split-group match', async () => {
      const order = buildOrder();
      getPOSInvoiceItemsMock.mockResolvedValueOnce({ items: [], taxes: [] });
      getSplitGroupMock.mockResolvedValueOnce({ invoices: [], current: order.name, group: null });

      const store = makeStore();
      store.setState({ orders: [order] });

      await store.getState().selectOrder(order);

      const state = store.getState();
      expect(state.selectedOrder).toEqual(order);
      expect(state.orders[0]).toEqual(order);
      expect(mapSplitGroupInvoiceToPOSInvoiceMock).not.toHaveBeenCalled();
    });

    it('falls back to an empty split group when getSplitGroup rejects', async () => {
      const order = buildOrder();
      getPOSInvoiceItemsMock.mockResolvedValueOnce({ items: [], taxes: [] });
      getSplitGroupMock.mockRejectedValueOnce(new Error('no split group'));

      const store = makeStore();
      await store.getState().selectOrder(order);

      const state = store.getState();
      expect(state.selectedOrder).toEqual(order);
      expect(state.selectedOrderError).toBeNull();
      expect(state.selectedOrderLoading).toBe(false);
    });

    it('sets selectedOrderError and clears loading when getPOSInvoiceItems fails', async () => {
      const order = buildOrder();
      getPOSInvoiceItemsMock.mockRejectedValueOnce(new Error('items unavailable'));
      getSplitGroupMock.mockResolvedValueOnce({ invoices: [], current: order.name, group: null });

      const store = makeStore();
      await store.getState().selectOrder(order);

      const state = store.getState();
      expect(state.selectedOrderError).toBe('items unavailable');
      expect(state.selectedOrderLoading).toBe(false);
    });

    it('sets a generic selectedOrderError when a non-Error is thrown', async () => {
      const order = buildOrder();
      getPOSInvoiceItemsMock.mockRejectedValueOnce('boom');
      getSplitGroupMock.mockResolvedValueOnce({ invoices: [], current: order.name, group: null });

      const store = makeStore();
      await store.getState().selectOrder(order);

      expect(store.getState().selectedOrderError).toBe('Failed to fetch order details');
    });
  });

  describe('clearSelectedOrder', () => {
    it('resets the selected-order fields only', () => {
      const store = makeStore();
      store.setState({
        selectedOrder: buildOrder(),
        selectedOrderItems: [{ item_code: 'x' } as any],
        selectedOrderTaxes: [{ account_head: 'VAT' } as any],
        selectedOrderError: 'boom',
        orders: [buildOrder()],
      });

      store.getState().clearSelectedOrder();

      const state = store.getState();
      expect(state.selectedOrder).toBeNull();
      expect(state.selectedOrderItems).toEqual([]);
      expect(state.selectedOrderTaxes).toEqual([]);
      expect(state.selectedOrderError).toBeNull();
      // Unrelated state must be preserved.
      expect(state.orders).toHaveLength(1);
    });
  });

  describe('updateOrderStatus', () => {
    it('posts the status update then refetches the current page', async () => {
      callPostMock.mockResolvedValueOnce({});
      getPOSInvoicesMock.mockResolvedValueOnce({ invoices: [], hasMore: false });
      const store = makeStore();
      store.setState({ pagination: { currentPage: 2, hasNextPage: false, itemsPerPage: 10 } });

      await store.getState().updateOrderStatus('POS-INV-001', 'Paid');

      expect(callPostMock).toHaveBeenCalledWith('ury.ury_pos.api.updatePosInvoiceStatus', {
        invoice: 'POS-INV-001',
        status: 'Paid',
      });
      expect(getPOSInvoicesMock).toHaveBeenCalledWith(expect.objectContaining({ limit_start: 10 }));
      expect(store.getState().orderLoading).toBe(false);
    });

    it('sets error and clears loading when the API call fails', async () => {
      callPostMock.mockRejectedValueOnce(new Error('server rejected'));
      const store = makeStore();

      await store.getState().updateOrderStatus('POS-INV-001', 'Paid');

      const state = store.getState();
      expect(state.error).toBe('server rejected');
      expect(state.orderLoading).toBe(false);
      expect(getPOSInvoicesMock).not.toHaveBeenCalled();
    });

    it('sets a generic error message when a non-Error is thrown', async () => {
      callPostMock.mockRejectedValueOnce('boom');
      const store = makeStore();

      await store.getState().updateOrderStatus('POS-INV-001', 'Paid');

      expect(store.getState().error).toBe('Failed to update order status');
    });
  });

  describe('setOrderSearchQuery', () => {
    it('stores the query verbatim, including empty string', () => {
      const store = makeStore();
      store.getState().setOrderSearchQuery('burger');
      expect(store.getState().orderSearchQuery).toBe('burger');
      store.getState().setOrderSearchQuery('');
      expect(store.getState().orderSearchQuery).toBe('');
    });
  });
});
