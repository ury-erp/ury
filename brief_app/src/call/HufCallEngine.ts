import type { CallState, StartOptions, TranscriptEvent, VoiceCallEngine } from "./types";

/**
 * STUB. Not implemented yet.
 *
 * Later this class will wrap Huf's voice session API (server side, reached only
 * through a ury whitelisted wrapper, never imported here):
 *   - start_session(agent, conversation_id)  -> opens a session, returns the engine
 *     connection details (signed_url or sidecar_ws_path) for the browser WebSocket.
 *   - send_to_session(...)                   -> pushes text/control to the live session.
 *   - end_session(...)                       -> hangs up and releases the session.
 * Until then every method throws NotImplementedError so nothing silently pretends to call.
 */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented: live voice calls are not available yet.`);
    this.name = "NotImplementedError";
  }
}

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
