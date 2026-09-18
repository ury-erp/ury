export const DEFAULT_LANGUAGE = 'en';

/** Code -> endonym. Labels stay in their own language so a user who has the
 *  dashboard stuck in a language they can't read can still find their own. */
export const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: 'English',
  ar: 'العربية',
};
