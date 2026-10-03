/**
 * Holds the active Intl locale for the formatting helpers.
 *
 * `format.ts` cannot import the app's i18n instance (core is the lower layer),
 * so the app registers its locale here once, right after i18n init. Until then
 * it is Iraqi Arabic with Western digits, the product's only market.
 */

let intlLocale = 'ar-IQ-u-nu-latn';

export function setIntlLocale(locale: string): void {
  intlLocale = locale;
}

export function getIntlLocale(): string {
  return intlLocale;
}
