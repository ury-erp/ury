export const MAX_SECONDS = 60;
export const MAX_BYTES = 5 * 1024 * 1024;
const CHAIN = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];

/** Pick the first supported mime (webm/opus -> mp4/aac -> ogg). "" means browser default. */
export function pickMime(isSupported: (t: string) => boolean = (t) => MediaRecorder.isTypeSupported(t)): string | null {
  for (const t of CHAIN) { try { if (isSupported(t)) return t; } catch { /* next */ } }
  return null;
}

export function micSupported(): boolean {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return false;
  // A listed mime works, or the browser default recorder (no mimeType) is used by begin().
  return pickMime() !== null || typeof MediaRecorder === "function";
}

export type RecError = "denied" | "unsupported" | "failed";
export interface Recording { blob: Blob; mime: string; seconds: number }

export class Recorder {
  private rec?: MediaRecorder;
  private stream?: MediaStream;
  private chunks: Blob[] = [];
  private t0 = 0;
  private cancelled = false;
  private done?: (r: Recording | null) => void;
  private ctx?: AudioContext;
  private analyser?: AnalyserNode;
  private buf?: Uint8Array<ArrayBuffer>;

  /** Live input level 0..1 (RMS of the mic), 0 when metering is unavailable. */
  level(): number {
    if (!this.analyser || !this.buf) return 0;
    this.analyser.getByteTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) { const v = (this.buf[i] - 128) / 128; sum += v * v; }
    return Math.min(1, Math.sqrt(sum / this.buf.length) * 3.2);
  }

  async begin(): Promise<void> {
    if (!micSupported()) throw "unsupported" as RecError;
    const mime = pickMime();
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) {
      const n = (e as DOMException)?.name;
      throw (n === "NotAllowedError" || n === "SecurityError" ? "denied" : "failed") as RecError;
    }
    this.stream = stream;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.ctx.createMediaStreamSource(stream).connect(this.analyser);
      this.buf = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
    } catch { this.analyser = undefined; }
    try { this.rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
    catch { this.release(); throw "failed" as RecError; }
    this.chunks = []; this.cancelled = false; this.t0 = Date.now();
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.onstop = () => {
      const type = (this.rec?.mimeType || mime || "audio/webm").split(";")[0];
      const blob = new Blob(this.chunks, { type });
      const seconds = Math.round((Date.now() - this.t0) / 1000);
      this.release();
      this.done?.(this.cancelled || !blob.size ? null : { blob, mime: type, seconds });
    };
    this.rec.start();
  }

  finish(): Promise<Recording | null> {
    return new Promise((ok) => { this.done = ok; if (this.rec && this.rec.state !== "inactive") this.rec.stop(); else ok(null); });
  }
  cancel() { this.cancelled = true; if (this.rec && this.rec.state !== "inactive") this.rec.stop(); else this.release(); }
  private release() { void this.ctx?.close().catch(() => {}); this.ctx = undefined; this.analyser = undefined; this.stream?.getTracks().forEach((t) => t.stop()); this.stream = undefined; }
}
