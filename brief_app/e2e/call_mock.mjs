// Local proof harness for the Gemini Live voice call: mock Gemini Live WS server + fake-mic Chromium.
// Run: nice -n 15 node e2e/call_mock.mjs   (needs playwright via PLAYWRIGHT_DIR like run.mjs; esbuild from node_modules)
// Standalone: it bundles GeminiLiveCallEngine into a tiny page, so no Frappe site or login is needed.
import { createRequire } from "node:module";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const pwDir = process.env.PLAYWRIGHT_DIR || path.join(os.homedir(), ".npm/_npx/e41f203b7505f1fb/node_modules/playwright");
const { chromium } = require(pwDir);
const esbuild = require(path.join(root, "node_modules/esbuild"));

const results = [];
const check = (name, ok, detail = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); };

// ---------- fixtures ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "call-mock-"));
function wav(seconds, rate, hz) {
  const n = seconds * rate, b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(12000 * Math.sin((2 * Math.PI * hz * i) / rate)), 44 + i * 2);
  return b;
}
const wavPath = path.join(tmp, "mic.wav");
fs.writeFileSync(wavPath, wav(4, 48000, 440));
const pcm24 = (ms) => { // 24 kHz PCM16 sine, base64
  const n = (24000 * ms) / 1000, b = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 330 * i) / 24000)), i * 2);
  return b.toString("base64");
};

const built = await esbuild.build({
  stdin: {
    contents: `import { GeminiLiveCallEngine } from "./src/call/GeminiLiveCallEngine";
      window.__start = () => { const e = new GeminiLiveCallEngine({ language: "en", flushMs: 1000 });
        window.__states = []; window.__transcripts = [];
        e.on("state", (s) => window.__states.push(s)); e.on("transcript", (t) => window.__transcripts.push(t));
        window.__eng = e; return e.start(); };`,
    resolveDir: root, loader: "ts",
  },
  bundle: true, format: "esm", write: false, target: "es2020",
});
const bundleJs = built.outputFiles[0].text;
const workletJs = fs.readFileSync(path.join(root, "src/call/audio/capture-worklet.js"));

// ---------- mock Gemini Live WebSocket server (RFC 6455, text frames only) ----------
const log = { urls: [], clientMsgs: [], http: [] };
const frame = (str) => {
  const p = Buffer.from(str), l = p.length;
  const h = l < 126 ? Buffer.from([0x81, l]) : l < 65536 ? Buffer.from([0x81, 126, l >> 8, l & 255]) : (() => { const x = Buffer.alloc(10); x[0] = 0x81; x[1] = 127; x.writeBigUInt64BE(BigInt(l), 2); return x; })();
  return Buffer.concat([h, p]);
};
const server = http.createServer((req, res) => {
  if (req.url === "/") { res.setHeader("Content-Type", "text/html"); return res.end(`<!doctype html><meta charset=utf-8><title>call</title><button id=go>go</button><script type=module src=/bundle.js></script>`); }
  if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); return res.end(bundleJs); }
  if (req.url === "/audio/capture-worklet.js") { res.setHeader("Content-Type", "text/javascript"); return res.end(workletJs); }
  res.statusCode = 404; res.end();
});
server.on("upgrade", (req, socket) => {
  log.urls.push(req.url);
  const key = req.headers["sec-websocket-key"];
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64")}\r\n\r\n`);
  const send = (o) => socket.write(frame(JSON.stringify(o)));
  let buf = Buffer.alloc(0), audioFrames = 0, sentGoAway = false;
  const onMsg = (m) => {
    log.clientMsgs.push(m);
    if (m.setup) {
      send({ setupComplete: {} });
      setTimeout(() => send({ serverContent: { inputTranscription: { text: "How were sales " } } }), 150);
      setTimeout(() => send({ serverContent: { inputTranscription: { text: "today?" } } }), 200);
      setTimeout(() => {
        send({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: pcm24(200) } }] } } });
        send({ serverContent: { outputTranscription: { text: "Let me check." } } });
        send({ toolCall: { functionCalls: [{ id: "fc1", name: "get_sales", args: { period: "today" } }] } });
      }, 400);
    }
    if (m.realtimeInput?.audio) audioFrames++;
    if (m.toolResponse) {
      send({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: pcm24(150) } }] } } });
      send({ serverContent: { outputTranscription: { text: " Sales were 120 thousand." } } });
      send({ serverContent: { turnComplete: true } });
      setTimeout(() => { if (!sentGoAway) { sentGoAway = true; send({ goAway: { timeLeft: "5s" } }); } }, 1500);
    }
  };
  socket.on("data", (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 15; let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + 4 + len) return;
      const mask = buf.subarray(off, off + 4), data = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(off + 4 + len);
      if (op === 8) { socket.end(Buffer.from([0x88, 0])); return; }
      if (op === 9) { socket.write(Buffer.concat([Buffer.from([0x8a, len]), data])); continue; }
      if (op === 1) { try { onMsg(JSON.parse(data.toString())); } catch { /* ignore */ } }
    }
  });
  socket.on("error", () => undefined);
});
await new Promise((r) => server.listen(0, "localhost", r));
const port = server.address().port;
const origin = `http://localhost:${port}`;

// ---------- browser ----------
const browser = await chromium.launch({
  headless: true,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${wavPath}`, "--autoplay-policy=no-user-gesture-required"],
});
let code = 0;
try {
  const ctx = await browser.newContext({ baseURL: origin });
  await ctx.grantPermissions(["microphone"], { origin });
  const page = await ctx.newPage();
  const consoleText = [];
  page.on("console", (m) => consoleText.push(m.text()));
  page.on("pageerror", (e) => consoleText.push("pageerror " + e.message));
  const calls = { start_call: [], call_tool: [], call_turns: [], end_call: [] };
  await page.route("**/api/method/ury.ury.api.chairman_call.*", async (route) => {
    const req = route.request();
    const name = req.url().split("chairman_call.")[1].split("?")[0];
    const body = req.postDataJSON?.() ?? {};
    let message = {};
    if (calls[name]) calls[name].push(body);
    if (name === "start_call") message = { call_id: "call-1", token: "tok-SECRET-123", model: "m", ws_url: `ws://localhost:${port}/live`, max_seconds: 60, languages: ["en"], tool_names: ["get_sales"], greeting: "Hi" };
    else if (name === "call_tool") message = { ok: true, result: { total: 120000 }, error: null };
    else if (name === "call_turns") message = { saved: (body.turns || []).length };
    else if (name === "end_call") message = { ok: true };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message }) });
  });

  await page.goto("/");
  await page.waitForFunction(() => typeof window.__start === "function");
  await page.evaluate(() => { window.__start(); });
  await page.waitForFunction(() => window.__states.at(-1) === "ended" || window.__states.at(-1) === "failed", null, { timeout: 25000 }).catch(() => undefined);
  await page.waitForTimeout(500);

  const states = await page.evaluate(() => window.__states);
  check("state sequence idle>requesting_mic>connecting>connected>speaking>listening>ended",
    JSON.stringify(states) === JSON.stringify(["requesting_mic", "connecting", "connected", "speaking", "listening", "ended"]), states.join(">"));

  check("ws url carries access_token query", log.urls.length === 1 && /[?&]access_token=tok-SECRET-123$/.test(log.urls[0]));
  check("first client frame is bare {setup:{}}", JSON.stringify(log.clientMsgs[0]) === '{"setup":{}}', JSON.stringify(log.clientMsgs[0]));
  const frames = log.clientMsgs.filter((m) => m.realtimeInput?.audio);
  const okMime = frames.length >= 5 && frames.every((f) => f.realtimeInput.audio.mimeType === "audio/pcm;rate=16000");
  check("mic frames arrive as audio/pcm;rate=16000", okMime, `${frames.length} frames`);
  let peak = 0, sizes = new Set();
  for (const f of frames) {
    const b = Buffer.from(f.realtimeInput.audio.data, "base64");
    sizes.add(b.length);
    for (let i = 0; i + 1 < b.length; i += 2) peak = Math.max(peak, Math.abs(b.readInt16LE(i)));
  }
  check("mic frames are valid PCM16 with signal from the fake mic", peak > 2000 && [...sizes].every((n) => n % 2 === 0), `peak=${peak} sizes=${[...sizes].slice(0, 3)}`);
  check("client never sent model/instructions/tools", !log.clientMsgs.some((m) => m.setup && Object.keys(m.setup).length));

  const tr = log.clientMsgs.find((m) => m.toolResponse)?.toolResponse?.functionResponses?.[0];
  check("toolCall round-trips to call_tool", calls.call_tool.length === 1 && calls.call_tool[0].call_id === "call-1" && calls.call_tool[0].name === "get_sales" && calls.call_tool[0].args?.period === "today", JSON.stringify(calls.call_tool[0]));
  check("toolResponse returned with id, name and output", tr?.id === "fc1" && tr?.name === "get_sales" && tr?.response?.output?.total === 120000, JSON.stringify(tr));

  const turns = calls.call_turns.flatMap((c) => c.turns);
  const roles = turns.map((t) => `${t.role}:${t.seq}`);
  check("turns posted to call_turns (user and agent, increasing seq)", turns.some((t) => t.role === "user" && t.text === "How were sales today?") && turns.some((t) => t.role === "agent" && /Sales were 120/.test(t.text)) && new Set(turns.map((t) => t.seq)).size === turns.length, roles.join(","));
  check("end_call posted once with go_away reason", calls.end_call.length === 1 && calls.end_call[0].call_id === "call-1" && calls.end_call[0].reason === "go_away", JSON.stringify(calls.end_call));
  check("token/call id never logged to console", !consoleText.some((t) => t.includes("tok-SECRET-123") || t.includes("call-1")), consoleText.slice(0, 3).join(" | "));
  const errs = consoleText.filter((t) => t.startsWith("pageerror"));
  check("no page errors", errs.length === 0, errs.join(" | "));
} catch (e) {
  check("harness exception", false, String(e.stack || e).split("\n").slice(0, 3).join(" "));
} finally {
  await browser.close();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
