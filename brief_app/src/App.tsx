import { useCallback, useEffect, useRef, useState } from "react";
import Deck from "./components/Deck";
import TabBar, { type Tab } from "./components/TabBar";
import InstallSheet, { detectPlatform, isStandalone } from "./components/InstallSheet";
import ChatTab from "./chat/ChatTab";
import CallTab from "./call/CallTab";
import { announceUser, checkUser, forgetUser, loadBrief, signOut, type LoadResult } from "./api";
import { timeOf } from "./format";
import Settings from "./settings/Settings";
import WhatsAppLink from "./settings/WhatsAppLink";
import { whatsappEnabled } from "./settings/whatsappHelpers";

type BIPEvent = Event & { prompt: () => Promise<void> };
const LOGIN = "/login?redirect-to=/ury/brief/";

export default function App() {
  const [res, setRes] = useState<LoadResult | null>(null);
  const [tab, setTab] = useState<Tab>("brief");
  const [sheet, setSheet] = useState(false);
  const [wa, setWa] = useState(false);
  const [settings, setSettings] = useState(false);
  const [authLost, setAuthLost] = useState(false);
  const [who, setWho] = useState<string | null>(null);
  const [update, setUpdate] = useState<ServiceWorker | null>(null);
  const deferred = useRef<BIPEvent | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);

  const load = useCallback(() => { setRes(null); checkUser().then(loadBrief).then(setRes); }, []);
  useEffect(load, [load]);

  useEffect(() => {
    const onBip = (e: Event) => { e.preventDefault(); deferred.current = e as BIPEvent; setCanPrompt(true); };
    window.addEventListener("beforeinstallprompt", onBip);
    if (!("serviceWorker" in navigator)) return () => window.removeEventListener("beforeinstallprompt", onBip);
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "AUTH_LOST") { forgetUser(); setAuthLost(true); } };
    navigator.serviceWorker.addEventListener("message", onMsg);
    navigator.serviceWorker.register("/ury/brief/sw.js", { scope: "/ury/brief/" }).then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) setUpdate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) setUpdate(w);
        });
      });
    }).catch(() => {});
    let reloaded = false;
    const had = !!navigator.serviceWorker.controller;
    const onCtl = () => { announceUser(); if (!reloaded && had) { reloaded = true; location.reload(); } };
    navigator.serviceWorker.ready.then(announceUser).catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", onCtl);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      navigator.serviceWorker.removeEventListener("message", onMsg);
      navigator.serviceWorker.removeEventListener("controllerchange", onCtl);
    };
  }, []);

  const prompt = async () => {
    const d = deferred.current;
    if (!d) return;
    deferred.current = null; setCanPrompt(false); setSheet(false);
    await d.prompt();
  };

  const auth = authLost || res?.kind === "auth";
  useEffect(() => {
    if (!auth) { setWho(null); return; }
    fetch("/api/method/frappe.auth.get_logged_user", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setWho(j?.message && j.message !== "Guest" ? String(j.message) : null))
      .catch(() => setWho(null));
  }, [auth]);
  const brief = res?.kind === "ok" && !auth ? res.brief : null;
  const huf = !!brief?.features?.huf;
  const voice = huf && !!brief?.features?.voice_call;
  const active: Tab = !huf || (tab === "call" && !voice) ? "brief" : tab;

  let body;
  if (auth) {
    body = who
      ? <div className="state"><h2>No access to the brief</h2><p className="sub">You are signed in as {who}, which cannot open the brief. Sign out and use an owner account.</p><button type="button" className="primary" onClick={() => signOut()}>Sign out</button></div>
      : <div className="state"><h2>Please sign in</h2><p className="sub">Your session has ended or you do not have access to the brief.</p><a className="btn" href={LOGIN}>Sign in</a></div>;
  } else if (!res) {
    body = <div className="skel" aria-hidden="true" />;
  } else if (res.kind === "offline") {
    body = <div className="state"><h2>You are offline</h2><p className="sub">No saved brief is available yet. Connect once to load it.</p></div>;
  } else if (res.kind === "error") {
    body = <div className="state"><h2>Brief unavailable</h2><p className="sub">Could not load the brief. Check your connection and try again.</p><button type="button" className="primary" onClick={load}>Try again</button></div>;
  } else if (active === "brief") {
    body = <Deck slides={res.brief.slides} />;
  } else {
    body = active === "ask" ? <ChatTab /> : <CallTab onBack={() => setTab("ask")} />;
  }

  return (
    <div className="app">
      <header className="bar">
        <h1>URY Brief</h1>
        <div className="bar-actions">
          <button type="button" className="ghost" onClick={() => setSettings(true)}>Settings</button>
        </div>
      </header>
      {update && (
        <p className="banner" role="status">New version available.
          <button type="button" onClick={() => update.postMessage({ type: "SKIP_WAITING" })}>Reload</button>
        </p>
      )}
      {res?.kind === "ok" && res.fromCache && <p className="banner" role="status">Showing {timeOf(res.brief.as_of)} brief, offline</p>}
      {res?.kind === "offline" && <p className="banner" role="status">Offline</p>}
      {body}
      <TabBar tab={active} onTab={setTab} huf={huf} voice={voice} />
      {settings && (
        <Settings
          onClose={() => setSettings(false)}
          onWhatsApp={whatsappEnabled(brief?.features) ? () => setWa(true) : undefined}
          onInstall={!isStandalone() ? () => setSheet(true) : undefined}
          onSignOut={() => signOut()}
        />
      )}
      {wa && <WhatsAppLink onClose={() => setWa(false)} />}
      {sheet && <InstallSheet platform={detectPlatform()} canPrompt={canPrompt} onPrompt={prompt} onClose={() => setSheet(false)} />}
    </div>
  );
}
