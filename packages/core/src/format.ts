import { storage } from './storage';

interface BootCurrency {
  name: string;
  symbol?: string;
  number_format?: string;
  symbol_on_right?: number;
}

interface FrappeBoot {
  sysdefaults?: { currency?: string; number_format?: string };
  docs?: Array<BootCurrency & { doctype?: string }>;
}

const INDIAN_NUMBER_FORMAT = '#,##,###.##';

function getBoot(): FrappeBoot | undefined {
  return (globalThis as { frappe?: { boot?: FrappeBoot } }).frappe?.boot;
}

/**
 * The site's default currency code (System Settings), e.g. "KES".
 * Falls back to the last currency the POS stored, then to an empty string.
 */
export function getDefaultCurrency(): string {
  return getBoot()?.sysdefaults?.currency || storage.getItem('currency') || '';
}

function getCurrencyDoc(code: string): BootCurrency | undefined {
  // Frappe boots currency records with doctype ":Currency".
  return getBoot()?.docs?.find(
    (d) => d.name === code && (d.doctype === ':Currency' || d.doctype === 'Currency')
  );
}

function getCurrencyDisplay() {
  const code = storage.getItem('currency') || getDefaultCurrency();
  const doc = code ? getCurrencyDoc(code) : undefined;
  // The boot record is fresh on every page load, so it wins over a symbol
  // cached in storage by an earlier session.
  const symbol = doc?.symbol || storage.getItem('currencySymbol') || code;
  const numberFormat = doc?.number_format || getBoot()?.sysdefaults?.number_format;
  return {
    symbol,
    symbolOnRight: Boolean(doc?.symbol_on_right),
    indianGrouping: numberFormat === INDIAN_NUMBER_FORMAT,
  };
}

/** Currency label for form fields, e.g. "Price (KES)". */
export function getCurrencyLabel(): string {
  return getCurrencyDisplay().symbol;
}

function withSymbol(value: string, symbol: string, onRight: boolean, gap = ' '): string {
  if (!symbol) return value;
  return onRight ? `${value}${gap}${symbol}` : `${symbol}${gap}${value}`;
}

export function formatCurrency(amount: number): string {
  const { symbol, symbolOnRight, indianGrouping } = getCurrencyDisplay();
  const roundedAmount = flt(amount, 2);
  const formattedVal = typeof roundedAmount === 'number' && !isNaN(roundedAmount)
    ? roundedAmount.toLocaleString(indianGrouping ? 'en-IN' : 'en-US')
    : String(roundedAmount);
  return withSymbol(formattedVal, symbol, symbolOnRight);
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
 * Formats a number as compact currency for chart axes/labels. Indian
 * number formats use Lakh/Crore (600000 -> "₹6L", 12500000 -> "₹1.25Cr");
 * others use k/M/B (1500000 -> "KES 1.5M"). Below 1000 the amount is
 * shown as is (8200 -> "8.2k" in both).
 */
export function formatCompactCurrency(amount: number): string {
  const { symbol, symbolOnRight, indianGrouping } = getCurrencyDisplay();
  if (typeof amount !== 'number' || isNaN(amount)) return withSymbol(String(amount), symbol, symbolOnRight);

  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);

  const trim = (value: number) => {
    const rounded = Math.round(value * 100) / 100;
    return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  };

  // Single-character symbols (₹, $) sit tight against the number as before;
  // codes like "KES" get a space.
  const gap = symbol.length > 1 ? ' ' : '';
  const compact = (value: string) => `${sign}${withSymbol(value, symbol, symbolOnRight, gap)}`;

  const units: Array<[number, string]> = indianGrouping
    ? [[1_00_00_000, 'Cr'], [1_00_000, 'L'], [1_000, 'k']]
    : [[1_000_000_000, 'B'], [1_000_000, 'M'], [1_000, 'k']];
  for (const [size, suffix] of units) {
    if (abs >= size) return compact(`${trim(abs / size)}${suffix}`);
  }
  return compact(trim(abs));
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