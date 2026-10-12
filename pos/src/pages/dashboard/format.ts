import { t, tPlural } from '../../i18n';

/**
 * "3 mins ago" in the active language.
 *
 * Previously built by string concatenation with an English `s` suffix, which
 * Arabic cannot express — it has dual and several plural forms — so this goes
 * through `tPlural` and lets Intl.PluralRules pick the category.
 */
export function formatRelativeTime(creation: string): string {
  const diffMs = Date.now() - new Date(creation).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return t('time.just_now');
  if (mins < 60) return tPlural('time.minutes_ago', mins);
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return tPlural('time.hours_ago', hours);
  return tPlural('time.days_ago', Math.floor(diffMs / 86_400_000));
}

/** Stock-depletion estimate. `null` means the item is not projected to run out. */
export function formatETA(minutes: number | null): string {
  if (minutes === null) return t('dashboard.holds');
  if (minutes <= 90) return t('time.approx_minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0
    ? t('time.approx_hours_minutes', { hours, minutes: mins })
    : t('time.approx_hours', { hours });
}

/** Ticket time, or an em dash when there is nothing to average yet. */
export function formatMinutes(minutes: number | null): string {
  return minutes === null ? '—' : t('time.minutes_short', { count: minutes });
}

/** Signed percentage against a baseline, e.g. "+12%". Null when no baseline. */
export function percentDelta(actual: number, baseline: number): string | null {
  if (!baseline) return null;
  const pct = ((actual - baseline) / baseline) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`;
}
