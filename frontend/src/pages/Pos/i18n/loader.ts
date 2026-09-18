import english from './locales/en.json';
import russian from './locales/ru.json';

type TranslationMap = Record<string, unknown>;

/** Available before the first render, including direct captain-route entry. */
export function getLocale(lang: string): TranslationMap {
  return lang === 'ru' ? russian : english;
}

export async function loadLocale(lang: string): Promise<TranslationMap> {
  return getLocale(lang);
}
