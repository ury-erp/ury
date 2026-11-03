import { useEffect, useState } from "react";
import { getPrefs, setPrefs, type Lang } from "./prefs";
import "./settings.css";

const LANG_NAMES: { code: Lang; label: string }[] = [
  { code: "auto", label: "Automatic (device language)" },
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "ar", label: "Arabic" },
  { code: "ml", label: "Malayalam" },
];

interface Props {
  onClose: () => void;
  onWhatsApp?: () => void;
  onInstall?: () => void;
  onSignOut: () => void;
}

export default function Settings({ onClose, onWhatsApp, onInstall, onSignOut }: Props) {
  const [p, setP] = useState(getPrefs);
  const [who, setWho] = useState<string | null>(null);
  const upd = (v: Parameters<typeof setPrefs>[0]) => setP(setPrefs(v));

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  useEffect(() => {
    fetch("/api/method/frappe.auth.get_logged_user", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setWho(j?.message && j.message !== "Guest" ? String(j.message) : null))
      .catch(() => setWho(null));
  }, []);

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <div className="st-body">
          {who && <p className="st-who">Signed in as {who}</p>}
          <div className="st-field">
            <label htmlFor="st-lang">Language for chat and calls</label>
            <select id="st-lang" className="st-select" value={p.language} onChange={(e) => upd({ language: e.target.value as Lang })}>
              {LANG_NAMES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
          <label className="st-row">
            <span>Show a play button on replies</span>
            <input type="checkbox" checked={p.readAloud} onChange={(e) => upd({ readAloud: e.target.checked })} />
          </label>
          <label className="st-row">
            <span>Show how many data sources an answer used</span>
            <input type="checkbox" checked={p.showSources} onChange={(e) => upd({ showSources: e.target.checked })} />
          </label>
          <p className="st-note">These are saved on this device only.</p>
          <div className="st-actions">
            {onWhatsApp && <button type="button" className="secondary" onClick={() => { onClose(); onWhatsApp(); }}>WhatsApp</button>}
            {onInstall && <button type="button" className="secondary" onClick={() => { onClose(); onInstall(); }}>Add to home screen</button>}
            <button type="button" className="secondary" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
        <button type="button" className="secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
