import russian from './ru.json';
import { resolveManagementLanguage } from './language';

const dictionary: Record<string, string> = russian;

/** Translate app-owned copy. Keep record IDs, API values and user content unchanged. */
export function translate(source: string, params?: Record<string, string | number>): string {
  const text = resolveManagementLanguage() === 'ru' ? dictionary[source] ?? source : source;
  return text.replace(/\{\{(\w+)\}\}/g, (placeholder, key: string) =>
    params?.[key] === undefined ? placeholder : String(params[key]),
  );
}
