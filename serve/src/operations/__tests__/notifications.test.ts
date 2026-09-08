import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  getUnreadNotificationCount,
  listNotificationPage,
  markNotificationAsRead,
} from '../api/notifications'

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

const callPost = vi.mocked(call.post)
const getDocList = vi.mocked(db.getDocList)

describe('notifications API', () => {
  beforeEach(() => {
    callPost.mockReset()
    getDocList.mockReset()
  })

  it('pages Notification Log newest first', async () => {
    getDocList.mockResolvedValue([
      { name: 'N-1', subject: 'A', read: 0 },
      { name: 'N-2', subject: 'B', read: 1 },
    ])

    const page = await listNotificationPage(0, 15)
    expect(page.rows).toHaveLength(2)
    expect(page.isListEnd).toBe(true)
    expect(getDocList).toHaveBeenCalledWith(
      'Notification Log',
      expect.objectContaining({
        limit: 15,
        limit_start: 0,
        orderBy: { field: 'creation', order: 'desc' },
      })
    )
  })

  it('marks read via Frappe notification_log.mark_as_read', async () => {
    callPost.mockResolvedValue({})
    await markNotificationAsRead('NOTIF-9')
    expect(callPost).toHaveBeenCalledWith(
      'frappe.desk.doctype.notification_log.notification_log.mark_as_read',
      { docname: 'NOTIF-9' }
    )
  })

  it('reads unread count with aggregation fallback', async () => {
    getDocList.mockResolvedValueOnce([{ unread_count: 4 }])
    await expect(getUnreadNotificationCount()).resolves.toBe(4)

    getDocList
      .mockRejectedValueOnce(new Error('count unsupported'))
      .mockResolvedValueOnce([{ name: 'a' }, { name: 'b' }])
    await expect(getUnreadNotificationCount()).resolves.toBe(2)
  })
})
