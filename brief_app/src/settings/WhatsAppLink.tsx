import { useEffect, useRef, useState } from "react";
import { getStatus, startLink, unlink, type WaStart, type WaStatus } from "./whatsappApi";
import { businessLabel, groupCode, normalizeNumber } from "./whatsappHelpers";
import "./whatsapp.css";

export default function WhatsAppLink({ onClose }: { onClose: () => void }) {
  const [st, setSt] = useState<WaStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [number, setNumber] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [started, setStarted] = useState<WaStart | null>(null);
  const first = useRef<HTMLButtonElement>(null);

  const refresh = () => getStatus().then((s) => { setSt(s); setFailed(false); }).catch(() => setFailed(true));
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  // While a code is waiting, poll status so the sheet flips to Linked once the chairman sends it.
  useEffect(() => {
    if (!started || st?.state === "Active") return;
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [started, st?.state]);

  const valid = normalizeNumber(number) !== null;
  const start = async () => {
    setBusy(true); setErr("");
    try { setStarted(await startLink(number)); setSt(await getStatus()); }
    catch { setErr("Could not create a code. Check the number, or try again in a minute."); }
    setBusy(false);
  };
  const remove = async () => {
    setBusy(true); setErr("");
    try { await unlink(); setStarted(null); setNumber(""); setAgree(false); await refresh(); }
    catch { setErr("Could not unlink. Try again."); }
    setBusy(false);
  };

  const biz = businessLabel(started?.business_number || st?.business_number || "");
  let body;
  if (failed) body = <p>Could not load WhatsApp settings. Check your connection and try again.</p>;
  else if (!st) body = <p>Loading</p>;
  else if (st.state === "Active") {
    body = (<>
      <p className="wa-ok" role="status">Linked: {st.number_masked}</p>
      <p>Send a question to the business number on WhatsApp and the brief answers there. Send STOP at any time to stop.</p>
      <div className="wa-actions"><button type="button" className="secondary" disabled={busy} onClick={remove}>Unlink WhatsApp</button></div>
    </>);
  } else if (started) {
    body = (<>
      <p>Your one-time code. It works once and expires in {started.expires_minutes} minutes.</p>
      <div className="wa-code" aria-label={`Code ${started.code.split("").join(" ")}`}>{groupCode(started.code)}</div>
      <ol className="wa-steps">
        <li>Open WhatsApp on {started.number_masked}.</li>
        <li>Send <b>{started.command}</b> to <b>{biz || "the business number"}</b>.</li>
        <li>Come back here. This page updates when the link is active.</li>
      </ol>
      <p className="wa-ver">Consent {started.consent_text_version}</p>
      <div className="wa-actions"><button type="button" className="secondary" disabled={busy} onClick={remove}>Cancel and unlink</button></div>
    </>);
  } else {
    body = (<>
      <p>Get your brief on WhatsApp. You link one number, confirm with a one-time code, and can unlink here at any time.</p>
      <div className="wa-field">
        <label htmlFor="wa-number">WhatsApp number with country code</label>
        <input id="wa-number" className="wa-input" inputMode="tel" autoComplete="tel" placeholder="971501234567" value={number} onChange={(e) => setNumber(e.target.value)} />
      </div>
      <label className="wa-consent">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>{st.consent_text}</span>
      </label>
      <p className="wa-ver">Consent text {st.consent_text_version}</p>
      <div className="wa-actions"><button type="button" className="primary" disabled={busy || !valid || !agree} onClick={start}>Get my code</button></div>
    </>);
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="WhatsApp" onClick={(e) => e.stopPropagation()}>
        <h2>WhatsApp</h2>
        <div className="wa-body">
          {body}
          {err && <p className="wa-err" role="alert">{err}</p>}
        </div>
        <button type="button" ref={first} className="secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
