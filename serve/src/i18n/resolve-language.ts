import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './config';

/** Minimal Frappe boot shape used for language detection on desk/portal pages. */
type FrappeBootWindow = Window & {
  frappe?: {
    boot?: {
      lang?: string;
    };
  };
};

/**
 * Resolves the active language using the following priority:
 * 1. localStorage key 'ury_language' (explicit URY preference)
 * 2. frappe.boot.lang (Frappe site config / user preference)
 * 3. DEFAULT_LANGUAGE ('en')
 */
export function resolveLanguage(): string {
  const normalize = (language?: string | null) => {
    const normalized = language?.toLowerCase().split(/[-_]/)[0];
    if (normalized === 'kz') return 'kk';
    return normalized && SUPPORTED_LANGUAGES[normalized] ? normalized : undefined;
  };

  // 1. Explicit URY language preference
  const storedLang = normalize(localStorage.getItem('ury_language'));
  if (storedLang) return storedLang;

  // 2. Frappe boot object
  const frappeLang: string | undefined =
    (window as FrappeBootWindow).frappe?.boot?.lang;
  const normalizedFrappeLang = normalize(frappeLang);
  if (normalizedFrappeLang) return normalizedFrappeLang;

  return DEFAULT_LANGUAGE;
}
