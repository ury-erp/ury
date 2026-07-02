import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShortcutRegistry } from './keyboard-shortcuts';

// Mock logger
vi.mock('./logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    setLevel: vi.fn(),
  },
}));

describe('ShortcutRegistry', () => {
  let registry: ShortcutRegistry;

  beforeEach(() => {
    registry = new ShortcutRegistry();
  });

  describe('register', () => {
    it('should register a keyboard shortcut', () => {
      const handler = vi.fn();
      registry.register({
        id: 'test-shortcut',
        key: 'k',
        modifiers: ['ctrl'],
        description: 'Test shortcut',
        scope: 'global',
        handler,
      });

      const shortcuts = registry.getAll();
      expect(shortcuts).toHaveLength(1);
      expect(shortcuts[0].id).toBe('test-shortcut');
    });

    it('should replace existing shortcut with same ID', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      registry.register({
        id: 'test',
        key: 'k',
        modifiers: ['ctrl'],
        description: 'First',
        scope: 'global',
        handler: handler1,
      });

      registry.register({
        id: 'test',
        key: 'l',
        modifiers: ['ctrl'],
        description: 'Second',
        scope: 'global',
        handler: handler2,
      });

      expect(registry.getAll()).toHaveLength(1);
      expect(registry.getAll()[0].key).toBe('l');
    });
  });

  describe('unregister', () => {
    it('should remove a shortcut by ID', () => {
      registry.register({
        id: 'to-remove',
        key: 'x',
        modifiers: ['ctrl'],
        description: 'Remove me',
        scope: 'global',
        handler: vi.fn,
      });

      expect(registry.getAll()).toHaveLength(1);
      registry.unregister('to-remove');
      expect(registry.getAll()).toHaveLength(0);
    });

    it('should not throw for non-existent ID', () => {
      expect(() => registry.unregister('nonexistent')).not.toThrow();
    });
  });

  describe('setScope / getScope', () => {
    it('should update and return the active scope', () => {
      expect(registry.getScope()).toBe('global');
      registry.setScope('pos');
      expect(registry.getScope()).toBe('pos');
    });
  });

  describe('setEnabled', () => {
    it('should disable a shortcut', () => {
      registry.register({
        id: 'toggle-test',
        key: 't',
        description: 'Toggle test',
        scope: 'global',
        handler: vi.fn,
      });

      registry.setEnabled('toggle-test', false);
      const shortcut = registry.getAll().find((s) => s.id === 'toggle-test');
      expect(shortcut?.enabled).toBe(false);
    });
  });

  describe('getAll', () => {
    it('should filter shortcuts by scope', () => {
      registry.register({
        id: 'global-1',
        key: 'g',
        description: 'Global',
        scope: 'global',
        handler: vi.fn,
      });

      registry.register({
        id: 'pos-1',
        key: 'p',
        description: 'POS only',
        scope: 'pos',
        handler: vi.fn,
      });

      // getAll('pos') returns both 'pos' scope AND 'global' scope shortcuts
      expect(registry.getAll('global')).toHaveLength(1);
      expect(registry.getAll('pos')).toHaveLength(2); // pos-1 + global-1
    });
  });

  describe('formatKey', () => {
    it('should format key with modifiers', () => {
      expect(registry.formatKey('k', ['ctrl'])).toBe('CTRL+K');
      expect(registry.formatKey('Enter', ['ctrl', 'shift'])).toBe('CTRL+SHIFT+ENTER');
    });

    it('should format key without modifiers', () => {
      expect(registry.formatKey('Escape')).toBe('ESCAPE');
    });
  });
});
