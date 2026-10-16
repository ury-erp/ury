import { useCallback, useEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { db } from '@ury/core'
import { getRealtimeSocket } from '../../lib/realtime'
import type { PrintJobRow } from '../api/printers'
import { PRINT_JOB_FIELDS, PRINT_JOB_FULL_LIMIT } from '../constants'
import { extractServerErrorMessage } from '../types'

export interface PrintJobStatusPayload {
  print_job_id?: string
  name?: string
  invoice?: string
  reference_name?: string
  job_type?: string
  table?: string
  job_owner?: string
  printer?: string
  printer_name?: string
  status?: string
  reason?: string
  failure_reason?: string
  creation?: string
  modified?: string
}

export interface PrintFailureAlertPayload {
  print_job_id?: string
  invoice?: string
  reference_name?: string
  printer_name?: string
  reason?: string
  job_type?: string
  job_owner?: string
}

export interface UsePrintJobsRealtimeOptions {
  user: string
  enabled?: boolean
  /** Called only for failure alerts owned by (or unowned and targeted at) the current user. */
  onFailureAlert?: (payload: PrintFailureAlertPayload) => void
}

function jobKey(payload: PrintJobStatusPayload): string {
  return payload.print_job_id || payload.name || ''
}

function applyStatusUpdate(prev: PrintJobRow[], payload: PrintJobStatusPayload) {
  const key = jobKey(payload)
  if (!key) return prev
  const patch: Partial<PrintJobRow> = {}
  if (payload.status !== undefined) patch.status = payload.status
  if (payload.invoice !== undefined) patch.invoice = payload.invoice
  if (payload.reference_name !== undefined)
    patch.reference_name = payload.reference_name
  if (payload.job_type !== undefined) patch.job_type = payload.job_type
  if (payload.table !== undefined) patch.table = payload.table
  if (payload.job_owner !== undefined) patch.job_owner = payload.job_owner
  if (payload.printer !== undefined) patch.printer = payload.printer
  if (payload.printer_name !== undefined)
    patch.printer_name = payload.printer_name
  if (payload.reason !== undefined || payload.failure_reason !== undefined)
    patch.failure_reason = payload.failure_reason ?? payload.reason
  if (payload.modified !== undefined) patch.modified = payload.modified

  const index = prev.findIndex((j) => j.name === key || j.print_job_id === key)
  if (index === -1) {
    const row: PrintJobRow = { name: key, ...patch }
    return [row, ...prev]
  }
  const next = prev.slice()
  next[index] = { ...next[index], ...patch }
  return next
}

/**
 * Live URY Print Job table: initial `db.getDocList` fetch plus realtime
 * `print_job_status_updated` patches applied in place. The socket `connect`
 * event triggers a full resync (socket.io reconnects lose no server state,
 * but the listing may have drifted while disconnected).
 *
 * `print_failure_alert` is filtered to the current user: alerts owned by a
 * different `job_owner` are dropped, matching the POS behavior.
 */
export function usePrintJobsRealtime({
  user,
  enabled = true,
  onFailureAlert,
}: UsePrintJobsRealtimeOptions) {
  const [jobs, setJobs] = useState<PrintJobRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncedAt, setSyncedAt] = useState<number | null>(null)
  const [selectedJob, setSelectedJob] = useState<PrintJobRow | null>(null)
  const onFailureAlertRef = useRef(onFailureAlert)

  useEffect(() => {
    onFailureAlertRef.current = onFailureAlert
  }, [onFailureAlert])

  const active = Boolean(user) && enabled

  const resync = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const docs = await db.getDocList('URY Print Job', {
        fields: [...PRINT_JOB_FIELDS],
        filters: [],
        limit: PRINT_JOB_FULL_LIMIT,
        orderBy: { field: 'modified', order: 'desc' },
      } as unknown as Parameters<typeof db.getDocList>[1])
      setJobs((Array.isArray(docs) ? docs : []) as PrintJobRow[])
      setSyncedAt(Date.now())
    } catch (err) {
      setError(extractServerErrorMessage(err, 'Failed to load print jobs'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!active) return

    let activeSocket: Socket | null = null
    let cancelled = false

    void resync()

    const handleStatusUpdate = (payload: PrintJobStatusPayload) => {
      setJobs((prev) => applyStatusUpdate(prev, payload))
    }

    const handleFailureAlert = (payload: PrintFailureAlertPayload) => {
      // Drop alerts owned by someone else; unowned alerts still surface.
      if (
        payload.job_owner &&
        user &&
        payload.job_owner.trim().toLowerCase() !== user.trim().toLowerCase()
      ) {
        return
      }
      setJobs((prev) =>
        applyStatusUpdate(prev, { ...payload, status: 'FAILED' })
      )
      onFailureAlertRef.current?.(payload)
    }

    getRealtimeSocket()
      .then((s) => {
        if (cancelled) return
        activeSocket = s
        s.on('print_job_status_updated', handleStatusUpdate)
        s.on('print_failure_alert', handleFailureAlert)
        s.on('connect', resync)
      })
      .catch((err) => {
        console.error('Failed to subscribe to print job realtime events:', err)
      })

    return () => {
      cancelled = true
      if (!activeSocket) return
      activeSocket.off('print_job_status_updated', handleStatusUpdate)
      activeSocket.off('print_failure_alert', handleFailureAlert)
      activeSocket.off('connect', resync)
    }
  }, [active, user, resync])

  return {
    jobs,
    loading,
    error,
    syncedAt,
    resync,
    selectedJob,
    setSelectedJob,
  }
}
