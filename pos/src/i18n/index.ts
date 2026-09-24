import { createI18n, setIntlLocale, setCompactSuffixes } from '@ury/core';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './config';
import { loadLocale } from './loader';

/**
 * POS i18n, built on the engine shared with the dashboard and self-order apps
 * (packages/core/src/i18n/engine.ts).
 *
 * This deliberately delegates rather than keeping a private copy: the POS used
 * to own a duplicate implementation, and the duplicate is exactly why the
 * currency formatter never learned the active locale — money kept rendering
 * with Indian digit grouping under an Arabic UI.
 */
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
 * `@ury/core`'s format helpers sit below this layer and cannot import the
 * app's i18n, so they are told the locale here. Without this call every
 * amount, quantity and time in the POS formats against the 'en-IN' default
 * regardless of the language on screen.
 */
export async function initI18n(lang?: string): Promise<void> {
  await i18n.init(lang);
  setIntlLocale(i18n.getIntlLocale());
  if (getActiveLanguage() === 'ar') {
    setCompactSuffixes({ thousand: ' ألف', million: ' مليون', billion: ' مليار' });
  }
}
