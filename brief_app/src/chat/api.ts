// All HTTP for the Ask tab lives here. Adjust names/shapes in one place.
import type { ChatMessage } from "./types";
import { sanitizeCards } from "./cardFormat";

const BASE = "/api/method/ury.ury.api.chairman_chat.";

export class ApiError extends Error {
  constructor(public status: number, msg = "request failed") { super(msg); }
}

function csrf(): string {
  const w = window as unknown as { csrf_token?: string; frappe?: { csrf_token?: string } };
  const t = w.frappe?.csrf_token || w.csrf_token ||
    document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";
  return t && !t.includes("{{") ? t : "";
}

async function call<T = unknown>(name: string, body: Record<string, unknown> = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  const tok = csrf();
  if (tok) headers["X-Frappe-CSRF-Token"] = tok;
  const res = await fetch(BASE + name, { method: "POST", credentials: "same-origin", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new ApiError(res.status);
  const j = await res.json().catch(() => ({}));
  return (j && "message" in j ? j.message : j) as T;
}

/** Best language hint from the browser (e.g. "hi-IN"). */
export const langHint = () => navigator.language || "en";

type Raw = Record<string, unknown>;

export function normalize(m: Raw): ChatMessage {
  const role = String(m.role ?? m.sender ?? "").toLowerCase();
  return {
    id: String(m.id ?? m.name ?? m.message_id ?? Math.random().toString(36).slice(2)),
    role: role === "user" || role === "human" ? "user" : "assistant",
    text: String(m.text ?? m.content ?? m.message ?? ""),
    state: "sent",
    voice: !!m.voice,
    cards: sanitizeCards(m.cards),
  };
}

const TOOL_ROW = /^\s*(Requesting Tool:|Tool Result:|Arguments:)/;

/** Tool-call rows never show: they collapse into a count on the next assistant answer. */
export function foldTools(msgs: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  let n = 0;
  for (const m of msgs) {
    if (m.role === "assistant" && TOOL_ROW.test(m.text)) { n++; continue; }
    if (m.role === "assistant" && n) { out.push({ ...m, tools: n }); n = 0; } else out.push(m);
  }
  return out;
}

export interface Reply {
  conversation?: string;
  transcript?: string;
  messages: ChatMessage[];
  pending: boolean;
}

function reply(r: unknown): Reply {
  const o = (Array.isArray(r) ? { messages: r } : (r ?? {})) as Raw;
  const list = (Array.isArray(o.messages) ? o.messages : []) as Raw[];
  const st = String(o.status ?? "").toLowerCase();
  return {
    conversation: (o.conversation ?? o.conversation_id ?? o.name) as string | undefined,
    transcript: (o.transcript ?? o.text) as string | undefined,
    messages: foldTools(list.map(normalize)),
    pending: o.pending === true || st === "queued" || st === "started" || st === "running",
  };
}

export const callCapabilities = () => call<{ available?: boolean; enabled?: boolean }>("call_capabilities");
export const start = (message: string) => call("start", { message, lang: langHint() }).then(reply);
export const send = (conversation: string, message: string) => call("send", { conversation, message, lang: langHint() }).then(reply);
export const history = (conversation: string) => call("history", { conversation }).then(reply);

function toB64(blob: Blob): Promise<string> {
  return new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = () => no(r.error);
    r.readAsDataURL(blob);
  });
}

export async function sendAudio(conversation: string | null, blob: Blob, mime: string): Promise<Reply> {
  const b64 = await toB64(blob);
  return call("send_audio", { conversation: conversation ?? "", b64, mime, lang: langHint() }).then(reply);
}

/** Returns an object URL for the spoken reply, or null when the server has no TTS. */
export async function speak(messageId: string): Promise<string | null> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const tok = csrf();
  if (tok) headers["X-Frappe-CSRF-Token"] = tok;
  const res = await fetch(BASE + "speak", { method: "POST", credentials: "same-origin", headers, body: JSON.stringify({ message_id: messageId, lang: langHint() }) });
  if (!res.ok) return null;
  const ct = res.headers.get("Content-Type") || "";
  if (ct.startsWith("audio/") || ct === "application/octet-stream") return URL.createObjectURL(await res.blob());
  const j = await res.json().catch(() => null);
  const url = j?.message?.url ?? j?.message?.file_url ?? j?.message;
  if (typeof url !== "string" || !url) return null;
  const f = await fetch(url, { credentials: "same-origin" });
  return f.ok ? URL.createObjectURL(await f.blob()) : null;
}
