import type { CallState, StartOptions, TranscriptEvent, VoiceCallEngine } from "./types";

/**
 * @deprecated Huf has no Gemini Live path; use `GeminiLiveCallEngine` from "./GeminiLiveCallEngine".
 * Kept as a self-contained stub (not a re-export) so node's strip-types test loader, which needs
 * explicit file extensions, can still import it; every method throws NotImplementedError.
 */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented: use GeminiLiveCallEngine for live voice calls.`);
    this.name = "NotImplementedError";
  }
}

/** @deprecated see file header. */
export class HufCallEngine implements VoiceCallEngine {
  async start(_opts?: StartOptions): Promise<void> {
    throw new NotImplementedError("HufCallEngine.start");
  }
  async end(): Promise<void> {
    throw new NotImplementedError("HufCallEngine.end");
  }
  setMuted(_m: boolean): void {
    throw new NotImplementedError("HufCallEngine.setMuted");
  }
  on(ev: "state", cb: (s: CallState) => void): () => void;
  on(ev: "level", cb: (rms: number) => void): () => void;
  on(ev: "transcript", cb: (t: TranscriptEvent) => void): () => void;
  on(_ev: "state" | "level" | "transcript", _cb: never): () => void {
    throw new NotImplementedError("HufCallEngine.on");
  }
}
