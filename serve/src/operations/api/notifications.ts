import { call, db } from '@ury/core'
import { NOTIFICATION_PAGE_SIZE } from '../constants'

export interface NotificationLogRow {
  name: string
  subject?: string
  email_content?: string
  read?: number
  creation?: string
  for_user?: string
}

export interface NotificationPage {
  rows: NotificationLogRow[]
  nextStart: number
  isListEnd: boolean
}

/**
 * Paginated Notification Log for the session user (Frappe scopes by permission).
 */
export async function listNotificationPage(
  start = 0,
  limit = NOTIFICATION_PAGE_SIZE
): Promise<NotificationPage> {
  const rows = (await db.getDocList('Notification Log', {
    fields: ['name', 'subject', 'email_content', 'read', 'creation', 'for_user'],
    orderBy: { field: 'creation', order: 'desc' },
    limit,
    limit_start: start,
  } as unknown as Parameters<typeof db.getDocList>[1])) as NotificationLogRow[]

  const list = Array.isArray(rows) ? rows : []
  return {
    rows: list,
    nextStart: start + limit,
    isListEnd: list.length < limit,
  }
}

/**
 * Unread count. Prefer count aggregation when the site supports it;
 * fall back to a bounded name list length.
 */
export async function getUnreadNotificationCount(): Promise<number> {
  try {
    const rows = (await db.getDocList('Notification Log', {
      fields: ['count(name) as unread_count'],
      filters: [['read', '=', 0]],
      limit: 1,
    } as unknown as Parameters<typeof db.getDocList>[1])) as Array<{ unread_count?: number }>
    const count = rows?.[0]?.unread_count
    if (typeof count === 'number') return count
  } catch {
    // fall through to name-list count
  }

  const rows = (await db.getDocList('Notification Log', {
    fields: ['name'],
    filters: [['read', '=', 0]],
    limit: 200,
  } as unknown as Parameters<typeof db.getDocList>[1])) as Array<{ name: string }>
  return Array.isArray(rows) ? rows.length : 0
}

/**
 * Frappe core: frappe.desk.doctype.notification_log.notification_log.mark_as_read
 * Param: docname
 */
export async function markNotificationAsRead(docname: string): Promise<void> {
  await call.post(
    'frappe.desk.doctype.notification_log.notification_log.mark_as_read',
    { docname }
  )
}
