import { useEffect, useRef } from "react";

export type Platform = "ios" | "android";

export function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(ua) || iPadOS ? "ios" : "android";
}

export function isStandalone(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export default function InstallSheet({ platform, canPrompt, onPrompt, onClose }: {
  platform: Platform; canPrompt: boolean; onPrompt: () => void; onClose: () => void;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    btn.current?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Add to home screen" onClick={(e) => e.stopPropagation()}>
        <h2>Add to home screen</h2>
        {platform === "ios" ? (
          <ol>
            <li>Open this page in Safari.</li>
            <li>Tap the Share button at the bottom of the screen.</li>
            <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
            <li>Tap <b>Add</b>. The brief now opens like an app.</li>
          </ol>
        ) : (
          <ol>
            {canPrompt && <li>Tap <b>Install</b> below.</li>}
            <li>Or open the browser menu (the three dots) in Chrome.</li>
            <li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
            <li>Confirm. The brief now opens like an app.</li>
          </ol>
        )}
        {platform === "android" && canPrompt && <button type="button" className="primary" onClick={onPrompt}>Install</button>}
        <button type="button" ref={btn} className="secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
