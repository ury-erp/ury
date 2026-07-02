/**
 * Safely extracts a human-readable error message from an unknown error value.
 *
 * Handles:
 * - Native Error instances (uses .message)
 * - Frappe API errors containing _server_messages (double-JSON.parse pattern)
 * - Fallback for everything else
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  const obj = error as Record<string, unknown> | null | undefined;
  const serverMessages = obj?._server_messages;
  if (typeof serverMessages === 'string') {
    try {
      const parsed = JSON.parse(serverMessages);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = JSON.parse(parsed[0] as string);
        if (first?.message) {
          return first.message as string;
        }
      }
    } catch {
      // fall through to default
    }
  }

  return 'An unexpected error occurred';
}