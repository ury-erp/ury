import { StateCreator } from 'zustand';
import { call } from '../../lib/frappe-sdk';
import { getPOSInvoices, getPOSInvoiceItems, searchPosInvoice, POSInvoiceItem, POSInvoiceTax } from '../../lib/invoice-api';
import type { POSInvoice } from '../../lib/invoice-api';
import { getErrorMessage } from '../../lib/error-utils';

export interface OrdersState {
  orders: POSInvoice[];
  orderLoading: boolean;
  error: string | null;
  pagination: {
    currentPage: number;
    hasNextPage: boolean;
    itemsPerPage: number;
  };
  selectedStatus: 'Draft' | 'Unbilled' | 'Recently Paid' | 'Paid' | 'Consolidated' | 'Return';
  selectedOrder: POSInvoice | null;
  selectedOrderItems: POSInvoiceItem[];
  selectedOrderTaxes: POSInvoiceTax[];
  selectedOrderLoading: boolean;
  selectedOrderError: string | null;
  orderSearchQuery: string;
}

export interface OrdersActions {
  fetchOrders: (page?: number) => Promise<void>;
  updateOrderStatus: (orderId: string, status: POSInvoice['status']) => Promise<void>;
  goToNextPage: () => Promise<void>;
  goToPreviousPage: () => Promise<void>;
  setSelectedStatus: (status: POSInvoice['status']) => Promise<void>;
  selectOrder: (order: POSInvoice) => Promise<void>;
  clearSelectedOrder: () => void;
  setOrderSearchQuery: (query: string) => void;
}

export type OrdersSlice = OrdersState & OrdersActions;

const ITEMS_PER_PAGE = 10;

export const createOrdersSlice: StateCreator<
  OrdersSlice,
  [],
  [],
  OrdersSlice
> = (set, get) => ({
  // Initial state
  orders: [],
  orderLoading: false,
  error: null,
  pagination: {
    currentPage: 1,
    hasNextPage: false,
    itemsPerPage: ITEMS_PER_PAGE,
  },
  selectedStatus: 'Draft',
  selectedOrder: null,
  selectedOrderItems: [],
  selectedOrderTaxes: [],
  selectedOrderLoading: false,
  selectedOrderError: null,
  orderSearchQuery: '',

  // Actions
  fetchOrders: async (page = 1) => {
    try {
      set({ orderLoading: true, error: null });
      const { orderSearchQuery, selectedStatus } = get();
      
      // Get POS profile to access paid_limit
      const posProfile = sessionStorage.getItem('posProfile');
      let paidLimit: number | undefined;
      if (posProfile) {
        try {
          const profile = JSON.parse(posProfile);
          paidLimit = profile?.paid_limit;
        } catch {
          sessionStorage.removeItem('posProfile');
        }
      }
      
      if (orderSearchQuery && orderSearchQuery.trim()) {
        // Use search API
        const res = await searchPosInvoice(orderSearchQuery, selectedStatus);
        set({
          orders: res.data || [],
          pagination: {
            currentPage: 1,
            hasNextPage: false,
            itemsPerPage: ITEMS_PER_PAGE,
          },
          orderLoading: false
        });
        return;
      }
      // Default fetch
      const limitStart = (page - 1) * ITEMS_PER_PAGE;
      const status = selectedStatus;
      const { invoices, hasMore } = await getPOSInvoices({
        status,
        limit: ITEMS_PER_PAGE,
        limit_start: limitStart,
        paid_limit: paidLimit
      });
      set({ 
        orders: invoices,
        pagination: {
          currentPage: page,
          hasNextPage: hasMore,
          itemsPerPage: ITEMS_PER_PAGE,
        },
        orderLoading: false 
      });
    } catch (error) {
      set({ 
        error: getErrorMessage(error),
        orderLoading: false 
      });
    }
  },

  goToNextPage: async () => {
    const { pagination, orderLoading } = get();
    if (!orderLoading && pagination.hasNextPage) {
      await get().fetchOrders(pagination.currentPage + 1);
    }
  },

  goToPreviousPage: async () => {
    const { pagination, orderLoading } = get();
    if (!orderLoading && pagination.currentPage > 1) {
      await get().fetchOrders(pagination.currentPage - 1);
    }
  },

  setSelectedStatus: async (status) => {
    set({ selectedStatus: status });
    // Clear selected order when status changes
    get().clearSelectedOrder();
    await get().fetchOrders(1); // Reset to first page when status changes
  },

  selectOrder: async (order) => {
    try {
      set({ 
        selectedOrder: order,
        selectedOrderLoading: true, 
        selectedOrderError: null 
      });

      const { items, taxes } = await getPOSInvoiceItems(order.name);
      
      set({ 
        selectedOrderItems: items,
        selectedOrderTaxes: taxes,
        selectedOrderLoading: false 
      });
    } catch (error) {
      set({ 
        selectedOrderError: getErrorMessage(error),
        selectedOrderLoading: false 
      });
    }
  },

  clearSelectedOrder: () => {
    set({ 
      selectedOrder: null,
      selectedOrderItems: [],
      selectedOrderTaxes: [],
      selectedOrderError: null 
    });
  },

  updateOrderStatus: async (orderId: string, status: POSInvoice['status']) => {
    try {
      set({ orderLoading: true, error: null });

      await call.post('ury.ury_pos.api.updatePosInvoiceStatus', {
        invoice: orderId,
        status,
      });

      // Refresh the orders list after status update
      await get().fetchOrders(get().pagination.currentPage);
      
      set({ orderLoading: false });
    } catch (error) {
      set({ 
        error: getErrorMessage(error),
        orderLoading: false 
      });
    }
  },

  setOrderSearchQuery: (query) => set({ orderSearchQuery: query }),
}); 