import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storage } from './storage';

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('setItem / getItem', () => {
    it('should store and retrieve a string value', () => {
      storage.setItem('testKey', 'testValue');
      expect(storage.getItem('testKey')).toBe('testValue');
    });

    it('should return null for non-existent keys', () => {
      expect(storage.getItem('nonExistent')).toBeNull();
    });

    it('should overwrite existing values', () => {
      storage.setItem('key', 'value1');
      storage.setItem('key', 'value2');
      expect(storage.getItem('key')).toBe('value2');
    });
  });

  describe('removeItem', () => {
    it('should remove an item', () => {
      storage.setItem('toRemove', 'value');
      storage.removeItem('toRemove');
      expect(storage.getItem('toRemove')).toBeNull();
    });

    it('should not throw when removing non-existent key', () => {
      expect(() => storage.removeItem('nonExistent')).not.toThrow();
    });
  });

  describe('savePosProfileFull / getPosProfileFull', () => {
    it('should save and retrieve a profile object', () => {
      const profile = { name: 'Test Profile', currency: 'EUR' };
      storage.savePosProfileFull(profile);
      expect(storage.getPosProfileFull()).toEqual(profile);
    });

    it('should return null when no profile exists', () => {
      expect(storage.getPosProfileFull()).toBeNull();
    });

    it('should handle corrupted JSON gracefully', () => {
      localStorage.setItem('pos_profile', '{invalid json}');
      const result = storage.getPosProfileFull();
      expect(result).toBeNull();
      // Should also clean up the corrupted entry
      expect(localStorage.getItem('pos_profile')).toBeNull();
    });
  });
});
