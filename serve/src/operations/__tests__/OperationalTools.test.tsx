import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OperationalTools } from '../components/OperationalTools'

vi.mock('../api/notifications', () => ({
  listNotificationPage: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  markNotificationAsRead: vi.fn(),
}))

vi.mock('../api/printers', () => ({
  fetchPrinterHealth: vi.fn(),
  listPrintJobs: vi.fn(),
  listFailedPrintJobsForUser: vi.fn(),
}))

import {
  getUnreadNotificationCount,
  listNotificationPage,
  markNotificationAsRead,
} from '../api/notifications'
import { fetchPrinterHealth, listPrintJobs } from '../api/printers'

const unreadMock = vi.mocked(getUnreadNotificationCount)
const listNotifMock = vi.mocked(listNotificationPage)
const markReadMock = vi.mocked(markNotificationAsRead)
const healthMock = vi.mocked(fetchPrinterHealth)
const jobsMock = vi.mocked(listPrintJobs)

describe('OperationalTools', () => {
  beforeEach(() => {
    unreadMock.mockReset()
    listNotifMock.mockReset()
    markReadMock.mockReset()
    healthMock.mockReset()
    jobsMock.mockReset()

    unreadMock.mockResolvedValue(2)
    listNotifMock.mockResolvedValue({
      rows: [
        {
          name: 'N-1',
          subject: 'Order delayed',
          email_content: '<b>Table 4</b>',
          read: 0,
          creation: '2026-09-07 10:00:00',
        },
      ],
      nextStart: 15,
      isListEnd: true,
    })
    healthMock.mockResolvedValue({
      status: 'ok',
      printers: [
        {
          printer_name: 'Bill',
          signal_status: 'excellent',
          ip_address: '10.0.0.8',
        },
      ],
    })
    jobsMock.mockResolvedValue([])
  })

  it('polls unread on mount and opens paginated notifications', async () => {
    const user = userEvent.setup()
    render(
      <OperationalTools
        user="captain@example.com"
        posProfile="POS-MAIN"
        branch="Main"
        pollingEnabled
      />
    )

    await waitFor(() => expect(unreadMock).toHaveBeenCalled())

    await user.click(
      screen.getByRole('button', { name: /Notifications, 2 unread/i })
    )

    expect(await screen.findByText('Order delayed')).toBeInTheDocument()
    expect(screen.getByText(/Table 4/)).toBeInTheDocument()

    await user.click(screen.getByText('Order delayed'))
    await waitFor(() =>
      expect(markReadMock).toHaveBeenCalledWith('N-1')
    )
  })

  it('shows printer watch unavailable instead of empty success', async () => {
    healthMock.mockResolvedValue({
      status: 'unavailable',
      printers: [],
      message: 'Printer watch is not available on this site (ury_printer_watch).',
    })

    const user = userEvent.setup()
    render(
      <OperationalTools
        user="captain@example.com"
        posProfile="POS-MAIN"
        pollingEnabled={false}
      />
    )

    // still allow manual open; trigger one health fetch via enabling poll false
    // so call refresh by opening dialog after priming mock
    healthMock.mockClear()
    healthMock.mockResolvedValue({
      status: 'unavailable',
      printers: [],
      message: 'Printer watch is not available on this site (ury_printer_watch).',
    })

    // With polling disabled, open dialog and Sync to fetch
    await user.click(screen.getByRole('button', { name: /Printer status/i }))
    // Dialog may show empty until sync — click Sync
    const sync = await screen.findByRole('button', { name: /^Sync$/i })
    await user.click(sync)

    expect(
      await screen.findByText(/Printer watch unavailable/i)
    ).toBeInTheDocument()
  })
})
