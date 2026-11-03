// HTTP for the voice call (ury.ury.api.chairman_call.*). Same CSRF/credentials handling as src/chat/api.ts.
// Runtime shape checks are hand written (no zod). Never log tokens or call ids.

import { fetchCsrf } from "../csrf";

const BASE = "/api/method/ury.ury.api.chairman_call.";

export class CallApiError extends Error {
  status: number;
  constructor(status: number, msg = "request failed") {
    super(msg);
    this.name = "CallApiError";
    this.status = status;
  }
}

function csrf(): string {
  const w = window as unknown as { csrf_token?: string; frappe?: { csrf_token?: string } };
  const t = w.frappe?.csrf_token || w.csrf_token ||
    document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";
  return t && !t.includes("{{") ? t : "";
}

async function post(name: string, body: Record<string, unknown>, keepalive = false): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  const res = await fetchCsrf(BASE + name, {
    method: "POST", credentials: "same-origin", headers, body: JSON.stringify(body), keepalive,
  });
  if (!res.ok) throw new CallApiError(res.status);
  const j = await res.json().catch(() => ({}));
  return j && typeof j === "object" && "message" in j ? (j as { message: unknown }).message : j;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export interface CallCapabilitiesResult {
  available: boolean;
  reason: string | null;
  voice_call_enabled: boolean;
  engines: string[];
  model: string;
  languages: string[];
  max_seconds: number;
  daily_minutes_left: number;
}

export interface StartCallResult {
  call_id: string;
  token: string;
  model: string;
  ws_url: string;
  max_seconds: number;
  languages: string[];
  tool_names: string[];
  greeting: string;
}

export interface CallToolResult {
  ok: boolean;
  result: Record<string, unknown> | null;
  error: string | null;
}

export interface CallTurn {
  role: "user" | "agent";
  text: string;
  seq: number;
}

const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const num = (v: unknown, d = 0) => (typeof v === "number" && isFinite(v) ? v : d);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function parseCapabilities(m: unknown): CallCapabilitiesResult {
  const o = isObj(m) ? m : {};
  return {
    available: o.available === true,
    reason: typeof o.reason === "string" ? o.reason : null,
    voice_call_enabled: o.voice_call_enabled === true,
    engines: strs(o.engines),
    model: str(o.model),
    languages: strs(o.languages),
    max_seconds: num(o.max_seconds),
    daily_minutes_left: num(o.daily_minutes_left),
  };
}

export function parseStartCall(m: unknown): StartCallResult {
  const o = isObj(m) ? m : {};
  const r: StartCallResult = {
    call_id: str(o.call_id),
    token: str(o.token),
    model: str(o.model),
    ws_url: str(o.ws_url),
    max_seconds: num(o.max_seconds),
    languages: strs(o.languages),
    tool_names: strs(o.tool_names),
    greeting: str(o.greeting),
  };
  if (!r.call_id || !r.token || !(/^wss:\/\//.test(r.ws_url) || (location.hostname === "localhost" && /^ws:\/\//.test(r.ws_url))) || !(r.max_seconds > 0)) {
    throw new CallApiError(502, "The server returned an incomplete call session.");
  }
  return r;
}

export function parseToolResult(m: unknown): CallToolResult {
  const o = isObj(m) ? m : {};
  return {
    ok: o.ok === true,
    result: isObj(o.result) ? o.result : null,
    error: typeof o.error === "string" ? o.error : null,
  };
}

export const callCapabilities = () => post("call_capabilities", {}).then(parseCapabilities);
export const startCall = (language?: string) => post("start_call", language ? { language } : {}).then(parseStartCall);
export const callTool = (callId: string, name: string, args: unknown) =>
  post("call_tool", { call_id: callId, name, args: isObj(args) ? args : {} }).then(parseToolResult);
export const callTurns = (callId: string, turns: CallTurn[]) =>
  post("call_turns", { call_id: callId, turns }).then((m) => ({ saved: isObj(m) ? num(m.saved) : 0 }));
export const endCall = (callId: string, seconds: number, reason: string) =>
  post("end_call", { call_id: callId, seconds: Math.max(0, Math.round(seconds)), reason }, true)
    .then((m) => ({ ok: isObj(m) ? m.ok === true : true }));

export interface CallApi {
  startCall: typeof startCall;
  callTool: typeof callTool;
  callTurns: typeof callTurns;
  endCall: typeof endCall;
}
export const defaultApi: CallApi = { startCall, callTool, callTurns, endCall };
