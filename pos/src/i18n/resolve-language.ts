import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './config';

export const LANGUAGE_STORAGE_KEY = 'ury_language';

/**
 * Resolves the active language using the following priority:
 * 1. localStorage key 'ury_language' (explicit in-app choice)
 * 2. frappe.boot.lang (Frappe site config / user preference)
 * 3. DEFAULT_LANGUAGE ('en')
 *
 * The in-app choice deliberately outranks `frappe.boot.lang`: a cashier who
 * picks Arabic from the header switcher must keep Arabic on the next load,
 * even though their Frappe user record still says English. Clearing the
 * stored value falls back to the Frappe preference.
 */
export function resolveLanguage(): string {
  // 1. Explicit in-app choice
  const storedLang = readStoredLanguage();
  if (storedLang) return storedLang;

  // 2. Frappe boot object
  const frappeLang: string | undefined = (window as any)?.frappe?.boot?.lang;
  if (frappeLang && SUPPORTED_LANGUAGES[frappeLang]) {
    return frappeLang;
  }

  return DEFAULT_LANGUAGE;
}

/**
 * Read the persisted language choice, or null when unset/unsupported.
 * Storage access is guarded: it throws in private-mode Safari and when
 * site data is blocked, and the POS must still boot in that case.
 */
export function readStoredLanguage(): string | null {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored && SUPPORTED_LANGUAGES[stored] ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Persist an explicit language choice. Returns false when storage is
 * unavailable, so callers can avoid promising a change that won't survive.
 */
export function storeLanguage(lang: string): boolean {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    return true;
  } catch {
    return false;
  }
}
