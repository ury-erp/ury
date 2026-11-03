// NOT a call/ internal: wraps CallTab as an immersive overlay (wake lock, End-call confirm on Back).
import { useEffect, useRef, useState } from "react";
import CallTab from "./CallTab";
import { push, replace } from "../router";

let fromApp = false;
/** Open the call overlay from inside the app so Back/End can pop to where the user was. */
export function openCall() { fromApp = true; push({ name: "call" }); }

const LIVE_IDLE = ["idle", "ended", "failed"];

export default function CallOverlay() {
  const root = useRef<HTMLDivElement>(null);
  const [ask, setAsk] = useState(false);
  const guarded = useRef(false);

  const isLive = () => {
    const st = root.current?.querySelector<HTMLElement>(".call")?.dataset.state;
    return !!st && !LIVE_IDLE.includes(st);
  };
  const leave = () => {
    const n = guarded.current ? -2 : -1;
    guarded.current = false;
    if (fromApp) { fromApp = false; history.go(n); } else replace({ name: "brief" });
  };

  useEffect(() => {
    // Guard entry: the first Back lands on the same route, where we ask before leaving.
    history.pushState(null, "", location.href);
    guarded.current = true;
    const onPop = () => {
      if (!guarded.current) return;
      guarded.current = false;
      if (isLive()) { history.pushState(null, "", location.href); guarded.current = true; setAsk(true); }
      else { guarded.current = false; if (fromApp) { fromApp = false; history.back(); } else replace({ name: "brief" }); }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let gone = false;
    const get = () => {
      const nav = navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
      try { nav.wakeLock?.request("screen").then((l) => { if (gone) void l.release(); else lock = l; }).catch(() => undefined); } catch { /* unsupported */ }
    };
    get();
    const vis = () => { if (document.visibilityState === "visible" && !lock) get(); };
    document.addEventListener("visibilitychange", vis);
    return () => { gone = true; document.removeEventListener("visibilitychange", vis); void lock?.release().catch(() => undefined); };
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onBack(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  });

  const onBack = () => { if (isLive()) setAsk(true); else leave(); };

  return (
    <div className="call-overlay" ref={root} role="dialog" aria-modal="true" aria-label="Voice call">
      <CallTab onBack={onBack} />
      {ask && (
        <div className="scrim dialog-scrim" role="presentation">
          <div className="dialog" role="alertdialog" aria-labelledby="end-t">
            <h3 id="end-t">End call?</h3>
            <p>Your conversation will be saved in Recent questions.</p>
            <div className="dialog-r">
              <button type="button" className="quiet" autoFocus onClick={() => setAsk(false)}>Keep talking</button>
              <button type="button" className="end" onClick={() => { setAsk(false); leave(); }}>End call</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
