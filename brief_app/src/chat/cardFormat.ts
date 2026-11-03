// Pure helpers for chat cards (no imports so node --test can load this file directly).
export type CardLink = { url: string; label?: string };
export interface Card {
  v?: number; type: "kpi" | "bar" | "line" | "table";
  title?: string; subtitle?: string; link?: CardLink | null; ai_composed?: boolean;
  kpis?: { label: string; value: number | string | null; fmt?: string; delta?: number | null }[];
  series?: { label: string; value: number }[]; fmt?: string;
  cols?: string[]; rows?: (string | number | null)[][];
}
export const CARD_TYPES = ["kpi", "bar", "line", "table"];

/** Keep only well-formed cards of known types; anything else is dropped silently. */
export function sanitizeCards(raw: unknown): Card[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is Card => !!c && typeof c === "object" && CARD_TYPES.includes((c as Card).type)).map((c) => {
    const o = c as Card;
    if (o.type === "kpi" && !Array.isArray(o.kpis)) return null;
    if ((o.type === "bar" || o.type === "line") && !Array.isArray(o.series)) return null;
    if (o.type === "table" && (!Array.isArray(o.cols) || !Array.isArray(o.rows))) return null;
    return o;
  }).filter((c): c is Card => c !== null);
}

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export function fmtValue(v: unknown, fmt?: string): string {
  if (v == null || v === "") return "–";
  if (typeof v === "string") return v;
  if (!Number.isFinite(v as number)) return "–";
  const n = v as number;
  if (fmt === "money") return (n < 0 ? "-" : "") + "₹" + inr.format(Math.abs(n));
  if (fmt === "pct") return inr2.format(n) + "%";
  if (fmt === "int") return inr.format(n);
  return inr2.format(n);
}

/** delta is a ratio (0.0009 = +0.09%). */
export function fmtDelta(d: number | null | undefined): { text: string; dir: "up" | "down" | "flat" } | null {
  if (d == null || !Number.isFinite(d)) return null;
  const p = d * 100;
  const abs = Math.abs(p) < 10 ? Math.abs(p).toFixed(1) : Math.round(Math.abs(p)).toString();
  if (Number(abs) === 0) return { text: "0%", dir: "flat" };
  return p > 0 ? { text: `+${abs}%`, dir: "up" } : { text: `−${abs}%`, dir: "down" };
}

export function safeLink(l: CardLink | null | undefined): CardLink | null {
  if (!l || typeof l.url !== "string") return null;
  return l.url.startsWith("/insights/") || l.url.startsWith("/app/") ? l : null;
}

/** Plain-text alternative for screen readers. */
export function cardSummary(c: Card): string {
  const head = [c.title, c.subtitle].filter(Boolean).join(", ");
  if (c.type === "kpi") return `${head}: ` + (c.kpis ?? []).map((k) => `${k.label} ${fmtValue(k.value, k.fmt)}`).join("; ");
  if (c.type === "table") return `${head}: ${(c.rows ?? []).length} rows. ` + (c.rows ?? []).slice(0, 5).map((r) => r.map((x) => fmtValue(x)).join(" ")).join("; ");
  const s = c.series ?? [];
  if (!s.length) return `${head}: no data`;
  const hi = s.reduce((a, b) => (b.value > a.value ? b : a));
  const lo = s.reduce((a, b) => (b.value < a.value ? b : a));
  return `${head}: ${s.length} points. Highest ${hi.label} ${fmtValue(hi.value, c.fmt)}, lowest ${lo.label} ${fmtValue(lo.value, c.fmt)}. ` +
    s.slice(0, 12).map((p) => `${p.label} ${fmtValue(p.value, c.fmt)}`).join("; ");
}
