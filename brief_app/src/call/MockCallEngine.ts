import type { CallState, StartOptions, TranscriptEvent, VoiceCallEngine } from "./types.ts";

export interface MockOptions {
  /** Delay between state steps in ms. */
  stepMs?: number;
  /** Number of speaking/listening turns before the mock call hangs up itself (0 = never). */
  turns?: number;
  /** If set, the call fails when it reaches this state. */
  failAt?: CallState;
  /** If set, the connection drops (state "reconnecting") for one step at the start of this turn number. */
  reconnectAtTurn?: number;
  /** Level meter tick in ms. */
  levelMs?: number;
}

type Handler = (v: never) => void;

/** Simulates the full call state machine with timers. For tests and demos only. */
export class MockCallEngine implements VoiceCallEngine {
  error?: string;
  private state: CallState = "idle";
  private muted = false;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private levelTimer: ReturnType<typeof setInterval> | null = null;
  private run = 0;
  private handlers: Record<"state" | "level" | "transcript", Set<Handler>> = {
    state: new Set(),
    level: new Set(),
    transcript: new Set(),
  };
  private opts: Required<Omit<MockOptions, "failAt" | "reconnectAtTurn">> & { failAt?: CallState; reconnectAtTurn?: number };

  constructor(opts: MockOptions = {}) {
    this.opts = { stepMs: 900, turns: 0, levelMs: 80, ...opts };
  }

  get current(): CallState {
    return this.state;
  }

  on(ev: "state", cb: (s: CallState) => void): () => void;
  on(ev: "level", cb: (rms: number) => void): () => void;
  on(ev: "transcript", cb: (t: TranscriptEvent) => void): () => void;
  on(ev: "state" | "level" | "transcript", cb: Handler): () => void {
    this.handlers[ev].add(cb);
    return () => this.handlers[ev].delete(cb);
  }

  private emit(ev: "state" | "level" | "transcript", v: unknown) {
    this.handlers[ev].forEach((h) => (h as (x: unknown) => void)(v));
  }

  private set(s: CallState) {
    this.state = s;
    this.emit("state", s);
  }

  private after(ms: number, fn: () => void, run: number) {
    this.timers.push(setTimeout(() => run === this.run && fn(), ms));
  }

  private clear() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.levelTimer) clearInterval(this.levelTimer);
    this.levelTimer = null;
  }

  private fails(s: CallState): boolean {
    if (this.opts.failAt !== s) return false;
    this.clear();
    this.error = `Mock failure at ${s}`;
    this.set("failed");
    return true;
  }

  async start(_opts?: StartOptions): Promise<void> {
    if (!["idle", "ended", "failed"].includes(this.state)) return;
    this.clear();
    this.error = undefined;
    const run = ++this.run;
    const { stepMs } = this.opts;
    this.set("requesting_mic");
    if (this.fails("requesting_mic")) return;
    this.after(stepMs, () => {
      this.set("connecting");
      if (this.fails("connecting")) return;
      this.after(stepMs, () => {
        this.set("ringing");
        if (this.fails("ringing")) return;
        this.after(stepMs, () => {
          this.set("connected");
          if (this.fails("connected")) return;
          this.startLevels();
          this.after(stepMs / 2, () => this.turn(1, run), run);
        }, run);
      }, run);
    }, run);
  }

  private startLevels() {
    let t = 0;
    this.levelTimer = setInterval(() => {
      t += 1;
      const talking = this.state === "speaking" || (this.state === "listening" && !this.muted);
      const rms = talking ? Math.min(1, Math.abs(Math.sin(t / 3)) * 0.7 + Math.random() * 0.25) : 0.02;
      this.emit("level", this.muted && this.state === "listening" ? 0 : rms);
    }, this.opts.levelMs);
  }

  private turn(n: number, run: number) {
    const { stepMs, turns } = this.opts;
    if (turns && n > turns) {
      void this.end();
      return;
    }
    if (this.opts.reconnectAtTurn === n && this.state !== "reconnecting") {
      this.set("reconnecting");
      this.after(stepMs, () => this.turn(n, run), run);
      return;
    }
    this.set("speaking");
    if (this.fails("speaking")) return;
    this.emit("transcript", { role: "agent", text: "Yesterday's sales were up 6 percent.", final: true });
    this.after(stepMs * 1.5, () => {
      this.set("listening");
      if (this.fails("listening")) return;
      this.after(stepMs, () => {
        if (!this.muted) this.emit("transcript", { role: "user", text: "And the branch breakdown?", final: true });
        this.after(stepMs / 2, () => this.turn(n + 1, run), run);
      }, run);
    }, run);
  }

  setMuted(m: boolean): void {
    this.muted = m;
  }

  async end(): Promise<void> {
    if (this.state === "idle" || this.state === "ended") return;
    this.run++;
    this.clear();
    this.set("ended");
  }
}
