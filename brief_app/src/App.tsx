import { useCallback, useEffect, useRef, useState } from "react";
import TopBar from "./components/TopBar";
import InstallSheet, { detectPlatform, isStandalone } from "./components/InstallSheet";
import WhatsAppLink from "./settings/WhatsAppLink";
import { whatsappEnabled } from "./settings/whatsappHelpers";
import DashboardIsland from "./components/DashboardIsland";
import Today from "./TodayHome";
import ChatTab from "./chat/ChatTab";
import ChatsSheet from "./chat/ChatsSheet";
import { useChats } from "./chat/useChats";
import { queueHandoff } from "./chat/handoff";
import CallOverlay, { openCall } from "./call/CallOverlay";
import { announceUser, checkUser, forgetUser, loadBrief, signOut, type LoadResult } from "./api";
import { timeOf } from "./format";
import Settings from "./settings/Settings";
import { push, replace, back, seedStack, useRoute } from "./router";

type BIPEvent = Event & { prompt: () => Promise<void> };
const LOGIN = "/login?redirect-to=/ury/brief/";

const initials = (n: string) => {
  const base = n.split("@")[0].split(/[\s._-]+/).filter(Boolean);
  return ((base[0]?.[0] ?? "B") + (base.length > 1 ? base[1][0] : "")).toUpperCase();
};

function briefBuild(): string {
  const meta = document.querySelector('meta[name="brief-build"]')?.getAttribute("content");
  if (meta) return meta;
  for (const s of Array.from(document.querySelectorAll("script[src]"))) {
    const src = s.getAttribute("src") || "";
    if (/\/app\.js(\?|$)/.test(src)) {
      const v = src.split("?")[1] && new URLSearchParams(src.split("?")[1]).get("v");
      if (v) return v;
    }
  }
  return "dev";
}

export default function App() {
  const [res, setRes] = useState<LoadResult | null>(null);
  useState(seedStack);
  const route = useRoute();
  const [dash, setDash] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [wa, setWa] = useState(false);
  const sheetPushed = useRef(false);
  const [sheet, setSheet] = useState(false);
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
    navigator.serviceWorker.register("/ury/brief/sw.js?v=" + encodeURIComponent(briefBuild()), { scope: "/ury/brief/" }).then((reg) => {
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

  const chats = useChats(huf);
  const view = !huf ? "brief" : route.name === "call" && !voice ? "brief" : route.name;
  useEffect(() => { if (view === "brief" || view === "ask") chats.reload(); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!brief) return;
    fetch("/api/method/frappe.auth.get_logged_user", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setMe(j?.message && j.message !== "Guest" ? String(j.message) : null))
      .catch(() => setMe(null));
  }, [!!brief]); // eslint-disable-line react-hooks/exhaustive-deps

  const ask = (q: string) => { queueHandoff({ text: q }); push({ name: "thread", id: "new" }); };
  const mic = () => { queueHandoff({ mic: true }); push({ name: "thread", id: "new" }); };
  const seeAll = () => { sheetPushed.current = true; push({ name: "ask" }); };
  const closeSheet = () => { if (sheetPushed.current) { sheetPushed.current = false; back(); } else replace({ name: "brief" }); };
  const leaveThread = () => { if (history.length > 1) back(); else replace({ name: "brief" }); };

  let body = null;
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
  }

  const threadRoute = route.name === "thread" && huf ? route : null;
  const threadTitle = threadRoute ? chats.rows?.find((r) => r.id === threadRoute.id)?.title : undefined;
  const name = brief?.scope?.companies?.length ? brief.scope.companies.join(", ") : "URY Brief";
  const installable = !isStandalone() ? () => setSheet(true) : undefined;

  return (
    <div className="app">
      {!brief && <TopBar title="URY Brief" initials={initials(who || "B")} onSettings={() => setSettings(true)} onInstall={installable} onSignOut={() => signOut()} />}
      {update && (
        <p className="banner" role="status">New version available.
          <button type="button" onClick={() => update.postMessage({ type: "SKIP_WAITING" })}>Reload</button>
        </p>
      )}
      {res?.kind === "ok" && res.fromCache && <p className="banner" role="status">Showing {timeOf(res.brief.as_of)} brief, offline</p>}
      {res?.kind === "offline" && <p className="banner" role="status">Offline</p>}
      {body}
      {brief && (
        <Today
          brief={brief} title={name} subtitle={timeOf(brief.as_of) ? `Updated ${timeOf(brief.as_of)}` : ""} initials={initials(me || name)}
          huf={huf} voice={voice} chats={chats} hidden={!!threadRoute}
          onAsk={ask} onMic={mic} onCall={openCall}
          onOpenChat={(id) => push({ name: "thread", id })} onSeeAll={seeAll} onDashboard={setDash}
          onSettings={() => setSettings(true)} onInstall={installable} onSignOut={() => signOut()}
          onWhatsApp={whatsappEnabled(brief.features) ? () => setWa(true) : undefined}
        />
      )}
      {threadRoute && (
        <ChatTab
          id={threadRoute.id} title={threadTitle} onBack={leaveThread} onCall={voice ? openCall : undefined}
          onStarted={(id) => replace({ name: "thread", id })}
        />
      )}
      {view === "ask" && <ChatsSheet chats={chats} onClose={closeSheet} onOpen={(id) => push({ name: "thread", id })} />}
      {view === "call" && <CallOverlay />}
      {dash && <DashboardIsland id={dash} onClose={() => setDash(null)} />}
      {chats.undo && (
        <div className="snack" role="status">
          <span dir="auto">Deleted &ldquo;{chats.undo.title.slice(0, 24)}&rdquo;</span>
          <button type="button" onClick={chats.undoRemove}>Undo</button>
        </div>
      )}
      {settings && <Settings onClose={() => setSettings(false)} />}
      {wa && <WhatsAppLink onClose={() => setWa(false)} />}
      {sheet && <InstallSheet platform={detectPlatform()} canPrompt={canPrompt} onPrompt={prompt} onClose={() => setSheet(false)} />}
    </div>
  );
}
