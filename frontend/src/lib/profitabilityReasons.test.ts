import { describe, expect, it } from 'vitest';
import { describeProfitabilityReason, PROFITABILITY_REASON_LABELS } from './profitabilityReasons';

describe('describeProfitabilityReason', () => {
  it('translates every documented reason code to a human sentence', () => {
    for (const [code, label] of Object.entries(PROFITABILITY_REASON_LABELS)) {
      expect(describeProfitabilityReason(code)).toBe(label);
    }
  });

  it('falls back to the raw code for one not in the map', () => {
    expect(describeProfitabilityReason('SOME_FUTURE_CODE')).toBe('SOME_FUTURE_CODE');
  });

  it('returns an empty string for no reason', () => {
    expect(describeProfitabilityReason(undefined)).toBe('');
    expect(describeProfitabilityReason(null)).toBe('');
    expect(describeProfitabilityReason('')).toBe('');
  });
});
