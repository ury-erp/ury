// Pure helpers for the WhatsApp onboarding section (mirrors the server rules in chairman_wa_identity.py).

/** E.164 digits only, 8-15 digits, no leading 0; null when invalid. */
export function normalizeNumber(raw: string): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length < 8 || d.length > 15 || d.startsWith("0")) return null;
  return d;
}

/** "123456" -> "123 456" for reading aloud / typing. */
export function groupCode(code: string): string {
  const c = String(code ?? "").replace(/\D/g, "");
  return c.length === 6 ? `${c.slice(0, 3)} ${c.slice(3)}` : c;
}

export function businessLabel(num: string): string {
  const d = String(num ?? "").replace(/\D/g, "");
  return d ? `+${d}` : "";
}

/** Whether to show the section: only when the server enabled the WhatsApp feature. */
export function whatsappEnabled(features?: { whatsapp?: boolean } | null): boolean {
  return features?.whatsapp === true;
}

/** A single-use token from a query string, or null when absent or implausible. */
export function extractToken(search: string): string | null {
  const t = new URLSearchParams(search || "").get("t");
  return t && /^[A-Za-z0-9_-]{16,128}$/.test(t) ? t : null;
}

/** Redirect target after exchange: the Brief root plus a harmless intent hash. */
export function landingTarget(hash: string): string {
  return /^#[a-z_]{1,32}$/.test(hash || "") ? `/ury/brief/${hash}` : "/ury/brief/";
}
