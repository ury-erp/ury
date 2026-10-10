/**
 * Holds the active Intl locale for the formatting helpers.
 *
 * `format.ts` cannot import the app's i18n instance (core is the lower layer),
 * so the app registers its locale here once, right after i18n init. Until then
 * the previous default — Indian grouping — is preserved so existing
 * deployments are unaffected by this indirection.
 */

let intlLocale = 'en-IN';

export function setIntlLocale(locale: string): void {
  intlLocale = locale;
}

export function getIntlLocale(): string {
  return intlLocale;
}
