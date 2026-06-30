import { create } from 'zustand';
import { logger } from '../lib/logger';
import {
  getSalesReport,
  getExpenseReport,
  getProfitLossReport,
  exportReportPdf,
  SalesReport,
  ExpenseReport,
  ProfitLossReport,
  ReportPeriod,
  ReportType,
} from '../lib/reports-api';
import { showToast } from '../components/ui/toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ---- Inventory Types ----

export interface InventoryItem {
  item_code: string;
  item_name: string;
  current_stock: number;
  reorder_level: number;
  stock_uom: string;
  valuation_rate: number;
  stock_value: number;
  status: 'OK' | 'Low' | 'Out of Stock';
}

export interface ExpenseItem {
  name: string;
  expense_type: string;
  description: string;
  amount: number;
  date?: string;
}

export interface InventoryReport {
  from_date: string;
  to_date: string;
  summary: {
    total_items: number;
    low_stock_items: number;
    out_of_stock_items: number;
    total_stock_value: number;
  };
  items: InventoryItem[];
}

// ---- State Interface ----

interface ReportsState {
  salesReport: SalesReport | null;
  expenseReport: ExpenseReport | null;
  profitLossReport: ProfitLossReport | null;
  inventoryReport: InventoryReport | null;
  previousSalesReport: SalesReport | null;
  selectedReportType: ReportType;
  selectedPeriod: ReportPeriod;
  customFromDate: string | null;
  customToDate: string | null;
  loading: boolean;
  exporting: boolean;
  error: string | null;
  comparePeriods: boolean;
}

// ---- Actions Interface ----

interface ReportsActions {
  fetchSalesReport: (period?: ReportPeriod, fromDate?: string, toDate?: string) => Promise<void>;
  fetchExpenseReport: (fromDate?: string, toDate?: string) => Promise<void>;
  fetchProfitLossReport: (fromDate?: string, toDate?: string) => Promise<void>;
  fetchCurrentReport: () => Promise<void>;
  fetchPreviousSalesReport: () => Promise<void>;
  exportToPdf: () => Promise<void>;
  exportToCsv: () => void;
  setSelectedReportType: (type: ReportType) => void;
  setSelectedPeriod: (period: ReportPeriod) => void;
  setCustomDateRange: (fromDate: string, toDate: string) => void;
  setComparePeriods: (compare: boolean) => void;
  clearReports: () => void;
}

export const useReportsStore = create<ReportsState & ReportsActions>(
  (set, get) => ({
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

    fetchSalesReport: async (period, fromDate, toDate) => {
      try {
        set({ loading: true, error: null });
        const p = period || get().selectedPeriod;
        const report = await getSalesReport(p, fromDate, toDate);
        set({ salesReport: report, loading: false });
      } catch {
        set({ error: 'Failed to load sales report', loading: false });
        showToast.error('Failed to load sales report');
      }
    },

    fetchExpenseReport: async (fromDate, toDate) => {
      try {
        set({ loading: true, error: null });
        const report = await getExpenseReport(fromDate, toDate);
        set({ expenseReport: report, loading: false });
      } catch {
        set({ error: 'Failed to load expense report', loading: false });
        showToast.error('Failed to load expense report');
      }
    },

    fetchProfitLossReport: async (fromDate, toDate) => {
      try {
        set({ loading: true, error: null });
        const report = await getProfitLossReport(fromDate, toDate);
        set({ profitLossReport: report, loading: false });
      } catch {
        set({ error: 'Failed to load profit & loss report', loading: false });
        showToast.error('Failed to load profit & loss report');
      }
    },

    fetchCurrentReport: async () => {
      const { selectedReportType, selectedPeriod, customFromDate, customToDate, comparePeriods } = get();
      switch (selectedReportType) {
        case 'sales':
          await get().fetchSalesReport(selectedPeriod, customFromDate || undefined, customToDate || undefined);
          if (comparePeriods) {
            await get().fetchPreviousSalesReport();
          }
          break;
        case 'expense':
          await get().fetchExpenseReport(customFromDate || undefined, customToDate || undefined);
          break;
        case 'profit_loss':
          await get().fetchProfitLossReport(customFromDate || undefined, customToDate || undefined);
          break;
        case 'inventory':
          // Inventory report uses placeholder data for now
          set({ loading: false });
          break;
      }
    },

    fetchPreviousSalesReport: async () => {
      try {
        const { selectedPeriod, customFromDate, customToDate } = get();
        const { prevFrom, prevTo } = getPreviousPeriodDates(selectedPeriod, customFromDate, customToDate);
        const report = await getSalesReport(selectedPeriod, prevFrom, prevTo);
        set({ previousSalesReport: report });
      } catch (err) {
        // Don't show error toast for previous period - it's optional
        logger.warn('Could not load previous period data:', err);
      }
    },

    exportToPdf: async () => {
      const { selectedReportType, salesReport, expenseReport, profitLossReport, inventoryReport } = get();

      try {
        set({ exporting: true });

        // Try server-side PDF first
        try {
          const { selectedPeriod, customFromDate, customToDate } = get();
          const pdfUrl = await exportReportPdf(
            selectedReportType,
            selectedPeriod,
            customFromDate || undefined,
            customToDate || undefined
          );
          if (pdfUrl) {
            window.open(pdfUrl, '_blank');
            set({ exporting: false });
            showToast.success('PDF report generated');
            return;
          }
        } catch {
          // Server-side failed, fall back to client-side
        }

        // Client-side PDF generation using jsPDF
        const doc = new jsPDF();

        // Add common header to all reports
        addReportHeader(doc, selectedReportType);

        if (selectedReportType === 'sales' && salesReport) {
          _generateSalesPdf(doc, salesReport);
        } else if (selectedReportType === 'expense' && expenseReport) {
          _generateExpensePdf(doc, expenseReport);
        } else if (selectedReportType === 'profit_loss' && profitLossReport) {
          _generatePLPdf(doc, profitLossReport);
        } else if (selectedReportType === 'inventory' && inventoryReport) {
          _generateInventoryPdf(doc, inventoryReport);
        }

        // Add footer to all pages
        addReportFooter(doc);

        doc.save(
          `${selectedReportType}_report_${new Date().toISOString().split('T')[0]}.pdf`
        );
        set({ exporting: false });
        showToast.success('PDF report downloaded');
      } catch {
        set({ exporting: false });
        showToast.error('Failed to export PDF');
      }
    },

    exportToCsv: () => {
      const { selectedReportType, salesReport, expenseReport, profitLossReport, inventoryReport } = get();

      let csvContent = '';
      let filename = '';

      try {
        switch (selectedReportType) {
          case 'sales':
            if (!salesReport) {
              showToast.error('No sales report data to export');
              return;
            }
            csvContent = generateSalesCsv(salesReport);
            filename = `sales_report_${new Date().toISOString().split('T')[0]}.csv`;
            break;
          case 'expense':
            if (!expenseReport) {
              showToast.error('No expense report data to export');
              return;
            }
            csvContent = generateExpenseCsv(expenseReport);
            filename = `expense_report_${new Date().toISOString().split('T')[0]}.csv`;
            break;
          case 'profit_loss':
            if (!profitLossReport) {
              showToast.error('No profit & loss report data to export');
              return;
            }
            csvContent = generatePLCsv(profitLossReport);
            filename = `profit_loss_report_${new Date().toISOString().split('T')[0]}.csv`;
            break;
          case 'inventory':
            if (!inventoryReport) {
              showToast.error('No inventory report data to export');
              return;
            }
            csvContent = generateInventoryCsv(inventoryReport);
            filename = `inventory_report_${new Date().toISOString().split('T')[0]}.csv`;
            break;
        }

        if (csvContent) {
          downloadCsv(csvContent, filename);
          showToast.success('CSV exported successfully');
        }
      } catch {
        showToast.error('Failed to export CSV');
      }
    },

    setSelectedReportType: (type) => {
      set({ selectedReportType: type });
      get().fetchCurrentReport();
    },

    setSelectedPeriod: (period) => {
      set({ selectedPeriod: period });
      get().fetchCurrentReport();
    },

    setCustomDateRange: (fromDate, toDate) => {
      set({ customFromDate: fromDate, customToDate: toDate });
      get().fetchCurrentReport();
    },

    setComparePeriods: (compare) => {
      set({ comparePeriods: compare });
      if (compare && get().selectedReportType === 'sales') {
        get().fetchPreviousSalesReport();
      }
    },

    clearReports: () => {
      set({
        salesReport: null,
        expenseReport: null,
        profitLossReport: null,
        inventoryReport: null,
        previousSalesReport: null,
        error: null,
      });
    },
  })
);

// ---- Period Helpers ----

function getPreviousPeriodDates(
  period: ReportPeriod,
  customFromDate?: string | null,
  customToDate?: string | null
): { prevFrom: string; prevTo: string } {
  const today = new Date();

  // If custom date range, calculate the previous equivalent period
  if (customFromDate && customToDate) {
    const from = new Date(customFromDate);
    const to = new Date(customToDate);
    const diffMs = to.getTime() - from.getTime();
    const prevTo = new Date(from.getTime() - 1); // Day before from
    const prevFrom = new Date(prevTo.getTime() - diffMs);
    return {
      prevFrom: prevFrom.toISOString().split('T')[0],
      prevTo: prevTo.toISOString().split('T')[0],
    };
  }

  switch (period) {
    case 'daily':
    case 'yesterday': {
      // Previous day
      const prev = new Date(today);
      prev.setDate(prev.getDate() - 1);
      const dateStr = prev.toISOString().split('T')[0];
      return { prevFrom: dateStr, prevTo: dateStr };
    }
    case 'weekly': {
      // Previous week (same day range)
      const prevWeekStart = new Date(today);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7 - prevWeekStart.getDay());
      const prevWeekEnd = new Date(prevWeekStart);
      prevWeekEnd.setDate(prevWeekEnd.getDate() + 6);
      return {
        prevFrom: prevWeekStart.toISOString().split('T')[0],
        prevTo: prevWeekEnd.toISOString().split('T')[0],
      };
    }
    case 'monthly': {
      // Previous month
      const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      return {
        prevFrom: prevMonth.toISOString().split('T')[0],
        prevTo: prevMonthEnd.toISOString().split('T')[0],
      };
    }
    case 'last_month': {
      // Two months ago
      const twoMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      const twoMonthsAgoEnd = new Date(today.getFullYear(), today.getMonth() - 1, 0);
      return {
        prevFrom: twoMonthsAgo.toISOString().split('T')[0],
        prevTo: twoMonthsAgoEnd.toISOString().split('T')[0],
      };
    }
    case 'last_7_days': {
      const prevEnd = new Date(today);
      prevEnd.setDate(prevEnd.getDate() - 8);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - 6);
      return {
        prevFrom: prevStart.toISOString().split('T')[0],
        prevTo: prevEnd.toISOString().split('T')[0],
      };
    }
    case 'last_30_days': {
      const prevEnd = new Date(today);
      prevEnd.setDate(prevEnd.getDate() - 31);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - 29);
      return {
        prevFrom: prevStart.toISOString().split('T')[0],
        prevTo: prevEnd.toISOString().split('T')[0],
      };
    }
    default: {
      const prev = new Date(today);
      prev.setDate(prev.getDate() - 1);
      const dateStr = prev.toISOString().split('T')[0];
      return { prevFrom: dateStr, prevTo: dateStr };
    }
  }
}

// ---- CSV Generation Helpers ----

function escapeCsvField(field: string | number): string {
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(...fields: (string | number)[]): string {
  return fields.map(escapeCsvField).join(',');
}

function downloadCsv(content: string, filename: string): void {
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel compatibility
  const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function generateSalesCsv(report: SalesReport): string {
  const lines: string[] = [];

  // Header
  lines.push(csvRow('URY Restaurant - Sales Report'));
  lines.push(csvRow('Period', `${report.from_date} to ${report.to_date}`));
  lines.push(csvRow('Generated', new Date().toLocaleString()));
  lines.push('');

  // Summary
  lines.push(csvRow('--- Summary ---'));
  lines.push(csvRow('Metric', 'Value'));
  lines.push(csvRow('Total Revenue', report.summary.total_revenue.toFixed(2)));
  lines.push(csvRow('Total Orders', report.summary.total_orders));
  lines.push(csvRow('Avg Order Value', report.summary.avg_order_value.toFixed(2)));
  lines.push(csvRow('Net Revenue', report.summary.net_revenue.toFixed(2)));
  lines.push(csvRow('Total Tax', report.summary.total_tax.toFixed(2)));
  lines.push(csvRow('Unique Customers', report.summary.unique_customers));
  lines.push('');

  // Item Sales
  if (report.item_sales.length > 0) {
    lines.push(csvRow('--- Item-wise Sales ---'));
    lines.push(csvRow('Item', 'Qty', 'Avg Rate', 'Total Amount'));
    report.item_sales.forEach((item) => {
      lines.push(csvRow(item.item_name, item.total_qty, item.avg_rate.toFixed(2), item.total_amount.toFixed(2)));
    });
    lines.push('');
  }

  // Order Type Sales
  if (report.order_type_sales.length > 0) {
    lines.push(csvRow('--- Order Type Breakdown ---'));
    lines.push(csvRow('Order Type', 'Orders', 'Revenue'));
    report.order_type_sales.forEach((ot) => {
      lines.push(csvRow(ot.order_type, ot.order_count, ot.revenue.toFixed(2)));
    });
    lines.push('');
  }

  // Cancelled Orders
  if (report.cancelled_orders.count > 0) {
    lines.push(csvRow('--- Cancelled Orders ---'));
    lines.push(csvRow('Count', 'Amount'));
    lines.push(csvRow(report.cancelled_orders.count, report.cancelled_orders.amount.toFixed(2)));
    lines.push('');
  }

  return lines.join('\n');
}

function generateExpenseCsv(report: ExpenseReport): string {
  const lines: string[] = [];

  lines.push(csvRow('URY Restaurant - Expense Report'));
  lines.push(csvRow('Period', `${report.from_date} to ${report.to_date}`));
  lines.push(csvRow('Generated', new Date().toLocaleString()));
  lines.push('');

  // Summary
  lines.push(csvRow('--- Summary ---'));
  lines.push(csvRow('Category', 'Amount'));
  lines.push(csvRow('Fixed Expenses', report.total_fixed.toFixed(2)));
  lines.push(csvRow('Variable Expenses', report.total_variable.toFixed(2)));
  lines.push(csvRow('Total Expenses', report.total_expenses.toFixed(2)));
  lines.push('');

  // Fixed Expenses
  if (report.fixed_expenses.length > 0) {
    lines.push(csvRow('--- Fixed Expenses ---'));
    lines.push(csvRow('Type', 'Description', 'Amount'));
    report.fixed_expenses.forEach((exp: ExpenseItem) => {
      lines.push(csvRow(exp.expense_type, exp.description || '', exp.amount.toFixed(2)));
    });
    lines.push('');
  }

  // Variable Expenses
  if (report.variable_expenses.length > 0) {
    lines.push(csvRow('--- Variable Expenses ---'));
    lines.push(csvRow('Date', 'Type', 'Description', 'Amount'));
    report.variable_expenses.forEach((exp: ExpenseItem) => {
      lines.push(csvRow(exp.date || '', exp.expense_type, exp.description || '', exp.amount.toFixed(2)));
    });
    lines.push('');
  }

  return lines.join('\n');
}

function generatePLCsv(report: ProfitLossReport): string {
  const lines: string[] = [];

  lines.push(csvRow('URY Restaurant - Profit & Loss Report'));
  lines.push(csvRow('Period', `${report.from_date} to ${report.to_date}`));
  lines.push(csvRow('Generated', new Date().toLocaleString()));
  lines.push('');

  lines.push(csvRow('Item', 'Amount'));
  lines.push(csvRow('Total Revenue', report.total_revenue.toFixed(2)));
  lines.push(csvRow('Cost of Goods', (-report.cost_of_goods).toFixed(2)));
  lines.push(csvRow('Gross Profit', report.gross_profit.toFixed(2)));
  lines.push(csvRow('Fixed Expenses', (-report.fixed_expenses).toFixed(2)));
  lines.push(csvRow('Variable Expenses', (-report.variable_expenses).toFixed(2)));
  lines.push(csvRow('Total Expenses', (-report.total_expenses).toFixed(2)));
  lines.push(csvRow('Net Profit', report.net_profit.toFixed(2)));
  lines.push(csvRow('Profit Margin', `${report.profit_margin}%`));

  return lines.join('\n');
}

function generateInventoryCsv(report: InventoryReport): string {
  const lines: string[] = [];

  lines.push(csvRow('URY Restaurant - Inventory Report'));
  lines.push(csvRow('As of', `${report.from_date} to ${report.to_date}`));
  lines.push(csvRow('Generated', new Date().toLocaleString()));
  lines.push('');

  // Summary
  lines.push(csvRow('--- Summary ---'));
  lines.push(csvRow('Metric', 'Value'));
  lines.push(csvRow('Total Items', report.summary.total_items));
  lines.push(csvRow('Low Stock Items', report.summary.low_stock_items));
  lines.push(csvRow('Out of Stock Items', report.summary.out_of_stock_items));
  lines.push(csvRow('Total Stock Value', report.summary.total_stock_value.toFixed(2)));
  lines.push('');

  // Items
  lines.push(csvRow('--- Stock Levels ---'));
  lines.push(csvRow('Item', 'Code', 'Current Stock', 'Reorder Level', 'Unit', 'Valuation Rate', 'Stock Value', 'Status'));
  report.items.forEach((item) => {
    lines.push(csvRow(
      item.item_name,
      item.item_code,
      item.current_stock,
      item.reorder_level,
      item.stock_uom,
      item.valuation_rate.toFixed(2),
      item.stock_value.toFixed(2),
      item.status
    ));
  });

  return lines.join('\n');
}

// ---- PDF Helpers ----

// Helper to get the Y position after the last autoTable
function getLastTableY(doc: jsPDF): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable?.finalY || 80;
}

function addReportHeader(doc: jsPDF, reportType: ReportType): void {
  const companyName = 'URY Restaurant';
  const now = new Date();
  const timestamp = now.toLocaleString();

  // Company header
  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.text(companyName, 14, 16);

  // Report title
  const titleMap: Record<ReportType, string> = {
    sales: 'Sales Report',
    expense: 'Expense Report',
    profit_loss: 'Profit & Loss Report',
    inventory: 'Inventory Report',
  };

  const colorMap: Record<ReportType, [number, number, number]> = {
    sales: [26, 86, 219],
    expense: [220, 38, 38],
    profit_loss: [5, 150, 105],
    inventory: [124, 58, 237],
  };

  doc.setFontSize(20);
  doc.setTextColor(...(colorMap[reportType] || [26, 86, 219]));
  doc.setFont('helvetica', 'bold');
  doc.text(titleMap[reportType] || 'Report', 14, 28);

  // Generation timestamp
  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${timestamp}`, 14, 34);

  // Separator line
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.5);
  doc.line(14, 37, 196, 37);
}

function addReportFooter(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Footer line
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.line(14, 282, 196, 282);

    // Page number
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.setFont('helvetica', 'normal');
    doc.text(`Page ${i} of ${pageCount}`, 14, 288);

    // Generated by
    doc.text('Generated by URY POS', 196, 288, { align: 'right' });
  }
}

function addSummarySection(
  doc: jsPDF,
  startY: number,
  title: string,
  data: [string, string][],
  accentColor: [number, number, number]
): number {
  // Summary section title with colored bar
  doc.setFillColor(...accentColor);
  doc.rect(14, startY, 3, 8, 'F');

  doc.setFontSize(13);
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 20, startY + 6.5);

  // Summary metrics with large bold numbers
  autoTable(doc, {
    startY: startY + 12,
    head: [['Metric', 'Value']],
    body: data,
    theme: 'grid',
    headStyles: {
      fillColor: accentColor,
      fontStyle: 'bold',
      fontSize: 10,
    },
    bodyStyles: {
      fontSize: 10,
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 80 },
      1: { halign: 'right', fontStyle: 'bold', fontSize: 11 },
    },
    margin: { left: 14 },
  });

  return getLastTableY(doc);
}

// ---- Client-side PDF generators ----

function _generateSalesPdf(doc: jsPDF, report: SalesReport) {
  const accentColor: [number, number, number] = [26, 86, 219];

  // Period info
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.setFont('helvetica', 'normal');
  doc.text(`Period: ${report.from_date} - ${report.to_date}`, 14, 42);

  // Summary section
  const summaryY = addSummarySection(doc, 48, 'Summary', [
    ['Total Revenue', `${report.summary.total_revenue.toFixed(2)}`],
    ['Total Orders', `${report.summary.total_orders}`],
    ['Avg Order Value', `${report.summary.avg_order_value.toFixed(2)}`],
    ['Net Revenue', `${report.summary.net_revenue.toFixed(2)}`],
    ['Total Tax', `${report.summary.total_tax.toFixed(2)}`],
    ['Unique Customers', `${report.summary.unique_customers}`],
  ], accentColor);

  // Cancelled orders note
  if (report.cancelled_orders.count > 0) {
    let currentY = summaryY + 8;
    if (currentY > 260) {
      doc.addPage();
      currentY = 20;
    }
    doc.setFontSize(10);
    doc.setTextColor(220, 38, 38);
    doc.text(`⚠ ${report.cancelled_orders.count} cancelled orders (${report.cancelled_orders.amount.toFixed(2)} amount)`, 14, currentY);
  }

  // Item-wise sales table
  if (report.item_sales.length > 0) {
    let currentY = getLastTableY(doc);
    if (currentY > 240) {
      doc.addPage();
      currentY = 20;
    }

    // Section header
    doc.setFillColor(...accentColor);
    doc.rect(14, currentY + 8, 3, 8, 'F');
    doc.setFontSize(13);
    doc.setTextColor(17, 24, 39);
    doc.setFont('helvetica', 'bold');
    doc.text('Item-wise Sales', 20, currentY + 14.5);

    autoTable(doc, {
      startY: currentY + 20,
      head: [['Item', 'Qty', 'Avg Rate', 'Total']],
      body: report.item_sales.map((item) => [
        item.item_name,
        item.total_qty,
        item.avg_rate.toFixed(2),
        item.total_amount.toFixed(2),
      ]),
      theme: 'striped',
      headStyles: { fillColor: accentColor, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      margin: { left: 14 },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right', fontStyle: 'bold' },
      },
    });
  }

  // Order type breakdown
  if (report.order_type_sales.length > 0) {
    let currentY = getLastTableY(doc);
    if (currentY > 240) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFillColor(...accentColor);
    doc.rect(14, currentY + 8, 3, 8, 'F');
    doc.setFontSize(13);
    doc.setTextColor(17, 24, 39);
    doc.setFont('helvetica', 'bold');
    doc.text('Order Type Breakdown', 20, currentY + 14.5);

    autoTable(doc, {
      startY: currentY + 20,
      head: [['Order Type', 'Orders', 'Revenue']],
      body: report.order_type_sales.map((o) => [
        o.order_type,
        o.order_count,
        o.revenue.toFixed(2),
      ]),
      theme: 'striped',
      headStyles: { fillColor: accentColor, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      margin: { left: 14 },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right', fontStyle: 'bold' },
      },
    });
  }

  // Top Customers
  if (report.top_customers.length > 0) {
    let currentY = getLastTableY(doc);
    if (currentY > 240) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFillColor(...accentColor);
    doc.rect(14, currentY + 8, 3, 8, 'F');
    doc.setFontSize(13);
    doc.setTextColor(17, 24, 39);
    doc.setFont('helvetica', 'bold');
    doc.text('Top Customers', 20, currentY + 14.5);

    autoTable(doc, {
      startY: currentY + 20,
      head: [['#', 'Customer', 'Orders', 'Total Spent']],
      body: report.top_customers.slice(0, 15).map((c, idx) => [
        idx + 1,
        c.customer_name,
        c.order_count,
        c.total_spent.toFixed(2),
      ]),
      theme: 'striped',
      headStyles: { fillColor: accentColor, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      margin: { left: 14 },
      columnStyles: {
        0: { cellWidth: 12 },
        2: { halign: 'right' },
        3: { halign: 'right', fontStyle: 'bold' },
      },
    });
  }
}

function _generateExpensePdf(doc: jsPDF, report: ExpenseReport) {
  const accentColor: [number, number, number] = [220, 38, 38];

  // Period info
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.setFont('helvetica', 'normal');
  doc.text(`Period: ${report.from_date} - ${report.to_date}`, 14, 42);

  // Summary section
  const summaryY = addSummarySection(doc, 48, 'Summary', [
    ['Fixed Expenses', `${report.total_fixed.toFixed(2)}`],
    ['Variable Expenses', `${report.total_variable.toFixed(2)}`],
    ['Total Expenses', `${report.total_expenses.toFixed(2)}`],
  ], accentColor);

  // Fixed Expenses table
  if (report.fixed_expenses.length > 0) {
    let currentY = summaryY + 8;
    if (currentY > 240) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFillColor(...accentColor);
    doc.rect(14, currentY + 8, 3, 8, 'F');
    doc.setFontSize(13);
    doc.setTextColor(17, 24, 39);
    doc.setFont('helvetica', 'bold');
    doc.text('Fixed Expenses', 20, currentY + 14.5);

    autoTable(doc, {
      startY: currentY + 20,
      head: [['Type', 'Description', 'Amount']],
      body: report.fixed_expenses.map((exp: ExpenseItem) => [
        exp.expense_type,
        exp.description || '—',
        exp.amount.toFixed(2),
      ]),
      theme: 'striped',
      headStyles: { fillColor: accentColor, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      margin: { left: 14 },
      columnStyles: {
        2: { halign: 'right', fontStyle: 'bold' },
      },
    });
  }

  // Variable Expenses table
  if (report.variable_expenses.length > 0) {
    let currentY = getLastTableY(doc);
    if (currentY > 240) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFillColor(...accentColor);
    doc.rect(14, currentY + 8, 3, 8, 'F');
    doc.setFontSize(13);
    doc.setTextColor(17, 24, 39);
    doc.setFont('helvetica', 'bold');
    doc.text('Variable Expenses', 20, currentY + 14.5);

    autoTable(doc, {
      startY: currentY + 20,
      head: [['Date', 'Type', 'Description', 'Amount']],
      body: report.variable_expenses.map((exp: ExpenseItem) => [
        exp.date || '',
        exp.expense_type,
        exp.description || '—',
        exp.amount.toFixed(2),
      ]),
      theme: 'striped',
      headStyles: { fillColor: accentColor, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      margin: { left: 14 },
      columnStyles: {
        3: { halign: 'right', fontStyle: 'bold' },
      },
    });
  }
}

function _generatePLPdf(doc: jsPDF, report: ProfitLossReport) {

  // Period info
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.setFont('helvetica', 'normal');
  doc.text(`Period: ${report.from_date} - ${report.to_date}`, 14, 42);

  // Revenue section
  let currentY = 48;
  doc.setFillColor(5, 150, 105);
  doc.rect(14, currentY, 3, 8, 'F');
  doc.setFontSize(13);
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.text('Revenue', 20, currentY + 6.5);

  autoTable(doc, {
    startY: currentY + 12,
    head: [['Item', 'Amount']],
    body: [
      ['Total Revenue', `${report.total_revenue.toFixed(2)}`],
      ['Net Revenue', `${report.net_revenue.toFixed(2)}`],
      ['Total Tax', `${report.total_tax.toFixed(2)}`],
    ],
    theme: 'grid',
    headStyles: { fillColor: [5, 150, 105], fontStyle: 'bold' },
    bodyStyles: { fontSize: 10 },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    margin: { left: 14 },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right', fontStyle: 'bold', fontSize: 11 },
    },
  });

  // Cost section
  currentY = getLastTableY(doc) + 8;
  if (currentY > 240) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFillColor(220, 38, 38);
  doc.rect(14, currentY, 3, 8, 'F');
  doc.setFontSize(13);
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.text('Cost of Goods', 20, currentY + 6.5);

  autoTable(doc, {
    startY: currentY + 12,
    head: [['Item', 'Amount']],
    body: [
      ['Cost of Goods', `-${report.cost_of_goods.toFixed(2)}`],
      ['Gross Profit', `${report.gross_profit.toFixed(2)}`],
    ],
    theme: 'grid',
    headStyles: { fillColor: [220, 38, 38], fontStyle: 'bold' },
    bodyStyles: { fontSize: 10 },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    margin: { left: 14 },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right', fontStyle: 'bold', fontSize: 11 },
    },
  });

  // Expenses section
  currentY = getLastTableY(doc) + 8;
  if (currentY > 240) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFillColor(234, 88, 12);
  doc.rect(14, currentY, 3, 8, 'F');
  doc.setFontSize(13);
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.text('Operating Expenses', 20, currentY + 6.5);

  autoTable(doc, {
    startY: currentY + 12,
    head: [['Item', 'Amount']],
    body: [
      ['Fixed Expenses', `-${report.fixed_expenses.toFixed(2)}`],
      ['Variable Expenses', `-${report.variable_expenses.toFixed(2)}`],
      ['Total Expenses', `-${report.total_expenses.toFixed(2)}`],
    ],
    theme: 'grid',
    headStyles: { fillColor: [234, 88, 12], fontStyle: 'bold' },
    bodyStyles: { fontSize: 10 },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    margin: { left: 14 },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right', fontStyle: 'bold', fontSize: 11 },
    },
  });

  // Net Profit section
  currentY = getLastTableY(doc) + 8;
  if (currentY > 240) {
    doc.addPage();
    currentY = 20;
  }

  const isProfit = report.net_profit >= 0;
  const profitColor: [number, number, number] = isProfit ? [5, 150, 105] : [220, 38, 38];

  doc.setFillColor(...profitColor);
  doc.rect(14, currentY, 3, 8, 'F');
  doc.setFontSize(13);
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.text('Net Result', 20, currentY + 6.5);

  autoTable(doc, {
    startY: currentY + 12,
    head: [['Item', 'Amount']],
    body: [
      ['Net Profit', `${report.net_profit.toFixed(2)}`],
      ['Profit Margin', `${report.profit_margin}%`],
    ],
    theme: 'grid',
    headStyles: { fillColor: profitColor, fontStyle: 'bold' },
    bodyStyles: { fontSize: 11 },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    margin: { left: 14 },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right', fontStyle: 'bold', fontSize: 12 },
    },
  });
}

function _generateInventoryPdf(doc: jsPDF, report: InventoryReport) {
  const accentColor: [number, number, number] = [124, 58, 237];

  // Period info
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.setFont('helvetica', 'normal');
  doc.text(`As of: ${report.from_date} - ${report.to_date}`, 14, 42);

  // Summary section
  const summaryY = addSummarySection(doc, 48, 'Inventory Summary', [
    ['Total Items', `${report.summary.total_items}`],
    ['Low Stock Items', `${report.summary.low_stock_items}`],
    ['Out of Stock Items', `${report.summary.out_of_stock_items}`],
    ['Total Stock Value', `${report.summary.total_stock_value.toFixed(2)}`],
  ], accentColor);

  // Inventory table
  if (report.items.length > 0) {
    let currentY = summaryY + 8;
    if (currentY > 240) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFillColor(...accentColor);
    doc.rect(14, currentY + 8, 3, 8, 'F');
    doc.setFontSize(13);
    doc.setTextColor(17, 24, 39);
    doc.setFont('helvetica', 'bold');
    doc.text('Stock Levels', 20, currentY + 14.5);

    autoTable(doc, {
      startY: currentY + 20,
      head: [['Item', 'Current Stock', 'Reorder Level', 'Unit', 'Value', 'Status']],
      body: report.items.map((item) => [
        item.item_name,
        item.current_stock,
        item.reorder_level,
        item.stock_uom,
        item.stock_value.toFixed(2),
        item.status,
      ]),
      theme: 'striped',
      headStyles: { fillColor: accentColor, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      margin: { left: 14 },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { halign: 'right' },
        2: { halign: 'right' },
        4: { halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: 25 },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 5) {
          const status = data.cell.raw;
          if (status === 'Out of Stock') {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          } else if (status === 'Low') {
            data.cell.styles.textColor = [217, 119, 6];
            data.cell.styles.fontStyle = 'bold';
          } else if (status === 'OK') {
            data.cell.styles.textColor = [5, 150, 105];
          }
        }
      },
    });
  }
}
