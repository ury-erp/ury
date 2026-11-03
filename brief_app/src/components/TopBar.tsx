import { useEffect, useRef, useState } from "react";
import { KebabIcon, PhoneIcon } from "./Icons";
import { getPrefs, setPrefs, type Theme } from "../settings/prefs";

interface Props {
  subtitle?: string;
  onCall?: () => void;
  onSettings: () => void;
  onWhatsApp?: () => void;
  onInstall?: () => void;
  onSignOut: () => void;
}

export default function TopBar({ subtitle, onCall, onSettings, onWhatsApp, onInstall, onSignOut }: Props) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => getPrefs().theme);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); btn.current?.focus(); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
        const i = items.indexOf(document.activeElement as HTMLElement);
        const n = e.key === "ArrowDown" ? i + 1 : i - 1;
        items[(n + items.length) % items.length]?.focus();
        e.preventDefault();
      }
    };
    const down = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", down);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", down); };
  }, [open]);

  const pick = (fn?: () => void) => () => { setOpen(false); fn?.(); };

  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>URY Brief</h1>
        {subtitle ? <p className="topbar-sub">{subtitle}</p> : null}
      </div>
      {onCall && (
        <button type="button" className="icon-btn" aria-label="Call" onClick={onCall}><PhoneIcon size={24} /></button>
      )}
      <div className="topbar-menu" ref={wrap}>
        <button ref={btn} type="button" className="icon-btn" aria-label="More options" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <KebabIcon size={24} />
        </button>
        {open && (
          <div className="menu" role="menu" ref={menu}>
            <button type="button" role="menuitem" onClick={pick(onSettings)}>Settings</button>
            {onWhatsApp && <button type="button" role="menuitem" onClick={pick(onWhatsApp)}>WhatsApp</button>}
            {onInstall && <button type="button" role="menuitem" onClick={pick(onInstall)}>Add to home screen</button>}
            <div className="menu-theme" role="group" aria-label="Theme">
              {(["system", "light", "dark"] as Theme[]).map((t) => (
                <button key={t} type="button" role="menuitemradio" aria-checked={theme === t} onClick={() => { setTheme(t); setPrefs({ theme: t }); }}>
                  {t === "system" ? "Auto" : t === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>
            <hr />
            <button type="button" role="menuitem" onClick={pick(onSignOut)}>Sign out</button>
          </div>
        )}
      </div>
    </header>
  );
}
