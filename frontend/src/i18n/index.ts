import { createI18n, setIntlLocale, setCompactSuffixes } from '@ury/core';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './config';

const cache: Record<string, Record<string, unknown>> = {};

/** Locale bundles are dynamic imports so only the active language ships. */
async function loadLocale(lang: string): Promise<Record<string, unknown>> {
  if (cache[lang]) return cache[lang];
  try {
    const mod = await import(`./locales/${lang}.json`);
    cache[lang] = mod.default;
    return cache[lang];
  } catch {
    if (lang !== DEFAULT_LANGUAGE) return loadLocale(DEFAULT_LANGUAGE);
    return {};
  }
}

const i18n = createI18n({
  loadLocale,
  defaultLanguage: DEFAULT_LANGUAGE,
  supportedLanguages: SUPPORTED_LANGUAGES,
  storageKey: 'ury_language',
});

export const t = i18n.t;
export const tPlural = i18n.tPlural;
export const setLanguage = i18n.setLanguage;
export const getActiveLanguage = i18n.getActiveLanguage;
export const getActiveDirection = i18n.getActiveDirection;
export const applyDocumentLocale = i18n.applyDocumentLocale;

/**
 * Boot i18n and point the shared formatters at the active locale.
 *
 * The formatters live in @ury/core below this layer, so they are told the
 * locale here rather than importing it — otherwise currency on the dashboard
 * would keep rendering with Indian grouping while the text is Arabic.
 */
export async function initI18n(): Promise<void> {
  await i18n.init();
  setIntlLocale(i18n.getIntlLocale());
  if (getActiveLanguage() === 'ar') {
    setCompactSuffixes({ thousand: ' ألف', million: ' مليون', billion: ' مليار' });
  }
  applyDocumentLocale();
}
