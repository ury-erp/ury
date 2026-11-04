import { loadLocale } from './loader';
import { DEFAULT_LANGUAGE } from './config';
import { resolveLanguage } from './resolve-language';

type TranslationMap = Record<string, unknown>;

let activeLocale: TranslationMap = {};
let activeLanguage: string = DEFAULT_LANGUAGE;
let englishLocale: TranslationMap = {};

/**
 * Load and activate a locale. Call this once before rendering the app.
 *
 * Also keeps the English bundle resident (regardless of the active locale)
 * so `t()` can fall back to it when a key is missing from the active
 * locale, instead of falling straight through to the raw key.
 */
export async function initI18n(lang?: string): Promise<void> {
  const resolvedLang = lang ?? resolveLanguage();
  const [resolvedLocale, english] = await Promise.all([
    loadLocale(resolvedLang),
    resolvedLang === DEFAULT_LANGUAGE ? Promise.resolve(null) : loadLocale(DEFAULT_LANGUAGE),
  ]);
  activeLocale = resolvedLocale;
  englishLocale = english ?? resolvedLocale;
  activeLanguage = resolvedLang;
}

/**
 * Look up a dot-notation key in a translation map. Returns the string value,
 * or undefined if the key is missing or resolves to a non-string value.
 */
function lookup(map: TranslationMap, key: string): string | undefined {
  const parts = key.split('.');
  let value: unknown = map;

  for (const part of parts) {
    if (value && typeof value === 'object') {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return typeof value === 'string' ? value : undefined;
}

/**
 * Get the text direction for the active locale.
 * Reads `_meta.direction` from the locale JSON; defaults to 'ltr'.
 */
export function getActiveDirection(): 'ltr' | 'rtl' {
  const meta = (activeLocale as Record<string, unknown>)._meta;
  if (meta && typeof meta === 'object' && (meta as Record<string, unknown>).direction === 'rtl') {
    return 'rtl';
  }
  return 'ltr';
}

/**
 * Apply lang and dir to <html> after i18n is resolved.
 * Call this once in main.tsx before rendering the React tree.
 */
export function applyDocumentLocale(): void {
  const root = document.documentElement;
  root.lang = activeLanguage;
  root.dir = getActiveDirection();
}

/**
 * Get the currently active language code.
 */
export function getActiveLanguage(): string {
  return activeLanguage;
}

/**
 * Translate a dot-notation key, with optional interpolation.
 *
 * Example:
 *   t('errors.user_not_logged_in')           → "User not logged in"
 *   t('common.greeting', { name: 'Alice' })  → "Hello, Alice"
 */
export function t(key: string, params?: Record<string, string | number>): string {
  let value = lookup(activeLocale, key);

  if (value === undefined) {
    // Fall back to English before surfacing the raw key, so missing
    // translations in non-English locales don't show untranslated dot-keys
    // (e.g. Latin-script "payment.total_entered") embedded in RTL text.
    value = lookup(englishLocale, key);
  }

  if (value === undefined) {
    // Return the key itself as a last-resort fallback so keys missing from
    // English too (i.e. genuinely undefined) are still visible for devs.
    return key;
  }

  if (!params) return value;

  return value.replace(/\{\{(\w+)\}\}/g, (_, k) => String(params[k] ?? `{{${k}}}`));
}

/**
 * Translate server-side DATA labels (item groups / courses, floors, branches)
 * through the site's Translation records, which Frappe injects into
 * `frappe.boot.__messages`. Falls back to the source text.
 */
export function tData(source: string): string {
  const m = (window as unknown as { frappe?: { boot?: { __messages?: Record<string, string> } } }).frappe?.boot?.__messages;
  return m?.[source] ?? source;
}


/** Server user display name (e.g. "Administrator") through Translation records. */
export function tUser(name: string | null | undefined): string {
  return name ? tData(name) : '';
}

/** LTR-isolated "x / y" fraction so RTL does not reverse it (matches the Service Board). */
export function ltrFraction(a: string | number, b: string | number): string {
  return `\u2066${a} / ${b}\u2069`;
}

const NOTIFICATION_PATTERNS: Array<[RegExp, string, string[]]> = [
  [/^A guest has asked for the bill$/, 'notifications.guest_bill', []],
  [/^Draft sales plan for (.+) is ready for review$/, 'notifications.plan_draft_ready', ['date']],
  [/^Yield below standard on a prepared item$/, 'notifications.yield_below', []],
  [/^Today's sales plan is locked for production$/, 'notifications.plan_locked', []],
  [/^Stock count correction posted \(short\/excess\)$/, 'notifications.stock_correction', []],
  [/^Daily P&L for (.+) has been submitted$/, 'notifications.pnl_submitted', ['date']],
  [/^Order # ?(\S+) Delayed$/, 'notifications.order_delayed', ['n']],
];

/** Translate server-generated notification subjects (hardcoded English in the API). */
export function tNotification(subject: string): string {
  for (const [re, key, names] of NOTIFICATION_PATTERNS) {
    const m = re.exec(subject);
    if (m) {
      const params: Record<string, string> = {};
      names.forEach((n, i) => { params[n] = `\u2066${m[i + 1]}\u2069`; });
      return t(key, params);
    }
  }
  return tData(subject);
}
