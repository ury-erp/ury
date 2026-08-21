import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import fr from './locales/fr.json';
import ar from './locales/ar.json';

/** Maps the Frappe/setup language values to i18next locale codes */
export const LANGUAGE_MAP: Record<string, string> = {
  English: 'en',
  French: 'fr',
  Arabic: 'ar',
  en: 'en',
  fr: 'fr',
  ar: 'ar',
};

/** Applies document-level dir and lang attributes for RTL/LTR switching. */
function applyDocumentDirection(lang: string) {
  const isRtl = lang === 'ar';
  document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
}

/**
 * Reads the persisted locale from localStorage (key: 'ury.lang').
 * Falls back to 'en'.
 */
function getPersistedLocale(): string {
  try {
    const stored = localStorage.getItem('ury.lang');
    if (stored && ['en', 'fr', 'ar'].includes(stored)) return stored;
  } catch {
    // localStorage may be unavailable in some environments
  }
  return 'en';
}

const initialLocale = getPersistedLocale();

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      ar: { translation: ar },
    },
    lng: initialLocale,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes by default
    },
  });

// Apply initial direction
applyDocumentDirection(initialLocale);

// Dynamically update document dir/lang whenever language changes
i18n.on('languageChanged', (lng: string) => {
  applyDocumentDirection(lng);
  // Persist choice so it survives navigation / re-render
  try {
    localStorage.setItem('ury.lang', lng);
  } catch {
    // Ignore storage errors
  }
});

/**
 * Change the active application language.
 *
 * Accepts either i18next locale codes ('en', 'fr', 'ar') or the
 * human-readable Frappe/setup language names ('English', 'French', 'Arabic').
 */
export function changeAppLanguage(language: string): void {
  const locale = LANGUAGE_MAP[language] ?? 'en';
  i18n.changeLanguage(locale);
}

export default i18n;
