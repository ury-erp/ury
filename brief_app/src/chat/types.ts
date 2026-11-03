import type { Card } from "./cardFormat";
export type Role = "user" | "assistant";
export type MsgState = "sent" | "sending" | "failed";

export interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  /** structured visual cards rendered under the text (never spoken) */
  cards?: Card[];
  state: MsgState;
  /** true when the user text came from a voice message transcript */
  voice?: boolean;
  /** retry payload for failed local messages */
  retry?: { kind: "text"; text: string } | { kind: "audio"; blob: Blob; mime: string };
}

export interface ChatTabProps { /* no required props */ }
