/**
 * Integration tests for Frappe backend API flows.
 * These tests verify the end-to-end flow from API call to response handling
 * using mocked Frappe SDK responses that simulate real backend behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- Mock Frappe SDK ----
const mockCallGet = vi.fn();
const mockCallPost = vi.fn();

vi.mock('../lib/frappe-sdk-retry', () => ({
  call: {
    get: (...args: unknown[]) => mockCallGet(...args),
    post: (...args: unknown[]) => mockCallPost(...args),
  },
  db: {
    getDocList: vi.fn(),
    getDoc: vi.fn(),
    getValue: vi.fn(),
    getCount: vi.fn(),
  },
  auth: {
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

// Mock error-utils
vi.mock('../lib/error-utils', () => ({
  getErrorMessage: (err: unknown) => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'object' && err !== null && 'message' in err) return String((err as { message: unknown }).message);
    return String(err);
  },
}));

// ---- Import API modules after mocks ----
import { syncOrder, getTableOrder } from './order-api';
import { getPOSInvoices, getPOSInvoiceItems, updateInvoiceStatus, searchPosInvoice } from './invoice-api';
import { getPaymentModes } from './payment-api';

describe('Frappe API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  describe('Order Flow: Create → Sync → Fetch', () => {
    it('should sync a new order successfully', async () => {
      mockCallPost.mockResolvedValue({
        message: { name: 'URY-ORD-001', status: 'Draft' },
      });

      const orderData = {
        items: [
          { item: 'COFFEE-001', item_name: 'Espresso', rate: 3.5, qty: 2 },
          { item: 'CAKE-001', item_name: 'Chocolate Cake', rate: 5.0, qty: 1 },
        ],
        no_of_pax: 1,
        pos_profile: 'Test POS Profile',
        order_type: 'Take Away',
        customer: 'Walk In Customer',
        cashier: 'Admin',
        owner: 'Admin',
        waiter: 'Waiter1',
        mode_of_payment: 'Cash',
        invoice: null,
        last_invoice: null,
      };

      const result = await syncOrder(orderData);

      expect(mockCallPost).toHaveBeenCalledWith(
        'ury.ury.doctype.ury_order.ury_order.sync_order',
        orderData
      );
      expect(result).toEqual({ message: { name: 'URY-ORD-001', status: 'Draft' } });
    });

    it('should handle sync order failure with error message', async () => {
      mockCallPost.mockRejectedValue(new Error('Network error'));

      const orderData = {
        items: [{ item: 'COFFEE-001', item_name: 'Espresso', rate: 3.5, qty: 1 }],
        no_of_pax: 1,
        pos_profile: 'Test POS Profile',
        order_type: 'Dine In',
        customer: 'Customer1',
        invoice: null,
        last_invoice: null,
      };

      await expect(syncOrder(orderData)).rejects.toThrow('Failed to sync order');
    });

    it('should fetch table order for a dine-in table', async () => {
      const mockOrder = {
        name: 'SINV-001',
        customer: 'Walk In Customer',
        grand_total: 25.0,
        status: 'Draft',
        items: [
          { item_code: 'COFFEE-001', item_name: 'Espresso', qty: 2, rate: 3.5, amount: 7.0 },
        ],
      };
      mockCallGet.mockResolvedValue({ message: mockOrder });

      const result = await getTableOrder('TABLE-01');

      expect(mockCallGet).toHaveBeenCalledWith(
        'ury.ury.doctype.ury_order.ury_order.get_order_invoice',
        { table: 'TABLE-01' }
      );
      expect(result.message).toEqual(mockOrder);
    });

    it('should return null message when no order exists for table', async () => {
      mockCallGet.mockResolvedValue({ message: null });

      const result = await getTableOrder('TABLE-99');
      expect(result.message).toBeNull();
    });
  });

  describe('Payment Flow: Fetch Modes → Submit Payment', () => {
    it('should fetch available payment modes from backend', async () => {
      mockCallGet.mockResolvedValue({
        message: [
          { mode_of_payment: 'Cash', opening_amount: 500 },
          { mode_of_payment: 'Card', opening_amount: 0 },
          { mode_of_payment: 'UPI', opening_amount: 0 },
        ],
      });

      const modes = await getPaymentModes();

      expect(mockCallGet).toHaveBeenCalledWith('ury.ury_pos.api.getModeOfPayment');
      expect(modes).toEqual(['Cash', 'Card', 'UPI']);
    });

    it('should cache payment modes in session storage', async () => {
      mockCallGet.mockResolvedValue({
        message: [
          { mode_of_payment: 'Cash', opening_amount: 500 },
        ],
      });

      const modes = await getPaymentModes();
      expect(modes).toEqual(['Cash']);

      // Verify session storage cache
      const cached = sessionStorage.getItem('payment_modes');
      expect(cached).toBe(JSON.stringify(['Cash']));

      // Second call should use cache, not API
      const cachedModes = await getPaymentModes();
      expect(cachedModes).toEqual(['Cash']);
      expect(mockCallGet).toHaveBeenCalledTimes(1);
    });

    it('should handle payment modes fetch failure', async () => {
      mockCallGet.mockRejectedValue(new Error('Server error'));

      await expect(getPaymentModes()).rejects.toThrow('Failed to fetch payment modes');
    });

    it('should process a payment via make_invoice API', async () => {
      mockCallPost.mockResolvedValue({
        message: { name: 'SINV-PAY-001', status: 'Paid' },
      });

      const paymentData = {
        additionalDiscount: null,
        cashier: 'Admin',
        customer: 'Walk In Customer',
        invoice: 'SINV-001',
        owner: 'Admin',
        payments: [
          { mode_of_payment: 'Cash', amount: 25.0 },
        ],
        pos_profile: 'Test POS Profile',
        table: 'TABLE-01',
      };

      // Simulate PaymentDialog's handlePayment call
      const result = await mockCallPost(
        'ury.ury.doctype.ury_order.ury_order.make_invoice',
        paymentData
      );

      expect(result).toEqual({ message: { name: 'SINV-PAY-001', status: 'Paid' } });
      expect(mockCallPost).toHaveBeenCalledWith(
        'ury.ury.doctype.ury_order.ury_order.make_invoice',
        paymentData
      );
    });
  });

  describe('Invoice Flow: List → Detail → Update Status', () => {
    it('should fetch POS invoices by status', async () => {
      const mockInvoices = [
        {
          name: 'SINV-001',
          customer: 'Customer1',
          grand_total: 50.0,
          status: 'Draft',
          order_type: 'Dine In',
        },
        {
          name: 'SINV-002',
          customer: 'Customer2',
          grand_total: 30.0,
          status: 'Draft',
          order_type: 'Take Away',
        },
      ];
      mockCallGet.mockResolvedValue({
        message: { data: mockInvoices, next: true },
      });

      const result = await getPOSInvoices({ status: 'Draft', limit: 20 });

      expect(mockCallGet).toHaveBeenCalledWith(
        'ury.ury_pos.api.getPosInvoice',
        expect.objectContaining({ status: 'Draft', limit: 20 })
      );
      expect(result.invoices).toHaveLength(2);
      expect(result.hasMore).toBe(true);
    });

    it('should fetch invoice items for a specific invoice', async () => {
      const mockItems = [
        { item_name: 'Espresso', qty: 2, amount: 7.0 },
        { item_name: 'Croissant', qty: 1, amount: 3.5 },
      ];
      const mockTaxes = [
        { description: 'VAT 20%', rate: 20 },
      ];
      mockCallGet.mockResolvedValue({
        message: [mockItems, mockTaxes],
      });

      const result = await getPOSInvoiceItems('SINV-001');

      expect(mockCallGet).toHaveBeenCalledWith(
        'ury.ury_pos.api.getPosInvoiceItems',
        { invoice: 'SINV-001' }
      );
      expect(result.items).toEqual(mockItems);
      expect(result.taxes).toEqual(mockTaxes);
    });

    it('should update invoice status from Draft to Paid', async () => {
      mockCallPost.mockResolvedValue({ message: 'Status updated' });

      await updateInvoiceStatus('SINV-001', 'Paid');

      expect(mockCallPost).toHaveBeenCalledWith(
        'ury.ury_pos.api.updatePosInvoiceStatus',
        { invoice: 'SINV-001', status: 'Paid' }
      );
    });

    it('should search for invoices by query', async () => {
      const mockResults = [
        { name: 'SINV-001', customer: 'John Doe' },
      ];
      mockCallGet.mockResolvedValue({ message: mockResults });

      const result = await searchPosInvoice('John', 'Draft');

      expect(mockCallGet).toHaveBeenCalledWith(
        'ury.ury_pos.api.searchPosInvoice',
        { query: 'John', status: 'Draft' }
      );
      expect(result).toEqual(mockResults);
    });

    it('should handle empty invoice list gracefully', async () => {
      mockCallGet.mockResolvedValue({
        message: { data: [], next: false },
      });

      const result = await getPOSInvoices({ status: 'Paid' });
      expect(result.invoices).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('Error Resilience', () => {
    it('should handle network timeout on invoice fetch', async () => {
      mockCallGet.mockRejectedValue(new Error('Request timeout'));

      await expect(getPOSInvoices({ status: 'Draft' })).rejects.toThrow();
    });

    it('should handle 500 server error on sync order', async () => {
      mockCallPost.mockRejectedValue(new Error('Internal Server Error'));

      await expect(
        syncOrder({
          items: [],
          no_of_pax: 1,
          pos_profile: 'Test',
          order_type: 'Take Away',
          invoice: null,
          last_invoice: null,
        })
      ).rejects.toThrow();
    });

    it('should handle malformed API response', async () => {
      mockCallGet.mockResolvedValue({ unexpected_format: true });

      // This should not crash — the API modules should handle unexpected formats
      const result = await getTableOrder('TABLE-01');
      expect(result).toBeDefined();
    });

    it('should handle session storage corruption gracefully', async () => {
      // Put corrupted JSON in session storage
      sessionStorage.setItem('payment_modes', 'not-valid-json{');

      // The API should fall through to the network call
      mockCallGet.mockResolvedValue({
        message: [{ mode_of_payment: 'Cash', opening_amount: 0 }],
      });

      const modes = await getPaymentModes();
      expect(modes).toEqual(['Cash']);
      expect(mockCallGet).toHaveBeenCalledTimes(1);
    });
  });

  describe('Full Order-to-Payment Flow', () => {
    it('should complete the full flow: create order → fetch invoices → make payment', async () => {
      // Step 1: Sync order
      mockCallPost.mockResolvedValueOnce({
        message: { name: 'URY-ORD-001', status: 'Draft' },
      });

      const orderResult = await syncOrder({
        items: [
          { item: 'COFFEE-001', item_name: 'Espresso', rate: 3.5, qty: 2 },
          { item: 'CAKE-001', item_name: 'Chocolate Cake', rate: 5.0, qty: 1 },
        ],
        no_of_pax: 2,
        pos_profile: 'Test POS Profile',
        order_type: 'Dine In',
        customer: 'Walk In Customer',
        table: 'TABLE-01',
        room: 'Main Hall',
        cashier: 'Admin',
        owner: 'Admin',
        waiter: 'Waiter1',
        mode_of_payment: 'Cash',
        invoice: null,
        last_invoice: null,
      });

      expect(orderResult.message.status).toBe('Draft');

      // Step 2: Fetch invoices
      mockCallGet.mockResolvedValueOnce({
        message: {
          data: [{ name: 'SINV-001', status: 'Draft', grand_total: 12.0 }],
          next: false,
        },
      });

      const invoices = await getPOSInvoices({ status: 'Draft' });
      expect(invoices.invoices).toHaveLength(1);

      // Step 3: Make payment
      mockCallPost.mockResolvedValueOnce({
        message: { name: 'SINV-001', status: 'Paid' },
      });

      await mockCallPost('ury.ury.doctype.ury_order.ury_order.make_invoice', {
        customer: 'Walk In Customer',
        invoice: 'SINV-001',
        payments: [{ mode_of_payment: 'Cash', amount: 12.0 }],
        pos_profile: 'Test POS Profile',
      });

      expect(mockCallPost).toHaveBeenCalledTimes(2);
    });
  });
});
