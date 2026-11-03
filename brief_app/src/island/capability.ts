// Frappe islands capability: true only when the site can serve island assets.
export const ISLAND_NAME = "insights.dashboard";
export const ASSETS_URL = `/api/method/frappe.utils.island.get_island_assets?name=${ISLAND_NAME}`;
const DASH_RE = /^\/insights\/dashboards\/([A-Za-z0-9]+)$/;

export interface IslandAssets { js: string; css?: string | null }
export class IslandError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

/** Insights dashboard docname from a card link ("/insights/dashboards/abc123"; same-origin absolute urls accepted). */
export function extractDashboardId(url: string | null | undefined, origin?: string): string | null {
  if (!url) return null;
  let path = url;
  if (origin && url.startsWith(origin)) path = url.slice(origin.length);
  const m = DASH_RE.exec(path);
  return m ? m[1] : null;
}

type F = typeof fetch;
export async function fetchIslandAssets(fetchImpl: F = globalThis.fetch.bind(globalThis)): Promise<IslandAssets> {
  const r = await fetchImpl(ASSETS_URL, { credentials: "same-origin", headers: { Accept: "application/json" } });
  if (!r.ok) throw new IslandError(`get_island_assets ${r.status}`, r.status);
  const j = await r.json();
  const m = j?.message;
  if (!m || typeof m.js !== "string" || !m.js) throw new IslandError("no island assets", 404);
  return { js: m.js, css: m.css ?? null };
}

let cached: Promise<boolean> | null = null;
export function isIslandAvailable(fetchImpl?: F): Promise<boolean> {
  if (!cached) cached = fetchIslandAssets(fetchImpl).then(() => true, () => false);
  return cached;
}
export function resetIslandCapability() { cached = null; }
