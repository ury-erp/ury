import { describe, expect, it } from 'vitest';
import { validateFieldValue, type ValidationMessages } from './validateField';

const validations: ValidationMessages = {
  required: 'This field is required',
  minLength: 'Must be at least {min} characters',
  maxLength: 'Must be at most {max} characters',
  pattern: {
    '^[0-9]+$': 'Digits only',
  },
};

describe('validateFieldValue', () => {
  describe('no rules', () => {
    it('is valid when rules is empty', () => {
      expect(validateFieldValue('anything', [], validations)).toEqual({ valid: true, message: '' });
    });
  });

  describe('required', () => {
    it('fails on empty string', () => {
      expect(validateFieldValue('', ['required'], validations)).toEqual({
        valid: false,
        message: validations.required,
      });
    });

    it('fails on whitespace-only string', () => {
      expect(validateFieldValue('   ', ['required'], validations)).toEqual({
        valid: false,
        message: validations.required,
      });
    });

    it('passes on non-empty string', () => {
      expect(validateFieldValue('hello', ['required'], validations)).toEqual({ valid: true, message: '' });
    });

    it('fails on falsy value passed directly (e.g. empty string via variable)', () => {
      const empty = '';
      expect(validateFieldValue(empty, ['required'], validations).valid).toBe(false);
    });
  });

  describe('minLength', () => {
    it('fails when shorter than minimum', () => {
      expect(validateFieldValue('ab', ['minLength:3'], validations)).toEqual({
        valid: false,
        message: 'Must be at least 3 characters',
      });
    });

    it('passes when exactly at minimum', () => {
      expect(validateFieldValue('abc', ['minLength:3'], validations)).toEqual({ valid: true, message: '' });
    });

    it('passes when longer than minimum', () => {
      expect(validateFieldValue('abcd', ['minLength:3'], validations)).toEqual({ valid: true, message: '' });
    });

    it('skips the check when value is empty (falsy guard)', () => {
      // Implementation only checks `if (value && ...)`, so empty string bypasses minLength.
      expect(validateFieldValue('', ['minLength:3'], validations)).toEqual({ valid: true, message: '' });
    });
  });

  describe('maxLength', () => {
    it('fails when longer than maximum', () => {
      expect(validateFieldValue('abcdef', ['maxLength:5'], validations)).toEqual({
        valid: false,
        message: 'Must be at most 5 characters',
      });
    });

    it('passes when exactly at maximum', () => {
      expect(validateFieldValue('abcde', ['maxLength:5'], validations)).toEqual({ valid: true, message: '' });
    });

    it('passes when shorter than maximum', () => {
      expect(validateFieldValue('ab', ['maxLength:5'], validations)).toEqual({ valid: true, message: '' });
    });

    it('skips the check when value is empty (falsy guard)', () => {
      expect(validateFieldValue('', ['maxLength:0'], validations)).toEqual({ valid: true, message: '' });
    });
  });

  describe('pattern', () => {
    it('fails when value does not match and uses the mapped message', () => {
      expect(validateFieldValue('abc', ['pattern:^[0-9]+$'], validations)).toEqual({
        valid: false,
        message: 'Digits only',
      });
    });

    it('passes when value matches', () => {
      expect(validateFieldValue('123', ['pattern:^[0-9]+$'], validations)).toEqual({ valid: true, message: '' });
    });

    it('falls back to a generic message when the pattern has no mapped message', () => {
      expect(validateFieldValue('abc', ['pattern:^[a-z]{5,}$'], validations)).toEqual({
        valid: false,
        message: 'Invalid format',
      });
    });

    it('skips the check when value is empty (falsy guard)', () => {
      expect(validateFieldValue('', ['pattern:^[0-9]+$'], validations)).toEqual({ valid: true, message: '' });
    });
  });

  describe('multiple rules', () => {
    it('stops at the first failing rule (required before minLength)', () => {
      expect(validateFieldValue('', ['required', 'minLength:3'], validations)).toEqual({
        valid: false,
        message: validations.required,
      });
    });

    it('checks rules in order and returns the first failure', () => {
      expect(validateFieldValue('ab', ['minLength:3', 'pattern:^[0-9]+$'], validations)).toEqual({
        valid: false,
        message: 'Must be at least 3 characters',
      });
    });

    it('passes when all rules are satisfied', () => {
      expect(
        validateFieldValue('12345', ['required', 'minLength:3', 'maxLength:10', 'pattern:^[0-9]+$'], validations)
      ).toEqual({ valid: true, message: '' });
    });
  });
});
