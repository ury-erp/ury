import { useCallback, useEffect, useRef, useState } from "react";
import "./chat.css";
import * as api from "./api";
import Markdown from "./markdown";
import { Cards } from "./Card";
import Player from "./Player";
import { MAX_BYTES, MAX_SECONDS, Recorder, micSupported, type RecError } from "./recorder";
import type { ChatMessage } from "./types";
import { getPrefs, usePrefsSubscribe } from "../settings/prefs";

export type { ChatMessage, ChatTabProps } from "./types";

const STARTERS = ["How were sales yesterday?", "Which dishes should I push?"];
const POLL_MS = 2000;
const POLL_MAX = 45;
let seq = 0;
const lid = () => `local-${++seq}`;

const MicIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v4" />
  </svg>
);

export default function ChatTab() {
  const [prefs, setPrefsState] = useState(getPrefs);
  useEffect(() => usePrefsSubscribe(() => setPrefsState(getPrefs())), []);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [micErr, setMicErr] = useState<RecError | null>(null);
  const [sheet, setSheet] = useState(false);
  const conv = useRef<string | null>(null);
  const rec = useRef<Recorder | null>(null);
  const timer = useRef<number>();
  const poll = useRef<number>();
  const end = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const canMic = micSupported();

  useEffect(() => { alive.current = true; return () => { alive.current = false; clearInterval(timer.current); clearTimeout(poll.current); rec.current?.cancel(); }; }, []);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "end" }); }, [msgs, waiting]);

  /** Server messages are the truth; keep only local items still in flight or failed. */
  const merge = (server: ChatMessage[]) =>
    setMsgs((cur) => [...server, ...cur.filter((m) => m.id.startsWith("local-") && (m.state !== "sent") )]);

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
    if (r.conversation) conv.current = r.conversation;
    if (r.messages.length) merge(r.messages);
    if (!r.messages.length || r.messages[r.messages.length - 1].role !== "assistant" || r.pending) startPolling();
    else setWaiting(false);
  };

  const sendText = async (body: string, existing?: string) => {
    const id = existing ?? lid();
    if (existing) patch(id, { state: "sending" });
    else setMsgs((c) => [...c, { id, role: "user", text: body, state: "sending", retry: { kind: "text", text: body } }]);
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
    else setMsgs((c) => [...c, { id, role: "user", text: "Voice message", voice: true, state: "sending", retry: { kind: "audio", blob, mime } }]);
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

  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <section className="chat" aria-label="Ask">
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
        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className="bubble">
              {m.voice && <span className="tag">Voice message</span>}
              {m.role === "assistant" ? <Markdown text={m.text} /> : <p dir="auto">{m.voice && m.text === "Voice message" ? "Sending voice message" : m.text}</p>}
              {m.role === "assistant" && !!m.tools && prefs.showSources && <span className="meta tools">Checked {m.tools} data {m.tools === 1 ? "source" : "sources"}</span>}
              {m.role === "assistant" && <Cards cards={m.cards} />}
              {m.role === "assistant" && prefs.readAloud && <Player id={m.id} text={m.text} />}
            </div>
            {m.state === "sending" && <span className="meta" role="status">Sending</span>}
            {m.state === "failed" && (
              <span className="meta err" role="alert">Not sent.
                <button type="button" className="retry" onClick={() => retry(m)}>Try again</button>
              </span>
            )}
          </div>
        ))}
        {waiting && <div className="msg assistant"><div className="bubble typing" role="status" aria-label="Assistant is typing"><i /><i /><i /></div></div>}
        <div ref={end} />
      </div>

      {micErr && (
        <p className="mic-err" role="alert">
          {micErr === "denied" && "Microphone access is blocked. Allow the microphone for this site in your browser or phone settings, then tap the mic again."}
          {micErr === "unsupported" && "Voice messages are not available on this device. You can still type."}
          {micErr === "failed" && "The recording could not be sent. Please try again."}
          <button type="button" className="retry" onClick={() => setMicErr(null)}>Dismiss</button>
        </p>
      )}

      {recording ? (
        <div className="composer rec" role="group" aria-label="Recording">
          <button type="button" className="icon" aria-label="Cancel recording" onClick={cancelRec}>{"✕"}</button>
          <span className="rec-dot" aria-hidden="true" />
          <span className="timer" role="timer" aria-label={`Recording ${mmss} of 1:00`}>{mmss} / 1:00</span>
          <button type="button" className="send" aria-label="Send voice message" onClick={() => void stopRec()}>{"➤"}</button>
        </div>
      ) : (
        <form className="composer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <input dir="auto" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a question" aria-label="Message" enterKeyHint="send" autoComplete="off" />
          {canMic && !text.trim() ? (
            <button type="button" className="icon mic" aria-label="Record a voice message" disabled={waiting} onClick={() => (sessionStorageSeen() ? void startRec() : setSheet(true))}><MicIcon /></button>
          ) : (
            <button type="submit" className="send" aria-label="Send message" disabled={!text.trim() || waiting}>{"➤"}</button>
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
