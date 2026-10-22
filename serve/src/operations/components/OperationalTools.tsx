import { useEffect, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Spinner,
  cn,
  messageToPlainText,
} from '@ury/ui'
import { useNotifications } from '../hooks/useNotifications'
import type { OperationsIdentityProps } from '../types'
import { ClosingChecklist } from './OpeningChecklist'
import { Bell, ClipboardCheck } from 'lucide-react'

export interface OperationalToolsProps extends OperationsIdentityProps {
  className?: string
  /** Disable background polls (useful in tests). */
  pollingEnabled?: boolean
}

function stripHtml(html?: string): string {
  if (!html) return ''
  return messageToPlainText(html).replace(/\s+/g, ' ').trim()
}

/**
 * Header actions: notifications (15s unread poll) + closing checklist.
 * Printer watch is intentionally isolated to frontend POS.
 */
export function OperationalTools({
  user,
  posProfile,
  branch,
  className,
  pollingEnabled = true,
}: OperationalToolsProps) {
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [closingOpen, setClosingOpen] = useState(false)

  const notifications = useNotifications({
    user,
    enabled: pollingEnabled && Boolean(user),
  })

  useEffect(() => {
    if (notificationsOpen) {
      void notifications.openAndLoad()
    }
    // intentionally only when dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationsOpen])

  void posProfile
  void branch

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={
          notifications.unreadCount > 0
            ? `Notifications, ${notifications.unreadCount} unread`
            : 'Notifications'
        }
        onClick={() => setNotificationsOpen(true)}
      >
        <span className="relative inline-flex">
          <Bell className="h-5 w-5" aria-hidden />
          {notifications.unreadCount > 0 ? (
            <Badge
              variant="danger"
              className="absolute -right-2 -top-2 min-w-[1.25rem] px-1 text-[10px]"
              aria-hidden
            >
              {notifications.unreadCount > 99
                ? '99+'
                : notifications.unreadCount}
            </Badge>
          ) : null}
        </span>
      </Button>


      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Closing checklist"
        title="Closing checklist"
        onClick={() => setClosingOpen(true)}
      >
        <ClipboardCheck className="h-5 w-5" aria-hidden />
      </Button>

      {closingOpen && user && posProfile ? (
        <ClosingChecklist
          user={user}
          posProfile={posProfile}
          branch={branch}
          onClose={() => setClosingOpen(false)}
        />
      ) : null}

      <Dialog open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <DialogContent
          variant="large"
          className="flex max-h-[85vh] flex-col gap-0 p-0"
          onClose={() => setNotificationsOpen(false)}
          aria-describedby={undefined}
        >
          <DialogHeader className="border-b border-border px-4 py-3">
            <DialogTitle>Notifications</DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {notifications.error && (
              <Alert variant="danger">
                <p className="text-sm">{notifications.error}</p>
              </Alert>
            )}
            {notifications.loading && <Spinner message="Loading…" />}
            {!notifications.loading && notifications.rows.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No notifications
              </p>
            )}
            {notifications.rows.map((row) => {
              const unread = Number(row.read) === 0
              return (
                <button
                  key={row.name}
                  type="button"
                  disabled={Boolean(notifications.markingId)}
                  className={cn(
                    'w-full rounded-lg border border-border p-3 text-left transition-colors',
                    unread ? 'bg-primary-50' : 'bg-card',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  )}
                  onClick={() => {
                    if (unread) void notifications.markRead(row.name)
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{row.subject || row.name}</p>
                    {unread ? (
                      <Badge variant="info" className="shrink-0">
                        Unread
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {stripHtml(row.email_content) || '—'}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {row.creation || ''}
                  </p>
                </button>
              )
            })}
            {!notifications.isListEnd && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={notifications.loadingMore}
                onClick={() => void notifications.loadMore()}
              >
                {notifications.loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}

