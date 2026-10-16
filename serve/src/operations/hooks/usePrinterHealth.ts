import { useCallback, useEffect, useState } from 'react'
import type { Socket } from 'socket.io-client'
import {
  fetchPrinterHealth,
  listPrintJobs,
  type PrinterHealthResult,
  type PrinterHealthRow,
  type PrintJobFilters,
  type PrintJobRow,
} from '../api/printers'
import { PRINTER_POLL_MS } from '../constants'
import { getRealtimeSocket } from '../../lib/realtime'
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

  // The 30s poll stays the baseline; a `printer_health_alert` socket event
  // means a printer changed state, so refetch immediately instead of waiting
  // for the next tick.
  useEffect(() => {
    if (!active) return

    let activeSocket: Socket | null = null
    let cancelled = false

    const handleHealthAlert = () => {
      void refresh()
    }

    getRealtimeSocket()
      .then((s) => {
        if (cancelled) return
        activeSocket = s
        s.on('printer_health_alert', handleHealthAlert)
      })
      .catch((error) => {
        console.error('Failed to subscribe to printer health alerts:', error)
      })

    return () => {
      cancelled = true
      activeSocket?.off('printer_health_alert', handleHealthAlert)
    }
  }, [active, refresh])

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
