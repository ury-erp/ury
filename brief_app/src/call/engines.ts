// Picks the call engine from the server capabilities. Kept free of React so node can test the helpers.
import { MockCallEngine, type MockOptions } from "./MockCallEngine.ts";
import type { VoiceCallEngine } from "./types.ts";

export type CallLang = "en" | "hi" | "ar" | "ml";

export interface CallCaps {
  available: boolean;
  reason?: string | null;
  voice_call_enabled?: boolean;
  engines?: string[];
  model?: string;
  languages?: string[];
  max_seconds?: number;
  daily_minutes_left?: number;
}

export interface EngineOpts {
  /** Omitted on purpose: the model picks the language from what the caller speaks. */
  language?: CallLang;
  mock?: MockOptions;
  /** Passed through to GeminiLiveCallEngine (api, wsFactory, ...). */
  gemini?: Record<string, unknown>;
}

export interface EngineChoice {
  engine: VoiceCallEngine;
  kind: "gemini_live" | "mock";
  /** Human message when the real engine is not in use; null when live. */
  notice: string | null;
}

const MESSAGES: Record<string, string> = {
  disabled: "Voice calls are turned off by your administrator.",
  no_agent: "Voice calls are not set up yet: no assistant is connected.",
  no_key: "Voice calls are not set up yet: the voice service key is missing.",
  policy: "Voice calls are not allowed by the assistant's policy.",
  role: "Your role does not have access to voice calls.",
  rate: "Call limit reached for now. Try again later.",
};

export function callErrorMessage(reason?: string | null): string {
  if (!reason) return "Voice calls are not available right now.";
  return MESSAGES[reason] ?? "Voice calls are not available right now.";
}

export function liveSupported(caps: CallCaps | null | undefined): boolean {
  return !!caps && caps.available === true && Array.isArray(caps.engines) && caps.engines.includes("gemini_live");
}

/** Mock path is pure (node-testable). Live path loads the Gemini engine lazily. */
export async function createCallEngine(caps: CallCaps | null | undefined, opts: EngineOpts): Promise<EngineChoice> {
  if (liveSupported(caps)) {
    const { GeminiLiveCallEngine } = (await import("./GeminiLiveCallEngine.ts")) as unknown as {
      GeminiLiveCallEngine: new (o: Record<string, unknown>) => VoiceCallEngine;
    };
    const engine = new GeminiLiveCallEngine({ language: opts.language, ...(opts.gemini ?? {}) });
    return { engine, kind: "gemini_live", notice: null };
  }
  const notice = caps && caps.reason ? callErrorMessage(caps.reason) : null;
  return { engine: new MockCallEngine(opts.mock), kind: "mock", notice };
}
