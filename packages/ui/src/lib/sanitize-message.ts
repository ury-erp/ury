import DOMPurify, { type Config } from 'dompurify';

const MESSAGE_HTML_CONFIG: Config = {
  ALLOWED_TAGS: ['strong', 'b', 'em', 'i', 'br'],
  ALLOWED_ATTR: [],
};

/**
 * Sanitize Frappe/server HTML for safe display (e.g. toast with emphasis).
 * Allows only basic formatting tags; strips scripts, attributes, and links.
 */
export function sanitizeMessageHtml(input: string): string {
  if (!input) return '';
  return DOMPurify.sanitize(input, MESSAGE_HTML_CONFIG);
}

/**
 * Sanitize then extract plain text — for inline error strings / setState
 * paths that must never use dangerouslySetInnerHTML.
 */
export function messageToPlainText(input: string): string {
  const sanitized = sanitizeMessageHtml(input);
  if (!sanitized) return '';
  if (typeof DOMParser === 'undefined') {
    return sanitized.replace(/<[^>]*>/g, '');
  }
  const doc = new DOMParser().parseFromString(sanitized, 'text/html');
  return doc.body.textContent ?? '';
}
