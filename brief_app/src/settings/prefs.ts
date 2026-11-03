// Per-device preferences for URY Brief. localStorage can throw or be empty (private mode), so every access is guarded.
export type Lang = "auto" | "en" | "hi" | "ar" | "ml";
export type Theme = "system" | "light" | "dark";
export interface Prefs { theme: Theme; language: Lang; readAloud: boolean; showSources: boolean }

const KEY = "ury_brief_prefs";
const DEFAULTS: Prefs = { theme: "system", language: "auto", readAloud: true, showSources: true };
const LANGS: Lang[] = ["auto", "en", "hi", "ar", "ml"];

export function getPrefs(): Prefs {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<Prefs>;
    return {
      theme: o.theme === "light" || o.theme === "dark" ? o.theme : "system",
      language: LANGS.includes(o.language as Lang) ? (o.language as Lang) : DEFAULTS.language,
      readAloud: typeof o.readAloud === "boolean" ? o.readAloud : DEFAULTS.readAloud,
      showSources: typeof o.showSources === "boolean" ? o.showSources : DEFAULTS.showSources,
    };
  } catch { return { ...DEFAULTS }; }
}

export function setPrefs(p: Partial<Prefs>): Prefs {
  const next = { ...getPrefs(), ...p };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* not persisted */ }
  applyTheme(next.theme);
  window.dispatchEvent(new Event("ury-brief-prefs"));
  return next;
}

export function usePrefsSubscribe(cb: () => void) {
  window.addEventListener("ury-brief-prefs", cb);
  return () => window.removeEventListener("ury-brief-prefs", cb);
}

export function applyTheme(theme: Theme = getPrefs().theme) {
  const el = document.documentElement;
  if (theme === "system") { el.removeAttribute("data-theme"); el.style.colorScheme = ""; }
  else { el.setAttribute("data-theme", theme); el.style.colorScheme = theme; }
  // Colours come from the token sheet (tokens.css); only the browser chrome meta needs a literal value.
  requestAnimationFrame(() => {
    const bg = getComputedStyle(el).getPropertyValue("--background").trim();
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    const m = document.createElement("meta");
    m.name = "theme-color"; m.content = bg ? `hsl(${bg})` : "";
    document.head.appendChild(m);
  });
}
