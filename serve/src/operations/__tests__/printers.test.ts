import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fetchPrinterHealth, listPrintJobs } from '../api/printers'
import { isUnavailableError } from '../types'
import {
  getPrinterHealthSummary,
  getPrintJobStatus,
  formatSuccessRate,
  formatLastUpdated,
  filterPrintJobs,
} from '../utils/printerStatus'

vi.mock('@ury/core', () => ({
  call: {
    get: vi.fn(),
    post: vi.fn(),
  },
  db: {
    getDocList: vi.fn(),
  },
}))

import { call, db } from '@ury/core'

const callGet = vi.mocked(call.get)
const getDocList = vi.mocked(db.getDocList)

describe('printers API', () => {
  beforeEach(() => {
    callGet.mockReset()
    getDocList.mockReset()
  })

  it('maps missing ury_printer_watch to unavailable (not empty ok)', async () => {
    callGet.mockRejectedValue({
      exception: 'ModuleNotFoundError: No module named ury_printer_watch',
      httpStatus: 404,
    })

    const result = await fetchPrinterHealth()
    expect(result.status).toBe('unavailable')
    expect(result.printers).toEqual([])
    expect(result.message).toMatch(/not available/i)
  })

  it('returns ok with printers when watch succeeds', async () => {
    callGet.mockResolvedValue({
      message: {
        success: true,
        printers: [{ printer_name: 'Kitchen', signal_status: 'excellent' }],
      },
    })

    const result = await fetchPrinterHealth()
    expect(result).toEqual({
      status: 'ok',
      printers: [{ printer_name: 'Kitchen', signal_status: 'excellent' }],
      message: undefined,
    })
  })

  it('treats success:false as error status', async () => {
    callGet.mockResolvedValue({
      message: { success: false, message: 'CUPS down', printers: [] },
    })
    const result = await fetchPrinterHealth()
    expect(result.status).toBe('error')
    expect(result.message).toBe('CUPS down')
  })

  it('lists print jobs with full listing by default (no silent 100 cap)', async () => {
    getDocList.mockResolvedValue([{ name: 'JOB-1', status: 'Failed' }])
    const rows = await listPrintJobs({
      table: 'T1',
      status: ['Failed', 'failed'],
      jobOwner: 'captain@example.com',
    })
    expect(rows).toEqual([{ name: 'JOB-1', status: 'Failed' }])
    expect(getDocList).toHaveBeenCalledWith(
      'URY Print Job',
      expect.objectContaining({
        limit: '*',
        filters: expect.arrayContaining([
          ['table', '=', 'T1'],
          ['status', 'in', ['Failed', 'failed']],
          ['job_owner', '=', 'captain@example.com'],
        ]),
      })
    )
  })

  it('allows an explicit numeric limit for bounded alert polls', async () => {
    getDocList.mockResolvedValue([])
    await listPrintJobs({ limit: 20, jobOwner: 'u@x.com' })
    expect(getDocList).toHaveBeenCalledWith(
      'URY Print Job',
      expect.objectContaining({ limit: 20 })
    )
  })
})

describe('printerStatus helpers', () => {
  it('marks unavailable health as unknown indicator', () => {
    const summary = getPrinterHealthSummary([], 'unavailable')
    expect(summary.indicator).toBe('unknown')
    expect(summary.healthy).toBe(false)
  })

  it('marks offline printers as bad', () => {
    const summary = getPrinterHealthSummary(
      [{ signal_status: 'failed' }],
      'ok'
    )
    expect(summary.indicator).toBe('bad')
    expect(summary.offline).toBe(1)
  })

  it('formats RN success_rate and last_updated', () => {
    expect(formatSuccessRate(99.5)).toBe('99.5%')
    expect(formatSuccessRate(null)).toBe('—')
    expect(formatLastUpdated('')).toBe('—')
  })

  it('filters jobs client-side by printer and status', () => {
    const jobs = [
      { name: '1', printer_name: 'Bill', status: 'FAILED' },
      { name: '2', printer_name: 'Kitchen', status: 'COMPLETED' },
      { name: '3', printer: 'Bill', status: 'queued' },
    ]
    expect(filterPrintJobs(jobs, 'Bill', null)).toHaveLength(2)
    expect(filterPrintJobs(jobs, null, 'FAILED')).toHaveLength(1)
  })

  it('normalizes job status', () => {
    expect(getPrintJobStatus({ name: 'a', status: 'failed' })).toBe('FAILED')
  })
})

describe('isUnavailableError', () => {
  it('detects module missing strings', () => {
    expect(
      isUnavailableError({
        exception: 'No module named ury_printer_watch',
      })
    ).toBe(true)
    expect(isUnavailableError(new Error('timeout'))).toBe(false)
  })
})
