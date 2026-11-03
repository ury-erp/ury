import { describe, expect, it } from 'vitest';
import {
  formatElapsed,
  formatFrappeDatetime,
  getPrintWarningState,
  parseFrappeDatetime,
} from './invoice-print-warning';

const base = { invoice_printed: 1, status: 'Draft', custom_printing_time: '2026-11-03 10:00:00' };
const at = (hour: number, minute: number) => new Date(2026, 10, 3, hour, minute, 0).getTime();

describe('parseFrappeDatetime', () => {
  it('parses datetimes with and without microseconds as local time', () => {
    expect(parseFrappeDatetime('2026-11-03 10:00:00')).toBe(at(10, 0));
    expect(parseFrappeDatetime('2026-11-03 10:00:00.123456')).toBe(at(10, 0));
  });

  it('returns NaN for empty input', () => {
    expect(parseFrappeDatetime(null)).toBeNaN();
    expect(parseFrappeDatetime('')).toBeNaN();
  });
});

describe('formatFrappeDatetime', () => {
  it('formats a Date as a local Frappe datetime', () => {
    expect(formatFrappeDatetime(new Date(2026, 10, 3, 9, 5, 7))).toBe('2026-11-03 09:05:07');
  });
});

describe('formatElapsed', () => {
  it('formats elapsed time as HH:MM', () => {
    expect(formatElapsed(3 * 3_600_000 + 7 * 60_000)).toBe('03:07');
    expect(formatElapsed(-1)).toBe('00:00');
  });
});

describe('getPrintWarningState', () => {
  it('is disabled when the warning time is unset, 0 or invalid', () => {
    for (const limit of [0, undefined, null, -5, NaN]) {
      expect(getPrintWarningState(base, limit, at(12, 0)).exceeded).toBe(false);
    }
  });

  it('ignores invoices that have not been printed', () => {
    expect(getPrintWarningState({ ...base, invoice_printed: 0 }, 10, at(12, 0)).exceeded).toBe(false);
  });

  it('ignores invoices that are no longer open', () => {
    expect(getPrintWarningState({ ...base, status: 'Paid' }, 10, at(12, 0)).exceeded).toBe(false);
  });

  it('does not flag legacy invoices without a printing time', () => {
    expect(getPrintWarningState({ ...base, custom_printing_time: null }, 10, at(12, 0)).exceeded).toBe(false);
  });

  it('stays quiet until the limit is reached', () => {
    expect(getPrintWarningState(base, 30, at(10, 29)).exceeded).toBe(false);
  });

  it('flags open printed invoices at or past the limit, with the elapsed time', () => {
    expect(getPrintWarningState(base, 30, at(10, 30))).toEqual({ exceeded: true, elapsedLabel: '00:30' });
    expect(getPrintWarningState({ ...base, status: 'Unbilled' }, 30, at(12, 15))).toEqual({
      exceeded: true,
      elapsedLabel: '02:15',
    });
  });
});
