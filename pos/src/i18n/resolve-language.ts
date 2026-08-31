import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './config';

/**
 * Resolves the active language using the following priority:
 * 1. localStorage key 'ury_language' (manual POS override)
 * 2. frappe.boot.lang (Frappe site config / user preference)
 * 3. DEFAULT_LANGUAGE ('en')
 */
type FrappeWindow = Window & {
  frappe?: {
    boot?: {
      lang?: string;
    };
  };
};

function normalizeLanguage(language?: string | null): string | undefined {
  const normalized = language?.toLowerCase().split(/[-_]/)[0];
  if (normalized === 'kz') return 'kk';
  return normalized && SUPPORTED_LANGUAGES[normalized] ? normalized : undefined;
}

export function resolveLanguage(): string {
  const storedLang = normalizeLanguage(localStorage.getItem('ury_language'));
  if (storedLang) {
    return storedLang;
  }

  const frappeLang = normalizeLanguage((window as FrappeWindow).frappe?.boot?.lang);
  if (frappeLang) {
    return frappeLang;
  }

  return DEFAULT_LANGUAGE;
}
