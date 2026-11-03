import { getPrefs } from "../settings/prefs";
import { useEffect, useRef, useState } from "react";
import "./call.css";
import { MockCallEngine } from "./MockCallEngine";
import { createCallEngine, callErrorMessage, type CallCaps, type CallLang, type EngineChoice } from "./engines";
import { ACTIVE_STATES, type CallState, type TranscriptEvent, type VoiceCallEngine } from "./types";

const STATUS: Record<CallState, string> = {
  idle: "Ready to call",
  requesting_mic: "Allow the microphone",
  connecting: "Connecting",
  ringing: "Ringing",
  connected: "Connected",
  speaking: "Assistant is speaking",
  listening: "Listening to you",
  reconnecting: "Reconnecting...",
  ended: "Call ended",
  failed: "Call failed",
};

const SPEAKER: Partial<Record<CallState, string>> = {
  speaking: "Brief assistant",
  listening: "You",
};

const LANGS: { code: CallLang; label: string; dir: "ltr" | "rtl" }[] = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "hi", label: "हिन्दी", dir: "ltr" },
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "ml", label: "മലയാളം", dir: "ltr" },
];

const MIC_HELP =
  "Microphone access is blocked. Allow the microphone for this site in your browser or phone settings, then tap Try again.";

const CAPS_URL = "/api/method/ury.ury.api.chairman_call.call_capabilities";

async function fetchCaps(): Promise<CallCaps | null> {
  try {
    const res = await fetch(CAPS_URL, { method: "POST", credentials: "same-origin", headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    const m = j && typeof j === "object" && "message" in j ? j.message : null;
    return m && typeof m === "object" ? (m as CallCaps) : null;
  } catch {
    return null;
  }
}

function hintLang(): CallLang {
  const pref = getPrefs().language;
  const l = (pref !== "auto" ? pref : navigator.language || "en").slice(0, 2).toLowerCase();
  return (["en", "hi", "ar", "ml"] as const).find((c) => c === l) ?? "en";
}

function fmt(sec: number) {
  const s0 = Math.max(0, Math.floor(sec));
  const m = Math.floor(s0 / 60);
  const s = s0 % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export interface CallTabProps {
  /** Optional: inject an engine (skips capability lookup; used by tests). */
  engine?: VoiceCallEngine;
  /** Optional: called by "Back to chat". Falls back to history.back(). */
  onBack?: () => void;
}

export default function CallTab({ engine, onBack }: CallTabProps = {}) {
  const [caps, setCaps] = useState<CallCaps | null>(null);
  const [lang, setLang] = useState<CallLang>(hintLang);
  const [choice, setChoice] = useState<EngineChoice>(() => ({
    engine: engine ?? new MockCallEngine(),
    kind: "mock",
    notice: null,
  }));
  const eng = choice.engine;
  const [state, setState] = useState<CallState>("idle");
  const stateRef = useRef<CallState>("idle");
  const [muted, setMuted] = useState(false);
  const [secs, setSecs] = useState(0);
  const [line, setLine] = useState<TranscriptEvent | null>(null);
  const [errText, setErrText] = useState("");
  const ringRef = useRef<HTMLDivElement>(null);
  const meterRef = useRef<HTMLSpanElement>(null);

  const maxSecs = caps?.max_seconds && caps.max_seconds > 0 ? caps.max_seconds : 300;
  const allowed = LANGS.filter((l) => !caps?.languages || caps.languages.includes(l.code));
  const langs = allowed.length ? allowed : LANGS.slice(0, 1);

  useEffect(() => {
    if (engine) return;
    let alive = true;
    void fetchCaps().then((c) => alive && setCaps(c));
    return () => {
      alive = false;
    };
  }, [engine]);

  useEffect(() => {
    if (caps && !langs.some((l) => l.code === lang)) setLang(langs[0].code);
  }, [caps, langs, lang]);

  useEffect(() => {
    if (engine) return;
    let alive = true;
    void createCallEngine(caps, { language: lang }).then((c) => {
      if (!alive) return;
      if (!["idle", "ended", "failed"].includes(stateRef.current)) return;
      setChoice((prev) => (prev.kind === "mock" && c.kind === "mock" ? { ...prev, notice: c.notice } : c));
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [engine, caps, lang]);

  useEffect(() => {
    stateRef.current = "idle";
    setState("idle");
    const offS = eng.on("state", (s) => {
      stateRef.current = s;
      setState(s);
      if (s === "failed") setErrText(eng.error ?? "");
    });
    const offT = eng.on("transcript", setLine);
    const offL = eng.on("level", (rms) => {
      const v = String(Math.max(0, Math.min(1, rms)));
      ringRef.current?.style.setProperty("--lvl", v);
      meterRef.current?.style.setProperty("--lvl", v);
    });
    return () => {
      offS();
      offT();
      offL();
      void eng.end().catch(() => undefined);
    };
  }, [eng]);

  const live = ACTIVE_STATES.includes(state);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [live]);

  useEffect(() => {
    if (live && secs >= maxSecs) void eng.end().catch(() => undefined);
  }, [live, secs, maxSecs, eng]);

  const start = () => {
    setSecs(0);
    setLine(null);
    setMuted(false);
    setErrText("");
    eng.start().catch((e) => {
      setErrText(e instanceof Error ? e.message : "");
      stateRef.current = "failed";
      setState("failed");
    });
  };
  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    eng.setMuted(m);
  };
  const inCall = ["requesting_mic", "connecting", "ringing", ...ACTIVE_STATES].includes(state);
  const busy = state === "requesting_mic" || state === "connecting" || state === "ringing";
  const speaker = SPEAKER[state] ? (state === "listening" && muted ? "You (muted)" : SPEAKER[state]) : "";
  const dir = LANGS.find((l) => l.code === lang)?.dir ?? "ltr";
  const remaining = maxSecs - secs;

  let failMsg = "";
  if (state === "failed") {
    const raw = errText.toLowerCase();
    failMsg = /denied|notallowed|permission|blocked|microphone/.test(raw) ? MIC_HELP : errText || "The call could not be started. Check your connection and try again.";
  }
  const notice =
    choice.kind === "gemini_live"
      ? "Voice calls use the assistant with read-only data."
      : !caps ? "Checking whether voice calls are available…" : choice.notice ?? callErrorMessage(caps.reason);
  // Never offer the simulated engine to a real user: no live engine means no call button.
  const unavailable = choice.kind === "mock" && !engine;

  return (
    <section className="call" data-state={state} data-engine={choice.kind} dir={dir} aria-label="Voice call">
      <p className="call-note" role={unavailable ? "alert" : undefined} dir="auto">{notice}</p>
      <div className="call-who">
        <label className="call-lang">
          <span className="call-lang-label">Language</span>
          <select
            value={lang}
            disabled={inCall}
            onChange={(e) => setLang(e.target.value as CallLang)}
            aria-label="Call language"
          >
            {langs.map((l) => (
              <option key={l.code} value={l.code} lang={l.code}>{l.label}</option>
            ))}
          </select>
        </label>
        <div className="call-ring" ref={ringRef} data-active={live || busy} aria-hidden="true">
          <div className="call-avatar">B</div>
        </div>
        <h2 className="call-name" dir="auto">Brief assistant</h2>
        <p className="call-status" role="status" aria-live="polite" dir="auto">{STATUS[state]}</p>
        <p className="call-time" aria-label="Call time">{fmt(secs)}</p>
        {live && (
          <p className="call-left" aria-label="Time left">
            Time left <span className={remaining <= 30 ? "call-left-low" : ""}>{fmt(remaining)}</span>
          </p>
        )}
        <span className="call-meter" ref={meterRef} data-on={live} aria-hidden="true"><i /></span>
        <p className="call-speaker" dir="auto">{speaker || " "}</p>
        {line && live && (
          <p className="call-line" dir="auto">{line.text}</p>
        )}
        {state === "failed" && <p className="call-error" role="alert" dir="auto">{failMsg}</p>}
      </div>

      <div className="call-actions">
        {state === "failed" && (
          <button className="call-btn call-retry" onClick={start}>Try again</button>
        )}
        {(state === "idle" || state === "ended") && (
          <button className="call-btn call-start" onClick={start} aria-label="Start call" disabled={unavailable}>Call</button>
        )}
        {inCall && (
          <>
            <button
              className="call-btn call-mute"
              aria-pressed={muted}
              aria-label={muted ? "Unmute microphone" : "Mute microphone"}
              onClick={toggleMute}
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            <button className="call-btn call-end" aria-label="End call" onClick={() => void eng.end()}>
              End
            </button>
          </>
        )}
      </div>
      <button className="call-back" onClick={() => (onBack ? onBack() : window.history.back())}>
        Back to chat
      </button>
    </section>
  );
}
