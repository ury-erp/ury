import { describe, expect, it } from 'vitest';
import { classifyWidth, POS_MIN_WIDTH } from './useViewport';

/**
 * The boundaries, not the middles.
 *
 * Every device in the plan's matrix sits exactly on one of these numbers,
 * and an off-by-one here is the difference between a portrait tablet getting
 * the sheet layout and getting the "phone not supported" wall (UX-06).
 */
const cases: { width: number; expected: string; note: string }[] = [
  { width: 360, expected: 'phone', note: 'captain phone' },
  { width: 430, expected: 'phone', note: 'large phone' },
  { width: 767, expected: 'phone', note: 'one below the floor' },
  { width: 768, expected: 'compact', note: 'portrait tablet, the floor itself' },
  { width: 820, expected: 'compact', note: 'portrait tablet 820x1180' },
  { width: 1023, expected: 'compact', note: 'one below docked panels' },
  { width: 1024, expected: 'medium', note: 'landscape tablet 1024x768' },
  { width: 1280, expected: 'wide', note: 'landscape tablet 1280x800 reads as wide' },
  { width: 1366, expected: 'wide', note: 'counter screen' },
  { width: 1920, expected: 'wide', note: 'counter screen' },
];

describe('classifyWidth', () => {
  it('keeps the POS floor where every breakpoint below assumes it is', () => {
    expect(POS_MIN_WIDTH).toBe(768);
  });

  it.each(cases)('$width px ($note) => $expected', ({ width, expected }) => {
    expect(classifyWidth(width)).toBe(expected);
  });
});
