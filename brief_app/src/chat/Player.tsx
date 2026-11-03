import { useEffect, useRef, useState } from "react";
import { speak, langHint } from "./api";

let current: { stop: () => void } | null = null;

/** Play/pause for an assistant reply. Never auto-plays. */
export default function Player({ id, text }: { id: string; text: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const usingTts = useRef(false);

  const stop = () => {
    audio.current?.pause();
    if (usingTts.current) window.speechSynthesis?.cancel();
    setState("idle"); setProgress(0);
  };
  useEffect(() => () => { audio.current?.pause(); if (usingTts.current) window.speechSynthesis?.cancel(); if (url.current) URL.revokeObjectURL(url.current); if (current?.stop === stop) current = null; }, []); // eslint-disable-line

  const fallback = () => {
    const synth = window.speechSynthesis;
    if (!synth) { setState("error"); return; }
    usingTts.current = true;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = langHint();
    u.onend = () => { setState("idle"); setProgress(0); };
    u.onerror = () => setState("idle");
    u.onboundary = (e) => setProgress(Math.min(1, e.charIndex / Math.max(1, text.length)));
    synth.speak(u);
    setState("playing");
  };

  const click = async () => {
    if (state === "playing") {
      if (usingTts.current) { window.speechSynthesis.pause(); } else audio.current?.pause();
      setState("paused"); return;
    }
    if (state === "paused") {
      if (usingTts.current) window.speechSynthesis.resume(); else void audio.current?.play();
      setState("playing"); return;
    }
    current?.stop(); current = { stop };
    setState("loading");
    if (!url.current && !usingTts.current) {
      try { url.current = await speak(id); } catch { url.current = null; }
    }
    if (!url.current) { fallback(); return; }
    if (!audio.current) {
      const a = new Audio(url.current);
      a.ontimeupdate = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
      a.onended = () => { setState("idle"); setProgress(0); };
      a.onerror = () => { audio.current = null; url.current = null; fallback(); };
      audio.current = a;
    }
    try { await audio.current.play(); setState("playing"); } catch { fallback(); }
  };

  const label = state === "playing" ? "Pause reply" : state === "loading" ? "Loading audio" : "Play reply";
  return (
    <div className="player">
      <button type="button" className="play" aria-label={label} disabled={state === "loading"} onClick={click}>
        {state === "playing" ? "❚❚" : state === "loading" ? "…" : "▶"}
      </button>
      <div className="prog" role="progressbar" aria-label="Playback progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      {state === "error" && <span className="sub" role="status">Audio is not available here.</span>}
    </div>
  );
}
