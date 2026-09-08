/** Poll intervals and list page sizes for Serve operational tools. */
export const NOTIFICATION_POLL_MS = 15_000
export const NOTIFICATION_PAGE_SIZE = 15

export const PRINTER_POLL_MS = 30_000
/** Failed-job alert poll stays bounded (RN FAILED_PRINT_JOB_LIMIT). */
export const FAILED_PRINT_JOB_LIMIT = 20
/**
 * Full listing matches RN `limit: "*"` (FEATURES: all URY Print Job records).
 * Do not silently cap the jobs dialog.
 */
export const PRINT_JOB_FULL_LIMIT = '*' as const

/**
 * Fields actually read by RN PrintJobsModal / PrinterContext.
 * cups_job_id / cups_state_reason appear in FEATURES.md prose but are not
 * requested or rendered by the RN modal — omit to avoid schema errors.
 */
export const PRINT_JOB_FIELDS = [
  'name',
  'print_job_id',
  'job_type',
  'status',
  'invoice',
  'reference_name',
  'table',
  'job_owner',
  'printer',
  'printer_name',
  'failure_reason',
  'created_at',
  'creation',
  'modified',
] as const

export const SIGNAL_STATUS = {
  EXCELLENT: 'excellent',
  FAIR: 'fair',
  FAILED: 'failed',
  PROCESSING: 'processing',
} as const
