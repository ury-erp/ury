// 24 kHz PCM16 playback queue with gapless scheduling, flush on interruption, volume/mute and level.
// Takes a duck-typed AudioContext so node tests can inject a fake.

export interface PlayerCtx {
  currentTime: number;
  destination: unknown;
  createBuffer(channels: number, length: number, rate: number): {
    getChannelData(c: number): Float32Array;
    duration: number;
  };
  createBufferSource(): {
    buffer: unknown;
    onended: (() => void) | null;
    connect(n: unknown): void;
    start(when?: number): void;
    stop(): void;
    disconnect?(): void;
  };
  createGain(): { gain: { value: number }; connect(n: unknown): void };
  createAnalyser?(): {
    fftSize: number;
    connect(n: unknown): void;
    getFloatTimeDomainData(a: Float32Array): void;
  };
}

export interface PlayerOptions {
  sampleRate?: number;
  /** Small lead time so the first chunk is never scheduled in the past. */
  leadSec?: number;
  onLevel?: (rms: number) => void;
  /** Called when the queue has fully played out (or after flush if something was playing). */
  onIdle?: () => void;
  /** Level poll interval in ms (0 disables polling). */
  levelIntervalMs?: number;
}

export class PcmPlayer {
  readonly gain: { gain: { value: number }; connect(n: unknown): void };
  private analyser: ReturnType<NonNullable<PlayerCtx["createAnalyser"]>> | null = null;
  private active = new Set<ReturnType<PlayerCtx["createBufferSource"]>>();
  private nextTime = 0;
  private volume = 1;
  private muted = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly rate: number;
  private readonly lead: number;

  private ctx: PlayerCtx;
  private opts: PlayerOptions;

  constructor(ctx: PlayerCtx, opts: PlayerOptions = {}) {
    this.ctx = ctx;
    this.opts = opts;
    this.rate = opts.sampleRate ?? 24000;
    this.lead = opts.leadSec ?? 0.03;
    this.gain = ctx.createGain();
    if (opts.onLevel && ctx.createAnalyser && (opts.levelIntervalMs ?? 50) > 0) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.gain.connect(this.analyser);
      this.analyser.connect(ctx.destination);
    } else {
      this.gain.connect(ctx.destination);
    }
    this.applyGain();
  }

  get playing(): boolean {
    return this.active.size > 0;
  }

  /** Seconds of audio still scheduled ahead of now. */
  get queuedSec(): number {
    return Math.max(0, this.nextTime - this.ctx.currentTime);
  }

  /** Queue little-endian PCM16 bytes (or an Int16Array). */
  enqueue(pcm: Uint8Array | Int16Array): void {
    let samples: Int16Array;
    if (pcm instanceof Int16Array) samples = pcm;
    else {
      const n = pcm.length >> 1;
      samples = new Int16Array(n);
      const dv = new DataView(pcm.buffer, pcm.byteOffset, n * 2);
      for (let i = 0; i < n; i++) samples[i] = dv.getInt16(i * 2, true);
    }
    if (!samples.length) return;
    const buf = this.ctx.createBuffer(1, samples.length, this.rate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < samples.length; i++) ch[i] = samples[i] / (samples[i] < 0 ? 0x8000 : 0x7fff);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    const when = Math.max(this.nextTime, this.ctx.currentTime + this.lead);
    src.onended = () => {
      this.active.delete(src);
      if (this.active.size === 0) this.opts.onIdle?.();
    };
    this.active.add(src);
    src.start(when);
    this.nextTime = when + buf.duration;
    this.startPolling();
  }

  /** Drop everything queued (barge-in). */
  flush(): void {
    const had = this.active.size > 0;
    const sources = [...this.active];
    this.active.clear();
    for (const s of sources) {
      s.onended = null;
      try { s.stop(); } catch { /* already stopped */ }
      try { s.disconnect?.(); } catch { /* ignore */ }
    }
    this.nextTime = 0;
    this.stopPolling();
    if (had) this.opts.onIdle?.();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyGain();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyGain();
  }

  close(): void {
    this.flush();
  }

  private applyGain() {
    this.gain.gain.value = this.muted ? 0 : this.volume;
  }

  private startPolling() {
    if (this.timer || !this.analyser) return;
    const a = this.analyser;
    const data = new Float32Array(a.fftSize);
    this.timer = setInterval(() => {
      a.getFloatTimeDomainData(data);
      let s = 0;
      for (let i = 0; i < data.length; i++) s += data[i] * data[i];
      this.opts.onLevel?.(this.playing ? Math.min(1, Math.sqrt(s / data.length) * 3) : 0);
      if (!this.playing) this.stopPolling();
    }, this.opts.levelIntervalMs ?? 50);
  }

  private stopPolling() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.opts.onLevel?.(0);
  }
}
