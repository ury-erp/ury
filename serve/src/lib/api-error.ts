export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback
  const value = error as { _server_messages?: string; message?: string; exception?: string }
  if (value._server_messages) {
    try {
      const messages = JSON.parse(value._server_messages) as string[]
      const message = JSON.parse(messages[0]).message
      if (typeof message === 'string') return message.replace(/<[^>]*>/g, '')
    } catch {
      // Malformed server messages must not hide the original error.
    }
  }
  return value.message || value.exception || fallback
}
