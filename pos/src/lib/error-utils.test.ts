import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getErrorMessage } from './error-utils';

describe('getErrorMessage', () => {
  it('should extract message from Error instances', () => {
    expect(getErrorMessage(new Error('Something went wrong'))).toBe('Something went wrong');
  });

  it('should extract message from TypeError', () => {
    expect(getErrorMessage(new TypeError('Invalid type'))).toBe('Invalid type');
  });

  it('should parse Frappe _server_messages format', () => {
    const serverMsg = JSON.stringify([JSON.stringify({ message: 'Item already exists' })]);
    const error = { _server_messages: serverMsg };
    expect(getErrorMessage(error)).toBe('Item already exists');
  });

  it('should return default message for null/undefined', () => {
    expect(getErrorMessage(null)).toBe('An unexpected error occurred');
    expect(getErrorMessage(undefined)).toBe('An unexpected error occurred');
  });

  it('should return default message for non-Error primitives', () => {
    expect(getErrorMessage('just a string')).toBe('An unexpected error occurred');
    expect(getErrorMessage(42)).toBe('An unexpected error occurred');
  });

  it('should return default message for malformed _server_messages', () => {
    const error = { _server_messages: 'not-valid-json' };
    expect(getErrorMessage(error)).toBe('An unexpected error occurred');
  });

  it('should return default message for empty _server_messages array', () => {
    const error = { _server_messages: '[]' };
    expect(getErrorMessage(error)).toBe('An unexpected error occurred');
  });

  it('should handle _server_messages with missing message field', () => {
    const serverMsg = JSON.stringify([JSON.stringify({ alert: 'no message field' })]);
    const error = { _server_messages: serverMsg };
    expect(getErrorMessage(error)).toBe('An unexpected error occurred');
  });

  it('should handle nested Frappe error with multiple server messages', () => {
    const serverMsg = JSON.stringify([
      JSON.stringify({ message: 'First error message' }),
      JSON.stringify({ message: 'Second error message' }),
    ]);
    const error = { _server_messages: serverMsg };
    // Should return the first message
    expect(getErrorMessage(error)).toBe('First error message');
  });
});
