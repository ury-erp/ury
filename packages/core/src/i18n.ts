export type UryLanguage = 'en' | 'ru' | 'kk';

export const URY_LANGUAGES: Record<UryLanguage, string> = {
  en: 'English',
  ru: 'Русский',
  kk: 'Қазақша',
};

export const URY_LANGUAGE_STORAGE_KEY = 'ury_language';

type FrappeWindow = Window & {
  frappe?: {
    boot?: {
      lang?: string;
    };
  };
};

type TranslationDictionary = Record<string, string>;
type TranslationCatalog = Partial<Record<Exclude<UryLanguage, 'en'>, TranslationDictionary>>;

type TemplateTranslation = {
  pattern: RegExp;
  placeholders: string[];
  translation: string;
};

function normalizeLanguage(language?: string | null): UryLanguage | undefined {
  const normalized = language?.toLowerCase().split(/[-_]/)[0];
  if (normalized === 'kz') return 'kk';
  return normalized === 'en' || normalized === 'ru' || normalized === 'kk' ? normalized : undefined;
}

export function resolveUryLanguage(): UryLanguage {
  if (typeof window === 'undefined') return 'en';

  const storedLanguage = normalizeLanguage(localStorage.getItem(URY_LANGUAGE_STORAGE_KEY));
  if (storedLanguage) return storedLanguage;

  const frappeLanguage = normalizeLanguage((window as FrappeWindow).frappe?.boot?.lang);
  return frappeLanguage ?? 'en';
}

export function setUryLanguage(language: UryLanguage, reload = true): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem(URY_LANGUAGE_STORAGE_KEY, language);
  if (reload) window.location.reload();
}

/** Adds a compact language switch for apps that do not yet have a native control. */
export function mountLanguageSwitcher(): () => void {
  if (typeof document === 'undefined') return () => undefined;

  const mount = () => {
    if (!document.body || document.querySelector('[data-ury-language-switcher]')) return;

    const activeLanguage = resolveUryLanguage();
    const wrapper = document.createElement('div');
    wrapper.dataset.uryLanguageSwitcher = 'true';
    wrapper.setAttribute('role', 'group');
    wrapper.setAttribute(
      'aria-label',
      activeLanguage === 'ru'
        ? 'Выбор языка'
        : activeLanguage === 'kk'
          ? 'Тілді таңдау'
          : 'Language selection',
    );
    Object.assign(wrapper.style, {
      position: 'fixed',
      right: '12px',
      bottom: '12px',
      zIndex: '2147483647',
      display: 'flex',
      gap: '4px',
      padding: '4px',
      border: '1px solid #d1d5db',
      borderRadius: '10px',
      background: '#ffffff',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
      fontFamily: 'system-ui, sans-serif',
    });

    for (const language of Object.keys(URY_LANGUAGES) as UryLanguage[]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = language.toUpperCase();
      button.setAttribute('aria-pressed', String(activeLanguage === language));
      Object.assign(button.style, {
        border: '0',
        borderRadius: '7px',
        padding: '6px 9px',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: '700',
        color: activeLanguage === language ? '#ffffff' : '#374151',
        background: activeLanguage === language ? '#2563eb' : 'transparent',
      });
      button.addEventListener('click', () => setUryLanguage(language));
      wrapper.appendChild(button);
    }

    document.body.appendChild(wrapper);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }

  return () => {
    document.removeEventListener('DOMContentLoaded', mount);
    document.querySelector('[data-ury-language-switcher]')?.remove();
  };
}

function resolveDomDictionary(
  dictionaryOrCatalog: TranslationDictionary | TranslationCatalog,
  activeLanguage: UryLanguage,
): TranslationDictionary | undefined {
  if (activeLanguage === 'en') return undefined;

  const catalogCandidate = dictionaryOrCatalog as TranslationCatalog;
  const languageDictionary = catalogCandidate[activeLanguage as Exclude<UryLanguage, 'en'>];
  if (languageDictionary && typeof languageDictionary === 'object') {
    return languageDictionary;
  }

  return dictionaryOrCatalog as TranslationDictionary;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function compileTemplateTranslations(dictionary: TranslationDictionary): TemplateTranslation[] {
  return Object.entries(dictionary).flatMap(([source, translation]) => {
    const placeholders = [...source.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]);
    if (placeholders.length === 0) return [];

    const escapedParts = source
      .split(/\{\{\w+\}\}/g)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`^${escapedParts.join('(.+?)')}$`);
    return [{ pattern, placeholders, translation }];
  });
}

function translateValue(
  value: string,
  dictionary: TranslationDictionary,
  templates: TemplateTranslation[],
): string {
  const normalized = normalizeText(value);
  let translated = dictionary[normalized];

  if (!translated) {
    for (const template of templates) {
      const match = normalized.match(template.pattern);
      if (!match) continue;

      translated = template.translation;
      template.placeholders.forEach((placeholder, index) => {
        translated = translated?.split(`{{${placeholder}}}`).join(match[index + 1]);
      });
      break;
    }
  }

  if (!translated) return value;

  const leadingWhitespace = value.match(/^\s*/)?.[0] ?? '';
  const trailingWhitespace = value.match(/\s*$/)?.[0] ?? '';
  return `${leadingWhitespace}${translated}${trailingWhitespace}`;
}

const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'] as const;
const IGNORED_ELEMENTS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE']);

/**
 * Translates residual hardcoded UI copy for legacy screens while they are
 * incrementally moved to key-based i18n. The dictionary is owned by the
 * consuming app; this module only provides the framework-neutral DOM bridge.
 */
export function startDomI18n(
  dictionaryOrCatalog: TranslationDictionary | TranslationCatalog,
): () => void {
  if (typeof document === 'undefined') {
    return () => undefined;
  }

  const activeLanguage = resolveUryLanguage();
  const dictionary = resolveDomDictionary(dictionaryOrCatalog, activeLanguage);
  if (!dictionary) {
    return () => undefined;
  }

  document.documentElement.lang = activeLanguage;
  document.documentElement.dir = 'ltr';
  const templates = compileTemplateTranslations(dictionary);

  const translateElementAttributes = (element: Element) => {
    for (const attribute of TRANSLATABLE_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (!value) continue;

      const translated = translateValue(value, dictionary, templates);
      if (translated !== value) element.setAttribute(attribute, translated);
    }
  };

  const translateNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentElement;
      if (!parent || IGNORED_ELEMENTS.has(parent.tagName)) return;

      const value = node.nodeValue ?? '';
      const translated = translateValue(value, dictionary, templates);
      if (translated !== value) node.nodeValue = translated;
      return;
    }

    if (!(node instanceof Element) || IGNORED_ELEMENTS.has(node.tagName)) return;
    translateElementAttributes(node);

    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current) {
      if (current.nodeType === Node.TEXT_NODE) {
        const parent = current.parentElement;
        if (parent && !IGNORED_ELEMENTS.has(parent.tagName)) {
          const value = current.nodeValue ?? '';
          const translated = translateValue(value, dictionary, templates);
          if (translated !== value) current.nodeValue = translated;
        }
      } else if (current instanceof Element && !IGNORED_ELEMENTS.has(current.tagName)) {
        translateElementAttributes(current);
      }
      current = walker.nextNode();
    }
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' || mutation.type === 'characterData') {
        translateNode(mutation.target);
        continue;
      }

      mutation.addedNodes.forEach(translateNode);
    }
  });

  const start = () => {
    if (!document.body) return;
    translateNode(document.body);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  return () => {
    document.removeEventListener('DOMContentLoaded', start);
    observer.disconnect();
  };
}
