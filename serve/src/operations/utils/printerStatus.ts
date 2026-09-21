import { SIGNAL_STATUS } from '../constants'
import type { PrinterHealthRow, PrintJobRow } from '../api/printers'

export function getSignalStatus(printer: PrinterHealthRow): string {
  return (printer.signal_status || '').toLowerCase()
}

export function isPrinterOffline(printer: PrinterHealthRow): boolean {
  return getSignalStatus(printer) === SIGNAL_STATUS.FAILED
}

export function isPrinterOnline(printer: PrinterHealthRow): boolean {
  const status = getSignalStatus(printer)
  return status === SIGNAL_STATUS.EXCELLENT || status === SIGNAL_STATUS.FAIR
}

export function getPrinterHealthSummary(
  printers: PrinterHealthRow[],
  healthStatus: 'ok' | 'unavailable' | 'error'
) {
  const offline = printers.filter(isPrinterOffline).length
  const online = printers.filter(isPrinterOnline).length
  return {
    total: printers.length,
    online,
    offline,
    healthy: healthStatus === 'ok' && printers.length > 0 && offline === 0,
    indicator:
      healthStatus === 'unavailable' || healthStatus === 'error'
        ? 'unknown'
        : offline > 0 || printers.length === 0
          ? 'bad'
          : 'good',
  } as const
}

export function getPrintJobStatus(job: PrintJobRow): string {
  return (job.status || '').toUpperCase()
}

export function formatSyncTime(timestamp: number | null): string {
  if (!timestamp) return 'Never'
  try {
    return new Date(timestamp).toLocaleTimeString()
  } catch {
    return 'Never'
  }
}

/** Mirrors RN formatSuccessRate. */
export function formatSuccessRate(rate: number | string | null | undefined): string {
  if (rate === null || rate === undefined || rate === '') return '—'
  const value = Number(rate)
  if (Number.isNaN(value)) return String(rate)
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`
}

/**
 * Server timestamps arrive as "YYYY-MM-DD HH:mm:ss" (RN formatLastUpdated).
 */
export function formatLastUpdated(lastUpdated?: string | null): string {
  if (!lastUpdated) return '—'
  const normalized = lastUpdated.includes('T')
    ? lastUpdated
    : lastUpdated.replace(' ', 'T')
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return lastUpdated
  const now = new Date()
  const sameDay =
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate()
  return sameDay
    ? parsed.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })
    : parsed.toLocaleString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        day: 'numeric',
        month: 'short',
      })
}

export function formatPrintJobTime(job: PrintJobRow): string {
  return formatLastUpdated(job.created_at || job.creation || job.modified)
}

/** Client-side filter like RN PrintJobsModal (after full fetch). */
export function filterPrintJobs(
  jobs: PrintJobRow[],
  printer: string | null,
  status: string | null
): PrintJobRow[] {
  return jobs.filter((job) => {
    if (printer) {
      const name = job.printer_name || job.printer || ''
      if (name !== printer) return false
    }
    if (status) {
      if (getPrintJobStatus(job) !== status.toUpperCase()) return false
    }
    return true
  })
}
