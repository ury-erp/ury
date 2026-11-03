import { fetchCsrf } from "../csrf";
import { getPrefs } from "../settings/prefs";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./call.css";
import { BackIcon, MicIcon, PhoneIcon } from "../components/Icons";
import { useLevel } from "./useLevel";
import { MockCallEngine } from "./MockCallEngine";
import { createCallEngine, callErrorMessage, type CallCaps, type CallLang, type EngineChoice } from "./engines";
import { ACTIVE_STATES, type CallState, type TranscriptEvent, type VoiceCallEngine } from "./types";

const LANGS: { code: CallLang; label: string; dir: "ltr" | "rtl" }[] = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "hi", label: "हिन्दी", dir: "ltr" },
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "ml", label: "മലയാളം", dir: "ltr" },
];

const CAPS_URL = "/api/method/ury.ury.api.chairman_call.call_capabilities";

async function fetchCaps(): Promise<CallCaps | null> {
  try {
    const res = await fetchCsrf(CAPS_URL, { method: "POST", credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: "{}" });
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
  /** Optional: called by the top-bar back button. Falls back to history.back(). */
  onBack?: () => void;
}

const STATUS: Record<CallState, string> = {
  idle: "Tap to talk",
  requesting_mic: "Allow microphone access",
  connecting: "Connecting…",
  ringing: "Calling…",
  connected: "Listening",
  speaking: "Speaking",
  listening: "Listening",
  reconnecting: "Reconnecting…",
  ended: "Call ended",
  failed: "Couldn't connect",
};

export default function CallTab({ engine, onBack }: CallTabProps = {}) {
  const [caps, setCaps] = useState<CallCaps | null>(null);
  const [capsDone, setCapsDone] = useState(false);
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
  const [fade, setFade] = useState(false);
  const [errText, setErrText] = useState("");
  const orbRef = useRef<HTMLDivElement>(null);

  const maxSecs = caps?.max_seconds && caps.max_seconds > 0 ? caps.max_seconds : 300;

  useEffect(() => {
    if (engine) return;
    let alive = true;
    void fetchCaps().then((c) => {
      if (!alive) return;
      setCaps(c);
      setCapsDone(true);
    });
    return () => {
      alive = false;
    };
  }, [engine]);

  useEffect(() => {
    if (engine) return;
    let alive = true;
    void createCallEngine(caps, {}).then((c) => {
      if (!alive) return;
      if (!["idle", "ended", "failed"].includes(stateRef.current)) return;
      setChoice((prev) => (prev.kind === "mock" && c.kind === "mock" ? { ...prev, notice: c.notice } : c));
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [engine, caps]);

  useEffect(() => {
    stateRef.current = "idle";
    setState("idle");
    const offS = eng.on("state", (s) => {
      stateRef.current = s;
      setState(s);
      if (s === "failed") setErrText(eng.error ?? "");
    });
    const offT = eng.on("transcript", (t) => {
      setLine(t);
      setFade(false);
    });
    return () => {
      offS();
      offT();
      void eng.end().catch(() => undefined);
    };
  }, [eng]);

  useLevel(eng, orbRef, state);

  // Caption fades 4s after the last transcript update.
  useEffect(() => {
    if (!line) return;
    const t = setTimeout(() => setFade(true), 4000);
    return () => clearTimeout(t);
  }, [line]);

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
  const goBack = () => (onBack ? onBack() : window.history.back());
  const inCall = ["requesting_mic", "connecting", "ringing", ...ACTIVE_STATES].includes(state);
  const remaining = Math.max(0, maxSecs - secs);

  // Never offer the simulated engine to a real user: no live engine means no call button.
  const checking = choice.kind === "mock" && !engine && !capsDone;
  const unavailable = choice.kind === "mock" && !engine && capsDone;
  const micBlocked = state === "failed" && /denied|notallowed|permission|blocked|microphone/.test(errText.toLowerCase());

  let status = STATUS[state];
  let detail = "";
  if (state === "listening" && muted) status = "You're muted";
  if (state === "ended") status = `Call ended · ${fmt(secs)}`;
  if (state === "failed") {
    status = micBlocked ? "Microphone blocked" : "Couldn't connect";
    detail = micBlocked ? "Allow the microphone in site settings." : "Check your connection.";
  }
  if (state === "idle" || state === "ended") {
    if (checking) status = "Checking availability…";
    else if (unavailable) {
      status = "Voice calls unavailable";
      detail = choice.notice ?? callErrorMessage(caps?.reason);
    }
  }
  const showTimer = inCall;
  const idleHint = state === "idle" && !checking && !unavailable ? `Voice · up to ${Math.max(1, Math.round(maxSecs / 60))} min` : "";
  const tone = remaining <= 30 ? "low" : remaining <= 60 ? "warn" : "ok";

  return (
    <section className="call" data-state={state} data-engine={choice.kind} data-muted={muted && inCall} dir="auto" aria-label="Voice call">
      <div className="call-top">
        <button type="button" className="call-iconbtn" aria-label="Back to chat" onClick={goBack}>
          <BackIcon size={24} />
        </button>
        {inCall && (
          <p className="call-left" data-tone={tone} aria-label="Time left">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")} left</p>
        )}
      </div>

      <div className="call-stage">
        <div className="call-orb" ref={orbRef} aria-hidden="true">
          <span className="orb-glow" />
          <span className="orb-ring" style={{ "--i": 1 } as CSSProperties} />
          <span className="orb-ring" style={{ "--i": 2 } as CSSProperties} />
          <span className="orb-ring" style={{ "--i": 3 } as CSSProperties} />
          <span className="orb-core">B</span>
        </div>
        <h2 className="call-name" dir="auto">Brief</h2>
        <p className="call-status" role="status" aria-live="polite" dir="auto">{status}</p>
        {detail && <p className="call-detail" dir="auto" role={state === "failed" ? "alert" : undefined}>{detail}</p>}
        {showTimer && <p className="call-time" aria-label="Call time">{fmt(secs)}</p>}
        {idleHint && <p className="call-time">{idleHint}</p>}
      </div>

      <div className="call-caption">
        {line && inCall && line.text && (
          <p className="call-line" dir="auto" data-fade={fade}>
            {line.role === "user" && <span className="call-line-who">You: </span>}
            {line.text}
          </p>
        )}
      </div>

      <div className="call-controls">
        {unavailable && !inCall ? (
          <button type="button" className="call-pill" onClick={goBack}>Back to chat</button>
        ) : inCall ? (
          <>
            <div className="call-ctl">
              <button type="button" className="call-round call-mute" aria-pressed={muted} aria-label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>
                <MicIcon size={28} />
              </button>
              <span className="call-ctl-label" aria-hidden="true">{muted ? "Unmute" : "Mute"}</span>
            </div>
            <div className="call-ctl">
              <button type="button" className="call-round call-end" aria-label="End" onClick={() => void eng.end()}>
                <PhoneIcon size={28} />
              </button>
              <span className="call-ctl-label" aria-hidden="true">End</span>
            </div>
          </>
        ) : (
          <div className="call-ctl">
            {(() => {
              const label = state === "failed" ? "Try again" : state === "ended" ? "Call again" : "Call";
              return (
                <>
                  <button type="button" className="call-round call-go" aria-label={label} onClick={start} disabled={checking}>
                    <PhoneIcon size={28} />
                  </button>
                  <span className="call-ctl-label" aria-hidden="true">{label}</span>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </section>
  );
}
