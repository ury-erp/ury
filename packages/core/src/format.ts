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

/** SAUDI RIYAL SIGN (U+20C1). No system font has it yet; the apps ship a one-glyph web font (sar-sign.css). */
export const SAR_SIGN = '⃁';

type BootWindow = { frappe?: { boot?: { sysdefaults?: { currency?: string } } } };

/** Default currency of the site, from the Frappe boot payload (null when not booted, e.g. unit tests). */
export function siteCurrencyCode(): string | null {
  try {
    const code = (globalThis as unknown as BootWindow).frappe?.boot?.sysdefaults?.currency;
    if (code) return code;
  } catch {
    // no boot available
  }
  return null;
}

/**
 * Display symbol for a currency. SAR always renders the official Saudi Riyal sign
 * (the Currency doc may still hold the older rial sign or text); other currencies use
 * the Currency doc symbol, then the ISO code. INR keeps the rupee sign.
 */
export function currencyDisplaySymbol(code: string | null | undefined, docSymbol?: string | null): string {
  if (!code) return docSymbol || '';
  if (code === 'SAR') return SAR_SIGN;
  if (docSymbol) return docSymbol;
  if (code === 'INR') return '₹';
  return code;
}

/** True when the page is rendered right-to-left (Arabic UI). */
export function isRtlUi(): boolean {
  try {
    const el = (globalThis as unknown as { document?: Document }).document?.documentElement;
    if (!el) return false;
    return el.dir === 'rtl' || (el.lang || '').toLowerCase().startsWith('ar');
  } catch {
    return false;
  }
}

/**
 * Put symbol and number together. LTR UI: "SYMBOL 1,234.50". Arabic RTL UI: the amount
 * is isolated as LTR ("1,234.50 SYMBOL", LRI..PDI) so digits/sign never reorder.
 */
function joinMoney(symbol: string, num: string, gap = ' '): string {
  if (!symbol) return num;
  if (isRtlUi()) return `⁦${num}${gap}${symbol}⁩`;
  return `${symbol}${gap}${num}`;
}

/** Currency when a caller gives none: the site currency from boot, else the legacy rupee. */
function fallbackCurrency(): CurrencyInfo {
  const code = siteCurrencyCode();
  if (code) return { code, symbol: currencyDisplaySymbol(code, code === 'INR' ? storage.getItem('currencySymbol') : null) };
  return { code: 'INR', symbol: storage.getItem('currencySymbol') || '₹' };
}

/**
 * Format an amount with its currency.
 *
 * ``currency`` may be an ISO code or a ``CurrencyInfo``; when omitted, the
 * currency published via ``setActiveCurrency`` is used, then the site default
 * currency from the Frappe boot (``frappe.boot.sysdefaults.currency``), and
 * only without a boot does it fall back to the legacy rupee. Numbers use Latin
 * digits (``en``; Indian grouping only for INR). A mixed currency
 * (``code: null``) renders the bare number, never a guessed symbol.
 */
export function formatCurrency(amount: number, currency?: CurrencyInfo | string | null): string {
  const info = resolveCurrency(currency) ?? fallbackCurrency();

  if (typeof amount !== 'number' || isNaN(amount)) {
    return info.code ? joinMoney(currencyDisplaySymbol(info.code, info.symbol), String(amount)) : String(amount);
  }

  if (!info.code) {
    return amount.toLocaleString('en', { maximumFractionDigits: 2 });
  }

  const formattedVal = amount.toLocaleString(isIndianGrouping(info.code) ? 'en-IN' : 'en', {
    maximumFractionDigits: currencyFractionDigits(info.code),
  });
  return joinMoney(currencyDisplaySymbol(info.code, info.symbol), formattedVal);
}

/**
 * Compact currency for chart axes/labels. Indian units for INR
 * (600000 -> "₹6L", 12500000 -> "₹1.25Cr"), international K/M/B otherwise
 * (1500000 -> "AED1.5M").
 */
export function formatCompactCurrency(amount: number, currency?: CurrencyInfo | string | null): string {
  const info = resolveCurrency(currency) ?? fallbackCurrency();
  const symbol = info.code ? currencyDisplaySymbol(info.code, info.symbol) : '';
  if (typeof amount !== 'number' || isNaN(amount)) return `${symbol} ${amount}`.trim();

  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);

  const trim = (value: number) => {
    const rounded = Math.round(value * 100) / 100;
    return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  };
  const out = (num: string) => `${sign}${joinMoney(symbol, num, '')}`;

  if (isIndianGrouping(info.code)) {
    if (abs >= 1_00_00_000) return out(`${trim(abs / 1_00_00_000)}Cr`);
    if (abs >= 1_00_000) return out(`${trim(abs / 1_00_000)}L`);
    if (abs >= 1_000) return out(`${trim(abs / 1_000)}k`);
    return out(trim(abs));
  }

  if (abs >= 1_000_000_000) return out(`${trim(abs / 1_000_000_000)}B`);
  if (abs >= 1_000_000) return out(`${trim(abs / 1_000_000)}M`);
  if (abs >= 1_000) return out(`${trim(abs / 1_000)}K`);
  return out(trim(abs));
}

/**
 * Normalise a Frappe Time/timedelta string ("H:M:S.micro", unpadded) to a
 * zero-padded "HH:MM:SS" that `new Date(`${date} ${time}`)` can parse.
 * Non-matching input is returned unchanged.
 */
export const normalizeFrappeTime = (time: string | null | undefined): string => {
  if (!time) return '';
  const m = time.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.\d+)?$/);
  if (!m) return time;
  return `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}:${m[3].padStart(2, '0')}`;
};

export const formatInvoiceTime = (timestamp: string | null) => {
    if (!timestamp) return 'No bill activity yet';

    const parsedDate = new Date(timestamp);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: 'numeric' });
    }

    const timeOnlyMatch = timestamp.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d+))?$/);
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
