import { currencySymbol, getBriefCurrency } from "./chat/cardFormat.ts";

// The server supplies headline and delta text. For chart amounts the API gives
// numbers only today, so this mirrors the server's compact rule as a fallback;
// any *_text field from the server always wins.
// INR keeps the Indian compact units (K/L/Cr); every other currency uses K/M/B.
export function compactInr(n: number): string {
  const a = Math.abs(Number(n) || 0);
  const one = (x: number, s: string) => {
    let t = (Math.round(x * 10) / 10).toFixed(1);
    if (t.endsWith(".0")) t = t.slice(0, -2);
    return t + s;
  };
  let s: string;
  if (getBriefCurrency() === "INR") {
    if (a >= 1e7) s = one(a / 1e7, "Cr");
    else if (a >= 1e5) s = one(a / 1e5, "L");
    else if (a >= 1e3) s = one(a / 1e3, "K");
    else s = String(Math.round(a));
  } else if (a >= 1e9) s = one(a / 1e9, "B");
  else if (a >= 1e6) s = one(a / 1e6, "M");
  else if (a >= 1e3) s = one(a / 1e3, "K");
  else s = String(Math.round(a));
  return (n < 0 ? "-" : "") + currencySymbol(getBriefCurrency()) + s;
}
export const amount = (text: string | undefined, n: number | null | undefined) =>
  text ?? (n == null ? "" : compactInr(n));

export function timeOf(iso?: string): string {
  const m = /T(\d\d:\d\d)/.exec(iso || "");
  return m ? m[1] : "";
}
