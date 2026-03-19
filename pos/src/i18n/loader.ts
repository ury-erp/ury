import { DEFAULT_LANGUAGE } from './config';

type TranslationMap = Record<string, unknown>;

const cache: Record<string, TranslationMap> = {};

export async function loadLocale(lang: string): Promise<TranslationMap> {
  if (cache[lang]) return cache[lang];

  try {
    const module = await import(`./locales/${lang}.json`);
    cache[lang] = module.default as TranslationMap;
    return cache[lang];
  } catch {
    if (lang !== DEFAULT_LANGUAGE) {
      return loadLocale(DEFAULT_LANGUAGE);
    }
    return {};
  }
}
