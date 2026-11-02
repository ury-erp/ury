import type { Brief } from "./types";

export type LoadResult =
  | { kind: "ok"; brief: Brief; fromCache: boolean }
  | { kind: "auth" }
  | { kind: "offline" }
  | { kind: "error" };

const API = "/api/method/ury.ury.api.chairman.get_brief";

export function briefUserKey(): string {
  return document.querySelector('meta[name="brief-user"]')?.getAttribute("content") || "";
}

export async function loadBrief(): Promise<LoadResult> {
  const params = new URLSearchParams(location.search);
  const sample = params.get("sample") === "1";
  let url = sample ? "/assets/ury/brief/brief.sample.json" : API;
  if (!sample && params.get("date")) url += "?date=" + encodeURIComponent(params.get("date")!);
  try {
    const res = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json", "X-Brief-User": briefUserKey() } });
    if (res.status === 401 || res.status === 403) return { kind: "auth" };
    if (res.status === 503) {
      const j = await res.json().catch(() => null);
      return j && j.offline ? { kind: "offline" } : { kind: "error" };
    }
    if (!res.ok) return { kind: "error" };
    const j = await res.json();
    const brief: Brief = sample ? j : j.message;
    return { kind: "ok", brief, fromCache: !sample && res.headers.get("X-Brief-Source") === "cache" };
  } catch {
    return { kind: "error" };
  }
}

export function swPost(msg: unknown) {
  try { navigator.serviceWorker?.controller?.postMessage(msg); } catch { /* ignore */ }
}

export async function wipeCaches() {
  try {
    if (!window.caches) return;
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("ury-brief-")).map((k) => caches.delete(k)));
  } catch { /* ignore */ }
}

const USER_KEY = "ury-brief-user";
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/** Drop cached data when a different user is signed in. */
export async function checkUser() {
  const key = briefUserKey();
  if (key && ls.get(USER_KEY) !== key) {
    swPost({ type: "LOGOUT" });
    await wipeCaches();
    ls.set(USER_KEY, key);
  }
  announceUser();
}

/** Tell the service worker which user this page belongs to (SET_USER). */
export function announceUser() {
  const user = briefUserKey();
  if (user) swPost({ type: "SET_USER", user });
}

export async function signOut() {
  const finish = async () => {
    swPost({ type: "LOGOUT" });
    await wipeCaches();
    ls.del(USER_KEY);
    location.href = "/login";
  };
  try {
    await fetch("/api/method/logout", { method: "POST", credentials: "same-origin" });
  } catch { /* ignore */ }
  await finish();
}

export function forgetUser() { ls.del(USER_KEY); }
