import { call, db } from '@ury/core'
import {
  FAILED_PRINT_JOB_LIMIT,
  PRINT_JOB_FIELDS,
  PRINT_JOB_FULL_LIMIT,
} from '../constants'
import { isUnavailableError } from '../types'

export interface PrinterHealthRow {
  name?: string
  printer_name?: string
  device_name?: string
  ip_address?: string
  ip?: string
  signal_status?: string
  /** RN PrinterStatusModal field names (not success_count / failed_count). */
  success?: number | string
  failed?: number | string
  success_rate?: number | string
  last_updated?: string
  modified?: string
}

export type PrinterHealthResult =
  | {
      status: 'ok'
      printers: PrinterHealthRow[]
      message?: string
    }
  | {
      status: 'unavailable'
      printers: []
      message: string
    }
  | {
      status: 'error'
      printers: []
      message: string
    }

export interface PrintJobRow {
  name: string
  print_job_id?: string
  job_type?: string
  status?: string
  invoice?: string
  reference_name?: string
  table?: string
  job_owner?: string
  printer?: string
  printer_name?: string
  failure_reason?: string
  created_at?: string
  creation?: string
  modified?: string
}

export interface PrintJobFilters {
  table?: string
  status?: string | string[]
  jobOwner?: string
  printer?: string
  /**
   * Defaults to full listing (`*`), matching RN.
   * Pass a number only for bounded alert polls.
   */
  limit?: number | typeof PRINT_JOB_FULL_LIMIT
}

/**
 * Printer health from optional ury_printer_watch app.
 * Missing module → status "unavailable" (not empty success).
 */
export async function fetchPrinterHealth(): Promise<PrinterHealthResult> {
  try {
    const response = await call.get<{
      message?: {
        success?: boolean
        message?: string
        printers?: PrinterHealthRow[]
      }
    }>('ury_printer_watch.api.printer_health.get_printer_health')

    const message = response?.message
    if (message?.success === false) {
      return {
        status: 'error',
        printers: [],
        message: message.message || 'Unable to fetch printer status',
      }
    }

    return {
      status: 'ok',
      printers: Array.isArray(message?.printers) ? message!.printers! : [],
      message: message?.message,
    }
  } catch (error) {
    if (isUnavailableError(error)) {
      return {
        status: 'unavailable',
        printers: [],
        message:
          'Printer watch is not available on this site (ury_printer_watch).',
      }
    }
    const detail =
      error instanceof Error ? error.message : 'Failed to fetch printer health'
    return { status: 'error', printers: [], message: detail }
  }
}

function buildPrintJobFilters(options: PrintJobFilters = {}) {
  const filters: Array<[string, string, string | string[]]> = []
  if (options.table) filters.push(['table', '=', options.table])
  if (options.status) {
    filters.push(
      Array.isArray(options.status)
        ? ['status', 'in', options.status]
        : ['status', '=', options.status]
    )
  }
  if (options.jobOwner) filters.push(['job_owner', '=', options.jobOwner])
  if (options.printer) {
    filters.push(['printer', '=', options.printer])
  }
  return filters
}

export async function listPrintJobs(
  options: PrintJobFilters = {}
): Promise<PrintJobRow[]> {
  const limit = options.limit ?? PRINT_JOB_FULL_LIMIT
  const docs = await db.getDocList('URY Print Job', {
    fields: [...PRINT_JOB_FIELDS],
    filters: buildPrintJobFilters(options),
    limit,
    orderBy: { field: 'modified', order: 'desc' },
  } as unknown as Parameters<typeof db.getDocList>[1])
  return (Array.isArray(docs) ? docs : []) as PrintJobRow[]
}

export async function listFailedPrintJobsForUser(
  user: string
): Promise<PrintJobRow[]> {
  return listPrintJobs({
    status: ['Failed', 'failed', 'FAILED'],
    jobOwner: user,
    limit: FAILED_PRINT_JOB_LIMIT,
  })
}
