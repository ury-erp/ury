import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useReportsStore } from './reports-store';
import type {
  SalesReport,
  ExpenseReport,
  ProfitLossReport,
} from '../lib/reports-api';
import type { InventoryReport } from './reports-store';

// ---- Mocks ----

vi.mock('../lib/reports-api', () => ({
  getSalesReport: vi.fn(),
  getExpenseReport: vi.fn(),
  getProfitLossReport: vi.fn(),
  exportReportPdf: vi.fn(),
}));

vi.mock('../components/ui/toast', () => ({
  showToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('jspdf', () => ({
  default: vi.fn().mockImplementation(() => ({
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    setFont: vi.fn(),
    text: vi.fn(),
    setDrawColor: vi.fn(),
    setLineWidth: vi.fn(),
    line: vi.fn(),
    setFillColor: vi.fn(),
    rect: vi.fn(),
    save: vi.fn(),
    addPage: vi.fn(),
    setPage: vi.fn(),
    getNumberOfPages: vi.fn().mockReturnValue(1),
    internal: { pageSize: { getWidth: () => 210 } },
  })),
}));

vi.mock('jspdf-autotable', () => ({
  default: vi.fn(),
}));

// ---- Import mocked modules ----

import { getSalesReport, getExpenseReport, getProfitLossReport, exportReportPdf } from '../lib/reports-api';
import { showToast } from '../components/ui/toast';
import { logger } from '../lib/logger';
import jsPDF from 'jspdf';

// ---- Test Fixtures ----

const mockSalesReport: SalesReport = {
  period: 'daily',
  from_date: '2025-01-15',
  to_date: '2025-01-15',
  branch: null,
  summary: {
    total_orders: 10,
    total_revenue: 1500.0,
    net_revenue: 1350.0,
    total_tax: 150.0,
    avg_order_value: 150.0,
    unique_customers: 8,
  },
  item_sales: [
    { item_code: 'ITEM001', item_name: 'Coffee', total_qty: 5, total_amount: 25.0, avg_rate: 5.0 },
  ],
  order_type_sales: [
    { order_type: 'Dine In', order_count: 6, revenue: 900.0 },
  ],
  hourly_sales: [{ hour: 10, order_count: 3, revenue: 450.0 }],
  cancelled_orders: { count: 0, amount: 0 },
  payment_summary: [{ payment_method: 'Cash', total_paid: 1500.0, transaction_count: 10 }],
  top_customers: [{ customer: 'C001', customer_name: 'John', order_count: 3, total_spent: 450.0 }],
};

const mockExpenseReport: ExpenseReport = {
  from_date: '2025-01-15',
  to_date: '2025-01-15',
  fixed_expenses: [
    { name: 'EXP001', expense_type: 'Rent', description: 'Monthly rent', amount: 2000.0 },
  ],
  variable_expenses: [
    { name: 'EXP002', expense_type: 'Supplies', description: 'Daily supplies', amount: 500.0, date: '2025-01-15' },
  ],
  total_fixed: 2000.0,
  total_variable: 500.0,
  total_expenses: 2500.0,
};

const mockProfitLossReport: ProfitLossReport = {
  from_date: '2025-01-15',
  to_date: '2025-01-15',
  total_revenue: 5000.0,
  net_revenue: 4500.0,
  total_tax: 500.0,
  cost_of_goods: 1500.0,
  gross_profit: 3000.0,
  total_expenses: 2500.0,
  fixed_expenses: 2000.0,
  variable_expenses: 500.0,
  net_profit: 500.0,
  profit_margin: 10.0,
};

const mockInventoryReport: InventoryReport = {
  from_date: '2025-01-15',
  to_date: '2025-01-15',
  summary: {
    total_items: 10,
    low_stock_items: 2,
    out_of_stock_items: 1,
    total_stock_value: 5000.0,
  },
  items: [
    {
      item_code: 'ITEM001',
      item_name: 'Coffee Beans',
      current_stock: 50,
      reorder_level: 10,
      stock_uom: 'Kg',
      valuation_rate: 20.0,
      stock_value: 1000.0,
      status: 'OK',
    },
    {
      item_code: 'ITEM002',
      item_name: 'Sugar',
      current_stock: 3,
      reorder_level: 5,
      stock_uom: 'Kg',
      valuation_rate: 5.0,
      stock_value: 15.0,
      status: 'Low',
    },
    {
      item_code: 'ITEM003',
      item_name: 'Tea Bags',
      current_stock: 0,
      reorder_level: 10,
      stock_uom: 'Box',
      valuation_rate: 8.0,
      stock_value: 0.0,
      status: 'Out of Stock',
    },
  ],
};

const mockSalesReportWithCancellations: SalesReport = {
  ...mockSalesReport,
  cancelled_orders: { count: 2, amount: 75.0 },
  top_customers: [
    { customer: 'C001', customer_name: 'John', order_count: 3, total_spent: 450.0 },
    { customer: 'C002', customer_name: 'Jane', order_count: 2, total_spent: 300.0 },
  ],
};

// ---- Helper to reset store state ----

function resetStore() {
  useReportsStore.setState({
    salesReport: null,
    expenseReport: null,
    profitLossReport: null,
    inventoryReport: null,
    previousSalesReport: null,
    selectedReportType: 'sales',
    selectedPeriod: 'daily',
    customFromDate: null,
    customToDate: null,
    loading: false,
    exporting: false,
    error: null,
    comparePeriods: false,
  });
}

// ---- Helper for CSV download mocking ----

function setupCsvDownloadMocks() {
  const mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/test');
  const mockRevokeObjectURL = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: mockCreateObjectURL, revokeObjectURL: mockRevokeObjectURL });
  const mockLink = { setAttribute: vi.fn(), click: vi.fn(), remove: vi.fn() };
  const origCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'a') return mockLink as unknown as HTMLElement;
    return origCreateElement(tag);
  });
  vi.spyOn(document.body, 'appendChild').mockImplementation((node: Node) => node);
  vi.spyOn(document.body, 'removeChild').mockImplementation((node: Node) => node);
  return { mockCreateObjectURL, mockRevokeObjectURL, mockLink };
}

// ---- Tests ----

describe('useReportsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish jsPDF mock implementation (vi.restoreAllMocks in CSV tests resets it)
    vi.mocked(jsPDF).mockImplementation(() => ({
      setFontSize: vi.fn(),
      setTextColor: vi.fn(),
      setFont: vi.fn(),
      text: vi.fn(),
      setDrawColor: vi.fn(),
      setLineWidth: vi.fn(),
      line: vi.fn(),
      setFillColor: vi.fn(),
      rect: vi.fn(),
      save: vi.fn(),
      addPage: vi.fn(),
      setPage: vi.fn(),
      getNumberOfPages: vi.fn().mockReturnValue(1),
      internal: { pageSize: { getWidth: () => 210 } },
    }));
    resetStore();
  });

  // ---- Initial State ----

  describe('initial state', () => {
    it('has correct initial selectedReportType (sales)', () => {
      expect(useReportsStore.getState().selectedReportType).toBe('sales');
    });

    it('has correct initial selectedPeriod (daily)', () => {
      expect(useReportsStore.getState().selectedPeriod).toBe('daily');
    });

    it('has loading false', () => {
      expect(useReportsStore.getState().loading).toBe(false);
    });

    it('has all reports null', () => {
      const state = useReportsStore.getState();
      expect(state.salesReport).toBeNull();
      expect(state.expenseReport).toBeNull();
      expect(state.profitLossReport).toBeNull();
      expect(state.inventoryReport).toBeNull();
      expect(state.previousSalesReport).toBeNull();
    });

    it('has comparePeriods false', () => {
      expect(useReportsStore.getState().comparePeriods).toBe(false);
    });
  });

  // ---- fetchSalesReport ----

  describe('fetchSalesReport', () => {
    it('sets loading true then false on success', async () => {
      vi.mocked(getSalesReport).mockResolvedValue(mockSalesReport);

      const promise = useReportsStore.getState().fetchSalesReport();
      // loading should be true synchronously after call
      expect(useReportsStore.getState().loading).toBe(true);

      await promise;
      expect(useReportsStore.getState().loading).toBe(false);
    });

    it('calls getSalesReport with period and dates', async () => {
      vi.mocked(getSalesReport).mockResolvedValue(mockSalesReport);

      await useReportsStore.getState().fetchSalesReport('weekly', '2025-01-01', '2025-01-07');

      expect(getSalesReport).toHaveBeenCalledWith('weekly', '2025-01-01', '2025-01-07');
    });

    it('uses selectedPeriod as default when no period passed', async () => {
      vi.mocked(getSalesReport).mockResolvedValue(mockSalesReport);
      useReportsStore.setState({ selectedPeriod: 'monthly' });

      await useReportsStore.getState().fetchSalesReport();

      expect(getSalesReport).toHaveBeenCalledWith('monthly', undefined, undefined);
    });

    it('sets salesReport on success', async () => {
      vi.mocked(getSalesReport).mockResolvedValue(mockSalesReport);

      await useReportsStore.getState().fetchSalesReport();

      expect(useReportsStore.getState().salesReport).toEqual(mockSalesReport);
    });

    it('sets error and shows toast on failure', async () => {
      vi.mocked(getSalesReport).mockRejectedValue(new Error('Network error'));

      await useReportsStore.getState().fetchSalesReport();

      expect(useReportsStore.getState().error).toBe('Failed to load sales report');
      expect(useReportsStore.getState().loading).toBe(false);
      expect(showToast.error).toHaveBeenCalledWith('Failed to load sales report');
    });
  });

  // ---- fetchExpenseReport ----

  describe('fetchExpenseReport', () => {
    it('sets loading true then false on success', async () => {
      vi.mocked(getExpenseReport).mockResolvedValue(mockExpenseReport);

      const promise = useReportsStore.getState().fetchExpenseReport();
      expect(useReportsStore.getState().loading).toBe(true);

      await promise;
      expect(useReportsStore.getState().loading).toBe(false);
    });

    it('calls getExpenseReport with dates', async () => {
      vi.mocked(getExpenseReport).mockResolvedValue(mockExpenseReport);

      await useReportsStore.getState().fetchExpenseReport('2025-01-01', '2025-01-15');

      expect(getExpenseReport).toHaveBeenCalledWith('2025-01-01', '2025-01-15');
    });

    it('sets expenseReport on success', async () => {
      vi.mocked(getExpenseReport).mockResolvedValue(mockExpenseReport);

      await useReportsStore.getState().fetchExpenseReport();

      expect(useReportsStore.getState().expenseReport).toEqual(mockExpenseReport);
    });

    it('sets error and shows toast on failure', async () => {
      vi.mocked(getExpenseReport).mockRejectedValue(new Error('Network error'));

      await useReportsStore.getState().fetchExpenseReport();

      expect(useReportsStore.getState().error).toBe('Failed to load expense report');
      expect(showToast.error).toHaveBeenCalledWith('Failed to load expense report');
    });
  });

  // ---- fetchProfitLossReport ----

  describe('fetchProfitLossReport', () => {
    it('sets loading true then false on success', async () => {
      vi.mocked(getProfitLossReport).mockResolvedValue(mockProfitLossReport);

      const promise = useReportsStore.getState().fetchProfitLossReport();
      expect(useReportsStore.getState().loading).toBe(true);

      await promise;
      expect(useReportsStore.getState().loading).toBe(false);
    });

    it('calls getProfitLossReport with dates', async () => {
      vi.mocked(getProfitLossReport).mockResolvedValue(mockProfitLossReport);

      await useReportsStore.getState().fetchProfitLossReport('2025-01-01', '2025-01-15');

      expect(getProfitLossReport).toHaveBeenCalledWith('2025-01-01', '2025-01-15');
    });

    it('sets profitLossReport on success', async () => {
      vi.mocked(getProfitLossReport).mockResolvedValue(mockProfitLossReport);

      await useReportsStore.getState().fetchProfitLossReport();

      expect(useReportsStore.getState().profitLossReport).toEqual(mockProfitLossReport);
    });

    it('sets error and shows toast on failure', async () => {
      vi.mocked(getProfitLossReport).mockRejectedValue(new Error('Network error'));

      await useReportsStore.getState().fetchProfitLossReport();

      expect(useReportsStore.getState().error).toBe('Failed to load profit & loss report');
      expect(showToast.error).toHaveBeenCalledWith('Failed to load profit & loss report');
    });
  });

  // ---- fetchCurrentReport ----

  describe('fetchCurrentReport', () => {
    it('calls fetchSalesReport when type is sales', async () => {
      vi.mocked(getSalesReport).mockResolvedValue(mockSalesReport);
      useReportsStore.setState({ selectedReportType: 'sales' });

      await useReportsStore.getState().fetchCurrentReport();

      expect(getSalesReport).toHaveBeenCalled();
    });

    it('calls fetchExpenseReport when type is expense', async () => {
      vi.mocked(getExpenseReport).mockResolvedValue(mockExpenseReport);
      useReportsStore.setState({ selectedReportType: 'expense' });

      await useReportsStore.getState().fetchCurrentReport();

      expect(getExpenseReport).toHaveBeenCalled();
    });

    it('calls fetchProfitLossReport when type is profit_loss', async () => {
      vi.mocked(getProfitLossReport).mockResolvedValue(mockProfitLossReport);
      useReportsStore.setState({ selectedReportType: 'profit_loss' });

      await useReportsStore.getState().fetchCurrentReport();

      expect(getProfitLossReport).toHaveBeenCalled();
    });

    it('sets loading false for inventory type', async () => {
      useReportsStore.setState({ selectedReportType: 'inventory', loading: true });

      await useReportsStore.getState().fetchCurrentReport();

      expect(useReportsStore.getState().loading).toBe(false);
    });

    it('calls fetchPreviousSalesReport when comparePeriods is true and type is sales', async () => {
      vi.mocked(getSalesReport).mockResolvedValue(mockSalesReport);
      useReportsStore.setState({ selectedReportType: 'sales', comparePeriods: true });

      await useReportsStore.getState().fetchCurrentReport();

      // getSalesReport should be called twice: once for current, once for previous
      expect(getSalesReport).toHaveBeenCalledTimes(2);
    });
  });

  // ---- fetchPreviousSalesReport ----

  describe('fetchPreviousSalesReport', () => {
    it('calls getSalesReport with previous period dates', async () => {
      vi.mocked(getSalesReport).mockResolvedValue(mockSalesReport);
      useReportsStore.setState({ selectedPeriod: 'daily' });

      await useReportsStore.getState().fetchPreviousSalesReport();

      // Should have been called with the 'daily' period and previous dates
      expect(getSalesReport).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(getSalesReport).mock.calls[0];
      expect(callArgs[0]).toBe('daily');
      // The previous date strings should be defined
      expect(callArgs[1]).toBeDefined();
      expect(callArgs[2]).toBeDefined();
    });

    it('sets previousSalesReport on success', async () => {
      vi.mocked(getSalesReport).mockResolvedValue(mockSalesReport);

      await useReportsStore.getState().fetchPreviousSalesReport();

      expect(useReportsStore.getState().previousSalesReport).toEqual(mockSalesReport);
    });

    it('logs warning on failure and does not show toast', async () => {
      vi.mocked(getSalesReport).mockRejectedValue(new Error('Network error'));

      await useReportsStore.getState().fetchPreviousSalesReport();

      expect(logger.warn).toHaveBeenCalled();
      expect(showToast.error).not.toHaveBeenCalled();
    });

    it('handles custom date range for previous period calculation', async () => {
      vi.mocked(getSalesReport).mockResolvedValue(mockSalesReport);
      useReportsStore.setState({
        selectedPeriod: 'daily',
        customFromDate: '2025-01-10',
        customToDate: '2025-01-15',
      });

      await useReportsStore.getState().fetchPreviousSalesReport();

      expect(getSalesReport).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(getSalesReport).mock.calls[0];
      // Previous period should be before the custom range
      expect(callArgs[1]).toBeDefined();
      expect(callArgs[2]).toBeDefined();
    });
  });

  // ---- setSelectedReportType ----

  describe('setSelectedReportType', () => {
    it('updates selectedReportType', () => {
      useReportsStore.getState().setSelectedReportType('expense');

      expect(useReportsStore.getState().selectedReportType).toBe('expense');
    });

    it('calls fetchCurrentReport after setting type', async () => {
      vi.mocked(getExpenseReport).mockResolvedValue(mockExpenseReport);

      useReportsStore.getState().setSelectedReportType('expense');

      // fetchCurrentReport is called, which invokes getExpenseReport
      // Need to wait for the async operation
      await vi.waitFor(() => {
        expect(getExpenseReport).toHaveBeenCalled();
      });
    });

    it('changes from sales to expense', () => {
      expect(useReportsStore.getState().selectedReportType).toBe('sales');
      useReportsStore.getState().setSelectedReportType('expense');
      expect(useReportsStore.getState().selectedReportType).toBe('expense');
    });
  });

  // ---- setSelectedPeriod ----

  describe('setSelectedPeriod', () => {
    it('updates selectedPeriod', () => {
      useReportsStore.getState().setSelectedPeriod('monthly');

      expect(useReportsStore.getState().selectedPeriod).toBe('monthly');
    });

    it('calls fetchCurrentReport after setting period', async () => {
      vi.mocked(getSalesReport).mockResolvedValue(mockSalesReport);

      useReportsStore.getState().setSelectedPeriod('weekly');

      await vi.waitFor(() => {
        expect(getSalesReport).toHaveBeenCalled();
      });
    });

    it('changes from daily to monthly', () => {
      expect(useReportsStore.getState().selectedPeriod).toBe('daily');
      useReportsStore.getState().setSelectedPeriod('monthly');
      expect(useReportsStore.getState().selectedPeriod).toBe('monthly');
    });
  });

  // ---- setCustomDateRange ----

  describe('setCustomDateRange', () => {
    it('sets customFromDate and customToDate', () => {
      useReportsStore.getState().setCustomDateRange('2025-01-01', '2025-01-15');

      expect(useReportsStore.getState().customFromDate).toBe('2025-01-01');
      expect(useReportsStore.getState().customToDate).toBe('2025-01-15');
    });

    it('calls fetchCurrentReport after setting dates', async () => {
      vi.mocked(getSalesReport).mockResolvedValue(mockSalesReport);

      useReportsStore.getState().setCustomDateRange('2025-01-01', '2025-01-15');

      await vi.waitFor(() => {
        expect(getSalesReport).toHaveBeenCalled();
      });
    });
  });

  // ---- setComparePeriods ----

  describe('setComparePeriods', () => {
    it('sets comparePeriods to true', () => {
      useReportsStore.getState().setComparePeriods(true);

      expect(useReportsStore.getState().comparePeriods).toBe(true);
    });

    it('calls fetchPreviousSalesReport when set to true with sales type', async () => {
      vi.mocked(getSalesReport).mockResolvedValue(mockSalesReport);
      useReportsStore.setState({ selectedReportType: 'sales' });

      useReportsStore.getState().setComparePeriods(true);

      await vi.waitFor(() => {
        expect(getSalesReport).toHaveBeenCalled();
      });
    });

    it('does not call fetchPreviousSalesReport when set to false', () => {
      useReportsStore.setState({ comparePeriods: true });
      vi.mocked(getSalesReport).mockResolvedValue(mockSalesReport);

      useReportsStore.getState().setComparePeriods(false);

      expect(getSalesReport).not.toHaveBeenCalled();
      expect(useReportsStore.getState().comparePeriods).toBe(false);
    });
  });

  // ---- clearReports ----

  describe('clearReports', () => {
    it('resets all reports to null', () => {
      useReportsStore.setState({
        salesReport: mockSalesReport,
        expenseReport: mockExpenseReport,
        profitLossReport: mockProfitLossReport,
        previousSalesReport: mockSalesReport,
      });

      useReportsStore.getState().clearReports();

      const state = useReportsStore.getState();
      expect(state.salesReport).toBeNull();
      expect(state.expenseReport).toBeNull();
      expect(state.profitLossReport).toBeNull();
      expect(state.inventoryReport).toBeNull();
      expect(state.previousSalesReport).toBeNull();
    });

    it('resets error to null', () => {
      useReportsStore.setState({ error: 'Some error' });

      useReportsStore.getState().clearReports();

      expect(useReportsStore.getState().error).toBeNull();
    });
  });

  // ---- exportToCsv ----

  describe('exportToCsv', () => {
    it('shows error toast when no sales report data available', () => {
      useReportsStore.setState({ selectedReportType: 'sales', salesReport: null });

      useReportsStore.getState().exportToCsv();

      expect(showToast.error).toHaveBeenCalledWith('No sales report data to export');
    });

    it('shows error toast when no expense report data available', () => {
      useReportsStore.setState({ selectedReportType: 'expense', expenseReport: null });

      useReportsStore.getState().exportToCsv();

      expect(showToast.error).toHaveBeenCalledWith('No expense report data to export');
    });

    it('generates CSV for sales report and calls downloadCsv', () => {
      useReportsStore.setState({ selectedReportType: 'sales', salesReport: mockSalesReport });

      // Mock URL.createObjectURL and document methods for jsdom
      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/test');
      const mockRevokeObjectURL = vi.fn();
      vi.stubGlobal('URL', { createObjectURL: mockCreateObjectURL, revokeObjectURL: mockRevokeObjectURL });

      // Mock createElement to return a clickable link
      const mockLink = { setAttribute: vi.fn(), click: vi.fn(), remove: vi.fn() };
      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') return mockLink as unknown as HTMLElement;
        return origCreateElement(tag);
      });
      const origBodyAppend = document.body.appendChild.bind(document.body);
      vi.spyOn(document.body, 'appendChild').mockImplementation((node: Node) => node);
      const origBodyRemove = document.body.removeChild.bind(document.body);
      vi.spyOn(document.body, 'removeChild').mockImplementation((node: Node) => node);

      useReportsStore.getState().exportToCsv();

      expect(showToast.success).toHaveBeenCalledWith('CSV exported successfully');

      // Cleanup
      vi.restoreAllMocks();
    });

    it('generates CSV for expense report', () => {
      useReportsStore.setState({ selectedReportType: 'expense', expenseReport: mockExpenseReport });

      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/test');
      const mockRevokeObjectURL = vi.fn();
      vi.stubGlobal('URL', { createObjectURL: mockCreateObjectURL, revokeObjectURL: mockRevokeObjectURL });

      const mockLink = { setAttribute: vi.fn(), click: vi.fn(), remove: vi.fn() };
      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') return mockLink as unknown as HTMLElement;
        return origCreateElement(tag);
      });
      vi.spyOn(document.body, 'appendChild').mockImplementation((node: Node) => node);
      vi.spyOn(document.body, 'removeChild').mockImplementation((node: Node) => node);

      useReportsStore.getState().exportToCsv();

      expect(showToast.success).toHaveBeenCalledWith('CSV exported successfully');

      vi.restoreAllMocks();
    });

    it('generates CSV for profit_loss report', () => {
      useReportsStore.setState({ selectedReportType: 'profit_loss', profitLossReport: mockProfitLossReport });

      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/test');
      const mockRevokeObjectURL = vi.fn();
      vi.stubGlobal('URL', { createObjectURL: mockCreateObjectURL, revokeObjectURL: mockRevokeObjectURL });

      const mockLink = { setAttribute: vi.fn(), click: vi.fn(), remove: vi.fn() };
      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') return mockLink as unknown as HTMLElement;
        return origCreateElement(tag);
      });
      vi.spyOn(document.body, 'appendChild').mockImplementation((node: Node) => node);
      vi.spyOn(document.body, 'removeChild').mockImplementation((node: Node) => node);

      useReportsStore.getState().exportToCsv();

      expect(showToast.success).toHaveBeenCalledWith('CSV exported successfully');

      vi.restoreAllMocks();
    });

    it('shows error toast when no inventory report data available', () => {
      useReportsStore.setState({ selectedReportType: 'inventory', inventoryReport: null });

      useReportsStore.getState().exportToCsv();

      expect(showToast.error).toHaveBeenCalledWith('No inventory report data to export');
    });
  });

  // ---- exportToPdf ----

  describe('exportToPdf', () => {
    it('sets exporting true then false on success', async () => {
      vi.mocked(exportReportPdf).mockResolvedValue('http://example.com/report.pdf');
      // Mock window.open
      vi.stubGlobal('open', vi.fn());

      const promise = useReportsStore.getState().exportToPdf();
      expect(useReportsStore.getState().exporting).toBe(true);

      await promise;
      expect(useReportsStore.getState().exporting).toBe(false);
    });

    it('tries server-side PDF first', async () => {
      vi.mocked(exportReportPdf).mockResolvedValue('http://example.com/report.pdf');
      const mockOpen = vi.fn();
      vi.stubGlobal('open', mockOpen);

      useReportsStore.setState({ selectedReportType: 'sales', selectedPeriod: 'daily' });
      await useReportsStore.getState().exportToPdf();

      expect(exportReportPdf).toHaveBeenCalledWith('sales', 'daily', undefined, undefined);
      expect(mockOpen).toHaveBeenCalledWith('http://example.com/report.pdf', '_blank');
      expect(showToast.success).toHaveBeenCalledWith('PDF report generated');
    });

    it('falls back to client-side PDF on server failure', async () => {
      vi.mocked(exportReportPdf).mockRejectedValue(new Error('Server error'));

      useReportsStore.setState({
        selectedReportType: 'sales',
        salesReport: mockSalesReport,
      });

      await useReportsStore.getState().exportToPdf();

      // Should have fallen back to client-side jsPDF generation
      expect(useReportsStore.getState().exporting).toBe(false);
      // jsPDF constructor should have been called for client-side fallback
      const { default: jsPDFMock } = await import('jspdf');
      expect(jsPDFMock).toHaveBeenCalled();
    });
  });

  // ---- Error state clearing on new fetch ----

  describe('error clearing on new fetch', () => {
    it('clears error when starting a new fetchSalesReport', async () => {
      useReportsStore.setState({ error: 'Previous error' });
      vi.mocked(getSalesReport).mockResolvedValue(mockSalesReport);

      await useReportsStore.getState().fetchSalesReport();

      expect(useReportsStore.getState().error).toBeNull();
    });

    it('clears error when starting a new fetchExpenseReport', async () => {
      useReportsStore.setState({ error: 'Previous error' });
      vi.mocked(getExpenseReport).mockResolvedValue(mockExpenseReport);

      await useReportsStore.getState().fetchExpenseReport();

      expect(useReportsStore.getState().error).toBeNull();
    });

    it('clears error when starting a new fetchProfitLossReport', async () => {
      useReportsStore.setState({ error: 'Previous error' });
      vi.mocked(getProfitLossReport).mockResolvedValue(mockProfitLossReport);

      await useReportsStore.getState().fetchProfitLossReport();

      expect(useReportsStore.getState().error).toBeNull();
    });
  });

  // ---- fetchCurrentReport passes custom dates ----

  describe('fetchCurrentReport with custom dates', () => {
    it('passes custom dates to fetchSalesReport', async () => {
      vi.mocked(getSalesReport).mockResolvedValue(mockSalesReport);
      useReportsStore.setState({
        selectedReportType: 'sales',
        customFromDate: '2025-01-01',
        customToDate: '2025-01-15',
      });

      await useReportsStore.getState().fetchCurrentReport();

      expect(getSalesReport).toHaveBeenCalledWith('daily', '2025-01-01', '2025-01-15');
    });

    it('passes custom dates to fetchExpenseReport', async () => {
      vi.mocked(getExpenseReport).mockResolvedValue(mockExpenseReport);
      useReportsStore.setState({
        selectedReportType: 'expense',
        customFromDate: '2025-01-01',
        customToDate: '2025-01-15',
      });

      await useReportsStore.getState().fetchCurrentReport();

      expect(getExpenseReport).toHaveBeenCalledWith('2025-01-01', '2025-01-15');
    });

    it('passes custom dates to fetchProfitLossReport', async () => {
      vi.mocked(getProfitLossReport).mockResolvedValue(mockProfitLossReport);
      useReportsStore.setState({
        selectedReportType: 'profit_loss',
        customFromDate: '2025-01-01',
        customToDate: '2025-01-15',
      });

      await useReportsStore.getState().fetchCurrentReport();

      expect(getProfitLossReport).toHaveBeenCalledWith('2025-01-01', '2025-01-15');
    });
  });

  // ---- setComparePeriods with non-sales type ----

  describe('setComparePeriods with non-sales type', () => {
    it('does not call fetchPreviousSalesReport when type is expense', () => {
      vi.mocked(getSalesReport).mockResolvedValue(mockSalesReport);
      useReportsStore.setState({ selectedReportType: 'expense' });

      useReportsStore.getState().setComparePeriods(true);

      expect(getSalesReport).not.toHaveBeenCalled();
      expect(useReportsStore.getState().comparePeriods).toBe(true);
    });
  });

  // ---- getPreviousPeriodDates via fetchPreviousSalesReport ----

  describe('getPreviousPeriodDates via fetchPreviousSalesReport', () => {
    it('calculates previous period for weekly', async () => {
      vi.mocked(getSalesReport).mockResolvedValue(mockSalesReport);
      useReportsStore.setState({ selectedPeriod: 'weekly' });
      await useReportsStore.getState().fetchPreviousSalesReport();
      const callArgs = vi.mocked(getSalesReport).mock.calls[0];
      expect(callArgs[0]).toBe('weekly');
      expect(callArgs[1]).toBeDefined();
      expect(callArgs[2]).toBeDefined();
    });

    it('calculates previous period for monthly', async () => {
      vi.mocked(getSalesReport).mockResolvedValue(mockSalesReport);
      useReportsStore.setState({ selectedPeriod: 'monthly' });
      await useReportsStore.getState().fetchPreviousSalesReport();
      const callArgs = vi.mocked(getSalesReport).mock.calls[0];
      expect(callArgs[0]).toBe('monthly');
      expect(callArgs[1]).toBeDefined();
      expect(callArgs[2]).toBeDefined();
    });

    it('calculates previous period for last_month', async () => {
      vi.mocked(getSalesReport).mockResolvedValue(mockSalesReport);
      useReportsStore.setState({ selectedPeriod: 'last_month' });
      await useReportsStore.getState().fetchPreviousSalesReport();
      const callArgs = vi.mocked(getSalesReport).mock.calls[0];
      expect(callArgs[0]).toBe('last_month');
      expect(callArgs[1]).toBeDefined();
      expect(callArgs[2]).toBeDefined();
    });

    it('calculates previous period for last_7_days', async () => {
      vi.mocked(getSalesReport).mockResolvedValue(mockSalesReport);
      useReportsStore.setState({ selectedPeriod: 'last_7_days' });
      await useReportsStore.getState().fetchPreviousSalesReport();
      const callArgs = vi.mocked(getSalesReport).mock.calls[0];
      expect(callArgs[0]).toBe('last_7_days');
      expect(callArgs[1]).toBeDefined();
      expect(callArgs[2]).toBeDefined();
    });

    it('calculates previous period for last_30_days', async () => {
      vi.mocked(getSalesReport).mockResolvedValue(mockSalesReport);
      useReportsStore.setState({ selectedPeriod: 'last_30_days' });
      await useReportsStore.getState().fetchPreviousSalesReport();
      const callArgs = vi.mocked(getSalesReport).mock.calls[0];
      expect(callArgs[0]).toBe('last_30_days');
      expect(callArgs[1]).toBeDefined();
      expect(callArgs[2]).toBeDefined();
    });

    it('calculates previous period for yesterday', async () => {
      vi.mocked(getSalesReport).mockResolvedValue(mockSalesReport);
      useReportsStore.setState({ selectedPeriod: 'yesterday' });
      await useReportsStore.getState().fetchPreviousSalesReport();
      const callArgs = vi.mocked(getSalesReport).mock.calls[0];
      expect(callArgs[0]).toBe('yesterday');
      expect(callArgs[1]).toBeDefined();
      expect(callArgs[2]).toBeDefined();
    });
  });

  // ---- exportToPdf client-side generation ----

  describe('exportToPdf client-side generation', () => {
    it('generates client-side PDF for expense report', async () => {
      vi.mocked(exportReportPdf).mockRejectedValue(new Error('Server error'));
      useReportsStore.setState({
        selectedReportType: 'expense',
        expenseReport: mockExpenseReport,
      });
      await useReportsStore.getState().exportToPdf();
      expect(useReportsStore.getState().exporting).toBe(false);
      expect(showToast.success).toHaveBeenCalledWith('PDF report downloaded');
    });

    it('generates client-side PDF for profit_loss report', async () => {
      vi.mocked(exportReportPdf).mockRejectedValue(new Error('Server error'));
      useReportsStore.setState({
        selectedReportType: 'profit_loss',
        profitLossReport: mockProfitLossReport,
      });
      await useReportsStore.getState().exportToPdf();
      expect(useReportsStore.getState().exporting).toBe(false);
      expect(showToast.success).toHaveBeenCalledWith('PDF report downloaded');
    });

    it('generates client-side PDF for inventory report', async () => {
      vi.mocked(exportReportPdf).mockRejectedValue(new Error('Server error'));
      useReportsStore.setState({
        selectedReportType: 'inventory',
        inventoryReport: mockInventoryReport,
      });
      await useReportsStore.getState().exportToPdf();
      expect(useReportsStore.getState().exporting).toBe(false);
      expect(showToast.success).toHaveBeenCalledWith('PDF report downloaded');
    });

    it('generates client-side PDF for sales with cancelled orders and top customers', async () => {
      vi.mocked(exportReportPdf).mockRejectedValue(new Error('Server error'));
      useReportsStore.setState({
        selectedReportType: 'sales',
        salesReport: mockSalesReportWithCancellations,
      });
      await useReportsStore.getState().exportToPdf();
      expect(useReportsStore.getState().exporting).toBe(false);
      expect(showToast.success).toHaveBeenCalledWith('PDF report downloaded');
    });

    it('falls back to client-side when server returns null', async () => {
      vi.mocked(exportReportPdf).mockResolvedValue(null as any);
      useReportsStore.setState({
        selectedReportType: 'sales',
        salesReport: mockSalesReport,
      });
      await useReportsStore.getState().exportToPdf();
      expect(useReportsStore.getState().exporting).toBe(false);
      expect(showToast.success).toHaveBeenCalledWith('PDF report downloaded');
    });

    it('falls back to client-side when server returns empty string', async () => {
      vi.mocked(exportReportPdf).mockResolvedValue('');
      useReportsStore.setState({
        selectedReportType: 'sales',
        salesReport: mockSalesReport,
      });
      await useReportsStore.getState().exportToPdf();
      expect(useReportsStore.getState().exporting).toBe(false);
      expect(showToast.success).toHaveBeenCalledWith('PDF report downloaded');
    });

    it('handles total failure and shows error toast', async () => {
      vi.mocked(exportReportPdf).mockRejectedValue(new Error('Server error'));
      const throwImpl = () => { throw new Error('PDF error'); };
      vi.mocked(jsPDF).mockImplementationOnce(throwImpl as any);
      useReportsStore.setState({
        selectedReportType: 'sales',
        salesReport: mockSalesReport,
      });
      await useReportsStore.getState().exportToPdf();
      expect(useReportsStore.getState().exporting).toBe(false);
      expect(showToast.error).toHaveBeenCalledWith('Failed to export PDF');
    });

    it('generates PDF with no report data for selected type', async () => {
      vi.mocked(exportReportPdf).mockRejectedValue(new Error('Server error'));
      useReportsStore.setState({
        selectedReportType: 'sales',
        salesReport: null,
      });
      await useReportsStore.getState().exportToPdf();
      expect(useReportsStore.getState().exporting).toBe(false);
      expect(showToast.success).toHaveBeenCalledWith('PDF report downloaded');
    });
  });

  // ---- exportToCsv inventory with data ----

  describe('exportToCsv inventory with data', () => {
    it('generates CSV for inventory report', () => {
      useReportsStore.setState({ selectedReportType: 'inventory', inventoryReport: mockInventoryReport });
      setupCsvDownloadMocks();
      useReportsStore.getState().exportToCsv();
      expect(showToast.success).toHaveBeenCalledWith('CSV exported successfully');
    });

    it('shows error toast for profit_loss report with no data', () => {
      useReportsStore.setState({ selectedReportType: 'profit_loss', profitLossReport: null });
      useReportsStore.getState().exportToCsv();
      expect(showToast.error).toHaveBeenCalledWith('No profit & loss report data to export');
    });
  });

  // ---- exportToCsv error handling ----

  describe('exportToCsv error handling', () => {
    it('shows error toast when CSV generation throws', () => {
      useReportsStore.setState({ selectedReportType: 'sales', salesReport: mockSalesReport });
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn().mockImplementation(() => { throw new Error('Blob error'); }),
        revokeObjectURL: vi.fn(),
      });
      useReportsStore.getState().exportToCsv();
      expect(showToast.error).toHaveBeenCalledWith('Failed to export CSV');
    });
  });

  // ---- CSV content generation ----

  describe('CSV content generation', () => {
    it('generates sales CSV with all sections including cancellations', () => {
      useReportsStore.setState({ selectedReportType: 'sales', salesReport: mockSalesReportWithCancellations });
      const { mockLink } = setupCsvDownloadMocks();
      useReportsStore.getState().exportToCsv();
      expect(mockLink.setAttribute).toHaveBeenCalledWith('download', expect.stringContaining('sales_report'));
      expect(mockLink.click).toHaveBeenCalled();
    });

    it('generates expense CSV with fixed and variable expenses', () => {
      useReportsStore.setState({ selectedReportType: 'expense', expenseReport: mockExpenseReport });
      setupCsvDownloadMocks();
      useReportsStore.getState().exportToCsv();
      expect(showToast.success).toHaveBeenCalledWith('CSV exported successfully');
    });

    it('generates profit_loss CSV with correct format', () => {
      useReportsStore.setState({ selectedReportType: 'profit_loss', profitLossReport: mockProfitLossReport });
      setupCsvDownloadMocks();
      useReportsStore.getState().exportToCsv();
      expect(showToast.success).toHaveBeenCalledWith('CSV exported successfully');
    });

    it('handles special characters in CSV fields (commas, quotes, newlines)', () => {
      const specialCharReport: SalesReport = {
        ...mockSalesReport,
        item_sales: [
          { item_code: 'ITEM001', item_name: 'Coffee, "Premium"', total_qty: 5, total_amount: 25.0, avg_rate: 5.0 },
          { item_code: 'ITEM002', item_name: 'Tea\nGreen', total_qty: 3, total_amount: 15.0, avg_rate: 5.0 },
        ],
        order_type_sales: [
          { order_type: 'Dine In, Takeaway', order_count: 6, revenue: 900.0 },
        ],
      };
      useReportsStore.setState({ selectedReportType: 'sales', salesReport: specialCharReport });
      setupCsvDownloadMocks();
      useReportsStore.getState().exportToCsv();
      expect(showToast.success).toHaveBeenCalledWith('CSV exported successfully');
    });
  });

  // ---- exportToPdf with custom dates ----

  describe('exportToPdf with custom dates', () => {
    it('passes custom dates to exportReportPdf', async () => {
      vi.mocked(exportReportPdf).mockResolvedValue('http://example.com/report.pdf');
      vi.stubGlobal('open', vi.fn());
      useReportsStore.setState({
        selectedReportType: 'sales',
        selectedPeriod: 'monthly',
        customFromDate: '2025-01-01',
        customToDate: '2025-01-31',
      });
      await useReportsStore.getState().exportToPdf();
      expect(exportReportPdf).toHaveBeenCalledWith('sales', 'monthly', '2025-01-01', '2025-01-31');
    });
  });

  // ---- fetchCurrentReport without custom dates ----

  describe('fetchCurrentReport without custom dates', () => {
    it('passes undefined for null custom dates to fetchExpenseReport', async () => {
      vi.mocked(getExpenseReport).mockResolvedValue(mockExpenseReport);
      useReportsStore.setState({
        selectedReportType: 'expense',
        customFromDate: null,
        customToDate: null,
      });
      await useReportsStore.getState().fetchCurrentReport();
      expect(getExpenseReport).toHaveBeenCalledWith(undefined, undefined);
    });

    it('passes undefined for null custom dates to fetchProfitLossReport', async () => {
      vi.mocked(getProfitLossReport).mockResolvedValue(mockProfitLossReport);
      useReportsStore.setState({
        selectedReportType: 'profit_loss',
        customFromDate: null,
        customToDate: null,
      });
      await useReportsStore.getState().fetchCurrentReport();
      expect(getProfitLossReport).toHaveBeenCalledWith(undefined, undefined);
    });
  });
});
