import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const localesDir = join(dirname(fileURLToPath(import.meta.url)), '../src/i18n/locales');

function collectStrings(value: unknown, path: string, found: Array<{ path: string; text: string }>): void {
  if (typeof value === 'string') {
    found.push({ path, text: value });
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    collectStrings(child, path ? `${path}.${key}` : key, found);
  }
}

describe('POS opening zero-balance copy', () => {
  it('does not hardcode a rupee sign in any locale string', () => {
    const offenders: string[] = [];
    for (const file of readdirSync(localesDir).filter((name) => name.endsWith('.json')).sort()) {
      const data = JSON.parse(readFileSync(join(localesDir, file), 'utf8')) as unknown;
      const found: Array<{ path: string; text: string }> = [];
      collectStrings(data, '', found);
      for (const entry of found) {
        if (entry.text.includes('\u20b9')) offenders.push(`${file}:${entry.path}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('states a zero opening balance without a currency symbol or interpolation', () => {
    for (const file of ['en.json', 'fr.json']) {
      const data = JSON.parse(readFileSync(join(localesDir, file), 'utf8')) as {
        pos_opening: { zero_balance_warning: string };
      };
      const warning = data.pos_opening.zero_balance_warning;
      expect(warning).not.toMatch(/\u20b9|\$|\u20ac|\u00a3|\u00a5/);
      expect(warning).not.toContain('{{');
    }
  });
});
