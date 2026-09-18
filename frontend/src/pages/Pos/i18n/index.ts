import { getLocale } from './loader';
import { DEFAULT_LANGUAGE } from './config';
import { resolveLanguage } from './resolve-language';

type TranslationMap = Record<string, unknown>;

let activeLanguage: string = resolveLanguage();
let activeLocale: TranslationMap = getLocale(activeLanguage);

/**
 * Load and activate a locale. Call this once before rendering the app.
 */
export async function initI18n(lang?: string): Promise<void> {
  const requestedLang = lang ?? resolveLanguage();
  const resolvedLang = requestedLang === 'ru' ? 'ru' : DEFAULT_LANGUAGE;
  activeLocale = getLocale(resolvedLang);
  activeLanguage = resolvedLang;
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
  const lookup = (locale: TranslationMap): unknown => key.split('.').reduce<unknown>(
    (value, part) => value && typeof value === 'object'
      ? (value as Record<string, unknown>)[part]
      : undefined,
    locale,
  );
  const value = lookup(activeLocale) ?? lookup(getLocale(DEFAULT_LANGUAGE));

  if (typeof value !== 'string') {
    // Return the key itself as a fallback so missing translations are visible
    return key;
  }

  if (!params) return value;

  return value.replace(/\{\{(\w+)\}\}/g, (_, k) => String(params[k] ?? `{{${k}}}`));
}
