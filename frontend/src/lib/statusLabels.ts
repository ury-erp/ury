import { t } from '../i18n';

/**
 * Display labels for values the server sends in English — POS Invoice
 * statuses, order types, table states. They were rendered raw ("Paid",
 * "Consolidated", "Dine In") on an otherwise Arabic dashboard.
 *
 * Keys are the server values; anything unknown is shown as sent rather than
 * as an empty or "missing key" label, so a new ERPNext status never blanks
 * the column.
 */

const INVOICE_STATUS_KEYS: Record<string, string> = {
  Draft: 'draft',
  Submitted: 'submitted',
  Paid: 'paid',
  Unpaid: 'unpaid',
  'Partly Paid': 'partly_paid',
  Overdue: 'overdue',
  Consolidated: 'consolidated',
  Return: 'return',
  'Credit Note Issued': 'credit_note_issued',
  'Debit Note Issued': 'debit_note_issued',
  Cancelled: 'cancelled',
  'Unpaid and Discounted': 'unpaid',
  'Overdue and Discounted': 'overdue',
};

const ORDER_TYPE_KEYS: Record<string, string> = {
  'Dine In': 'dine_in',
  'Take Away': 'take_away',
  Delivery: 'delivery',
  'Phone In': 'phone_in',
  Aggregators: 'aggregators',
  Aggregator: 'aggregators',
};

const TABLE_STATUS_KEYS: Record<string, string> = {
  Available: 'available',
  Occupied: 'occupied',
};

function lookup(group: string, keys: Record<string, string>, value?: string | null): string {
  if (!value) return '';
  const key = keys[value];
  return key ? t(`labels.${group}.${key}`) : value;
}

export const invoiceStatusLabel = (status?: string | null) => lookup('invoice_status', INVOICE_STATUS_KEYS, status);
export const orderTypeLabel = (orderType?: string | null) => lookup('order_type', ORDER_TYPE_KEYS, orderType);
export const tableStatusLabel = (status?: string | null) => lookup('table_status', TABLE_STATUS_KEYS, status);

/** Badge tone for an invoice status: settled green, open amber, reversed red. */
export function invoiceStatusTone(status?: string | null): 'success' | 'warning' | 'danger' | 'secondary' {
  switch (status) {
    case 'Paid':
    case 'Submitted':
    case 'Consolidated':
      return 'success';
    case 'Cancelled':
    case 'Return':
    case 'Credit Note Issued':
    case 'Debit Note Issued':
    case 'Overdue':
      return 'danger';
    case 'Draft':
      return 'secondary';
    default:
      return 'warning';
  }
}

/**
 * Server dates ("2026-10-02") and times ("14:05:33.123456") for table cells.
 * Parsed by hand rather than through `new Date(string)`, which reads a bare
 * date as UTC and can shift it a day; formatted with the active locale so an
 * Iraqi screen reads "2 تشرين الأول 2026" and "2:05 م".
 */
export function formatServerDate(date?: string | null, locale?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date || '');
  if (!m) return date || '';
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatServerTime(time?: string | null, locale?: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time || '');
  if (!m) return time || '';
  const d = new Date();
  d.setHours(+m[1], +m[2], 0, 0);
  return d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}
