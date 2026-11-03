// The offline shell can hold a stale CSRF token after a session change; refresh it from the live page once on a 400.
export function csrfToken(): string {
  const w = window as unknown as { csrf_token?: string; frappe?: { csrf_token?: string } };
  const t = w.frappe?.csrf_token || w.csrf_token ||
    document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";
  return t && !t.includes("{{") ? t : "";
}

export async function refreshCsrf(): Promise<boolean> {
  try {
    const r = await fetch("/ury/brief/", { credentials: "same-origin", cache: "no-store", headers: { "X-Brief-Refresh": "1" } });
    const m = (await r.text()).match(/window\.csrf_token\s*=\s*("[^"]*"|null)/);
    const t = m ? (JSON.parse(m[1]) as string | null) : null;
    if (!t) return false;
    (window as unknown as { csrf_token?: string }).csrf_token = t;
    return true;
  } catch { return false; }
}

/** fetch() that retries once with a fresh CSRF token when the server answers 400 CSRFTokenError. */
export async function fetchCsrf(url: string, init: RequestInit & { headers: Record<string, string> }): Promise<Response> {
  const send = () => { const tok = csrfToken(); return fetch(url, { ...init, headers: tok ? { ...init.headers, "X-Frappe-CSRF-Token": tok } : init.headers }); };
  const res = await send();
  if (res.status !== 400) return res;
  const body = await res.clone().text().catch(() => "");
  if (!/CSRFTokenError/.test(body) || !(await refreshCsrf())) return res;
  return send();
}
