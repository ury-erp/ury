import { useCallback, useState } from 'react'
import {
  getUnreadNotificationCount,
  listNotificationPage,
  markNotificationAsRead,
  type NotificationLogRow,
} from '../api/notifications'
import { NOTIFICATION_PAGE_SIZE, NOTIFICATION_POLL_MS } from '../constants'
import { extractServerErrorMessage } from '../types'
import { usePollingGuard } from './usePollingGuard'

export interface UseNotificationsOptions {
  user: string
  enabled?: boolean
  pollMs?: number
  pageSize?: number
}

export function useNotifications({
  user,
  enabled = true,
  pollMs = NOTIFICATION_POLL_MS,
  pageSize = NOTIFICATION_PAGE_SIZE,
}: UseNotificationsOptions) {
  const [rows, setRows] = useState<NotificationLogRow[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [nextStart, setNextStart] = useState(0)
  const [isListEnd, setIsListEnd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const active = Boolean(user) && enabled

  const refreshUnread = useCallback(
    async (generation: number, isCurrent: (g: number) => boolean) => {
      try {
        const count = await getUnreadNotificationCount()
        if (!isCurrent(generation)) return
        setUnreadCount(count)
      } catch (err) {
        if (!isCurrent(generation)) return
        setError(extractServerErrorMessage(err, 'Failed to load unread count'))
      }
    },
    []
  )

  const reloadList = useCallback(
    async (generation: number, isCurrent: (g: number) => boolean) => {
      setLoading(true)
      setError(null)
      try {
        const page = await listNotificationPage(0, pageSize)
        if (!isCurrent(generation)) return
        setRows(page.rows)
        setNextStart(page.nextStart)
        setIsListEnd(page.isListEnd)
      } catch (err) {
        if (!isCurrent(generation)) return
        setError(extractServerErrorMessage(err, 'Failed to load notifications'))
      } finally {
        if (isCurrent(generation)) setLoading(false)
      }
    },
    [pageSize]
  )

  const { isCurrent, refresh } = usePollingGuard(
    active,
    pollMs,
    async (generation) => {
      await refreshUnread(generation, isCurrent)
    }
  )

  const openAndLoad = useCallback(async () => {
    const generation = Date.now()
    await Promise.all([
      reloadList(generation, () => true),
      refreshUnread(generation, () => true),
    ])
  }, [reloadList, refreshUnread])

  const loadMore = useCallback(async () => {
    if (isListEnd || loadingMore || loading) return
    setLoadingMore(true)
    setError(null)
    try {
      const page = await listNotificationPage(nextStart, pageSize)
      setRows((prev) => [...prev, ...page.rows])
      setNextStart(page.nextStart)
      setIsListEnd(page.isListEnd)
    } catch (err) {
      setError(extractServerErrorMessage(err, 'Failed to load more notifications'))
    } finally {
      setLoadingMore(false)
    }
  }, [isListEnd, loadingMore, loading, nextStart, pageSize])

  const markRead = useCallback(
    async (docname: string) => {
      if (!docname || markingId) return
      setMarkingId(docname)
      setError(null)
      const previous = rows
      setRows((prev) =>
        prev.map((row) => (row.name === docname ? { ...row, read: 1 } : row))
      )
      setUnreadCount((c) => Math.max(0, c - 1))
      try {
        await markNotificationAsRead(docname)
        void refresh()
      } catch (err) {
        setRows(previous)
        setError(extractServerErrorMessage(err, 'Failed to mark as read'))
        void refresh()
      } finally {
        setMarkingId(null)
      }
    },
    [markingId, rows, refresh]
  )

  return {
    rows,
    unreadCount,
    loading,
    loadingMore,
    isListEnd,
    markingId,
    error,
    refreshUnread: refresh,
    openAndLoad,
    loadMore,
    markRead,
  }
}
