import { describe, it, expect } from 'vitest';
import { validatePhoneNumber, sanitizePhoneNumber, getCountryCallingCode } from './phoneValidation';

describe('sanitizePhoneNumber', () => {
  it('strips formatting characters and preserves leading plus', () => {
    expect(sanitizePhoneNumber('  +91 98765-43210  ')).toBe('+919876543210');
    expect(sanitizePhoneNumber('(050) 123-4567')).toBe('0501234567');
    expect(sanitizePhoneNumber('')).toBe('');
  });
});

describe('validatePhoneNumber', () => {
  describe('India validation', () => {
    it('validates 10-digit mobile numbers starting with 6-9', () => {
      expect(validatePhoneNumber('9876543210', 'India').isValid).toBe(true);
      expect(validatePhoneNumber('+919876543210', 'India').isValid).toBe(true);
      expect(validatePhoneNumber('09876543210', 'India').isValid).toBe(true);
      expect(validatePhoneNumber('+91 98765 43210', 'India').isValid).toBe(true);
      expect(validatePhoneNumber('6123456789', 'India').isValid).toBe(true);
      expect(validatePhoneNumber('7123456789', 'India').isValid).toBe(true);
      expect(validatePhoneNumber('8123456789', 'India').isValid).toBe(true);
    });

    it('rejects invalid numbers for India', () => {
      const res1 = validatePhoneNumber('12345', 'India');
      expect(res1.isValid).toBe(false);
      expect(res1.message).toBe('Invalid mobile number for India');

      const res2 = validatePhoneNumber('987654321', 'India'); // 9 digits
      expect(res2.isValid).toBe(false);
      expect(res2.message).toBe('Invalid mobile number for India');

      const res3 = validatePhoneNumber('1234567890', 'India'); // starts with 1
      expect(res3.isValid).toBe(false);
      expect(res3.message).toBe('Invalid mobile number for India');
    });

    it('accepts country alias IN or ind', () => {
      expect(validatePhoneNumber('9876543210', 'IN').isValid).toBe(true);
      expect(validatePhoneNumber('12345', 'IN').isValid).toBe(false);
    });
  });

  describe('United Arab Emirates validation', () => {
    it('validates UAE numbers starting with 5', () => {
      expect(validatePhoneNumber('501234567', 'United Arab Emirates').isValid).toBe(true);
      expect(validatePhoneNumber('0501234567', 'United Arab Emirates').isValid).toBe(true);
      expect(validatePhoneNumber('+971501234567', 'United Arab Emirates').isValid).toBe(true);
      expect(validatePhoneNumber('0541234567', 'UAE').isValid).toBe(true);
      expect(validatePhoneNumber('0561234567', 'AE').isValid).toBe(true);
    });

    it('rejects invalid numbers for UAE', () => {
      const res = validatePhoneNumber('12345', 'United Arab Emirates');
      expect(res.isValid).toBe(false);
      expect(res.message).toBe('Invalid mobile number for United Arab Emirates');

      // Landline starting with 4
      const res2 = validatePhoneNumber('041234567', 'United Arab Emirates');
      expect(res2.isValid).toBe(false);
    });
  });

  describe('Saudi Arabia validation', () => {
    it('validates Saudi numbers starting with 5', () => {
      expect(validatePhoneNumber('512345678', 'Saudi Arabia').isValid).toBe(true);
      expect(validatePhoneNumber('0512345678', 'Saudi Arabia').isValid).toBe(true);
      expect(validatePhoneNumber('+966512345678', 'Saudi Arabia').isValid).toBe(true);
      expect(validatePhoneNumber('0512345678', 'KSA').isValid).toBe(true);
    });

    it('rejects invalid numbers for Saudi Arabia', () => {
      expect(validatePhoneNumber('12345', 'Saudi Arabia').isValid).toBe(false);
    });
  });

  describe('Oman validation', () => {
    it('validates Oman numbers starting with 7 or 9', () => {
      expect(validatePhoneNumber('91234567', 'Oman').isValid).toBe(true);
      expect(validatePhoneNumber('71234567', 'Oman').isValid).toBe(true);
      expect(validatePhoneNumber('+96891234567', 'Oman').isValid).toBe(true);
      expect(validatePhoneNumber('91234567', 'OM').isValid).toBe(true);
    });

    it('rejects invalid numbers for Oman', () => {
      expect(validatePhoneNumber('12345', 'Oman').isValid).toBe(false);
      expect(validatePhoneNumber('21234567', 'Oman').isValid).toBe(false);
    });
  });

  describe('International E.164 fallback', () => {
    it('allows valid international number with + even if pos profile country is different', () => {
      // In India POS profile, customer with UAE number
      expect(validatePhoneNumber('+971501234567', 'India').isValid).toBe(true);
      // In UAE POS profile, customer with India number
      expect(validatePhoneNumber('+919876543210', 'United Arab Emirates').isValid).toBe(true);
    });

    it('rejects invalid international numbers', () => {
      expect(validatePhoneNumber('+12', 'India').isValid).toBe(false);
    });
  });

  describe('Empty and invalid input', () => {
    it('returns error for empty input', () => {
      const res = validatePhoneNumber('', 'India');
      expect(res.isValid).toBe(false);
      expect(res.message).toBe('Mobile number is required');
    });

    it('returns error when only the country calling code is entered', () => {
      const res1 = validatePhoneNumber('+91', 'India');
      expect(res1.isValid).toBe(false);
      expect(res1.message).toBe('Mobile number is required');

      const res2 = validatePhoneNumber('+971', 'United Arab Emirates');
      expect(res2.isValid).toBe(false);
      expect(res2.message).toBe('Mobile number is required');
    });

    it('returns error for non-digit input', () => {
      const res = validatePhoneNumber('abcde', 'India');
      expect(res.isValid).toBe(false);
    });
  });

  describe('getCountryCallingCode', () => {
    it('returns correct calling code for countries and aliases', () => {
      expect(getCountryCallingCode('India')).toBe('+91');
      expect(getCountryCallingCode('in')).toBe('+91');
      expect(getCountryCallingCode('ind')).toBe('+91');
      expect(getCountryCallingCode('United Arab Emirates')).toBe('+971');
      expect(getCountryCallingCode('UAE')).toBe('+971');
      expect(getCountryCallingCode('Saudi Arabia')).toBe('+966');
      expect(getCountryCallingCode('KSA')).toBe('+966');
      expect(getCountryCallingCode('Oman')).toBe('+968');
      expect(getCountryCallingCode('Qatar')).toBe('+974');
      expect(getCountryCallingCode('Kuwait')).toBe('+965');
      expect(getCountryCallingCode('Bahrain')).toBe('+973');
      expect(getCountryCallingCode('United States')).toBe('+1');
      expect(getCountryCallingCode('United Kingdom')).toBe('+44');
      expect(getCountryCallingCode('Germany')).toBe('+49');
      expect(getCountryCallingCode('Singapore')).toBe('+65');
    });

    it('returns empty string for unknown or null country', () => {
      expect(getCountryCallingCode('')).toBe('');
      expect(getCountryCallingCode(null)).toBe('');
      expect(getCountryCallingCode(undefined)).toBe('');
      expect(getCountryCallingCode('NonExistentLand')).toBe('');
    });
  });
});

