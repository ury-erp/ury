// Tiny hash router: #/ (Today), #/ask (chats sheet), #/ask/<id|new>, #/call. Tabs replace, views push, so Back pops view -> list -> Brief -> exit.
import { useEffect, useState } from "react";

export type Route =
  | { name: "brief" }
  | { name: "ask" }
  | { name: "thread"; id: string }
  | { name: "call" };

export function parse(hash: string): Route {
  const p = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (p[0] === "ask") return p[1] ? { name: "thread", id: decodeURIComponent(p[1]) } : { name: "ask" };
  if (p[0] === "call") return { name: "call" };
  return { name: "brief" };
}

export function href(r: Route): string {
  if (r.name === "thread") return `#/ask/${encodeURIComponent(r.id)}`;
  return r.name === "brief" ? "#/" : `#/${r.name}`;
}

/** Cold deep link into a thread: put the chat list underneath so Back has somewhere to go. */
export function seedStack() {
  if (parse(location.hash).name === "thread") {
    const target = location.hash;
    history.replaceState(null, "", "#/ask");
    history.pushState(null, "", target);
  }
}

const emit = () => window.dispatchEvent(new HashChangeEvent("hashchange"));
export const push = (r: Route) => { history.pushState(null, "", href(r)); emit(); };
export const replace = (r: Route) => { history.replaceState(null, "", href(r)); emit(); };
export const back = () => history.back();

export function useRoute(): Route {
  const [r, setR] = useState<Route>(() => parse(location.hash));
  useEffect(() => {
    const on = () => setR(parse(location.hash));
    window.addEventListener("hashchange", on);
    window.addEventListener("popstate", on);
    return () => { window.removeEventListener("hashchange", on); window.removeEventListener("popstate", on); };
  }, []);
  return r;
}
