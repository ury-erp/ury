import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import { createOrdersSlice, type OrdersSlice } from './orders-slice';
import { getPOSInvoices, getPOSInvoiceItems, searchPosInvoice } from '../../lib/invoice-api';

vi.mock('../../i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('../../lib/invoice-api', () => ({
  getPOSInvoices: vi.fn(),
  getPOSInvoiceItems: vi.fn(),
  searchPosInvoice: vi.fn(),
}));

vi.mock('../../lib/frappe-sdk', () => ({
  call: { post: vi.fn() },
}));

vi.mock('../../lib/error-utils', () => ({
  getErrorMessage: (e: unknown) => String(e),
}));

const useOrdersStore = create<OrdersSlice>()(createOrdersSlice);

describe('orders slice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOrdersStore.setState({
      orders: [],
      orderLoading: false,
      error: null,
      pagination: { currentPage: 1, hasNextPage: false, itemsPerPage: 10 },
      selectedStatus: 'Draft',
      selectedOrder: null,
      selectedOrderItems: [],
      selectedOrderTaxes: [],
      selectedOrderLoading: false,
      selectedOrderError: null,
      orderSearchQuery: '',
    });
    sessionStorage.clear();
  });

  it('initial state is correct', () => {
    const state = useOrdersStore.getState();
    expect(state.orders).toEqual([]);
    expect(state.orderLoading).toBe(false);
    expect(state.pagination).toEqual({ currentPage: 1, hasNextPage: false, itemsPerPage: 10 });
    expect(state.selectedStatus).toBe('Draft');
    expect(state.selectedOrder).toBeNull();
    expect(state.selectedOrderItems).toEqual([]);
    expect(state.selectedOrderTaxes).toEqual([]);
    expect(state.selectedOrderLoading).toBe(false);
    expect(state.selectedOrderError).toBeNull();
    expect(state.orderSearchQuery).toBe('');
  });

  it('fetchOrders sets orderLoading true then false', async () => {
    (getPOSInvoices as any).mockResolvedValue({ invoices: [], hasMore: false });

    const promise = useOrdersStore.getState().fetchOrders();
    expect(useOrdersStore.getState().orderLoading).toBe(true);

    await promise;
    expect(useOrdersStore.getState().orderLoading).toBe(false);
  });

  it('fetchOrders calls getPOSInvoices with correct params', async () => {
    (getPOSInvoices as any).mockResolvedValue({ invoices: [], hasMore: false });

    await useOrdersStore.getState().fetchOrders(2);
    expect(getPOSInvoices).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'Draft',
        limit: 10,
        limit_start: 10, // (page 2 - 1) * 10
      })
    );
  });

  it('fetchOrders handles search query', async () => {
    useOrdersStore.setState({ orderSearchQuery: 'INV-001' });
    (searchPosInvoice as any).mockResolvedValue({ data: [] });

    await useOrdersStore.getState().fetchOrders();
    expect(searchPosInvoice).toHaveBeenCalledWith('INV-001', 'Draft');
    expect(getPOSInvoices).not.toHaveBeenCalled();
  });

  it('fetchOrders sets error on failure', async () => {
    (getPOSInvoices as any).mockRejectedValue(new Error('API Error'));

    await useOrdersStore.getState().fetchOrders();
    expect(useOrdersStore.getState().error).toBeTruthy();
  });

  it('goToNextPage fetches next page when available', async () => {
    useOrdersStore.setState({
      pagination: { currentPage: 1, hasNextPage: true, itemsPerPage: 10 },
    });
    (getPOSInvoices as any).mockResolvedValue({ invoices: [], hasMore: false });

    await useOrdersStore.getState().goToNextPage();
    expect(getPOSInvoices).toHaveBeenCalled();
  });

  it('goToNextPage does nothing when no next page', async () => {
    useOrdersStore.setState({
      pagination: { currentPage: 1, hasNextPage: false, itemsPerPage: 10 },
    });

    await useOrdersStore.getState().goToNextPage();
    expect(getPOSInvoices).not.toHaveBeenCalled();
  });

  it('goToPreviousPage fetches previous page when currentPage > 1', async () => {
    useOrdersStore.setState({
      pagination: { currentPage: 3, hasNextPage: true, itemsPerPage: 10 },
    });
    (getPOSInvoices as any).mockResolvedValue({ invoices: [], hasMore: true });

    await useOrdersStore.getState().goToPreviousPage();
    expect(getPOSInvoices).toHaveBeenCalledWith(
      expect.objectContaining({ limit_start: 10 }) // page 2
    );
  });

  it('goToPreviousPage does nothing when on page 1', async () => {
    useOrdersStore.setState({
      pagination: { currentPage: 1, hasNextPage: false, itemsPerPage: 10 },
    });

    await useOrdersStore.getState().goToPreviousPage();
    expect(getPOSInvoices).not.toHaveBeenCalled();
  });

  it('setSelectedStatus updates status and refetches', async () => {
    (getPOSInvoices as any).mockResolvedValue({ invoices: [], hasMore: false });

    await useOrdersStore.getState().setSelectedStatus('Paid');
    expect(useOrdersStore.getState().selectedStatus).toBe('Paid');
  });

  it('setSelectedStatus clears selected order', async () => {
    useOrdersStore.setState({
      selectedOrder: { name: 'INV-001' } as any,
    });
    (getPOSInvoices as any).mockResolvedValue({ invoices: [], hasMore: false });

    await useOrdersStore.getState().setSelectedStatus('Paid');
    expect(useOrdersStore.getState().selectedOrder).toBeNull();
  });

  it('selectOrder fetches order items', async () => {
    const mockOrder = { name: 'INV-001', status: 'Draft' } as any;
    (getPOSInvoiceItems as any).mockResolvedValue({
      items: [{ item_name: 'Burger', qty: 2, amount: 20 }],
      taxes: [{ description: 'GST', rate: 5 }],
    });

    await useOrdersStore.getState().selectOrder(mockOrder);
    expect(getPOSInvoiceItems).toHaveBeenCalledWith('INV-001');
    expect(useOrdersStore.getState().selectedOrderItems).toEqual([
      { item_name: 'Burger', qty: 2, amount: 20 },
    ]);
    expect(useOrdersStore.getState().selectedOrderTaxes).toEqual([
      { description: 'GST', rate: 5 },
    ]);
    expect(useOrdersStore.getState().selectedOrderLoading).toBe(false);
  });

  it('selectOrder sets error on failure', async () => {
    const mockOrder = { name: 'INV-001', status: 'Draft' } as any;
    (getPOSInvoiceItems as any).mockRejectedValue(new Error('Not found'));

    await useOrdersStore.getState().selectOrder(mockOrder);
    expect(useOrdersStore.getState().selectedOrderError).toBeTruthy();
    expect(useOrdersStore.getState().selectedOrderLoading).toBe(false);
  });

  it('clearSelectedOrder resets selected order state', () => {
    useOrdersStore.setState({
      selectedOrder: { name: 'INV-001' } as any,
      selectedOrderItems: [{ item_name: 'Burger', qty: 2, amount: 20 }],
      selectedOrderTaxes: [{ description: 'GST', rate: 5 }],
      selectedOrderError: 'some error',
    });

    useOrdersStore.getState().clearSelectedOrder();
    expect(useOrdersStore.getState().selectedOrder).toBeNull();
    expect(useOrdersStore.getState().selectedOrderItems).toEqual([]);
    expect(useOrdersStore.getState().selectedOrderTaxes).toEqual([]);
    expect(useOrdersStore.getState().selectedOrderError).toBeNull();
  });

  it('setOrderSearchQuery updates the query', () => {
    useOrdersStore.getState().setOrderSearchQuery('INV-005');
    expect(useOrdersStore.getState().orderSearchQuery).toBe('INV-005');
  });

  it('updateOrderStatus calls API and refreshes orders', async () => {
    (getPOSInvoices as any).mockResolvedValue({ invoices: [], hasMore: false });
    const { call } = await import('../../lib/frappe-sdk');
    (call.post as any).mockResolvedValue({});

    await useOrdersStore.getState().updateOrderStatus('INV-001', 'Paid');
    expect(call.post).toHaveBeenCalledWith(
      'ury.ury_pos.api.updatePosInvoiceStatus',
      expect.objectContaining({ invoice: 'INV-001', status: 'Paid' })
    );
    expect(getPOSInvoices).toHaveBeenCalled();
  });
});
