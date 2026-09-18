import { resolveManagementLanguage } from '../../../i18n/language';

/**
 * Resolves the active language using the following priority:
 * 1. localStorage key 'ury_language' (explicit user choice)
 * 2. frappe.boot.lang (Frappe site config / user preference)
 * 3. DEFAULT_LANGUAGE ('en')
 */
export function resolveLanguage(): string {
  return resolveManagementLanguage();
}
