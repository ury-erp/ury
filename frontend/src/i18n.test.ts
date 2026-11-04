import { afterEach, describe, expect, it } from 'vitest';
import { __, isRtl } from './i18n';

const w = window as unknown as { frappe?: { boot?: { __messages?: Record<string, string> } } };

describe('__', () => {
  afterEach(() => {
    delete w.frappe;
    document.documentElement.dir = 'ltr';
  });

  it('returns the source text when there are no boot messages', () => {
    expect(__('Save')).toBe('Save');
  });

  it('translates from frappe.boot.__messages and falls back for unknown strings', () => {
    w.frappe = { boot: { __messages: { Save: 'حفظ' } } };
    expect(__('Save')).toBe('حفظ');
    expect(__('Cancel')).toBe('Cancel');
  });

  it('substitutes positional placeholders', () => {
    w.frappe = { boot: { __messages: { 'Total: {0}': 'الإجمالي: {0}' } } };
    expect(__('Total: {0}', [5])).toBe('الإجمالي: 5');
    expect(__('{0} of {1}', [1, 2])).toBe('1 of 2');
  });

  it('reports rtl from the document direction', () => {
    expect(isRtl()).toBe(false);
    document.documentElement.dir = 'rtl';
    expect(isRtl()).toBe(true);
  });
});
