import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import {
  usePrintJobsRealtime,
  type PrintFailureAlertPayload,
} from './usePrintJobsRealtime'

vi.mock('@ury/core', () => ({
  db: {
    getDocList: vi.fn(),
  },
}))

import { db } from '@ury/core'

const getDocList = vi.mocked(db.getDocList)

type Handler = (payload: unknown) => void

function createFakeSocket() {
  const handlers = new Map<string, Set<Handler>>()
  return {
    on(event: string, cb: Handler) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(cb)
    },
    off(event: string, cb: Handler) {
      handlers.get(event)?.delete(cb)
    },
    emit(event: string, payload: unknown) {
      handlers.get(event)?.forEach((cb) => cb(payload))
    },
    listenerCount(event: string) {
      return handlers.get(event)?.size ?? 0
    },
  }
}

const fakeSocket = createFakeSocket()

vi.mock('../../lib/realtime', () => ({
  getRealtimeSocket: vi.fn(() => Promise.resolve(fakeSocket)),
}))

function Harness({
  user,
  onAlert,
}: {
  user: string
  onAlert?: (payload: PrintFailureAlertPayload) => void
}) {
  const { jobs } = usePrintJobsRealtime({ user, onFailureAlert: onAlert })
  return createElement(
    'ul',
    null,
    jobs.map((job) =>
      createElement(
        'li',
        { key: job.name, 'data-testid': `job-${job.name}` },
        `${job.name}:${job.status ?? 'UNKNOWN'}`
      )
    )
  )
}

describe('usePrintJobsRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDocList.mockResolvedValue([
      { name: 'PJ-1', print_job_id: 'PJ-1', status: 'QUEUED' },
    ])
  })

  it('fetches the print job list on mount', async () => {
    render(createElement(Harness, { user: "captain@example.com" }))
    expect(await screen.findByText('PJ-1:QUEUED')).toBeInTheDocument()
    expect(getDocList).toHaveBeenCalledWith(
      'URY Print Job',
      expect.objectContaining({ limit: '*' })
    )
  })

  it('transitions a job row from QUEUED to FAILED on print_job_status_updated', async () => {
    render(createElement(Harness, { user: "captain@example.com" }))
    expect(await screen.findByText('PJ-1:QUEUED')).toBeInTheDocument()

    act(() => {
      fakeSocket.emit('print_job_status_updated', {
        print_job_id: 'PJ-1',
        status: 'FAILED',
        failure_reason: 'No paper',
      })
    })

    expect(screen.getByText('PJ-1:FAILED')).toBeInTheDocument()
    expect(screen.queryByText('PJ-1:QUEUED')).toBeNull()
  })

  it('suppresses print_failure_alert events owned by another user', async () => {
    const onAlert = vi.fn()
    render(createElement(Harness, { user: "captain@example.com", onAlert }))
    expect(await screen.findByText('PJ-1:QUEUED')).toBeInTheDocument()

    act(() => {
      fakeSocket.emit('print_failure_alert', {
        print_job_id: 'PJ-1',
        job_owner: 'someone-else@example.com',
        reason: 'CUPS error',
      })
    })

    // Other owner's alert must neither flip the row nor fire the callback.
    expect(screen.getByText('PJ-1:QUEUED')).toBeInTheDocument()
    expect(onAlert).not.toHaveBeenCalled()
  })

  it('applies print_failure_alert for the current user and fires onAlert', async () => {
    const onAlert = vi.fn()
    render(createElement(Harness, { user: "captain@example.com", onAlert }))
    expect(await screen.findByText('PJ-1:QUEUED')).toBeInTheDocument()

    act(() => {
      fakeSocket.emit('print_failure_alert', {
        print_job_id: 'PJ-1',
        job_owner: 'Captain@Example.com',
        reason: 'Printer offline',
        invoice: 'INV-1',
      })
    })

    expect(screen.getByText('PJ-1:FAILED')).toBeInTheDocument()
    expect(onAlert).toHaveBeenCalledWith(
      expect.objectContaining({ print_job_id: 'PJ-1', reason: 'Printer offline' })
    )
  })

  it('resyncs from the server when the socket reconnects', async () => {
    render(createElement(Harness, { user: "captain@example.com" }))
    expect(await screen.findByText('PJ-1:QUEUED')).toBeInTheDocument()
    const callsBefore = getDocList.mock.calls.length

    act(() => {
      fakeSocket.emit('connect', {})
    })

    await waitFor(() =>
      expect(getDocList.mock.calls.length).toBeGreaterThan(callsBefore)
    )
  })

  it('removes socket listeners on unmount', async () => {
    const { unmount } = render(createElement(Harness, { user: "captain@example.com" }))
    await screen.findByText('PJ-1:QUEUED')

    await waitFor(() => {
      expect(fakeSocket.listenerCount('print_job_status_updated')).toBe(1)
      expect(fakeSocket.listenerCount('print_failure_alert')).toBe(1)
    })

    unmount()

    expect(fakeSocket.listenerCount('print_job_status_updated')).toBe(0)
    expect(fakeSocket.listenerCount('print_failure_alert')).toBe(0)
  })
})
