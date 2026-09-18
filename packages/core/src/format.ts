import { storage } from './storage';
import { getIntlLocale } from './i18n/locale-registry';

export function formatCurrency(amount: number): string {
  const symbol = storage.getItem('currencySymbol') || '₹';
  const roundedAmount = flt(amount, 2);
  // Grouping follows the active locale rather than a hardcoded 'en-IN':
  // Indian grouping (12,34,567) is wrong outside South Asia, and an Arabic
  // locale must still render Western digits (see getIntlLocale).
  const formattedVal =
    typeof roundedAmount === 'number' && !isNaN(roundedAmount)
      ? roundedAmount.toLocaleString(getIntlLocale())
      : roundedAmount;
  return `${symbol} ${formattedVal}`;
}

/**
 * Compact-scale suffixes. Apps override these after i18n init so chart labels
 * read in the active language (e.g. "ألف" / "مليون" for Arabic).
 */
export const COMPACT_SUFFIXES = {
  thousand: 'k',
  million: 'M',
  billion: 'B',
  lakh: 'L',
  crore: 'Cr',
};

export function setCompactSuffixes(suffixes: Partial<typeof COMPACT_SUFFIXES>): void {
  Object.assign(COMPACT_SUFFIXES, suffixes);
}

export function flt(v: number | string | null | undefined, decimals: number = 2): number {
  if (v == null || v === '') return 0;
  const num = typeof v === 'number' ? v : parseFloat(v as string);
  if (isNaN(num)) return 0;
  if (decimals != null) {
    const mult = Math.pow(10, decimals);
    const isNegative = num < 0;
    const absNum = Math.abs(num);
    const n = +(absNum * mult).toFixed(8);
    const rounded = Math.round(n) / mult;
    return isNegative ? -rounded : rounded;
  }
  return num;
}

/**
 * Formats a number as compact currency for chart axes/labels.
 *
 * Indian locales keep the lakh/crore scale they expect (₹6L, ₹1.25Cr); every
 * other locale gets the thousand/million/billion scale, because "Cr" is not a
 * unit an Iraqi or Gulf cashier reads. Suffixes are localised via `suffixes`.
 */
export function formatCompactCurrency(amount: number): string {
  const symbol = storage.getItem('currencySymbol') || '₹';
  if (typeof amount !== 'number' || isNaN(amount)) return `${symbol} ${amount}`;

  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);

  const trim = (value: number) => {
    const rounded = Math.round(value * 100) / 100;
    return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  };

  const locale = getIntlLocale();
  const usesIndianScale = locale.startsWith('en-IN') || locale.startsWith('hi');

  if (usesIndianScale) {
    if (abs >= 1_00_00_000) return `${sign}${symbol}${trim(abs / 1_00_00_000)}${COMPACT_SUFFIXES.crore}`;
    if (abs >= 1_00_000) return `${sign}${symbol}${trim(abs / 1_00_000)}${COMPACT_SUFFIXES.lakh}`;
    if (abs >= 1_000) return `${sign}${symbol}${trim(abs / 1_000)}${COMPACT_SUFFIXES.thousand}`;
    return `${sign}${symbol}${trim(abs)}`;
  }

  if (abs >= 1_000_000_000) return `${sign}${symbol}${trim(abs / 1_000_000_000)}${COMPACT_SUFFIXES.billion}`;
  if (abs >= 1_000_000) return `${sign}${symbol}${trim(abs / 1_000_000)}${COMPACT_SUFFIXES.million}`;
  if (abs >= 1_000) return `${sign}${symbol}${trim(abs / 1_000)}${COMPACT_SUFFIXES.thousand}`;
  return `${sign}${symbol}${trim(abs)}`;
}

/**
 * Formats an invoice timestamp as a short time-of-day.
 *
 * `emptyLabel` lets the caller pass an already-translated string for the
 * "nothing yet" case; the English default keeps existing call sites working.
 */
export const formatInvoiceTime = (timestamp: string | null, emptyLabel = 'No bill activity yet') => {
    if (!timestamp) return emptyLabel;

    const parsedDate = new Date(timestamp);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toLocaleTimeString(getIntlLocale(), { hour: 'numeric', minute: 'numeric' });
    }

    const timeOnlyMatch = timestamp.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
    if (timeOnlyMatch) {
      const [, hours, minutes, seconds] = timeOnlyMatch;
      const date = new Date();
      date.setHours(Number(hours), Number(minutes), Number(seconds), 0);
      const formatted = date.toLocaleTimeString(getIntlLocale(), {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      if (/^\d{1,2}:\d{2}$/.test(formatted)) {
        return formatted;
      }
      return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
    }

    return timestamp;
  };