import { useEffect, useRef, useState } from "react";
import { mountIsland, type IslandHandle } from "../island/host";
import { ISLAND_NAME, fetchIslandAssets, IslandError } from "../island/capability";

export function currentTheme(): "light" | "dark" {
  const t = document.documentElement.getAttribute("data-theme");
  if (t === "dark" || t === "light") return t;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

type Phase = "loading" | "ready" | "error" | "noaccess";
type Props = { id: string; onClose: () => void; theme?: "light" | "dark" };

/** Full-screen Insights dashboard embedded via a Frappe island. Back / Escape / close button all dismiss it. */
export default function DashboardIsland({ id, onClose, theme }: Props) {
  const target = useRef<HTMLDivElement>(null);
  const handle = useRef<IslandHandle | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const th = theme ?? currentTheme();
  const [phase, setPhase] = useState<Phase>("loading");
  const [title, setTitle] = useState("Dashboard");
  const [attempt, setAttempt] = useState(0);

  // Back closes the overlay: push one history entry, close on popstate.
  useEffect(() => {
    if (!(history.state && history.state.dash)) history.pushState({ dash: 1 }, "");
    const pop = () => closeRef.current();
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  const close = () => { if (history.state && history.state.dash) history.back(); else onClose(); };
  const closeFn = useRef(close);
  closeFn.current = close;
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") closeFn.current(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    let live = true;
    setPhase("loading");
    const origin = location.origin;
    const h = mountIsland(ISLAND_NAME, el, {
      resolve: () => fetchIslandAssets(),
      host: {
        base_url: origin, theme: th,
        navigate: (route: string) => { try { window.open(new URL(route, origin).href, "_blank", "noopener"); } catch { /* ignore */ } },
      },
      props: {
        dashboard: id, theme: th,
        onTitle: (t: string) => { if (live && typeof t === "string" && t) setTitle(t); },
        onNavigate: (route: string) => { try { window.open(new URL(route, origin).href, "_blank", "noopener"); } catch { /* ignore */ } },
      },
    });
    handle.current = h;
    h.ready.then(() => { if (live) setPhase("ready"); }, (e) => {
      if (!live) return;
      const s = e instanceof IslandError ? e.status : 0;
      setPhase(s === 401 || s === 403 ? "noaccess" : "error");
    });
    return () => { live = false; h.unmount(); handle.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, attempt]);

  useEffect(() => { handle.current?.update({ theme: th }); }, [th]);

  return (
    <div role="dialog" aria-modal="true" aria-label={title}
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", flexDirection: "column", background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid hsl(var(--hair2))" }}>
        <button type="button" className="ghost" onClick={close} aria-label="Back">← Back</button>
        <h2 dir="auto" style={{ flex: 1, margin: 0, fontSize: "var(--text-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</h2>
        <button type="button" className="ghost" onClick={close} aria-label="Close">✕</button>
      </header>
      <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "auto" }}>
        <div ref={target} style={{ minHeight: "100%", display: phase === "ready" ? "block" : "none" }} />
        {phase === "loading" && <p role="status" style={{ padding: 16 }}>Loading dashboard…</p>}
        {phase === "noaccess" && <p role="alert" style={{ padding: 16 }}>No Access. You do not have permission to view this dashboard.</p>}
        {phase === "error" && (
          <div role="alert" style={{ padding: 16 }}>
            <p>Could not load the dashboard.</p>
            <button type="button" className="retry" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
          </div>
        )}
      </div>
    </div>
  );
}
