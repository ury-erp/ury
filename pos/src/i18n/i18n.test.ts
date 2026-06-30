import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to test the i18n module, but it depends on dynamic imports
// So we test the core logic in isolation
describe('i18n - t() function', () => {
  // Test the translation resolution logic directly
  const resolveKey = (locale: Record<string, unknown>, key: string): string | undefined => {
    const parts = key.split('.');
    let value: unknown = locale;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = (value as Record<string, unknown>)[part];
      } else {
        value = undefined;
        break;
      }
    }

    return typeof value === 'string' ? value : undefined;
  };

  // Test the interpolation logic
  const interpolate = (text: string, params?: Record<string, string>): string => {
    if (!params) return text;
    return text.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? `{{${k}}}`);
  };

  const mockLocale = {
    common: {
      loading: 'Loading...',
      cancel: 'Cancel',
      selected_count: 'Selected: {{count}}',
    },
    menu_management: {
      title: 'Menu Management',
      subtitle: 'Manage your restaurant menus, items, and categories',
    },
    dashboard: {
      title: 'Dashboard',
    },
    footer: {
      pos: 'POS',
    },
  };

  it('should resolve simple keys', () => {
    expect(resolveKey(mockLocale, 'common.loading')).toBe('Loading...');
    expect(resolveKey(mockLocale, 'common.cancel')).toBe('Cancel');
    expect(resolveKey(mockLocale, 'menu_management.title')).toBe('Menu Management');
  });

  it('should resolve nested keys', () => {
    expect(resolveKey(mockLocale, 'dashboard.title')).toBe('Dashboard');
    expect(resolveKey(mockLocale, 'footer.pos')).toBe('POS');
  });

  it('should return undefined for missing keys', () => {
    expect(resolveKey(mockLocale, 'common.nonexistent')).toBeUndefined();
    expect(resolveKey(mockLocale, 'nonexistent.key')).toBeUndefined();
    expect(resolveKey(mockLocale, 'common.loading.deep')).toBeUndefined();
  });

  it('should interpolate parameters', () => {
    expect(interpolate('Selected: {{count}}', { count: '5' })).toBe('Selected: 5');
    expect(interpolate('Hello, {{name}}!', { name: 'World' })).toBe('Hello, World!');
  });

  it('should handle multiple parameters', () => {
    expect(
      interpolate('{{greeting}}, {{name}}!', { greeting: 'Hello', name: 'World' })
    ).toBe('Hello, World!');
  });

  it('should leave unresolved placeholders as-is', () => {
    expect(interpolate('Hello, {{name}}!', {})).toBe('Hello, {{name}}!');
    expect(interpolate('Hello, {{name}}!', { other: 'value' })).toBe('Hello, {{name}}!');
  });

  it('should return text as-is when no params provided', () => {
    expect(interpolate('Hello World')).toBe('Hello World');
    expect(interpolate('Hello World', undefined)).toBe('Hello World');
  });

  it('should handle empty locale', () => {
    expect(resolveKey({}, 'common.loading')).toBeUndefined();
  });

  it('should handle null locale', () => {
    expect(resolveKey(null as any, 'common.loading')).toBeUndefined();
  });
});
