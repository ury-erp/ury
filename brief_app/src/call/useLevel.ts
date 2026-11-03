import { useEffect, type RefObject } from "react";
import { ACTIVE_STATES, type CallState, type VoiceCallEngine } from "./types";

/**
 * Drives the --level custom property (0..1) on `ref` from the engine's 'level' events.
 * The engine reports output level while speaking and mic level otherwise. Values are
 * smoothed in a rAF loop (fast attack, slow release) and only written when they move.
 */
export function useLevel(engine: VoiceCallEngine, ref: RefObject<HTMLElement | null>, state: CallState) {
  const live = ACTIVE_STATES.includes(state);
  useEffect(() => {
    const el = ref.current;
    if (!live) {
      el?.style.setProperty("--level", "0");
      return;
    }
    let target = 0;
    let cur = 0;
    let written = -1;
    let frame = 0;
    const off = engine.on("level", (rms) => {
      target = Number.isFinite(rms) ? Math.max(0, Math.min(1, rms)) : 0;
    });
    const tick = () => {
      cur += (target - cur) * (target > cur ? 0.5 : 0.15);
      if (Math.abs(cur - written) > 0.005 || (cur < 0.005 && written !== 0)) {
        written = cur < 0.005 ? 0 : cur;
        ref.current?.style.setProperty("--level", written.toFixed(3));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      off();
      cancelAnimationFrame(frame);
      ref.current?.style.setProperty("--level", "0");
    };
  }, [engine, ref, live]);
}
