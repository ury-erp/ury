/**
 * Minimal i18n for the Vue apps (mosaic / urypos).
 *
 * These two apps sit outside the yarn workspace, so they cannot import
 * `@ury/core`'s createI18n. This is a deliberate, dependency-free port of the
 * same rules (resolution order, English fallback, `_meta.direction`, reload on
 * change) so behaviour does not drift from the React apps. It avoids pulling
 * in vue-i18n for ~35 strings.
 */

export const DEFAULT_LANGUAGE = 'en';

export const SUPPORTED_LANGUAGES = {
  en: 'English',
  ar: 'العربية',
};

const STORAGE_KEY = 'ury_language';
const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur', 'ku']);

const locales = {
  en: () => import('./locales/en.json'),
  ar: () => import('./locales/ar.json'),
};

let active = {};
let fallback = {};
let activeLanguage = DEFAULT_LANGUAGE;

function readStored() {
  // Throws in private mode / when site data is blocked; the app must still boot.
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && SUPPORTED_LANGUAGES[v] ? v : null;
  } catch {
    return null;
  }
}

function resolveLanguage() {
  // An explicit in-app choice outranks the Frappe user preference.
  const stored = readStored();
  if (stored) return stored;
  const boot = window?.frappe?.boot?.lang;
  if (boot && SUPPORTED_LANGUAGES[boot]) return boot;
  return DEFAULT_LANGUAGE;
}

async function load(lang) {
  try {
    const mod = await locales[lang]();
    return mod.default ?? mod;
  } catch {
    return {};
  }
}

export async function initI18n() {
  activeLanguage = resolveLanguage();
  active = await load(activeLanguage);
  fallback = activeLanguage === DEFAULT_LANGUAGE ? active : await load(DEFAULT_LANGUAGE);
  applyDocumentLocale();
}

function lookup(map, key) {
  let value = map;
  for (const part of key.split('.')) {
    if (value && typeof value === 'object') value = value[part];
    else return undefined;
  }
  return typeof value === 'string' ? value : undefined;
}

export function t(key, params) {
  // Fall back to English before showing a raw key, so a missing string never
  // renders a Latin dot-key inside Arabic text.
  const value = lookup(active, key) ?? lookup(fallback, key);
  if (value === undefined) return key;
  if (!params) return value;
  return value.replace(/\{\{(\w+)\}\}/g, (_, k) => String(params[k] ?? `{{${k}}}`));
}

export function getActiveLanguage() {
  return activeLanguage;
}

export function getActiveDirection() {
  const dir = active?._meta?.direction;
  if (dir === 'rtl' || dir === 'ltr') return dir;
  return RTL_LANGUAGES.has(activeLanguage) ? 'rtl' : 'ltr';
}

export function applyDocumentLocale() {
  document.documentElement.lang = activeLanguage;
  document.documentElement.dir = getActiveDirection();
}

export function setLanguage(lang) {
  if (!SUPPORTED_LANGUAGES[lang] || lang === activeLanguage) return false;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    return false;
  }
  // Templates already rendered hold the old strings; the reload is what swaps
  // the UI over, and it re-applies `dir` alongside the text.
  window.location.reload();
  return true;
}

/** Registers `$t` so templates can call it without importing per-component. */
export const i18nPlugin = {
  install(app) {
    app.config.globalProperties.$t = t;
    app.config.globalProperties.$lang = {
      active: () => activeLanguage,
      supported: SUPPORTED_LANGUAGES,
      set: setLanguage,
    };
  },
};
