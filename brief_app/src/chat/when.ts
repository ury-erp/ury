// Pure date helpers for the Ask tab. `now` and `locale` are injected so tests are deterministic.
const DAY = 86400000;

/** Parses the server's site-local "YYYY-MM-DD HH:MM:SS(.ffffff)" as local time. Safari rejects the space form, so never use new Date(str). */
export function parseServerTime(s: unknown): Date | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?)?$/.exec(s.trim());
  if (!m) return null;
  const ms = m[7] ? Math.floor(Number(`0.${m[7]}`) * 1000) : 0;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), ms);
  return isNaN(d.getTime()) ? null : d;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Whole calendar days from `date` to `now` (0 = same day). DST-safe. */
export const calendarDiff = (date: Date, now: Date) => Math.round((+startOfDay(now) - +startOfDay(date)) / DAY);
/** Local calendar-day key, e.g. "2026-10-21", for detecting day changes. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

function shortDate(date: Date, now: Date, locale: string): string {
  const withYear = date.getFullYear() !== now.getFullYear();
  return new Intl.DateTimeFormat(locale, withYear ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" }).format(date);
}

export function relativeLabel(date: Date, now: Date, locale = "en-GB"): string {
  const mins = Math.floor((+now - +date) / 60000);
  if (mins < 1) return "Just now";
  const days = calendarDiff(date, now);
  if (mins < 60) return `${mins} min ago`;
  if (days === 0 && mins < 1440) { const h = Math.floor(mins / 60); return `${h} ${h === 1 ? "hour" : "hours"} ago`; }
  if (days === 1) return "Yesterday";
  if (days >= 2 && days <= 6) return `${days} days ago`;
  return shortDate(date, now, locale);
}

export function dayLabel(date: Date, now: Date, locale = "en-GB"): string {
  const days = calendarDiff(date, now);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return shortDate(date, now, locale);
}

/** Section a chat belongs to in the history list: Today, Yesterday, Previous 7 days, then "October 2026". */
export function groupKey(date: Date, now: Date, locale = "en-GB"): { key: string; label: string } {
  const days = calendarDiff(date, now);
  if (days <= 0) return { key: "today", label: "Today" };
  if (days === 1) return { key: "yesterday", label: "Yesterday" };
  if (days <= 7) return { key: "week", label: "Previous 7 days" };
  const label = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
  return { key: `${date.getFullYear()}-${date.getMonth()}`, label };
}

/** Chat-list time: "14:32" today, "Yesterday", weekday within 6 days, then "3 Nov" / "3 Nov 2025". */
export function rowTime(date: Date, now: Date, locale = "en-GB"): string {
  const days = calendarDiff(date, now);
  if (days <= 0) return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  if (days === 1) return "Yesterday";
  if (days <= 6) return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
  return shortDate(date, now, locale);
}
