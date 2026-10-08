import { storage } from './storage';

/** A currency as configured on the Frappe ``Currency`` doctype. */
export interface CurrencyInfo {
  /** ISO code, e.g. ``AED``. ``null`` means the scope spans several currencies. */
  code: string | null;
  symbol?: string | null;
}

/** ``null`` code: the active scope mixes currencies (e.g. "All companies"). */
export const MIXED_CURRENCY: CurrencyInfo = Object.freeze({ code: null, symbol: null });

/**
 * In-memory, per-tab active currency. The management dashboard publishes the
 * active company/branch currency here; it is deliberately NOT persisted to
 * localStorage, which is shared across tabs and would leak one tab's company
 * into another. ``undefined`` = nobody published one (POS / Mosaic), in which
 * case the legacy ``currencySymbol`` storage key is used.
 */
let activeCurrency: CurrencyInfo | undefined;

export function setActiveCurrency(currency: CurrencyInfo | undefined): void {
  activeCurrency = currency;
}

export function getActiveCurrency(): CurrencyInfo | undefined {
  return activeCurrency;
}

const digitsCache = new Map<string, number>();

/** Minor-unit digits for an ISO code (OMR/BHD/KWD = 3, JPY = 0, most = 2). */
export function currencyFractionDigits(code: string): number {
  const cached = digitsCache.get(code);
  if (cached !== undefined) return cached;
  let digits = 2;
  try {
    digits = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  } catch {
    // Unknown/non-ISO code configured in Frappe: keep 2.
  }
  digitsCache.set(code, digits);
  return digits;
}

function resolveCurrency(currency?: CurrencyInfo | string | null): CurrencyInfo | undefined {
  if (typeof currency === 'string') return { code: currency };
  if (currency) return currency;
  // ``null`` passed explicitly falls through to the active currency too.
  return activeCurrency;
}

function isIndianGrouping(code: string | null | undefined): boolean {
  return code === 'INR';
}

function legacySymbol(): string {
  return storage.getItem('currencySymbol') || '₹';
}

/**
 * Format an amount with its currency.
 *
 * ``currency`` may be an ISO code or a ``CurrencyInfo``; when omitted, the
 * currency published via ``setActiveCurrency`` is used, and only when nothing
 * was published does it fall back to the legacy POS ``currencySymbol`` key.
 * A mixed currency (``code: null``) renders the bare number, never a guessed
 * symbol.
 */
export function formatCurrency(amount: number, currency?: CurrencyInfo | string | null): string {
  const info = resolveCurrency(currency);

  if (!info) {
    const formattedVal = typeof amount === 'number' && !isNaN(amount) ? amount.toLocaleString('en-IN') : amount;
    return `${legacySymbol()} ${formattedVal}`;
  }

  if (typeof amount !== 'number' || isNaN(amount)) {
    return info.code ? `${info.symbol || info.code} ${amount}` : String(amount);
  }

  if (!info.code) {
    return amount.toLocaleString('en', { maximumFractionDigits: 2 });
  }

  const formattedVal = amount.toLocaleString(isIndianGrouping(info.code) ? 'en-IN' : 'en', {
    maximumFractionDigits: currencyFractionDigits(info.code),
  });
  return `${info.symbol || info.code} ${formattedVal}`;
}

/**
 * Compact currency for chart axes/labels. Indian units for INR
 * (600000 -> "₹6L", 12500000 -> "₹1.25Cr"), international K/M/B otherwise
 * (1500000 -> "AED1.5M").
 */
export function formatCompactCurrency(amount: number, currency?: CurrencyInfo | string | null): string {
  const info = resolveCurrency(currency);
  const symbol = info ? (info.code ? info.symbol || info.code : '') : legacySymbol();
  if (typeof amount !== 'number' || isNaN(amount)) return `${symbol} ${amount}`.trim();

  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);

  const trim = (value: number) => {
    const rounded = Math.round(value * 100) / 100;
    return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  };

  // Legacy callers (no published currency) keep the Indian units they had.
  if (!info || isIndianGrouping(info.code)) {
    if (abs >= 1_00_00_000) return `${sign}${symbol}${trim(abs / 1_00_00_000)}Cr`;
    if (abs >= 1_00_000) return `${sign}${symbol}${trim(abs / 1_00_000)}L`;
    if (abs >= 1_000) return `${sign}${symbol}${trim(abs / 1_000)}k`;
    return `${sign}${symbol}${trim(abs)}`;
  }

  if (abs >= 1_000_000_000) return `${sign}${symbol}${trim(abs / 1_000_000_000)}B`;
  if (abs >= 1_000_000) return `${sign}${symbol}${trim(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${trim(abs / 1_000)}K`;
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
