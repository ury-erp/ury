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
  Percent,
} from 'lucide-react';

export interface ReportEntry {
  id: string;
  label: string;
  group: string;
  path: string;
  icon: LucideIcon;
}

export const reportsRegistry: ReportEntry[] = [
  { id: 'today-sales', label: "Today's Sales", group: 'Sales Summary', path: 'today-sales', icon: Sun },
  { id: 'daywise-sales', label: 'Daywise Sales', group: 'Sales Summary', path: 'daywise-sales', icon: CalendarDays },
  { id: 'daywise-invoices', label: 'Daywise Invoices', group: 'Sales Summary', path: 'daywise-invoices', icon: Receipt },
  { id: 'month-wise-sales', label: 'Month Wise Sales', group: 'Sales Summary', path: 'month-wise-sales', icon: BarChart3 },
  { id: 'time-wise-sales', label: 'Time Wise Sales', group: 'Sales Summary', path: 'time-wise-sales', icon: Clock },
  { id: 'service-wise-sales', label: 'Service Wise Sales', group: 'Sales Summary', path: 'service-wise-sales', icon: PieChart },
  { id: 'cancelled-invoices', label: 'Cancelled Invoices', group: 'Sales Summary', path: 'cancelled-invoices', icon: Ban },
  { id: 'average-bill-value', label: 'Average Bill Value', group: 'Sales Summary', path: 'average-bill-value', icon: Gauge },

  { id: 'item-wise-sales', label: 'Item Wise Sales', group: 'Customers & Items', path: 'item-wise-sales', icon: Package },
  { id: 'item-wise-purchase-history', label: 'Item-wise Purchase History', group: 'Customers & Items', path: 'item-wise-purchase-history', icon: ShoppingCart },
  { id: 'customer-data', label: 'Customer Data', group: 'Customers & Items', path: 'customer-data', icon: Users },
  { id: 'daywise-customer-details', label: 'Daywise Customer Details', group: 'Customers & Items', path: 'daywise-customer-details', icon: UserPlus },
  { id: 'repeated-customers', label: 'Repeated Customers', group: 'Customers & Items', path: 'repeated-customers', icon: Repeat },

  { id: 'employee-sales', label: 'Employee Sales', group: 'Employees & Operations', path: 'employee-sales', icon: UserCog },
  { id: 'employee-commission', label: 'Employee Commission', group: 'Employees & Operations', path: 'employee-commission', icon: Percent },
  { id: 'employee-item-wise-sales', label: 'Employee Item Wise Sales', group: 'Employees & Operations', path: 'employee-item-wise-sales', icon: ClipboardList },
  { id: 'completed-work-orders', label: 'Completed Work Orders', group: 'Employees & Operations', path: 'completed-work-orders', icon: Factory },

  { id: 'daily-pnl', label: 'Daily P&L', group: 'Financial', path: 'daily-pnl', icon: IndianRupee },
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
