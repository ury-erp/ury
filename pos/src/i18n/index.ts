import { loadLocale } from './loader';
import { DEFAULT_LANGUAGE } from './config';
import { resolveLanguage } from './resolve-language';

type TranslationMap = Record<string, unknown>;

let activeLocale: TranslationMap = {};
let activeLanguage: string = DEFAULT_LANGUAGE;

/**
 * Load and activate a locale. Call this once before rendering the app.
 */
export async function initI18n(lang?: string): Promise<void> {
  const resolvedLang = lang ?? resolveLanguage();
  activeLocale = await loadLocale(resolvedLang);
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
export function t(key: string, params?: Record<string, string>): string {
  const parts = key.split('.');
  let value: unknown = activeLocale;

  for (const part of parts) {
    if (value && typeof value === 'object') {
      value = (value as Record<string, unknown>)[part];
    } else {
      value = undefined;
      break;
    }
  }

  if (typeof value !== 'string') {
    // Return the key itself as a fallback so missing translations are visible
    return key;
  }

  if (!params) return value;

  return value.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? `{{${k}}}`);
}
