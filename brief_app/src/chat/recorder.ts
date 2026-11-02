export const MAX_SECONDS = 60;
export const MAX_BYTES = 5 * 1024 * 1024;
const CHAIN = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];

/** Pick the first supported mime (webm/opus -> mp4/aac -> ogg). "" means browser default. */
export function pickMime(isSupported: (t: string) => boolean = (t) => MediaRecorder.isTypeSupported(t)): string | null {
  for (const t of CHAIN) { try { if (isSupported(t)) return t; } catch { /* next */ } }
  return null;
}

export function micSupported(): boolean {
  return window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
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
  private release() { this.stream?.getTracks().forEach((t) => t.stop()); this.stream = undefined; }
}
