/**
 * Parses a Frappe API error object into a human-readable string.
 *
 * The frappe-js-sdk throws a plain object (not an Error instance) when an API
 * call fails. The object is shaped as:
 *
 *   {
 *     ...error.response.data,          // _server_messages, exc, exc_type, etc.
 *     httpStatus: number,
 *     httpStatusText: string,
 *     message: string,                 // top-level Frappe message (may be generic)
 *     exception: string,               // short exception string
 *   }
 *
 * When Frappe raises a ValidationError via frappe.throw(), the actual
 * user-facing message lives in `_server_messages` (a JSON-encoded array of
 * JSON-encoded {message, title, indicator} objects). The top-level `.message`
 * is often a generic wrapper like "There was an error." or
 * "Error while settling order: ...".
 *
 * This utility normalizes all Frappe error shapes into a single display string,
 * preferring the richest user-readable content available.
 */
export function parseFrappeError(err: unknown, fallback = 'An unexpected error occurred.'): string {
  if (!err || typeof err !== 'object') {
    if (err instanceof Error) return err.message;
    return fallback;
  }

  const e = err as Record<string, unknown>;

  // Priority 1: _server_messages — richest human-readable validation message
  // from frappe.throw() / frappe.msgprint()
  if (typeof e._server_messages === 'string' && e._server_messages) {
    try {
      const messages: string[] = JSON.parse(e._server_messages);
      if (Array.isArray(messages) && messages.length > 0) {
        const first: { message?: string } = JSON.parse(messages[0]);
        if (first.message) {
          // Strip HTML tags — Frappe sometimes wraps messages in <b>, <p>, etc.
          return first.message.replace(/<[^>]*>/g, '').trim();
        }
      }
    } catch {
      // Parsing failed — fall through to next strategy
    }
  }

  // Priority 2: top-level .message if it is not the generic SDK fallback
  if (
    typeof e.message === 'string' &&
    e.message &&
    e.message !== 'There was an error.'
  ) {
    return e.message;
  }

  return fallback;
}
