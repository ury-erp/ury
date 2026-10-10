import React from 'react';
import { Moon } from 'lucide-react';
import { Input } from '@ury/ui';
import type { HoursRow } from '../../services/website';
import { t } from '../../i18n';

interface HoursEditorProps {
  days: string[];
  value: HoursRow[];
  onChange: (rows: HoursRow[]) => void;
  disabled?: boolean;
}

const DEFAULT_OPEN = '10:00:00';
const DEFAULT_CLOSE = '23:00:00';

/** "23:00:00" and "23:00" both come back from the server; the input wants "23:00". */
function toInput(value: string): string {
  return (value || '').slice(0, 5);
}

/** A closing time at or before the opening time means the kitchen works past midnight. */
export function crossesMidnight(row: HoursRow): boolean {
  const opens = toInput(row.opens);
  const closes = toInput(row.closes);
  return Boolean(opens && closes && closes <= opens);
}

export const HoursEditor: React.FC<HoursEditorProps> = ({ days, value, onChange, disabled }) => {
  const byDay = new Map(value.map((row) => [row.day, row]));

  const toggle = (day: string, open: boolean) => {
    if (open) {
      onChange([...value, { day, opens: DEFAULT_OPEN, closes: DEFAULT_CLOSE }]);
    } else {
      onChange(value.filter((row) => row.day !== day));
    }
  };

  const setTime = (day: string, field: 'opens' | 'closes', time: string) => {
    onChange(
      value.map((row) => (row.day === day ? { ...row, [field]: time ? `${time}:00` : '' } : row)),
    );
  };

  return (
    <div className="space-y-2">
      {days.map((day) => {
        const row = byDay.get(day);
        const open = Boolean(row);
        return (
          <div
            key={day}
            className={[
              'flex flex-wrap items-center gap-3 rounded-xl border p-3 transition-colors',
              open ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50',
            ].join(' ')}
          >
            <label className="flex min-w-[9rem] items-center gap-3 text-sm font-medium text-gray-800">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary-600"
                checked={open}
                disabled={disabled}
                onChange={(e) => toggle(day, e.target.checked)}
              />
              {t(`dash.website.days.${day.toLowerCase()}`)}
            </label>

            {open && row ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="time"
                  aria-label={`${day} ${t('dash.website.hours.opens')}`}
                  className="w-32"
                  value={toInput(row.opens)}
                  disabled={disabled}
                  onChange={(e) => setTime(day, 'opens', e.target.value)}
                />
                <span className="text-gray-400">—</span>
                <Input
                  type="time"
                  aria-label={`${day} ${t('dash.website.hours.closes')}`}
                  className="w-32"
                  value={toInput(row.closes)}
                  disabled={disabled}
                  onChange={(e) => setTime(day, 'closes', e.target.value)}
                />
                {crossesMidnight(row) && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    <Moon className="h-3.5 w-3.5" />
                    {t('dash.website.hours.past_midnight')}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-sm text-gray-500">{t('dash.website.hours.closed')}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};
