import { buildCsv, messageToPlainText, type CsvColumnSpec } from '@ury/ui';
import type { DepartmentProductionPlanState } from '../../services/salesPlan';

// Shared by the Sales Plan page and the Chef page (track
// sa-chef-ui-production-queue): label/badge lookups for the two independent
// Production Plan state axes (D12), the ERPNext status badge, the Prepare
// polling interval, and small helpers for API errors and CSV downloads.

export type BadgeTone = 'default' | 'tagAccent' | 'tagWarning' | 'tagSuccess' | 'tagDestructive';

export type LinkState = DepartmentProductionPlanState['link_state'];
export type ExecutionState = NonNullable<DepartmentProductionPlanState['execution_state']>;

export const LINK_STATE_LABEL: Record<LinkState, string> = {
  none: 'No Production Plan',
  live: 'Production Plan',
  stale: 'Stale (Sales Plan changed)',
  ineligible: 'Not eligible yet',
};

export const LINK_STATE_BADGE: Record<LinkState, 'default' | 'tagAccent' | 'tagWarning'> = {
  none: 'default',
  live: 'tagAccent',
  stale: 'tagWarning',
  ineligible: 'default',
};

export const EXECUTION_STATE_LABEL: Record<ExecutionState, string> = {
  awaiting_materials: 'Awaiting Materials',
  ready: 'Ready for Production',
  processing: 'Processing',
  completed: 'Production Completed',
  failed: 'Production Failed',
};

export const EXECUTION_STATE_BADGE: Record<ExecutionState, 'tagWarning' | 'tagAccent' | 'tagSuccess' | 'tagDestructive'> = {
  awaiting_materials: 'tagWarning',
  ready: 'tagAccent',
  processing: 'tagAccent',
  completed: 'tagSuccess',
  failed: 'tagDestructive',
};

/** ERPNext Production Plan.status → badge tone for the primary manufacturing signal. */
export const ERPNEXT_STATUS_BADGE: Record<string, BadgeTone> = {
  Draft: 'default',
  Submitted: 'tagAccent',
  'Not Started': 'tagAccent',
  'Material Requested': 'tagWarning',
  'In Process': 'tagAccent',
  Completed: 'tagSuccess',
  Closed: 'default',
  Cancelled: 'tagDestructive',
};

export const PREPARE_POLL_INTERVAL_MS = 4000;
export const CAN_PREPARE_EXECUTION: ExecutionState[] = ['awaiting_materials', 'ready', 'failed'];

export interface ProductionBlockerLike {
  type?: string;
  message?: string;
  item_code?: string;
}

export function describeBlocker(blocker: ProductionBlockerLike): string {
  return blocker.message || `${blocker.type || 'Blocker'}${blocker.item_code ? `: ${blocker.item_code}` : ''}`;
}

/**
 * Pull the actionable reason out of a failed `call` (@ury/core). `call`
 * throws the raw Frappe error object, not an `Error`; the frappe.throw()
 * text lives in the JSON-encoded `_server_messages` array.
 */
export function describeApiError(err: unknown, fallback: string, permissionMessage?: string): string {
  const anyErr = err as { exc_type?: string; _server_messages?: string } | null | undefined;

  if (anyErr?.exc_type === 'frappe.exceptions.PermissionError' && permissionMessage) {
    return permissionMessage;
  }

  if (anyErr?._server_messages) {
    try {
      const messages = JSON.parse(anyErr._server_messages) as string[];
      const first = JSON.parse(messages[0]) as { message?: string };
      if (first?.message) {
        return messageToPlainText(first.message);
      }
    } catch {
      // Unexpected shape -- fall back to the generic message.
    }
  }

  return fallback;
}

/** A filename-safe slug for a department or date. */
export function fileSlug(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'export';
}

/**
 * Download rows as CSV using the shared `buildCsv` (formula-injection-safe
 * cells). These files are handed to people to read, never re-imported, so the
 * `_row_key` column is left out.
 */
export function downloadCsv<T>(filename: string, rows: T[], columns: CsvColumnSpec<T>[]): void {
  if (typeof document === 'undefined') return;
  const csvText = buildCsv(rows, () => '', columns, [], { includeRowKey: false });
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
