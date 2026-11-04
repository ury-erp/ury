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
import { __ } from '../../i18n';

export interface ReportEntry {
  id: string;
  label: string;
  group: string;
  path: string;
  icon: LucideIcon;
}

export const reportsRegistry: ReportEntry[] = [
  { id: 'today-sales', label: __("Today's Sales"), group: 'Sales Summary', path: 'today-sales', icon: Sun },
  { id: 'daywise-sales', label: __('Daywise Sales'), group: 'Sales Summary', path: 'daywise-sales', icon: CalendarDays },
  { id: 'daywise-invoices', label: __('Daywise Invoices'), group: 'Sales Summary', path: 'daywise-invoices', icon: Receipt },
  { id: 'month-wise-sales', label: __('Month Wise Sales'), group: 'Sales Summary', path: 'month-wise-sales', icon: BarChart3 },
  { id: 'time-wise-sales', label: __('Time Wise Sales'), group: 'Sales Summary', path: 'time-wise-sales', icon: Clock },
  { id: 'service-wise-sales', label: __('Service Wise Sales'), group: 'Sales Summary', path: 'service-wise-sales', icon: PieChart },
  { id: 'cancelled-invoices', label: __('Cancelled Invoices'), group: 'Sales Summary', path: 'cancelled-invoices', icon: Ban },
  { id: 'average-bill-value', label: __('Average Bill Value'), group: 'Sales Summary', path: 'average-bill-value', icon: Gauge },

  { id: 'item-wise-sales', label: __('Item Wise Sales'), group: 'Customers & Items', path: 'item-wise-sales', icon: Package },
  { id: 'item-wise-purchase-history', label: __('Item-wise Purchase History'), group: 'Customers & Items', path: 'item-wise-purchase-history', icon: ShoppingCart },
  { id: 'customer-data', label: __('Customer Data'), group: 'Customers & Items', path: 'customer-data', icon: Users },
  { id: 'daywise-customer-details', label: __('Daywise Customer Details'), group: 'Customers & Items', path: 'daywise-customer-details', icon: UserPlus },
  { id: 'repeated-customers', label: __('Repeated Customers'), group: 'Customers & Items', path: 'repeated-customers', icon: Repeat },

  { id: 'employee-sales', label: __('Employee Sales'), group: 'Employees & Operations', path: 'employee-sales', icon: UserCog },
  { id: 'employee-commission', label: __('Employee Commission'), group: 'Employees & Operations', path: 'employee-commission', icon: Percent },
  { id: 'employee-item-wise-sales', label: __('Employee Item Wise Sales'), group: 'Employees & Operations', path: 'employee-item-wise-sales', icon: ClipboardList },
  { id: 'completed-work-orders', label: __('Completed Work Orders'), group: 'Employees & Operations', path: 'completed-work-orders', icon: Factory },

  { id: 'daily-pnl', label: __('Daily P&L'), group: 'Financial', path: 'daily-pnl', icon: IndianRupee },
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
