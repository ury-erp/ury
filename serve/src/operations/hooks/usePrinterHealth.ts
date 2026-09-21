import { useCallback, useState } from 'react'
import {
  fetchPrinterHealth,
  listPrintJobs,
  type PrinterHealthResult,
  type PrinterHealthRow,
  type PrintJobFilters,
  type PrintJobRow,
} from '../api/printers'
import { PRINTER_POLL_MS } from '../constants'
import { extractServerErrorMessage } from '../types'
import { getPrinterHealthSummary } from '../utils/printerStatus'
import { usePollingGuard } from './usePollingGuard'

export interface UsePrinterHealthOptions {
  user: string
  enabled?: boolean
  pollMs?: number
}

export function usePrinterHealth({
  user,
  enabled = true,
  pollMs = PRINTER_POLL_MS,
}: UsePrinterHealthOptions) {
  const [health, setHealth] = useState<PrinterHealthResult>({
    status: 'ok',
    printers: [],
  })
  const [loading, setLoading] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const [jobs, setJobs] = useState<PrintJobRow[]>([])
  const [jobsLoading, setJobsLoading] = useState(false)
  const [jobsError, setJobsError] = useState<string | null>(null)
  const [jobsSyncedAt, setJobsSyncedAt] = useState<number | null>(null)
  const [selectedJob, setSelectedJob] = useState<PrintJobRow | null>(null)

  const active = Boolean(user) && enabled

  const { refresh } = usePollingGuard(
    active,
    pollMs,
    async (generation, isCurrent) => {
      setLoading(true)
      try {
        const result = await fetchPrinterHealth()
        if (!isCurrent(generation)) return
        setHealth(result)
        if (result.status === 'ok') {
          setLastSyncedAt(Date.now())
        }
      } finally {
        if (isCurrent(generation)) setLoading(false)
      }
    }
  )

  const loadJobs = useCallback(async (filters: PrintJobFilters = {}) => {
    setJobsLoading(true)
    setJobsError(null)
    try {
      const docs = await listPrintJobs(filters)
      setJobs(docs)
      setJobsSyncedAt(Date.now())
    } catch (err) {
      setJobs([])
      setJobsError(extractServerErrorMessage(err, 'Failed to load print jobs'))
    } finally {
      setJobsLoading(false)
    }
  }, [])

  const printers: PrinterHealthRow[] =
    health.status === 'ok' ? health.printers : []
  const summary = getPrinterHealthSummary(printers, health.status)

  return {
    health,
    printers,
    summary,
    loading,
    lastSyncedAt,
    refreshHealth: refresh,
    jobs,
    jobsLoading,
    jobsError,
    jobsSyncedAt,
    loadJobs,
    selectedJob,
    setSelectedJob,
  }
}
