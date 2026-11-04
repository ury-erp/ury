import { describe, it, expect } from 'vitest';
import en from './locales/en.json';
import ar from './locales/ar.json';
import { ORDER_TYPES, orderTypeLabel } from '../data/order-types';

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    if (k === '_meta') continue;
    if (typeof v === 'string') out[prefix + k] = v;
    else Object.assign(out, flatten(v, `${prefix}${k}.`));
  }
  return out;
}

const placeholders = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join(',');

describe('Arabic locale', () => {
  const enFlat = flatten(en as Tree);
  const arFlat = flatten(ar as Tree);

  it('has every English key', () => {
    const missing = Object.keys(enFlat).filter((k) => !(k in arFlat));
    expect(missing).toEqual([]);
  });

  it('has no empty values', () => {
    const empty = Object.entries(arFlat).filter(([, v]) => !v.trim()).map(([k]) => k);
    expect(empty).toEqual([]);
  });

  it('keeps interpolation placeholders identical to English', () => {
    const bad = Object.keys(enFlat).filter((k) => k in arFlat && placeholders(enFlat[k]) !== placeholders(arFlat[k]));
    expect(bad).toEqual([]);
  });

  it('declares right-to-left direction', () => {
    expect((ar as { _meta: { direction: string } })._meta.direction).toBe('rtl');
    expect((en as { _meta?: { direction?: string } })._meta?.direction ?? 'ltr').toBe('ltr');
  });

  it('translates every order type while stored values stay English', () => {
    for (const { value } of ORDER_TYPES) {
      expect(['Dine In', 'Take Away', 'Delivery', 'Phone In', 'Aggregators']).toContain(value);
      expect(orderTypeLabel(value)).toBeTruthy();
      const key = value.toLowerCase().replace(/ /g, '_');
      expect(arFlat[`order_types.${key}`]).toBeTruthy();
    }
  });
});
