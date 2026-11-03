import { useEffect, useRef, useState } from "react";
import { SparkleIcon, SettingsIcon, InstallIcon, LogoutIcon } from "./Icons";
import { getPrefs, setPrefs, usePrefsSubscribe, type Theme } from "../settings/prefs";

interface Props {
  title: string;
  subtitle?: string;
  initials: string;
  onSettings: () => void;
  onInstall?: () => void;
  onWhatsApp?: () => void;
  onSignOut: () => void;
}

export default function TopBar({ title, subtitle, initials, onSettings, onInstall, onWhatsApp, onSignOut }: Props) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => getPrefs().theme);
  useEffect(() => usePrefsSubscribe(() => setTheme(getPrefs().theme)), []);
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
        <h1 dir="auto">{title}</h1>
        {subtitle ? <p className="topbar-sub">{subtitle}</p> : null}
      </div>
      <div className="topbar-menu" ref={wrap}>
        <button ref={btn} type="button" className="avatar" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{initials}</button>
        {open && (
          <div className="menu" role="menu" ref={menu}>
            <div className="menu-theme" role="group" aria-label="Appearance">
              <p className="menu-lbl">Appearance</p>
              <div className="seg">
                {(["system", "light", "dark"] as Theme[]).map((t) => (
                  <button key={t} type="button" role="menuitemradio" aria-checked={theme === t} aria-pressed={theme === t} onClick={() => { setTheme(t); setPrefs({ theme: t }); }}>
                    {t === "system" ? "Auto" : t === "light" ? "Light" : "Dark"}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" role="menuitem" onClick={pick(onSettings)}><SettingsIcon size={22} />Settings</button>
            {onWhatsApp && <button type="button" role="menuitem" onClick={pick(onWhatsApp)}><SparkleIcon size={22} />WhatsApp</button>}
            {onInstall && <button type="button" role="menuitem" onClick={pick(onInstall)}><InstallIcon size={22} />Add to home screen</button>}
            <button type="button" role="menuitem" className="danger" onClick={pick(onSignOut)}><LogoutIcon size={22} />Sign out</button>
          </div>
        )}
      </div>
    </header>
  );
}
