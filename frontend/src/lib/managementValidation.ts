import type { DashboardSummary } from '../services/dashboard';

export function unwrapResponse(value: unknown): unknown {
  return value !== null && typeof value === 'object' && 'message' in value
    ? (value as { message: unknown }).message
    : value;
}

export function readDashboardSummary(response: unknown): DashboardSummary {
  const data = unwrapResponse(response);
  const fields: (keyof DashboardSummary)[] = [
    'today_sales', 'today_orders', 'occupied_tables', 'total_tables',
    'avg_order_value', 'active_cashiers', 'pending_kitchen_orders', 'total_menu_items',
  ];
  if (!data || typeof data !== 'object' || fields.some((field) => {
    const value = (data as Record<string, unknown>)[field];
    return typeof value !== 'number' || !Number.isFinite(value);
  })) {
    throw new Error('Invalid dashboard response');
  }
  return data as DashboardSummary;
}

export function readListResponse<T>(response: unknown): T[] {
  const data = unwrapResponse(response);
  if (!Array.isArray(data)) throw new Error('Invalid list response');
  return data;
}

export interface WizardStatus {
  step1_complete: boolean;
  step2_complete: boolean;
}

export function readWizardStatus(response: unknown): WizardStatus {
  const data = unwrapResponse(response);
  if (!data || typeof data !== 'object') throw new Error('Invalid setup status');
  const status = data as Record<string, unknown>;
  const isFlag = (value: unknown) => typeof value === 'boolean' || value === 0 || value === 1;
  if (!isFlag(status.step1_complete) || !isFlag(status.step2_complete)) {
    throw new Error('Invalid setup status');
  }
  return {
    step1_complete: Boolean(status.step1_complete),
    step2_complete: Boolean(status.step2_complete),
  };
}
