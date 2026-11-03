/**
 * Minimal Frappe-style translation helper for the /ury React app.
 *
 * Strings are looked up in `frappe.boot.__messages`, which the ury.html page
 * receives from `frappe.sessions.get()`: it is built from every installed
 * app's `translations/<lang>.csv` plus Translation records, so adding a
 * language is a data change (ury/translations/<lang>.csv or a Translation
 * record), not a code change. Unknown strings, and the English UI (where
 * `__messages` is empty), fall back to the source text unchanged.
 *
 * Supports `{0}` style positional placeholders: `__('Total: {0}', [n])`.
 */
type Messages = Record<string, string>;

type FrappeWindow = { frappe?: { boot?: { __messages?: Messages } } };

function messages(): Messages | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as FrappeWindow).frappe?.boot?.__messages;
}

export function __(source: string, params?: ReadonlyArray<string | number>): string {
  const translated = messages()?.[source] ?? source;
  if (!params || params.length === 0) return translated;
  return translated.replace(/\{(\d+)\}/g, (m, i) =>
    params[Number(i)] !== undefined ? String(params[Number(i)]) : m,
  );
}

/** BCP-47 locale for Intl formatting: the page language, else the browser default. */
export function uiLocale(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const lang = document.documentElement.lang;
  return lang ? lang : undefined;
}

/** True when the page direction is right-to-left (set from the boot language in index.html). */
export function isRtl(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.dir === 'rtl';
}
