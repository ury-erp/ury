// Minimal i18n for Mosaic. Language comes from frappe boot (window.frappe.boot.lang),
// then the server-rendered <html lang>, then "en". English strings are their own keys,
// so the English path is unchanged; ar.json supplies translations.
import ar from "./locales/ar.json";
import en from "./locales/en.json";

const catalogs = { ar, en };
const RTL = ["ar", "he", "fa", "ur", "ku"];

function detect() {
  const raw =
    (window.frappe && window.frappe.boot && window.frappe.boot.lang) ||
    document.documentElement.getAttribute("lang") ||
    "en";
  return String(raw).toLowerCase().split(/[-_]/)[0] || "en";
}

export const lang = detect();
export const isRTL = RTL.includes(lang);

export function t(key, ...args) {
  const cat = catalogs[lang] || en;
  let s = (cat && cat[key]) || key;
  args.forEach((a, i) => { s = s.split(`{${i}}`).join(String(a)); });
  return s;
}

export function applyDocumentLocale() {
  document.documentElement.setAttribute("lang", lang);
  document.documentElement.setAttribute("dir", isRTL ? "rtl" : "ltr");
}

export default { install(app) { app.config.globalProperties.__ = t; app.config.globalProperties.$isRTL = isRTL; } };
