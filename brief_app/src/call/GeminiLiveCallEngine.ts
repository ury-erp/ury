import type { CallApi, StartCallResult } from "./api";
import { defaultApi } from "./api";
import { PcmPlayer, type PlayerCtx } from "./audio/player";
import { StreamResampler, base64ToBytes, floatToPcm16, pcm16ToBase64, rms } from "./audio/resample";
import type { CallState, StartOptions, TranscriptEvent, VoiceCallEngine } from "./types";

/**
 * Gemini Live setup frame. Model, instructions and tools are locked server side by the ephemeral
 * token, so the client sends nothing sensitive: just an empty setup. If Gemini ever rejects this
 * (the constrained endpoint may want no setup at all) flip this constant or pass `sendSetup: false`.
 */
export const SEND_EMPTY_SETUP = true;

export const MIC_DENIED_MESSAGE = "Microphone access was blocked. Allow the microphone for this site in your browser settings, then try again.";
const FLUSH_MS = 5000;

interface WsLike {
  readyState: number;
  onopen: ((e: unknown) => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onclose: ((e: { code?: number }) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface GeminiLiveOptions {
  language?: string;
  api?: CallApi;
  /** Inject for tests. Receives the full URL (contains the access token: never log it). */
  wsFactory?: (url: string) => WsLike;
  audioContextFactory?: () => AudioContext;
  getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
  workletUrl?: string | URL;
  sendSetup?: boolean;
  flushMs?: number;
  /** Called every second with seconds left once connected. */
  onCountdown?: (secondsLeft: number) => void;
}

type Handler = (v: never) => void;
type Ev = "state" | "level" | "transcript" | "countdown";
interface Turn { role: "user" | "agent"; text: string; seq: number }

const pick = (o: Record<string, unknown> | undefined, a: string, b: string) => (o ? (o[a] ?? o[b]) : undefined) as unknown;
const asObj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, any>) : undefined); // eslint-disable-line @typescript-eslint/no-explicit-any

export class GeminiLiveCallEngine implements VoiceCallEngine {
  error?: string;
  private state: CallState = "idle";
  private o: GeminiLiveOptions;
  private api: CallApi;
  private handlers: Record<Ev, Set<Handler>> = { state: new Set(), level: new Set(), transcript: new Set(), countdown: new Set() };
  private run = 0;
  private muted = false;
  private ending = false;
  private session: StartCallResult | null = null;
  private ws: WsLike | null = null;
  private ready = false;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private resampler: StreamResampler | null = null;
  private player: PcmPlayer | null = null;
  private userBuf = "";
  private agentBuf = "";
  private seq = 0;
  private pending: Turn[] = [];
  private flushing: Promise<void> | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private turnDone = false;
  private goAway = false;
  private cancelled = new Set<string>();
  private micLevel = 0;

  constructor(opts: GeminiLiveOptions = {}) {
    this.o = opts;
    this.api = opts.api ?? defaultApi;
  }

  get current(): CallState {
    return this.state;
  }

  on(ev: "state", cb: (s: CallState) => void): () => void;
  on(ev: "level", cb: (rms: number) => void): () => void;
  on(ev: "transcript", cb: (t: TranscriptEvent) => void): () => void;
  on(ev: "countdown", cb: (secondsLeft: number) => void): () => void;
  on(ev: Ev, cb: Handler): () => void {
    this.handlers[ev].add(cb);
    return () => this.handlers[ev].delete(cb);
  }

  private emit(ev: Ev, v: unknown) {
    this.handlers[ev].forEach((h) => (h as (x: unknown) => void)(v));
  }

  private set(s: CallState) {
    if (this.state === s) return;
    this.state = s;
    this.emit("state", s);
  }

  private fail(msg: string) {
    if (this.state === "failed" || this.state === "ended") return;
    this.error = msg;
    this.teardown();
    this.set("failed");
    void this.finishRemote("error");
  }

  async start(_opts?: StartOptions): Promise<void> {
    if (!["idle", "ended", "failed"].includes(this.state)) return;
    const run = ++this.run;
    this.resetCall();
    this.set("requesting_mic");
    try {
      const gum = this.o.getUserMedia ?? ((c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c));
      this.stream = await gum({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch {
      if (run === this.run) this.fail(MIC_DENIED_MESSAGE);
      return;
    }
    if (run !== this.run) return this.releaseStream();
    this.set("connecting");
    try {
      this.session = await this.api.startCall(this.o.language);
    } catch (e) {
      if (run === this.run) this.fail(startErrorMessage(e));
      return;
    }
    if (run !== this.run) return this.releaseStream();
    try {
      await this.setupAudio();
      if (run !== this.run) return;
      this.openSocket(run);
    } catch {
      if (run === this.run) this.fail("Audio could not be started on this device.");
    }
  }

  private resetCall() {
    this.error = undefined;
    this.ending = false;
    this.ready = false;
    this.session = null;
    this.userBuf = this.agentBuf = "";
    this.seq = 0;
    this.pending = [];
    this.turnDone = false;
    this.goAway = false;
    this.cancelled.clear();
    this.micLevel = 0;
  }

  private async setupAudio() {
    const ctx = this.o.audioContextFactory ? this.o.audioContextFactory() : new AudioContext();
    this.ctx = ctx;
    if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
    this.resampler = new StreamResampler(ctx.sampleRate, 16000);
    this.player = new PcmPlayer(ctx as unknown as PlayerCtx, {
      onLevel: (l) => { if (this.state === "speaking") this.emit("level", l); },
      onIdle: () => this.maybeListening(),
    });
    await ctx.audioWorklet.addModule(String(this.o.workletUrl ?? new URL("./audio/capture-worklet.js", import.meta.url)));
    const node = new AudioWorkletNode(ctx, "capture-processor", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    node.port.onmessage = (e: MessageEvent) => this.onMic(e.data?.samples as Float32Array);
    const sink = ctx.createGain();
    sink.gain.value = 0;
    this.src = ctx.createMediaStreamSource(this.stream as MediaStream);
    this.src.connect(node);
    node.connect(sink);
    sink.connect(ctx.destination);
    this.node = node;
  }

  private openSocket(run: number) {
    const s = this.session as StartCallResult;
    const sep = s.ws_url.includes("?") ? "&" : "?";
    const url = `${s.ws_url}${sep}access_token=${encodeURIComponent(s.token)}`;
    const ws = this.o.wsFactory ? this.o.wsFactory(url) : (new WebSocket(url) as unknown as WsLike);
    this.ws = ws;
    ws.onopen = () => {
      if (run !== this.run) return;
      if (this.o.sendSetup ?? SEND_EMPTY_SETUP) ws.send(JSON.stringify({ setup: {} }));
    };
    ws.onmessage = (e) => {
      if (run === this.run) void this.onFrame(e.data);
    };
    ws.onerror = () => {
      if (run === this.run && !this.ready) this.fail("Could not reach the voice service.");
    };
    ws.onclose = (e) => {
      if (run !== this.run || this.ending || this.state === "ended" || this.state === "failed") return;
      if (!this.ready) return this.fail("The voice service closed the connection.");
      if (e?.code && e.code !== 1000 && e.code !== 1005) return this.fail("The connection to the voice service was lost.");
      void this.end("closed");
    };
  }

  private async onFrame(data: unknown) {
    let text: string;
    if (typeof data === "string") text = data;
    else if (typeof Blob !== "undefined" && data instanceof Blob) text = await data.text();
    else if (data instanceof ArrayBuffer) text = new TextDecoder().decode(data);
    else return;
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(text); } catch { return; }
    if (this.state === "ended" || this.state === "failed") return;

    if (pick(msg, "setupComplete", "setup_complete") !== undefined) this.onSetupComplete();
    const sc = asObj(pick(msg, "serverContent", "server_content"));
    if (sc) this.onServerContent(sc);
    const tc = asObj(pick(msg, "toolCall", "tool_call"));
    if (tc) void this.onToolCall(tc);
    const cancel = asObj(pick(msg, "toolCallCancellation", "tool_call_cancellation"));
    if (cancel && Array.isArray(cancel.ids)) cancel.ids.forEach((i: string) => this.cancelled.add(i));
    if (pick(msg, "goAway", "go_away") !== undefined) this.onGoAway();
  }

  private onSetupComplete() {
    if (this.ready) return;
    this.ready = true;
    const s = this.session as StartCallResult;
    this.startedAt = Date.now();
    this.set("connected");
    this.flushTimer = setInterval(() => void this.flushTurns(), this.o.flushMs ?? FLUSH_MS);
    const total = s.max_seconds;
    const report = () => {
      const left = Math.max(0, total - Math.floor((Date.now() - this.startedAt) / 1000));
      this.o.onCountdown?.(left);
      this.emit("countdown", left);
      if (left <= 0) void this.end("max_seconds");
    };
    report();
    this.tick = setInterval(report, 1000);
  }

  private onServerContent(sc: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (sc.interrupted) {
      this.player?.flush();
      this.finalizeTurn("agent");
      this.turnDone = false;
      this.set("listening");
    }
    const parts = asObj(pick(sc, "modelTurn", "model_turn"))?.parts;
    if (Array.isArray(parts)) {
      for (const p of parts) {
        const inl = asObj(pick(p, "inlineData", "inline_data"));
        const mime = String(pick(inl, "mimeType", "mime_type") ?? "");
        if (inl?.data && mime.startsWith("audio/")) {
          this.turnDone = false;
          this.set("speaking");
          this.player?.enqueue(base64ToBytes(String(inl.data)));
        }
      }
    }
    const it = asObj(pick(sc, "inputTranscription", "input_transcription"))?.text;
    if (typeof it === "string" && it) {
      this.finalizeTurn("agent");
      this.userBuf += it;
      this.emit("transcript", { role: "user", text: this.userBuf.trim(), final: false });
    }
    const ot = asObj(pick(sc, "outputTranscription", "output_transcription"))?.text;
    if (typeof ot === "string" && ot) {
      this.finalizeTurn("user");
      this.agentBuf += ot;
      this.emit("transcript", { role: "agent", text: this.agentBuf.trim(), final: false });
    }
    if (pick(sc, "turnComplete", "turn_complete")) {
      this.finalizeTurn("user");
      this.finalizeTurn("agent");
      this.turnDone = true;
      this.maybeListening();
    }
  }

  private finalizeTurn(role: "user" | "agent") {
    const text = (role === "user" ? this.userBuf : this.agentBuf).trim();
    if (role === "user") this.userBuf = ""; else this.agentBuf = "";
    if (!text) return;
    this.pending.push({ role, text, seq: ++this.seq });
    this.emit("transcript", { role, text, final: true });
  }

  /** Agent finished its turn and the audio has played out. */
  private maybeListening() {
    if (!this.turnDone || this.player?.playing) return;
    if (this.state === "ended" || this.state === "failed" || !this.ready) return;
    this.turnDone = false;
    if (this.goAway) return void this.end("go_away");
    this.set("listening");
    this.emit("level", 0);
  }

  private onGoAway() {
    this.goAway = true;
    if (this.state !== "speaking" && !this.player?.playing) void this.end("go_away");
  }

  private async onToolCall(tc: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const calls = Array.isArray(tc.functionCalls ?? tc.function_calls) ? (tc.functionCalls ?? tc.function_calls) : [];
    const responses: { id: string; name: string; response: Record<string, unknown> }[] = [];
    for (const c of calls) {
      const id = String(c.id ?? "");
      const name = String(c.name ?? "");
      let response: Record<string, unknown>;
      try {
        const r = await this.api.callTool((this.session as StartCallResult).call_id, name, c.args ?? {});
        response = r.ok ? { output: r.result ?? {} } : { error: r.error || "tool failed" };
      } catch {
        response = { error: "tool unavailable" };
      }
      if (!this.cancelled.has(id)) responses.push({ id, name, response });
    }
    if (responses.length && this.ws && this.state !== "ended" && this.state !== "failed") {
      this.ws.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
    }
  }

  private onMic(samples: Float32Array | undefined) {
    if (!samples || !this.resampler) return;
    const lvl = rms(samples);
    if (!this.muted && (this.state === "connected" || this.state === "listening")) {
      this.micLevel = Math.min(1, lvl * 4);
      this.emit("level", this.micLevel);
    }
    if (this.muted || !this.ready || !this.ws || this.ws.readyState !== 1) return;
    const out = this.resampler.push(samples);
    if (!out.length) return;
    this.ws.send(JSON.stringify({
      realtimeInput: { audio: { data: pcm16ToBase64(floatToPcm16(out)), mimeType: "audio/pcm;rate=16000" } },
    }));
  }

  private async flushTurns(): Promise<void> {
    if (this.flushing) return this.flushing;
    if (!this.pending.length || !this.session) return;
    const batch = this.pending.splice(0);
    const id = this.session.call_id;
    this.flushing = this.api.callTurns(id, batch).then(
      () => undefined,
      () => { this.pending = [...batch, ...this.pending]; },
    ).finally(() => { this.flushing = null; });
    return this.flushing;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.stream?.getAudioTracks().forEach((t) => { t.enabled = !m; });
    if (m) this.emit("level", 0);
  }

  async end(reason = "user"): Promise<void> {
    if (this.ending || ["idle", "ended", "failed"].includes(this.state)) return;
    this.ending = true;
    this.run++;
    this.finalizeTurn("user");
    this.finalizeTurn("agent");
    this.teardown();
    this.set("ended");
    await this.finishRemote(reason);
  }

  private async finishRemote(reason: string) {
    const s = this.session;
    if (!s) return;
    try { await Promise.race([this.flushTurns(), new Promise((r) => setTimeout(r, 3000))]); } catch { /* ignore */ }
    if (this.flushing) await this.flushing.catch(() => undefined);
    if (this.pending.length) await this.flushTurns().catch(() => undefined);
    const secs = this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0;
    try { await this.api.endCall(s.call_id, secs, reason); } catch { /* server expires the call anyway */ }
    this.session = null;
    this.startedAt = 0;
  }

  private releaseStream() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private teardown() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.tick) clearInterval(this.tick);
    this.flushTimer = this.tick = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try { ws.close(1000, "done"); } catch { /* ignore */ }
    }
    try { this.node?.port && (this.node.port.onmessage = null); this.src?.disconnect(); this.node?.disconnect(); } catch { /* ignore */ }
    this.node = null;
    this.src = null;
    this.player?.close();
    this.player = null;
    this.releaseStream();
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) void ctx.close().catch(() => undefined);
    this.emit("level", 0);
  }
}

function startErrorMessage(e: unknown): string {
  const s = (e as { status?: number })?.status;
  if (s === 429) return "Call limit reached for now. Try again later.";
  if (s === 403) return "You are not allowed to start a voice call.";
  return "Could not start the call. Please try again.";
}
