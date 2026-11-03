// Per-device preferences for URY Brief. localStorage can throw or be empty (private mode), so every access is guarded.
export type Lang = "auto" | "en" | "hi" | "ar" | "ml";
export interface Prefs { language: Lang; readAloud: boolean; showSources: boolean }

const KEY = "ury_brief_prefs";
const DEFAULTS: Prefs = { language: "auto", readAloud: true, showSources: true };
const LANGS: Lang[] = ["auto", "en", "hi", "ar", "ml"];

export function getPrefs(): Prefs {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<Prefs>;
    return {
      language: LANGS.includes(o.language as Lang) ? (o.language as Lang) : DEFAULTS.language,
      readAloud: typeof o.readAloud === "boolean" ? o.readAloud : DEFAULTS.readAloud,
      showSources: typeof o.showSources === "boolean" ? o.showSources : DEFAULTS.showSources,
    };
  } catch { return { ...DEFAULTS }; }
}

export function setPrefs(p: Partial<Prefs>): Prefs {
  const next = { ...getPrefs(), ...p };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* not persisted */ }
  window.dispatchEvent(new Event("ury-brief-prefs"));
  return next;
}

export function usePrefsSubscribe(cb: () => void) {
  window.addEventListener("ury-brief-prefs", cb);
  return () => window.removeEventListener("ury-brief-prefs", cb);
}
