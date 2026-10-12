import { resolveUryLanguage } from './i18n';

type CurrencyBoot = {
  sysdefaults?: { currency?: string; number_format?: string };
  docs?: Array<{ doctype?: string; name?: string; symbol?: string }>;
};

function getCurrencyBoot(): CurrencyBoot | undefined {
  return typeof window === 'undefined' ? undefined :
    (window as Window & { frappe?: { boot?: CurrencyBoot } }).frappe?.boot;
}

// Only a freshly loaded profile may override server defaults. Browser storage
// is deliberately not authoritative: it can be cleared or belong to another profile.
let activeCurrency: { code: string; symbol?: string } | undefined;

export function setCurrency(code?: string, symbol?: string): void {
  activeCurrency = code ? { code, symbol } : undefined;
}

export function getCurrencyCode(): string {
  return activeCurrency?.code || getCurrencyBoot()?.sysdefaults?.currency || '';
}

export function getCurrencySymbol(currency = getCurrencyCode()): string {
  if (!currency) return '';
  if (activeCurrency?.code === currency && activeCurrency.symbol) return activeCurrency.symbol;
  const doc = getCurrencyBoot()?.docs?.find(
    (item) => (item.doctype === ':Currency' || item.doctype === 'Currency') && item.name === currency,
  );
  if (doc?.symbol) return doc.symbol;
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find((part) => part.type === 'currency')?.value || currency;
  } catch {
    return currency;
  }
}

/** Site grouping takes precedence; UI language supplies compact-number labels. */
export function getAmountLocale(): string {
  if (getCurrencyBoot()?.sysdefaults?.number_format?.startsWith('#,##,###')) return 'en-IN';
  try {
    const language = resolveUryLanguage();
    return language === 'ru' ? 'ru-RU' : language === 'kk' ? 'kk-KZ' : 'en-US';
  } catch {
    return 'en-US';
  }
}

function formatAmountParts(parts: Intl.NumberFormatPart[]): string {
  const pattern = getCurrencyBoot()?.sysdefaults?.number_format;
  const decimal = pattern?.match(/([^#]+)##$/)?.[1];
  const group = pattern?.match(/^#([^#]+)#{2,3}/)?.[1];
  return parts.map((part) => part.type === 'decimal' && decimal ? decimal :
    part.type === 'group' && group ? group : part.value).join('');
}

export function formatCurrency(amount: number, currency = getCurrencyCode()): string {
  const symbol = getCurrencySymbol(currency);
  const formattedVal = typeof amount === 'number' && Number.isFinite(amount)
    ? formatAmountParts(new Intl.NumberFormat(getAmountLocale(), { maximumFractionDigits: 2 }).formatToParts(amount))
    : String(amount);
  return symbol ? `${symbol} ${formattedVal}` : formattedVal;
}

/**
 * Formats a number as compact currency for chart axes/labels,
 * e.g. 8200 -> "₸8,2 тыс.", 12500000 -> "₸12,5 млн" (English UI: "₸8.2K", "₸12.5M").
 */
export function formatCompactCurrency(amount: number): string {
  const symbol = getCurrencySymbol();
  if (typeof amount !== 'number' || isNaN(amount)) return `${symbol} ${amount}`;

  const sign = amount < 0 ? '-' : '';
  const compact = formatAmountParts(new Intl.NumberFormat(getAmountLocale(), {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).formatToParts(Math.abs(amount)));
  return `${sign}${symbol}${compact}`;
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
