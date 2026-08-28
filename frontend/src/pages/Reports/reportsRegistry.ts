import type { LucideIcon } from 'lucide-react';
import {
  Sun,
  CalendarDays,
  Receipt,
  BarChart3,
  Clock,
  PieChart,
  Ban,
  Gauge,
  Package,
  ShoppingCart,
  Users,
  UserPlus,
  Repeat,
  UserCog,
  ClipboardList,
  Factory,
  IndianRupee,
} from 'lucide-react';

export interface ReportEntry {
  id: string;
  label: string;
  group: string;
  path: string;
  icon: LucideIcon;
}

/**
 * Accent color token per report category — used as a left-accent / icon
 * tint wherever a report is shown outside its plain sidebar row (e.g. the
 * 'Start here' cards on ReportsHome). Keep this in sync with any new
 * category added to the registry below.
 */
export const categoryColors: Record<string, string> = {
  Sales: '#2563eb', // blue
  'Menu & Purchasing': '#d97706', // amber
  Customers: '#7c3aed', // violet
  'Team & Operations': '#0d9488', // teal
  Exceptions: '#dc2626', // red
  Finance: '#16a34a', // green
};

export const reportsRegistry: ReportEntry[] = [
  { id: 'today-sales', label: "Today's Sales", group: 'Sales', path: 'today-sales', icon: Sun },
  { id: 'daywise-sales', label: 'Daywise Sales', group: 'Sales', path: 'daywise-sales', icon: CalendarDays },
  { id: 'daywise-invoices', label: 'Daywise Invoices', group: 'Sales', path: 'daywise-invoices', icon: Receipt },
  { id: 'month-wise-sales', label: 'Month Wise Sales', group: 'Sales', path: 'month-wise-sales', icon: BarChart3 },
  { id: 'time-wise-sales', label: 'Time Wise Sales', group: 'Sales', path: 'time-wise-sales', icon: Clock },
  { id: 'service-wise-sales', label: 'Service Wise Sales', group: 'Sales', path: 'service-wise-sales', icon: PieChart },
  { id: 'average-bill-value', label: 'Average Bill Value', group: 'Sales', path: 'average-bill-value', icon: Gauge },

  { id: 'item-wise-sales', label: 'Item Wise Sales', group: 'Menu & Purchasing', path: 'item-wise-sales', icon: Package },
  { id: 'item-wise-purchase-history', label: 'Item-wise Purchase History', group: 'Menu & Purchasing', path: 'item-wise-purchase-history', icon: ShoppingCart },

  { id: 'customer-data', label: 'Customer Data', group: 'Customers', path: 'customer-data', icon: Users },
  { id: 'daywise-customer-details', label: 'Daywise Customer Details', group: 'Customers', path: 'daywise-customer-details', icon: UserPlus },
  { id: 'repeated-customers', label: 'Repeat Customers', group: 'Customers', path: 'repeated-customers', icon: Repeat },

  { id: 'employee-sales', label: 'Employee Sales', group: 'Team & Operations', path: 'employee-sales', icon: UserCog },
  { id: 'employee-item-wise-sales', label: 'Employee Item Wise Sales', group: 'Team & Operations', path: 'employee-item-wise-sales', icon: ClipboardList },
  { id: 'completed-work-orders', label: 'Completed Work Orders', group: 'Team & Operations', path: 'completed-work-orders', icon: Factory },

  { id: 'cancelled-invoices', label: 'Cancelled Invoices', group: 'Exceptions', path: 'cancelled-invoices', icon: Ban },

  { id: 'daily-pnl', label: 'Daily P&L', group: 'Finance', path: 'daily-pnl', icon: IndianRupee },
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
