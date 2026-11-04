import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import en from "./locales/en.json";
import ar from "./locales/ar.json";

async function load(lang) {
  vi.resetModules();
  document.documentElement.setAttribute("lang", lang);
  delete window.frappe;
  return import("./i18n");
}

afterEach(() => {
  document.documentElement.setAttribute("lang", "en");
  delete window.frappe;
});

describe("i18n", () => {
  it("returns the English key unchanged by default (identity locale)", async () => {
    const { t, isRTL } = await load("en");
    expect(t("Serve")).toBe("Serve");
    expect(t("No active orders for {0}", "Bar")).toBe("No active orders for Bar");
    expect(isRTL).toBe(false);
    expect(en).toEqual({});
  });

  it("translates and flips direction for Arabic", async () => {
    const { t, isRTL, applyDocumentLocale } = await load("ar");
    expect(t("Serve")).toBe(ar["Serve"]);
    expect(t("Table: {0}", "5")).toContain("5");
    expect(isRTL).toBe(true);
    applyDocumentLocale();
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
  });

  it("prefers the frappe boot language", async () => {
    vi.resetModules();
    window.frappe = { boot: { lang: "ar-SA" } };
    const { lang } = await import("./i18n");
    expect(lang).toBe("ar");
  });

  it("falls back to the key for unknown strings and languages", async () => {
    const { t } = await load("fr");
    expect(t("Anything new")).toBe("Anything new");
  });

  it("keeps every placeholder of the English key in the Arabic string", () => {
    for (const [k, v] of Object.entries(ar)) {
      const ph = (k.match(/\{\d+\}/g) || []).sort().join();
      expect((v.match(/\{\d+\}/g) || []).sort().join(), k).toBe(ph);
    }
  });

  it("renders Arabic in a component via the __ helper", async () => {
    const { default: plugin } = await load("ar");
    const ProductionCard = (await import("./components/production/ProductionCard.vue")).default;
    const w = mount(ProductionCard, { props: { title: "Kitchen" }, global: { plugins: [plugin] } });
    expect(w.text()).toContain(ar["Production Unit"]);
  });
});
