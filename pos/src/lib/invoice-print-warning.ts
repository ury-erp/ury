/**
 * Print-time warning for POS invoices.
 *
 * An invoice that has been printed but is still open (Draft / Unbilled) is flagged once
 * it has been waiting at least the POS Profile's "Invoice Warning Time" (minutes).
 * Times are Frappe Datetime strings compared in local time, which assumes the server and
 * the browser share a timezone (true for single-site URY deployments).
 */

export interface PrintWarningInput {
  invoice_printed: number | string;
  status: string;
  custom_printing_time?: string | null;
}

export interface PrintWarningState {
  exceeded: boolean;
  elapsedLabel: string;
}

const OPEN_STATUSES: ReadonlySet<string> = new Set(['Draft', 'Unbilled']);
const NOT_FLAGGED: PrintWarningState = { exceeded: false, elapsedLabel: '' };

/** Parse "YYYY-MM-DD HH:mm:ss[.ffffff]" as local time. Returns NaN when empty or invalid. */
export function parseFrappeDatetime(value?: string | null): number {
  if (!value) return NaN;
  const iso = value.split('.')[0].trim().replace(' ', 'T');
  return new Date(iso).getTime();
}

/** Format a Date as a Frappe Datetime, using local time (not UTC). */
export function formatFrappeDatetime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** Format elapsed milliseconds as HH:MM. */
export function formatElapsed(ms: number): string {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Decide whether an order should show the late-print warning.
 * Disabled when the warning time is unset or 0. Invoices without a recorded print time
 * (printed before this field existed) are not flagged.
 */
export function getPrintWarningState(
  order: PrintWarningInput,
  warningMinutes: number | null | undefined,
  now: number = Date.now()
): PrintWarningState {
  const limit = Number(warningMinutes);
  if (!Number.isFinite(limit) || limit <= 0) return NOT_FLAGGED;
  if (Number(order.invoice_printed) !== 1 || !OPEN_STATUSES.has(order.status)) return NOT_FLAGGED;

  const printedAt = parseFrappeDatetime(order.custom_printing_time);
  if (Number.isNaN(printedAt)) return NOT_FLAGGED;

  const elapsedMs = Math.max(0, now - printedAt);
  if (elapsedMs < limit * 60_000) return NOT_FLAGGED;
  return { exceeded: true, elapsedLabel: formatElapsed(elapsedMs) };
}
