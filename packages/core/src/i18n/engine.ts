/**
 * App-agnostic i18n engine shared by every URY frontend.
 *
 * Each app owns its own locale JSON files and passes a loader in; the engine
 * owns resolution order, fallback, interpolation, direction and persistence so
 * that all five apps behave identically. Translations stay per-app because the
 * vocabularies barely overlap (a cashier POS and an analytics dashboard share
 * almost no strings), but the *rules* must not drift.
 */

export type TranslationMap = Record<string, unknown>;
export type Direction = 'ltr' | 'rtl';

export interface I18nOptions {
  /** Resolve a language code to its translation map. */
  loadLocale: (lang: string) => Promise<TranslationMap>;
  /** Language used when nothing else resolves, and as the fallback bundle. */
  defaultLanguage: string;
  /** Code -> endonym (label written in its own language). */
  supportedLanguages: Record<string, string>;
  /** localStorage key holding the explicit in-app choice. */
  storageKey?: string;
}

export interface I18n {
  init: (lang?: string) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
  tPlural: (
    key: string,
    count: number,
    params?: Record<string, string | number>,
  ) => string;
  setLanguage: (lang: string) => boolean;
  getActiveLanguage: () => string;
  getActiveDirection: () => Direction;
  getSupportedLanguages: () => Record<string, string>;
  applyDocumentLocale: () => void;
  /** BCP-47 tag for Intl APIs, forcing Western digits for Arabic. */
  getIntlLocale: () => string;
}

/** Languages whose script runs right-to-left. */
const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur', 'ku', 'ps', 'sd', 'yi', 'dv']);

function lookup(map: TranslationMap, key: string): string | undefined {
  const parts = key.split('.');
  let value: unknown = map;
  for (const part of parts) {
    if (value && typeof value === 'object') {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof value === 'string' ? value : undefined;
}

/** Replace `{{name}}` placeholders, leaving unknown ones visible for devs. */
function interpolate(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) =>
    params[k] !== undefined ? String(params[k]) : `{{${k}}}`,
  );
}

export function createI18n(options: I18nOptions): I18n {
  const { loadLocale, defaultLanguage, supportedLanguages } = options;
  const storageKey = options.storageKey ?? 'ury_language';

  let activeLocale: TranslationMap = {};
  let fallbackLocale: TranslationMap = {};
  let activeLanguage = defaultLanguage;

  /** Storage throws in private mode and when site data is blocked. */
  function readStored(): string | null {
    try {
      const v = localStorage.getItem(storageKey);
      return v && supportedLanguages[v] ? v : null;
    } catch {
      return null;
    }
  }

  function resolve(): string {
    // 1. Explicit in-app choice outranks the Frappe user preference: someone
    //    who picks Arabic in the UI must still get Arabic next load, even
    //    though their Frappe user record still says English.
    const stored = readStored();
    if (stored) return stored;

    // 2. Frappe user / site language.
    const bootLang: string | undefined = (window as any)?.frappe?.boot?.lang;
    if (bootLang && supportedLanguages[bootLang]) return bootLang;

    return defaultLanguage;
  }

  async function init(lang?: string): Promise<void> {
    const target = lang ?? resolve();
    const [resolved, fallback] = await Promise.all([
      loadLocale(target),
      target === defaultLanguage ? Promise.resolve(null) : loadLocale(defaultLanguage),
    ]);
    activeLocale = resolved;
    fallbackLocale = fallback ?? resolved;
    activeLanguage = target;
  }

  function getActiveDirection(): Direction {
    // The locale file's own `_meta.direction` wins, so adding an RTL language
    // needs no code change; the language-code set is only a fallback.
    const meta = (activeLocale as Record<string, unknown>)._meta;
    if (meta && typeof meta === 'object') {
      const dir = (meta as Record<string, unknown>).direction;
      if (dir === 'rtl' || dir === 'ltr') return dir;
    }
    return RTL_LANGUAGES.has(activeLanguage) ? 'rtl' : 'ltr';
  }

  function t(key: string, params?: Record<string, string | number>): string {
    // Fall back to the default bundle before surfacing a raw key, so a missing
    // translation shows readable English rather than a Latin-script dot-key
    // sitting inside RTL text.
    let value = lookup(activeLocale, key) ?? lookup(fallbackLocale, key);
    if (value === undefined) return key;
    if (!params) return value;
    return interpolate(value, params);
  }

  /**
   * Plural-aware lookup.
   *
   * English needs two forms, Arabic needs up to six (zero, one, two, few,
   * many, other) — so `count === 1 ? 'item' : 'items'` cannot be localised,
   * it can only be replaced. `Intl.PluralRules` picks the category for the
   * active locale and we look up `<key>.<category>`, falling back through
   * `other` so a locale that only supplies one form still works.
   *
   * `{{count}}` is interpolated automatically.
   */
  function tPlural(
    key: string,
    count: number,
    params?: Record<string, string | number>,
  ): string {
    let category = 'other';
    try {
      category = new Intl.PluralRules(getIntlLocale()).select(count);
    } catch {
      // Very old engines, or an unknown locale tag: `other` is always defined.
    }
    const withCount = { count, ...params };
    const exact = lookup(activeLocale, `${key}.${category}`);
    if (exact !== undefined) return interpolate(exact, withCount);
    return t(`${key}.other`, withCount);
  }

  function getIntlLocale(): string {
    // Arabic defaults to Arabic-Indic digits (١٢٣) under Intl. URY's Arabic
    // style mandates Western digits, so force the `latn` numbering system.
    if (activeLanguage === 'ar') return 'ar-IQ-u-nu-latn';
    return activeLanguage;
  }

  return {
    init,
    t,
    tPlural,
    getActiveLanguage: () => activeLanguage,
    getActiveDirection,
    getSupportedLanguages: () => supportedLanguages,
    getIntlLocale,
    applyDocumentLocale() {
      const root = document.documentElement;
      root.lang = activeLanguage;
      root.dir = getActiveDirection();
    },
    setLanguage(lang: string): boolean {
      if (!supportedLanguages[lang]) return false;
      if (lang === activeLanguage) return true;
      try {
        localStorage.setItem(storageKey, lang);
      } catch {
        return false;
      }
      // `t` is a plain function, not a hook, so the rendered tree holds strings
      // from the old locale and cannot re-render itself. The reload is what
      // swaps the UI, and it re-applies `dir` alongside the text.
      window.location.reload();
      return true;
    },
  };
}
