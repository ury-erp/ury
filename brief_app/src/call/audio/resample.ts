// Pure audio helpers: Float32 at any rate -> PCM16 mono 16 kHz, plus base64 helpers.
// No DOM, no relative runtime imports, so node can run the tests directly.

export const MIC_RATE = 16000;
export const PLAY_RATE = 24000;

/**
 * Streaming resampler. A triangular kernel of half-width max(ratio, 1) input samples acts as
 * the low-pass (area-style averaging when downsampling, linear interpolation when upsampling).
 * State carries across push() calls, so chunk boundaries are continuous.
 */
export class StreamResampler {
  private buf = new Float32Array(0);
  private base = 0; // absolute input index of buf[0]
  private next = 0; // absolute (fractional) input position of the next output sample
  private readonly ratio: number;
  private readonly half: number;
  readonly inRate: number;
  readonly outRate: number;

  constructor(inRate: number, outRate: number = MIC_RATE) {
    this.inRate = inRate;
    this.outRate = outRate;
    if (!(inRate > 0) || !(outRate > 0)) throw new Error("invalid sample rate");
    this.ratio = inRate / outRate;
    this.half = Math.max(this.ratio, 1);
  }

  /** Feed input samples (-1..1). Returns the output samples that are fully determined so far. */
  push(input: Float32Array): Float32Array {
    if (input.length) {
      const joined = new Float32Array(this.buf.length + input.length);
      joined.set(this.buf);
      joined.set(input, this.buf.length);
      this.buf = joined;
    }
    const out: number[] = [];
    const end = this.base + this.buf.length; // exclusive absolute end
    while (this.next + this.half < end) {
      const lo = Math.max(this.base, Math.ceil(this.next - this.half));
      const hi = Math.min(end - 1, Math.floor(this.next + this.half));
      let acc = 0;
      let wsum = 0;
      for (let i = lo; i <= hi; i++) {
        const w = 1 - Math.abs(i - this.next) / this.half;
        if (w <= 0) continue;
        acc += w * this.buf[i - this.base];
        wsum += w;
      }
      out.push(wsum > 0 ? acc / wsum : 0);
      this.next += this.ratio;
    }
    const keepFrom = Math.max(this.base, Math.ceil(this.next - this.half));
    if (keepFrom > this.base) {
      this.buf = this.buf.slice(keepFrom - this.base);
      this.base = keepFrom;
    }
    return Float32Array.from(out);
  }
}

export function floatToPcm16(f: Float32Array): Int16Array {
  const o = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    o[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return o;
}

export function pcm16ToFloat(p: Int16Array): Float32Array {
  const o = new Float32Array(p.length);
  for (let i = 0; i < p.length; i++) o[i] = p[i] / (p[i] < 0 ? 0x8000 : 0x7fff);
  return o;
}

/** One-shot conversion: Float32 at inRate -> PCM16 mono at outRate (default 16 kHz). */
export function resampleToPcm16(input: Float32Array, inRate: number, outRate: number = MIC_RATE): Int16Array {
  return floatToPcm16(new StreamResampler(inRate, outRate).push(input));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const o = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i);
  return o;
}

/** Little-endian PCM16 bytes of an Int16Array. */
export function pcm16ToBytes(p: Int16Array): Uint8Array {
  const o = new Uint8Array(p.length * 2);
  const dv = new DataView(o.buffer);
  for (let i = 0; i < p.length; i++) dv.setInt16(i * 2, p[i], true);
  return o;
}

export function bytesToPcm16(b: Uint8Array): Int16Array {
  const n = b.length >> 1;
  const o = new Int16Array(n);
  const dv = new DataView(b.buffer, b.byteOffset, n * 2);
  for (let i = 0; i < n; i++) o[i] = dv.getInt16(i * 2, true);
  return o;
}

export const pcm16ToBase64 = (p: Int16Array) => bytesToBase64(pcm16ToBytes(p));
export const base64ToPcm16 = (s: string) => bytesToPcm16(base64ToBytes(s));

export function rms(f: Float32Array): number {
  if (!f.length) return 0;
  let a = 0;
  for (let i = 0; i < f.length; i++) a += f[i] * f[i];
  return Math.sqrt(a / f.length);
}
