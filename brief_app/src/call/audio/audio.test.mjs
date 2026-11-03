// Run: node --test src/call/audio/audio.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  StreamResampler, resampleToPcm16, floatToPcm16, pcm16ToBase64, base64ToPcm16, bytesToBase64, base64ToBytes, rms,
} from "./resample.ts";
import { PcmPlayer } from "./player.ts";

const sine = (hz, rate, n, amp = 0.5) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate));

test("48k sine -> 16k PCM16 keeps frequency and amplitude", () => {
  const out = resampleToPcm16(sine(440, 48000, 48000), 48000, 16000);
  assert.ok(Math.abs(out.length - 16000) <= 4, `len ${out.length}`);
  const want = sine(440, 16000, out.length);
  let err = 0, peak = 0;
  for (let i = 100; i < out.length - 100; i++) {
    err = Math.max(err, Math.abs(out[i] / 32767 - want[i]));
    peak = Math.max(peak, Math.abs(out[i]));
  }
  assert.ok(err < 0.03, `max err ${err}`);
  assert.ok(Math.abs(peak / 32767 - 0.5) < 0.02);
});

test("44.1k and 24k inputs resample correctly", () => {
  for (const rate of [44100, 24000, 16000, 8000]) {
    const out = resampleToPcm16(sine(300, rate, rate), rate, 16000);
    const want = sine(300, 16000, out.length);
    let err = 0;
    for (let i = 100; i < out.length - 100; i++) err = Math.max(err, Math.abs(out[i] / 32767 - want[i]));
    assert.ok(err < 0.04, `${rate}: ${err}`);
  }
});

test("high tone above 8 kHz is attenuated when downsampling", () => {
  const out = resampleToPcm16(sine(20000, 48000, 9600, 0.8), 48000, 16000);
  assert.ok(rms(Float32Array.from(out, (v) => v / 32767)) < 0.2);
});

test("chunk boundaries are continuous (streaming == one shot)", () => {
  const x = sine(523, 48000, 9600 + 37);
  const whole = new StreamResampler(48000).push(x);
  const r = new StreamResampler(48000);
  const parts = [];
  for (let i = 0; i < x.length; ) { const n = 1 + ((i * 7) % 700); parts.push(r.push(x.subarray(i, i + n))); i += n; }
  const joined = Float32Array.from(parts.flatMap((p) => [...p]));
  assert.equal(joined.length, whole.length);
  for (let i = 0; i < whole.length; i++) assert.ok(Math.abs(joined[i] - whole[i]) < 1e-6);
});

test("pcm16 clamps and base64 round-trips", () => {
  assert.deepEqual([...floatToPcm16(Float32Array.of(2, -2, 0))], [32767, -32768, 0]);
  const p = Int16Array.of(0, 1, -1, 12345, -32768, 32767);
  assert.deepEqual([...base64ToPcm16(pcm16ToBase64(p))], [...p]);
  const big = new Uint8Array(100000).map((_, i) => i % 251);
  assert.deepEqual(base64ToBytes(bytesToBase64(big)), big);
});

function fakeCtx() {
  const ctx = {
    currentTime: 0, destination: {}, started: [], stopped: 0,
    createBuffer: (c, len, rate) => ({ duration: len / rate, getChannelData: () => new Float32Array(len) }),
    createGain: () => ({ gain: { value: 1 }, connect() {} }),
    createBufferSource() {
      const s = { buffer: null, onended: null, connect() {}, start: (w) => ctx.started.push({ s, w, dur: s.buffer.duration }), stop: () => { ctx.stopped++; } };
      return s;
    },
  };
  return ctx;
}
const chunk = (n) => new Uint8Array(n * 2);

test("player schedules chunks gaplessly", () => {
  const ctx = fakeCtx();
  const p = new PcmPlayer(ctx, { levelIntervalMs: 0 });
  p.enqueue(chunk(2400)); p.enqueue(chunk(4800)); p.enqueue(chunk(2400));
  const [a, b, c] = ctx.started;
  assert.ok(Math.abs(b.w - (a.w + a.dur)) < 1e-9);
  assert.ok(Math.abs(c.w - (b.w + b.dur)) < 1e-9);
  assert.ok(Math.abs(p.queuedSec - 0.4 - 0.03) < 1e-6 || p.queuedSec > 0.39);
});

test("player reschedules from now after underrun", () => {
  const ctx = fakeCtx();
  const p = new PcmPlayer(ctx, { levelIntervalMs: 0 });
  p.enqueue(chunk(2400));
  ctx.currentTime = 5;
  p.enqueue(chunk(2400));
  assert.ok(ctx.started[1].w >= 5);
});

test("flush stops sources, resets the queue, fires onIdle once, and mute/volume set gain", () => {
  const ctx = fakeCtx();
  let idle = 0;
  const p = new PcmPlayer(ctx, { levelIntervalMs: 0, onIdle: () => idle++ });
  p.enqueue(chunk(2400)); p.enqueue(chunk(2400));
  assert.ok(p.playing);
  p.flush();
  assert.equal(ctx.stopped, 2);
  assert.equal(p.playing, false);
  assert.equal(idle, 1);
  p.enqueue(chunk(2400));
  assert.ok(ctx.started[2].w < 0.1); // restarts near now, not after the dropped audio
  p.setMuted(true);
  p.setVolume(0.5);
  p.setMuted(false);
  assert.equal(p.gain.gain.value, 0.5);
});

test("onIdle fires when the last source ends", () => {
  const ctx = fakeCtx();
  let idle = 0;
  const p = new PcmPlayer(ctx, { levelIntervalMs: 0, onIdle: () => idle++ });
  p.enqueue(chunk(100)); p.enqueue(chunk(100));
  ctx.started[0].s.onended();
  assert.equal(idle, 0);
  ctx.started[1].s.onended();
  assert.equal(idle, 1);
});
