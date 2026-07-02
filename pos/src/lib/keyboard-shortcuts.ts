/**
 * Keyboard shortcuts system for URY POS.
 *
 * Provides a centralized registry for keyboard shortcuts with:
 * - Modifier key support (Ctrl, Alt, Shift, Meta)
 * - Scope-based activation (global, pos, orders, etc.)
 * - Conflict detection
 * - i18n labels for shortcut descriptions
 *
 * Usage:
 *   import { shortcutRegistry, useShortcut } from '../lib/keyboard-shortcuts';
 *
 *   // Register a shortcut
 *   shortcutRegistry.register({
 *     id: 'search',
 *     key: 'k',
 *     modifiers: ['ctrl'],
 *     description: t('shortcuts.search'),
 *     scope: 'global',
 *     handler: () => searchInputRef.current?.focus(),
 *   });
 *
 *   // In a component, use the hook for auto-cleanup:
 *   useShortcut('search', () => { ... });
 */

import { useEffect, useCallback } from 'react';
import { logger } from './logger';

export interface KeyboardShortcut {
  /** Unique identifier for this shortcut */
  id: string;
  /** Key name (e.g., 'k', 'Enter', 'Escape', 'F1') */
  key: string;
  /** Required modifier keys */
  modifiers?: ('ctrl' | 'alt' | 'shift' | 'meta')[];
  /** Human-readable description */
  description: string;
  /** Scope where this shortcut is active */
  scope: 'global' | 'pos' | 'orders' | 'dashboard' | 'menu-management' | 'reports';
  /** Handler function */
  handler: () => void;
  /** Whether this shortcut is currently enabled */
  enabled?: boolean;
}

class ShortcutRegistry {
  private shortcuts = new Map<string, KeyboardShortcut>();
  private activeScope: KeyboardShortcut['scope'] = 'global';
  private listenerAttached = false;

  /**
   * Register a keyboard shortcut.
   * If a shortcut with the same ID exists, it will be replaced.
   */
  register(shortcut: KeyboardShortcut): void {
    // Check for conflicts (same key+modifiers in same scope)
    const existing = this.findByKey(shortcut.key, shortcut.modifiers, shortcut.scope);
    if (existing && existing.id !== shortcut.id) {
      logger.warn(
        `[Shortcuts] Conflict: "${shortcut.id}" and "${existing.id}" both use ` +
        `${this.formatKey(shortcut.key, shortcut.modifiers)} in scope "${shortcut.scope}"`
      );
    }

    this.shortcuts.set(shortcut.id, shortcut);
    this.ensureListener();
  }

  /**
   * Unregister a keyboard shortcut by ID.
   */
  unregister(id: string): void {
    this.shortcuts.delete(id);
  }

  /**
   * Update the active scope. Only shortcuts in 'global' scope
   * or the active scope will be triggered.
   */
  setScope(scope: KeyboardShortcut['scope']): void {
    this.activeScope = scope;
  }

  /**
   * Get the current active scope.
   */
  getScope(): KeyboardShortcut['scope'] {
    return this.activeScope;
  }

  /**
   * Enable or disable a shortcut by ID.
   */
  setEnabled(id: string, enabled: boolean): void {
    const shortcut = this.shortcuts.get(id);
    if (shortcut) {
      shortcut.enabled = enabled;
    }
  }

  /**
   * Get all registered shortcuts (optionally filtered by scope).
   */
  getAll(scope?: KeyboardShortcut['scope']): KeyboardShortcut[] {
    const all = Array.from(this.shortcuts.values());
    if (scope) return all.filter((s) => s.scope === scope || s.scope === 'global');
    return all;
  }

  /**
   * Format a key combination for display.
   */
  formatKey(key: string, modifiers?: string[]): string {
    const parts = [...(modifiers || []).map((m) => m.toUpperCase()), key.toUpperCase()];
    return parts.join('+');
  }

  private findByKey(
    key: string,
    modifiers: string[] | undefined,
    scope: string
  ): KeyboardShortcut | undefined {
    const modSet = new Set(modifiers || []);
    return Array.from(this.shortcuts.values()).find(
      (s) =>
        s.key.toLowerCase() === key.toLowerCase() &&
        new Set(s.modifiers || []).size === modSet.size &&
        [...modSet].every((m) => (s.modifiers || []).includes(m as 'ctrl')) &&
        (s.scope === scope || s.scope === 'global')
    );
  }

  private ensureListener(): void {
    if (this.listenerAttached) return;
    this.listenerAttached = true;

    document.addEventListener('keydown', (e: KeyboardEvent) => {
      this.handleKeyDown(e);
    });
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Don't trigger shortcuts when typing in input fields (unless Escape or specific global)
    const target = e.target as HTMLElement;
    const isInputFocused =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable;

    for (const shortcut of this.shortcuts.values()) {
      if (shortcut.enabled === false) continue;
      if (shortcut.scope !== 'global' && shortcut.scope !== this.activeScope) continue;

      // Check key match
      if (shortcut.key.toLowerCase() !== e.key.toLowerCase()) continue;

      // Check modifiers
      const requiredMods = new Set(shortcut.modifiers || []);
      const modsMatch =
        requiredMods.has('ctrl') === (e.ctrlKey || e.metaKey) &&
        requiredMods.has('alt') === e.altKey &&
        requiredMods.has('shift') === e.shiftKey;

      if (!modsMatch) continue;

      // Skip if input is focused (except for Escape and Ctrl+ shortcuts)
      if (isInputFocused && shortcut.key !== 'Escape' && !e.ctrlKey && !e.metaKey) continue;

      e.preventDefault();
      logger.debug(`[Shortcuts] Triggered: ${shortcut.id}`);
      shortcut.handler();
      return; // Only trigger the first matching shortcut
    }
  }
}

/** Singleton shortcut registry */
export const shortcutRegistry = new ShortcutRegistry();

/** Export class for testing */
export { ShortcutRegistry };

/**
 * React hook to register a keyboard shortcut with automatic cleanup.
 *
 * @param id - Unique shortcut ID
 * @param handler - Function to call when shortcut is triggered
 * @param options - Shortcut configuration
 */
export function useShortcut(
  id: string,
  handler: () => void,
  options?: Partial<Omit<KeyboardShortcut, 'id' | 'handler'>>
): void {
  const stableHandler = useCallback(handler, [handler]);

  useEffect(() => {
    shortcutRegistry.register({
      id,
      key: options?.key ?? id.charAt(0).toLowerCase(),
      modifiers: options?.modifiers,
      description: options?.description ?? id,
      scope: options?.scope ?? 'global',
      handler: stableHandler,
      enabled: options?.enabled,
    });

    return () => {
      shortcutRegistry.unregister(id);
    };
  }, [id, stableHandler, options?.key, options?.modifiers, options?.description, options?.scope, options?.enabled]);
}
