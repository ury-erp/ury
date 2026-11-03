import { useEffect, useRef, useState } from "react";
import { extractToken, landingTarget } from "../settings/whatsappHelpers";
import "../settings/whatsapp.css";

const EXCHANGE = "/api/method/ury.ury.api.chairman_link.exchange";

/**
 * Landing page for a pre-authorised link. Link previews only GET this shell, so a GET never
 * consumes the token: the token is read, stripped from the address bar, and only then POSTed.
 */
export default function Go() {
  const [state, setState] = useState<"working" | "bad">("working");
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = extractToken(location.search);
    const target = landingTarget(location.hash);
    history.replaceState(null, "", location.pathname); // strip ?t= and #hash BEFORE any request
    if (!token) { setState("bad"); return; }
    fetch(EXCHANGE, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then((r) => { if (r.ok) location.replace(target); else setState("bad"); }).catch(() => setState("bad"));
  }, []);
  return (
    <div className="app">
      <div className="state go-state">
        {state === "working"
          ? <><h2>Opening your brief</h2><p className="sub" role="status">One moment.</p></>
          : <><h2>This link has expired</h2><p className="sub">Links work once and last 10 minutes. Ask for a new one on WhatsApp, or sign in.</p><a className="btn" href="/login?redirect-to=/ury/brief/">Sign in</a></>}
      </div>
    </div>
  );
}
