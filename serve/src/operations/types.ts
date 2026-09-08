/** Shared prop contract for operational Serve components (no store coupling). */
export interface OperationsIdentityProps {
  /** Session user id (Frappe User.name). */
  user: string
  /** POS Profile name. */
  posProfile: string
  /** Optional branch for display / future scoping. */
  branch?: string
}

export function extractServerErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && '_server_messages' in error) {
    const raw = (error as { _server_messages?: unknown })._server_messages
    if (typeof raw === 'string') {
      try {
        const messages = JSON.parse(raw)
        const first = JSON.parse(messages[0])
        if (first?.message) return String(first.message)
      } catch {
        // fall through
      }
    }
  }
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object' && 'exception' in error) {
    const exception = String((error as { exception?: unknown }).exception ?? '')
    const afterColon = exception.split(':').slice(1).join(':').trim()
    if (afterColon) return afterColon
    if (exception) return exception
  }
  return fallback
}

/** True when the method/module is missing (e.g. ury_printer_watch not installed). */
export function isUnavailableError(error: unknown): boolean {
  const text = [
    error instanceof Error ? error.message : '',
    typeof error === 'string' ? error : '',
    error && typeof error === 'object' && 'exception' in error
      ? String((error as { exception?: unknown }).exception ?? '')
      : '',
    error && typeof error === 'object' && 'httpStatus' in error
      ? String((error as { httpStatus?: unknown }).httpStatus ?? '')
      : '',
    error && typeof error === 'object' && 'status' in error
      ? String((error as { status?: unknown }).status ?? '')
      : '',
  ]
    .join(' ')
    .toLowerCase()

  return (
    text.includes('ury_printer_watch') ||
    text.includes('modulenotfound') ||
    text.includes('no module named') ||
    text.includes('not found') ||
    text.includes('404') ||
    text.includes('does not exist') ||
    text.includes('unknown method')
  )
}
