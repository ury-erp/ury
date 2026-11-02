import { useEffect, useMemo, useRef, useState } from "react";
import "./call.css";
import { MockCallEngine } from "./MockCallEngine";
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

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export interface CallTabProps {
  /** Optional: inject an engine (defaults to the mock). */
  engine?: VoiceCallEngine;
  /** Optional: called by "Back to chat". Falls back to history.back(). */
  onBack?: () => void;
}

export default function CallTab({ engine, onBack }: CallTabProps = {}) {
  const eng = useMemo<VoiceCallEngine>(() => engine ?? new MockCallEngine(), [engine]);
  const [state, setState] = useState<CallState>("idle");
  const [muted, setMuted] = useState(false);
  const [secs, setSecs] = useState(0);
  const [line, setLine] = useState<TranscriptEvent | null>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const offS = eng.on("state", setState);
    const offT = eng.on("transcript", setLine);
    const offL = eng.on("level", (rms) => {
      ringRef.current?.style.setProperty("--lvl", String(Math.max(0, Math.min(1, rms))));
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

  const start = () => {
    setSecs(0);
    setLine(null);
    setMuted(false);
    eng.start().catch(() => setState("failed"));
  };
  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    eng.setMuted(m);
  };
  const inCall = ["requesting_mic", "connecting", "ringing", ...ACTIVE_STATES].includes(state);
  const busy = state === "requesting_mic" || state === "connecting" || state === "ringing";
  const speaker = SPEAKER[state] ? (state === "listening" && muted ? "You (muted)" : SPEAKER[state]) : "";

  return (
    <section className="call" data-state={state} aria-label="Voice call">
      <p className="call-note">Live voice calls are coming soon; this screen is a preview.</p>
      <div className="call-who">
        <div className="call-ring" ref={ringRef} data-active={live || busy} aria-hidden="true">
          <div className="call-avatar">B</div>
        </div>
        <h2 className="call-name" dir="auto">Brief assistant</h2>
        <p className="call-status" role="status" aria-live="polite" dir="auto">{STATUS[state]}</p>
        <p className="call-time" aria-label="Call time">{fmt(secs)}</p>
        <p className="call-speaker" dir="auto">{speaker || " "}</p>
        {line && live && (
          <p className="call-line" dir="auto">{line.text}</p>
        )}
      </div>

      <div className="call-actions">
        {state === "failed" && (
          <button className="call-btn call-retry" onClick={start}>Try again</button>
        )}
        {(state === "idle" || state === "ended") && (
          <button className="call-btn call-start" onClick={start} aria-label="Start call">Call</button>
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
