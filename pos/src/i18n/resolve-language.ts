import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './config';

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
  if (frappeLang && SUPPORTED_LANGUAGES[frappeLang]) {
    return frappeLang;
  }

  // 2. Local storage override
  const storedLang = localStorage.getItem('ury_language');
  if (storedLang && SUPPORTED_LANGUAGES[storedLang]) {
    return storedLang;
  }

  return DEFAULT_LANGUAGE;
}
