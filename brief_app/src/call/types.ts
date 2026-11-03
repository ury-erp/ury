// Call seam: UI-facing contract for a voice call. No network, no Huf imports here.
export type CallState =
  | "idle"
  | "requesting_mic"
  | "connecting"
  | "ringing"
  | "connected"
  | "speaking" // the assistant is talking
  | "listening" // the assistant is waiting for the caller
  | "reconnecting" // connection dropped, retrying
  | "ended"
  | "failed";

export interface TranscriptEvent {
  role: "user" | "agent";
  text: string;
  final: boolean;
}

export interface StartOptions {
  conversationId?: string;
}

export interface VoiceCallEngine {
  start(opts?: StartOptions): Promise<void>;
  end(): Promise<void>;
  setMuted(muted: boolean): void;
  on(ev: "state", cb: (s: CallState) => void): () => void;
  on(ev: "level", cb: (rms: number) => void): () => void; // rms in 0..1
  on(ev: "transcript", cb: (t: TranscriptEvent) => void): () => void;
  /** Reason text when state is "failed" (optional). */
  readonly error?: string;
}

export const ACTIVE_STATES: CallState[] = ["connected", "speaking", "listening", "reconnecting"];
