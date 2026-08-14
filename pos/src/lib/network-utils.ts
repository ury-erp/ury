/**
 * Returns true when an error looks like a transport/network failure (offline,
 * timeout, connection refused, etc.) rather than a deterministic server
 * response/validation error.
 *
 * Server response errors (Frappe ValidationError, HTTP 4xx/5xx, etc.) must
 * return false so the caller can surface the alert toast to the UI instead of
 * silently queueing the request offline.
 */
export function isNetworkError(error: any): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return true;
  }
  if (!error) return false;

  // Server response (Frappe ValidationError, HTTP status 4xx/5xx) -> NOT a network failure
  if (
    error._server_messages ||
    error.exception ||
    error.exc ||
    error.exc_type ||
    error.httpStatus ||
    error.status_code ||
    (typeof error.status === 'number' && error.status >= 400) ||
    error.response?.status
  ) {
    return false;
  }

  const msg = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  const code = typeof error.code === 'string' ? error.code.toLowerCase() : '';
  const name = typeof error.name === 'string' ? error.name : '';

  return (
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('networkerror') ||
    msg.includes('network disconnected') ||
    msg.includes('connection refused') ||
    msg.includes('net::err') ||
    msg.includes('timeout') ||
    code === 'econnaborted' ||
    code === 'etimedout' ||
    name === 'TypeError'
  );
}
