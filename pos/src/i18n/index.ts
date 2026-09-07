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
