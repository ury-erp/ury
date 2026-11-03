// Pure helpers for chat cards (no imports so node --test can load this file directly).
export type CardLink = { url: string; label?: string };
export interface Card {
  v?: number; type: "kpi" | "bar" | "line" | "table" | "dashboard";
  title?: string; subtitle?: string; link?: CardLink | null; ai_composed?: boolean;
  kpis?: { label: string; value: number | string | null; fmt?: string; delta?: number | null; trend?: Trend | null; tone?: Tone | null }[];
  good_direction?: "up" | "down"; subtext?: string; footnote?: string; panels?: DashboardPanel[];
  series?: { label: string; value: number }[]; fmt?: string;
  cols?: string[]; rows?: (string | number | null)[][];
}
export type Trend = "up" | "down" | "flat";
export type Tone = "good" | "bad" | "neutral";
export interface DashboardPanel { card: Card; id?: string; composed: boolean; span: 1 | 2; title?: string; subtitle?: string; caption?: string }
export const CARD_TYPES = ["kpi", "bar", "line", "table"];
export const MAX_PANELS = 6;

function cleanBase(raw: unknown): Card | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Card;
  if (!CARD_TYPES.includes(o.type)) return null;
  if (o.type === "kpi" && !Array.isArray(o.kpis)) return null;
  if ((o.type === "bar" || o.type === "line") && !Array.isArray(o.series)) return null;
  if (o.type === "table" && (!Array.isArray(o.cols) || !Array.isArray(o.rows))) return null;
  return o;
}
const str = (x: unknown) => (typeof x === "string" ? x : undefined);

function cleanDashboard(o: Card): Card | null {
  if (!Array.isArray(o.panels)) return null;
  const panels: DashboardPanel[] = [];
  for (const p of o.panels as unknown[]) {
    if (panels.length >= MAX_PANELS) break;
    const q = p as Partial<DashboardPanel> | null;
    if (!q || typeof q !== "object") continue;
    const card = cleanBase(q.card); // nested dashboards are dropped here
    if (!card) continue;
    panels.push({ card, id: str(q.id), composed: q.composed === true, span: q.span === 1 ? 1 : 2, title: str(q.title), subtitle: str(q.subtitle), caption: str(q.caption) });
  }
  if (!panels.length) return null;
  return { ...o, type: "dashboard", panels, subtext: str(o.subtext), footnote: str(o.footnote) };
}

export function panelTitle(p: DashboardPanel): string { return p.title || p.card.title || ""; }
export function panelSubtitle(p: DashboardPanel): string { return p.subtitle || p.card.subtitle || ""; }
/** Panel link, only when it passes safeLink. */
export function dashboardLink(c: Card): CardLink | null {
  for (const p of c.panels ?? []) { const l = safeLink(p.card.link); if (l) return l; }
  return null;
}

export function trendGlyph(t: Trend | null | undefined): string { return t === "up" ? "▲" : t === "down" ? "▼" : t === "flat" ? "▬" : ""; }
export function trendWord(t: Trend | null | undefined): string { return t === "up" ? "up" : t === "down" ? "down" : t === "flat" ? "flat" : ""; }
/** Tone to the css modifier class; unknown tones are neutral. */
export function toneClass(t: unknown): string { return t === "good" ? "tone-good" : t === "bad" ? "tone-bad" : "tone-neutral"; }

/** Keep only well-formed cards of known types; anything else is dropped silently. */
export function sanitizeCards(raw: unknown): Card[] {
  if (!Array.isArray(raw)) return [];
  const out: Card[] = [];
  for (const c of raw) {
    if (c && typeof c === "object" && (c as Card).type === "dashboard") { const d = cleanDashboard(c as Card); if (d) out.push(d); continue; }
    const k = cleanBase(c);
    if (k) out.push(k);
  }
  return out;
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
  if (c.type === "dashboard") {
    const ps = (c.panels ?? []).map((p) => [cardSummary({ ...p.card, title: panelTitle(p), subtitle: panelSubtitle(p) }), p.caption].filter(Boolean).join(" ")).join(" | ");
    return `Dashboard ${head}: ${ps}${c.footnote ? ". " + c.footnote : ""}`;
  }
  if (c.type === "kpi") return `${head}: ` + (c.kpis ?? []).map((k) => `${k.label} ${fmtValue(k.value, k.fmt)}${k.trend && k.trend !== "flat" ? ` ${trendWord(k.trend)}${fmtDelta(k.delta) ? " " + fmtDelta(k.delta)!.text : ""}` : ""}`).join("; ");
  if (c.type === "table") return `${head}: ${(c.rows ?? []).length} rows. ` + (c.rows ?? []).slice(0, 5).map((r) => r.map((x) => fmtValue(x)).join(" ")).join("; ");
  const s = c.series ?? [];
  if (!s.length) return `${head}: no data`;
  const hi = s.reduce((a, b) => (b.value > a.value ? b : a));
  const lo = s.reduce((a, b) => (b.value < a.value ? b : a));
  return `${head}: ${s.length} points. Highest ${hi.label} ${fmtValue(hi.value, c.fmt)}, lowest ${lo.label} ${fmtValue(lo.value, c.fmt)}. ` +
    s.slice(0, 12).map((p) => `${p.label} ${fmtValue(p.value, c.fmt)}`).join("; ");
}
