import { describe, expect, it } from 'vitest';
import { messageToPlainText, sanitizeMessageHtml } from './sanitize-message';

describe('sanitizeMessageHtml', () => {
  it('keeps allowed emphasis tags', () => {
    const input =
      'Field <strong>require_active_menu_for_planning</strong> does not exist on <strong>URY Production Settings</strong>';
    expect(sanitizeMessageHtml(input)).toBe(input);
  });

  it('strips script tags and event handlers', () => {
    expect(sanitizeMessageHtml('<script>alert(1)</script>Safe')).toBe('Safe');
    expect(sanitizeMessageHtml('<img src=x onerror=alert(1)>')).toBe('');
    expect(sanitizeMessageHtml('<b onclick="evil()">Bold</b>')).toBe('<b>Bold</b>');
  });

  it('strips disallowed tags but keeps their text', () => {
    expect(sanitizeMessageHtml('<a href="https://evil.example">click</a>')).toBe('click');
    expect(sanitizeMessageHtml('<p>Hello</p>')).toBe('Hello');
  });

  it('leaves plain strings unchanged', () => {
    expect(sanitizeMessageHtml('No HTML here')).toBe('No HTML here');
    expect(sanitizeMessageHtml('')).toBe('');
  });
});

describe('messageToPlainText', () => {
  it('strips tags after sanitize', () => {
    expect(
      messageToPlainText(
        'Field <strong>require_active_menu_for_planning</strong> does not exist on <strong>URY Production Settings</strong>'
      )
    ).toBe('Field require_active_menu_for_planning does not exist on URY Production Settings');
  });

  it('does not leave script content', () => {
    expect(messageToPlainText('<script>alert(1)</script>oops')).toBe('oops');
  });
});
