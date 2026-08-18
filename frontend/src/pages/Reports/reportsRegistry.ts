export interface ReportEntry {
  id: string;
  label: string;
  group: string;
  path: string;
}

export const reportsRegistry: ReportEntry[] = [
  { id: 'today-sales', label: "Today's Sales", group: 'Sales Summary', path: 'today-sales' },
  { id: 'daywise-sales', label: 'Daywise Sales', group: 'Sales Summary', path: 'daywise-sales' },
  { id: 'daywise-invoices', label: 'Daywise Invoices', group: 'Sales Summary', path: 'daywise-invoices' },
  { id: 'month-wise-sales', label: 'Month Wise Sales', group: 'Sales Summary', path: 'month-wise-sales' },
  { id: 'time-wise-sales', label: 'Time Wise Sales', group: 'Sales Summary', path: 'time-wise-sales' },
  { id: 'service-wise-sales', label: 'Service Wise Sales', group: 'Sales Summary', path: 'service-wise-sales' },
  { id: 'cancelled-invoices', label: 'Cancelled Invoices', group: 'Sales Summary', path: 'cancelled-invoices' },
  { id: 'average-bill-value', label: 'Average Bill Value', group: 'Sales Summary', path: 'average-bill-value' },

  { id: 'item-wise-sales', label: 'Item Wise Sales', group: 'Customers & Items', path: 'item-wise-sales' },
  { id: 'item-wise-purchase-history', label: 'Item-wise Purchase History', group: 'Customers & Items', path: 'item-wise-purchase-history' },
  { id: 'customer-data', label: 'Customer Data', group: 'Customers & Items', path: 'customer-data' },
  { id: 'daywise-customer-details', label: 'Daywise Customer Details', group: 'Customers & Items', path: 'daywise-customer-details' },
  { id: 'repeated-customers', label: 'Repeated Customers', group: 'Customers & Items', path: 'repeated-customers' },

  { id: 'employee-sales', label: 'Employee Sales', group: 'Employees & Operations', path: 'employee-sales' },
  { id: 'employee-item-wise-sales', label: 'Employee Item Wise Sales', group: 'Employees & Operations', path: 'employee-item-wise-sales' },
  { id: 'completed-work-orders', label: 'Completed Work Orders', group: 'Employees & Operations', path: 'completed-work-orders' },

  { id: 'daily-pnl', label: 'Daily P&L', group: 'Financial', path: 'daily-pnl' },
];

export function groupReports(reports: ReportEntry[]): Record<string, ReportEntry[]> {
  return reports.reduce<Record<string, ReportEntry[]>>((acc, report) => {
    if (!acc[report.group]) {
      acc[report.group] = [];
    }
    acc[report.group].push(report);
    return acc;
  }, {});
}
