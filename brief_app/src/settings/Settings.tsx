import { useEffect, useState } from "react";
import { getPrefs, setPrefs, type Lang, type Theme } from "./prefs";
import { CloseIcon } from "../components/Icons";
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
}

const initials = (n: string) => {
  const base = n.split("@")[0].split(/[\s._-]+/).filter(Boolean);
  return ((base[0]?.[0] ?? "?") + (base.length > 1 ? base[1][0] : "")).toUpperCase();
};

export default function Settings({ onClose }: Props) {
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
        <div className="st-head">
          <h2>Settings</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><CloseIcon size={24} /></button>
        </div>
        <div className="st-body">
          {who && (
            <div className="st-profile">
              <span className="st-avatar" aria-hidden="true">{initials(who)}</span>
              <p className="st-who">Signed in as {who}</p>
            </div>
          )}
          <div className="st-field">
            <label htmlFor="st-theme">Appearance</label>
            <select id="st-theme" className="st-select" value={p.theme} onChange={(e) => upd({ theme: e.target.value as Theme })}>
              <option value="system">Automatic (device setting)</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
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
        </div>
      </div>
    </div>
  );
}
