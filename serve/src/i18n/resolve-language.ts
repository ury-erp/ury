import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './config';

/**
 * Map a Frappe / browser language code onto a supported locale.
 * Accepts exact codes (`es`) and regional variants (`es-CO`, `es_MX`).
 */
function matchSupportedLanguage(code: string | undefined | null): string | null {
  if (!code) return null;
  if (SUPPORTED_LANGUAGES[code]) return code;
  const base = code.split(/[-_]/)[0];
  if (base && SUPPORTED_LANGUAGES[base]) return base;
  return null;
}

/**
 * Resolves the active language using the following priority:
 * 1. frappe.boot.lang (Frappe site config / user preference)
 * 2. localStorage key 'ury_language'
 * 3. DEFAULT_LANGUAGE ('en')
 */
export function resolveLanguage(): string {
  // 1. Frappe boot object
  const frappeLang: string | undefined =
    (window as any)?.frappe?.boot?.lang;
  const fromFrappe = matchSupportedLanguage(frappeLang);
  if (fromFrappe) return fromFrappe;

  // 2. Local storage override
  const fromStorage = matchSupportedLanguage(localStorage.getItem('ury_language'));
  if (fromStorage) return fromStorage;

  return DEFAULT_LANGUAGE;
}
