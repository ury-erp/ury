import { storage } from './storage';
import { getIntlLocale } from './i18n/locale-registry';

/**
 * The Iraqi dinar is written the way an Iraqi receipt writes it: whole dinars,
 * Western digits grouped by thousands, and the symbol after the number —
 * "25,000 د.ع". It is the default: a screen that has not been told the
 * company currency (the dashboard never was) used to fall back to "₹".
 */
const DEFAULT_CURRENCY = 'IQD';

function currencyDisplay(): { label: string; after: boolean; decimals: number } {
  const code = storage.getItem('currency') || DEFAULT_CURRENCY;
  if (code === DEFAULT_CURRENCY) {
    const arabic = getIntlLocale().startsWith('ar');
    return { label: arabic ? 'د.ع' : 'IQD', after: true, decimals: 0 };
  }
  return { label: storage.getItem('currencySymbol') || code, after: false, decimals: 2 };
}

/** The currency label alone ("د.ع"), for column headers and input labels. */
export function currencyLabel(): string {
  return currencyDisplay().label;
}

export function formatCurrency(amount: number): string {
  const { label, after, decimals } = currencyDisplay();
  const value = flt(amount, decimals);
  // Grouping uses Western digits in every locale (see getIntlLocale), and
  // never the Indian lakh grouping.
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
  return after ? `${formatted} ${label}` : `${label} ${formatted}`;
}

/**
 * Compact-scale suffixes. Apps override these after i18n init so chart labels
 * read in the active language (e.g. "ألف" / "مليون" for Arabic).
 */
export const COMPACT_SUFFIXES = {
  thousand: 'k',
  million: 'M',
  billion: 'B',
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
 * Thousand/million/billion, localised via setCompactSuffixes ("25 ألف د.ع").
 */
export function formatCompactCurrency(amount: number): string {
  const { label, after } = currencyDisplay();
  const place = (value: string) => (after ? `${value} ${label}` : `${label}${value}`);
  if (typeof amount !== 'number' || isNaN(amount)) return place(String(amount));

  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);

  const trim = (value: number) => {
    const rounded = Math.round(value * 100) / 100;
    return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  };
  // Arabic suffixes are words ("ألف"), so they get a space; "k"/"M" do not.
  const unit = (value: number, suffix: string) =>
    place(`${sign}${trim(value)}${/^[a-zA-Z]+$/.test(suffix) ? '' : ' '}${suffix}`);

  if (abs >= 1_000_000_000) return unit(abs / 1_000_000_000, COMPACT_SUFFIXES.billion);
  if (abs >= 1_000_000) return unit(abs / 1_000_000, COMPACT_SUFFIXES.million);
  if (abs >= 1_000) return unit(abs / 1_000, COMPACT_SUFFIXES.thousand);
  return place(`${sign}${trim(abs)}`);
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