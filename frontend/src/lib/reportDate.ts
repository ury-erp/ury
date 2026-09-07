import { format } from 'date-fns';

/**
 * Format a Date as YYYY-MM-DD for report API params, using LOCAL time
 * components. Never use Date#toISOString().slice(0, 10) for this — it
 * converts to UTC first, which silently shifts the date backward by one day
 * for any timezone behind UTC (e.g. "Aug 1 00:00" IST becomes
 * "2026-07-31T18:30:00.000Z"). Every report page's date/date-range filter
 * must go through this function before sending to the backend.
 */
export function toApiDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}
