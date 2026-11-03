import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import "./chat.css";
import * as api from "./api";
import Markdown from "./markdown";
import { Cards } from "./Card";
import Player from "./Player";
import Waveform from "./Waveform";
import { MAX_BYTES, MAX_SECONDS, Recorder, micSupported, type RecError } from "./recorder";
import { takeHandoff } from "./handoff";
import { dayKey, dayLabel } from "./when";
import type { ChatMessage } from "./types";
import { MicIcon, SendIcon, CloseIcon, TickIcon, DoubleTickIcon, BackIcon, PhoneIcon } from "../components/Icons";
import { getPrefs, usePrefsSubscribe } from "../settings/prefs";

export type { ChatMessage, ChatTabProps } from "./types";

const STARTERS = ["How were sales yesterday?", "Which dishes should I push?"];
const POLL_MS = 2000;
const POLL_MAX = 45;
let seq = 0;
const firstSeen = new Map<string, number>();
const stampOf = (id: string) => { let t = firstSeen.get(id); if (!t) { t = Date.now(); firstSeen.set(id, t); } return t; };
const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const lid = () => `local-${++seq}`;

export interface ThreadProps {
  /** conversation id, or "new" */
  id: string;
  title?: string;
  onBack: () => void;
  onCall?: () => void;
  /** a new chat got its server id (caller swaps the route to it) */
  onStarted: (id: string) => void;
}

export default function ChatTab({ id: routeId, title, onBack, onCall, onStarted }: ThreadProps) {
  const [prefs, setPrefsState] = useState(getPrefs);
  useEffect(() => usePrefsSubscribe(() => setPrefsState(getPrefs())), []);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [micErr, setMicErr] = useState<RecError | null>(null);
  const [sheet, setSheet] = useState(false);
  const loadTok = useRef(0);
  const conv = useRef<string | null>(null);
  const rec = useRef<Recorder | null>(null);
  const timer = useRef<number>();
  const poll = useRef<number>();
  const end = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const canMic = micSupported();
  const onStartedRef = useRef(onStarted);
  onStartedRef.current = onStarted;
  const ta = useRef<HTMLTextAreaElement>(null);
  const coarse = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
  useEffect(() => {
    const el = ta.current; if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 6 * 20)}px`;
  }, [text, recording]);

  useEffect(() => { alive.current = true; return () => { alive.current = false; clearInterval(timer.current); clearTimeout(poll.current); rec.current?.cancel(); }; }, []);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "end" }); }, [msgs, waiting]);

  /** Server messages are the truth; keep only local items still in flight or failed. */
  const merge = (server: ChatMessage[]) =>
    setMsgs((cur) => [...server.map((m) => (m.at ? m : { ...m, at: stampOf(m.id) })), ...cur.filter((m) => m.id.startsWith("local-") && (m.state !== "sent") )]);

  const startPolling = useCallback(() => {
    clearTimeout(poll.current);
    setWaiting(true);
    let n = 0;
    const tick = async () => {
      if (!alive.current || !conv.current) return;
      n++;
      try {
        const r = await api.history(conv.current);
        if (!alive.current) return;
        if (r.messages.length) merge(r.messages);
        const last = r.messages[r.messages.length - 1];
        if (last?.role === "assistant" && !r.pending) { setWaiting(false); return; }
      } catch { /* keep trying */ }
      if (n >= POLL_MAX) { setWaiting(false); return; }
      poll.current = window.setTimeout(tick, POLL_MS);
    };
    poll.current = window.setTimeout(tick, POLL_MS);
  }, []);

  const patch = (id: string, p: Partial<ChatMessage>) => setMsgs((c) => c.map((m) => (m.id === id ? { ...m, ...p } : m)));

  const afterReply = (r: api.Reply) => {
    if (r.conversation) { const first = !conv.current; conv.current = r.conversation; if (first) onStartedRef.current(r.conversation); }
    if (r.messages.length) merge(r.messages);
    if (!r.messages.length || r.messages[r.messages.length - 1].role !== "assistant" || r.pending) startPolling();
    else setWaiting(false);
  };

  const sendText = async (body: string, existing?: string) => {
    const id = existing ?? lid();
    if (existing) patch(id, { state: "sending" });
    else setMsgs((c) => [...c, { id, at: Date.now(), role: "user", text: body, state: "sending", retry: { kind: "text", text: body } }]);
    setWaiting(true);
    try {
      const r = conv.current ? await api.send(conv.current, body) : await api.start(body);
      if (!alive.current) return;
      patch(id, { state: "sent", retry: undefined });
      afterReply(r);
    } catch {
      patch(id, { state: "failed" }); setWaiting(false);
    }
  };

  const sendBlob = async (blob: Blob, mime: string, existing?: string) => {
    const id = existing ?? lid();
    if (existing) patch(id, { state: "sending" });
    else setMsgs((c) => [...c, { id, at: Date.now(), role: "user", text: "Voice message", voice: true, state: "sending", retry: { kind: "audio", blob, mime } }]);
    setWaiting(true);
    try {
      const r = await api.sendAudio(conv.current, blob, mime);
      if (!alive.current) return;
      patch(id, { state: "sent", retry: undefined, text: r.transcript || "Voice message" });
      afterReply(r);
    } catch {
      patch(id, { state: "failed" }); setWaiting(false);
    }
  };

  const retry = (m: ChatMessage) => {
    if (m.retry?.kind === "text") void sendText(m.retry.text, m.id);
    else if (m.retry?.kind === "audio") void sendBlob(m.retry.blob, m.retry.mime, m.id);
  };

  const submit = () => {
    const t = text.trim();
    if (!t || waiting) return;
    setText(""); void sendText(t);
  };

  const stopTimer = () => { clearInterval(timer.current); setRecording(false); setSecs(0); };

  const startRec = async () => {
    if (recording || waiting) return;
    const r = new Recorder();
    try { await r.begin(); }
    catch (e) { setMicErr((e as RecError) || "failed"); return; }
    rec.current = r; setMicErr(null); setRecording(true); setSecs(0);
    const t0 = Date.now();
    timer.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      setSecs(s);
      if (s >= MAX_SECONDS) void stopRec();
    }, 250);
  };

  const stopRec = async () => {
    const r = rec.current; if (!r) return;
    rec.current = null; stopTimer();
    const out = await r.finish();
    if (!out || !alive.current) return;
    if (out.blob.size > MAX_BYTES) { setMicErr("failed"); return; }
    void sendBlob(out.blob, out.mime);
  };

  const cancelRec = () => { rec.current?.cancel(); rec.current = null; stopTimer(); };

  const resetState = () => {
    loadTok.current++;
    clearTimeout(poll.current);
    if (rec.current) cancelRec();
    setWaiting(false); setMicErr(null); setText(""); setMsgs([]);
  };

  const openChat = async (id: string) => {
    resetState();
    conv.current = id;
    const tok = loadTok.current;
    setWaiting(true);
    try {
      const r = await api.history(id);
      if (!alive.current || tok !== loadTok.current) return;
      setMsgs(r.messages.map((m) => (m.at ? m : { ...m, at: stampOf(m.id) })));
      const last = r.messages[r.messages.length - 1];
      if (r.pending || (last && last.role !== "assistant")) startPolling(); else setWaiting(false);
    } catch {
      if (alive.current && tok === loadTok.current) { setWaiting(false); setMicErr("load" as RecError); }
    }
  };

  // Route drives which conversation is open. A "new" chat that just got an id keeps its live state.
  useEffect(() => {
    if (routeId === "new") {
      if (conv.current) return;
      const h = takeHandoff();
      if (h?.text) void sendText(h.text);
      else if (h?.mic) (sessionStorageSeen() ? void startRec() : setSheet(true));
      return;
    }
    if (routeId !== conv.current) void openChat(routeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  const heading = title || msgs.find((m) => m.role === "user")?.text || "New chat";
  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <section className="chat" aria-label="Ask">
      <header className="thread-bar">
        <button type="button" className="sub-btn" aria-label="Back" onClick={onBack}><BackIcon size={24} className="mirror" /></button>
        <h1 className="thread-title" dir="auto">{heading}</h1>
        {onCall && <button type="button" className="sub-btn" aria-label="Call" onClick={onCall}><PhoneIcon size={24} /></button>}
      </header>
      <div className="msgs" role="log" aria-live="polite" aria-label="Conversation">
        {msgs.length === 0 && (
          <div className="intro">
            <h2>Ask about your restaurant</h2>
            <p className="sub">Type or speak in English, Hindi, Arabic or Malayalam.</p>
            <div className="starters">
              {STARTERS.map((s) => <button key={s} type="button" className="starter" onClick={() => void sendText(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => {
          const first = i === 0 || msgs[i - 1].role !== m.role;
          const at = m.at ? hhmm(m.at) : "";
          const day = m.at ? dayKey(new Date(m.at)) : "";
          const prevDay = i > 0 && msgs[i - 1].at ? dayKey(new Date(msgs[i - 1].at!)) : "";
          const chip = m.at && day !== prevDay ? dayLabel(new Date(m.at), new Date(), api.langHint()) : "";
          return (
          <Fragment key={m.id}>
          {chip && <div className="day-chip" role="separator" aria-label={chip}>{chip}</div>}
          <div className={`msg ${m.role}${first ? " first" : ""}`}>
            <div className="bubble">
              {m.role === "assistant" ? <Markdown text={m.text} /> : (
                <p dir="auto">
                  {m.voice && <span className="voice"><MicIcon size={14} />Voice message{m.text !== "Voice message" ? ": " : ""}</span>}
                  {m.voice && m.text === "Voice message" ? "" : m.text}
                </p>
              )}
              {m.role === "assistant" && !!m.tools && prefs.showSources && <span className="meta tools">Checked {m.tools} data {m.tools === 1 ? "source" : "sources"}</span>}
              {m.role === "assistant" && <Cards cards={m.cards} />}
              {m.role === "assistant" && prefs.readAloud && <Player id={m.id} text={m.text} />}
              <span className="stamp-pad" aria-hidden="true" />
              <span className="stamp">
                {at}
                {m.role === "user" && m.state === "failed" && <span className="fail" aria-hidden="true">!</span>}
                {m.role === "user" && m.state === "sending" && <TickIcon size={16} />}
                {m.role === "user" && m.state === "sent" && <DoubleTickIcon size={16} />}
              </span>
            </div>
            {m.state === "sending" && <span className="sr-only" role="status">Sending</span>}
            {m.state === "failed" && (
              <span className="meta err" role="alert">Not sent.
                <button type="button" className="retry" onClick={() => retry(m)}>Try again</button>
              </span>
            )}
          </div>
          </Fragment>
          );
        })}
        {waiting && <div className="msg assistant"><div className="bubble typing" role="status" aria-label="Assistant is typing"><i /><i /><i /></div></div>}
        <div ref={end} />
      </div>

      {micErr && (
        <p className="mic-err" role="alert">
          {micErr === "denied" && "Microphone access is blocked. Allow the microphone for this site in your browser or phone settings, then tap the mic again."}
          {micErr === "unsupported" && "Voice messages are not available on this device. You can still type."}
          {micErr === "failed" && "The recording could not be sent. Please try again."}
          {(micErr as string) === "load" && "Could not open that chat. Check your connection and try again."}
          <button type="button" className="retry" onClick={() => setMicErr(null)}>Dismiss</button>
        </p>
      )}

      {recording ? (
        <div className="composer rec" role="group" aria-label="Recording">
          <div className="field rec-pill">
            <button type="button" className="cancel" aria-label="Cancel recording" onClick={cancelRec}><CloseIcon size={22} /></button>
            <span className="rec-dot" aria-hidden="true" />
            <span className="timer" role="timer" aria-label={`Recording ${mmss} of 1:00`}>{mmss}</span>
            <Waveform getLevel={() => rec.current?.level() ?? 0} />
          </div>
          <button type="button" className="act" aria-label="Send voice message" onClick={() => void stopRec()}><SendIcon size={22} /></button>
        </div>
      ) : (
        <form className="composer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="field">
            <textarea ref={ta} dir="auto" rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a question" aria-label="Message" enterKeyHint="send" autoComplete="off"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} />
          </div>
          {canMic && !text.trim() ? (
            <button type="button" className="act mic" aria-label="Record a voice message" disabled={waiting} onClick={() => (sessionStorageSeen() ? void startRec() : setSheet(true))}><MicIcon size={22} /></button>
          ) : (
            <button type="submit" className="act" aria-label="Send message" disabled={!text.trim() || waiting}><SendIcon size={22} /></button>
          )}
        </form>
      )}

      {sheet && (
        <div className="scrim" role="dialog" aria-modal="true" aria-label="Microphone">
          <div className="sheet">
            <h2>Use your microphone?</h2>
            <p className="sub">Your voice is only recorded while you speak, then sent to answer your question. Your browser will ask for permission next.</p>
            <button type="button" className="primary" onClick={() => { markSeen(); setSheet(false); void startRec(); }}>Continue</button>
            <button type="button" className="secondary" onClick={() => setSheet(false)}>Not now</button>
          </div>
        </div>
      )}
    </section>
  );
}

let seen = false;
function sessionStorageSeen() { return seen; }
function markSeen() { seen = true; }
