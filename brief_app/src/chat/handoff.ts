// One-shot hand-off from the Today dock to a fresh thread (first question, or "start recording").
export interface Handoff { text?: string; mic?: boolean }
let pending: Handoff | null = null;
export const queueHandoff = (h: Handoff) => { pending = h; };
export function takeHandoff(): Handoff | null { const h = pending; pending = null; return h; }
