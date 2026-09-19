import type { LucideIcon } from 'lucide-react';
import { t } from '../../i18n';
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
  /** English fallback; render via `reportLabel()` so the active locale wins. */
  label: string;
  /** Stable group key, translated via `reportGroupLabel()`. */
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
  { id: 'employee-item-wise-sales', label: 'Employee Item Wise Sales', group: 'Employees & Operations', path: 'employee-item-wise-sales', icon: ClipboardList },
  { id: 'completed-work-orders', label: 'Completed Work Orders', group: 'Employees & Operations', path: 'completed-work-orders', icon: Factory },

  { id: 'daily-pnl', label: 'Daily P&L', group: 'Financial', path: 'daily-pnl', icon: IndianRupee },
];

/**
 * Translated report name.
 *
 * Resolved at render time, never at module scope: this module is imported
 * while `initI18n()` is still in flight, so a top-level `t()` would bake in
 * English before the locale finished loading.
 */
export function reportLabel(report: ReportEntry): string {
  const key = `reports.items.${report.id}`;
  const translated = t(key);
  // `t()` echoes the key when a string is missing, so compare against it
  // rather than testing truthiness — the key is always truthy.
  return translated === key ? report.label : translated;
}

/** Translated group heading, keyed off the stable English group name. */
export function reportGroupLabel(group: string): string {
  const key = group.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const translated = t(`reports.groups.${key}`);
  return translated === `reports.groups.${key}` ? group : translated;
}

export function groupReports(reports: ReportEntry[]): Record<string, ReportEntry[]> {
  return reports.reduce<Record<string, ReportEntry[]>>((acc, report) => {
    if (!acc[report.group]) {
      acc[report.group] = [];
    }
    acc[report.group].push(report);
    return acc;
  }, {});
}
