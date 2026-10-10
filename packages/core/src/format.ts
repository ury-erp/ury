import { storage } from './storage';

type FrappeBoot = {
  sysdefaults?: { currency?: string; number_format?: string };
  docs?: Array<{ doctype?: string; name?: string; symbol?: string }>;
};

// The Frappe page boot (window.frappe.boot) is injected by every URY entry page,
// including the guest self-order page, which never loads the POS profile.
function frappeBoot(): FrappeBoot | undefined {
  return typeof window !== 'undefined' ? (window as any).frappe?.boot : undefined;
}

// Symbol: the one the POS stored, else the site currency resolved the way Frappe
// Desk does (boot ':Currency' doc symbol, else the currency code), else ₹.
function currencySymbol(): string {
  const stored = storage.getItem('currencySymbol');
  if (stored) return stored;
  const boot = frappeBoot();
  const currency = boot?.sysdefaults?.currency;
  if (!currency) return '₹';
  const doc = boot?.docs?.find((d) => d?.doctype === ':Currency' && d?.name === currency);
  return doc?.symbol || currency;
}

// Digit grouping: Indian (lakh) grouping only for the '#,##,###' number format or
// when no site format is known (historical behaviour); thousands grouping otherwise.
function groupingLocale(): string {
  const fmt = frappeBoot()?.sysdefaults?.number_format;
  if (!fmt || fmt.startsWith('#,##,###')) return 'en-IN';
  return 'en-US';
}

export function formatCurrency(amount: number): string {
  const symbol = currencySymbol();
  const roundedAmount = flt(amount, 2);
  const formattedVal = typeof roundedAmount === 'number' && !isNaN(roundedAmount) ? roundedAmount.toLocaleString(groupingLocale()) : roundedAmount;
  return `${symbol} ${formattedVal}`;
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
 * Formats a number as compact Indian-style currency for chart axes/labels,
 * e.g. 600000 -> "₹6L", 12500000 -> "₹1.25Cr", 8200 -> "₹8.2k".
 */
export function formatCompactCurrency(amount: number): string {
  const symbol = currencySymbol();
  if (typeof amount !== 'number' || isNaN(amount)) return `${symbol} ${amount}`;

  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);

  const trim = (value: number) => {
    const rounded = Math.round(value * 100) / 100;
    return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  };

  if (abs >= 1_00_00_000) return `${sign}${symbol}${trim(abs / 1_00_00_000)}Cr`;
  if (abs >= 1_00_000) return `${sign}${symbol}${trim(abs / 1_00_000)}L`;
  if (abs >= 1_000) return `${sign}${symbol}${trim(abs / 1_000)}k`;
  return `${sign}${symbol}${trim(abs)}`;
}

export const formatInvoiceTime = (timestamp: string | null) => {
    if (!timestamp) return 'No bill activity yet';

    const parsedDate = new Date(timestamp);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: 'numeric' });
    }

    const timeOnlyMatch = timestamp.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
    if (timeOnlyMatch) {
      const [, hours, minutes, seconds] = timeOnlyMatch;
      const date = new Date();
      date.setHours(Number(hours), Number(minutes), Number(seconds), 0);
      const formatted = date.toLocaleTimeString(undefined, {
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