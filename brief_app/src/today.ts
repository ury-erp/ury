// Pure derivations for the Today home. Everything shown comes from fields that exist on the slide; nothing is invented.
import type { Slide } from "./types.ts";
import { amount, compactInr } from "./format.ts";

export interface Fact { v: string; l: string }
export interface Tile { id: string; k: string; v: string; d?: string; q: string }
export interface Delta { text: string; tone: "good" | "bad" | "neutral" }

/** The day-summary slide that feeds the hero: "yesterday", else the first spark slide with a value. */
export function heroSlide(slides: Slide[]): Slide | null {
  const ok = (s: Slide) => s.value != null && s.status !== "unavailable";
  return slides.find((s) => s.id === "yesterday" && ok(s)) ?? slides.find((s) => ok(s) && s.chart?.type === "spark") ?? null;
}

export function deltaOf(s: Slide): Delta | null {
  const d = s.delta_pct;
  if (d == null) return null;
  const label = s.delta_label ?? `${Math.abs(Math.round(d * 1000) / 10)}%`;
  const sign = d > 0.0005 ? "+" : d < -0.0005 ? "-" : "";
  return { text: `${sign}${label}`, tone: s.tone || "neutral" };
}

const num = (n: number) => String(Math.round(n * 10) / 10);

export function tilesOf(slides: Slide[], hero: Slide | null): Tile[] {
  const out: Tile[] = [];
  if (hero?.orders != null) {
    out.push({ id: "orders", k: "Orders", v: String(hero.orders), d: hero.orders_compare != null ? `vs ${hero.orders_compare} before` : undefined, q: `Why were there ${hero.orders} orders?` });
    if (hero.value != null && hero.orders > 0) out.push({ id: "avg", k: "Avg check", v: compactInr(hero.value / hero.orders), q: "How is the average check changing?" });
  }
  const covers = slides.find((s) => s.id === "covers" && s.status !== "unavailable");
  if (covers?.covers != null) out.push({ id: "covers", k: "Covers", v: String(covers.covers), d: covers.bills != null ? `${covers.bills} bills` : undefined, q: "How are covers trending?" });
  if (covers?.spend_per_cover != null) out.push({ id: "spc", k: "Spend per cover", v: compactInr(covers.spend_per_cover), q: "Why is spend per cover what it is?" });
  const kitchen = slides.find((s) => s.id === "kitchen" && s.status !== "unavailable");
  if (kitchen?.avg_minutes != null) out.push({ id: "prep", k: "Avg prep time", v: `${num(kitchen.avg_minutes)} min`, d: kitchen.p90_minutes != null ? `p90 ${num(kitchen.p90_minutes)} min` : undefined, q: "How is kitchen prep time?" });
  return out.slice(0, 4);
}

/** Up to 3 headline numbers for a card, taken from its chart series or numeric fields. */
export function factsOf(s: Slide): Fact[] {
  if (s.status === "unavailable") return [];
  const f: Fact[] = [];
  const pts = s.id === "top_bottom_items" && s.top?.length ? s.top : s.chart?.series;
  const type = s.chart?.type;
  if (pts?.length && type !== "spark") {
    const total = pts.reduce((a, p) => a + (Number(p.value) || 0), 0);
    const list = type === "donut" ? [...pts].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0)) : pts;
    for (const p of list.slice(0, 3)) {
      const share = type === "donut" && total > 0 ? ` · ${Math.round(((Number(p.value) || 0) / total) * 100)}%` : "";
      f.push({ v: amount(p.value_text, p.value), l: p.label + share });
    }
    return f;
  }
  if (s.value != null) f.push({ v: amount(s.value_text, s.value), l: "Total" });
  if (s.orders != null) f.push({ v: String(s.orders), l: "Orders" });
  const d = deltaOf(s);
  if (d) f.push({ v: d.text, l: "vs before" });
  if (s.covers != null) f.push({ v: String(s.covers), l: "Covers" });
  if (s.bills != null) f.push({ v: String(s.bills), l: "Bills" });
  if (s.spend_per_cover != null) f.push({ v: compactInr(s.spend_per_cover), l: "Per cover" });
  if (s.tickets != null) f.push({ v: String(s.tickets), l: "Tickets" });
  if (s.avg_minutes != null) f.push({ v: `${num(s.avg_minutes)} min`, l: "Avg prep" });
  if (s.p90_minutes != null) f.push({ v: `${num(s.p90_minutes)} min`, l: "p90 prep" });
  return f.slice(0, 3);
}

/** "/insights/dashboards/abc" -> "abc" (the id the dashboard island needs), else null. */
export function dashboardId(drill?: string | null): string | null {
  const m = /\/dashboards\/([^/?#]+)/.exec(drill || "");
  return m ? decodeURIComponent(m[1]) : null;
}

export const askAbout = (s: Slide) => `Tell me more about this: ${s.headline || s.title}`;
