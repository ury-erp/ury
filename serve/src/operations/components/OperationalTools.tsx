import { useEffect, useMemo, useState } from 'react'
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
} from '@ury/ui'
import type { PrintJobRow } from '../api/printers'
import { useNotifications } from '../hooks/useNotifications'
import { usePrinterHealth } from '../hooks/usePrinterHealth'
import type { OperationsIdentityProps } from '../types'
import {
  filterPrintJobs,
  formatLastUpdated,
  formatPrintJobTime,
  formatSuccessRate,
  formatSyncTime,
  getPrintJobStatus,
  isPrinterOffline,
  isPrinterOnline,
} from '../utils/printerStatus'
import { Bell, Printer } from 'lucide-react'

export interface OperationalToolsProps extends OperationsIdentityProps {
  className?: string
  /** Disable background polls (useful in tests). */
  pollingEnabled?: boolean
}

function stripHtml(html?: string): string {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Header actions: notifications (15s unread poll) + printer health (30s) /
 * print jobs dialog. Pass identity props only — no store imports.
 */
export function OperationalTools({
  user,
  posProfile,
  branch,
  className,
  pollingEnabled = true,
}: OperationalToolsProps) {
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [printersOpen, setPrintersOpen] = useState(false)
  const [jobsOpen, setJobsOpen] = useState(false)
  const [jobFilterPrinter, setJobFilterPrinter] = useState<string | null>(null)
  const [jobFilterStatus, setJobFilterStatus] = useState<string | null>(null)

  const notifications = useNotifications({
    user,
    enabled: pollingEnabled && Boolean(user),
  })
  const printers = usePrinterHealth({
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

  // Full listing (limit *) once per open / sync — filter client-side like RN.
  useEffect(() => {
    if (jobsOpen) {
      void printers.loadJobs({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobsOpen])

  const printerTabs = useMemo(() => {
    const fromHealth = printers.printers.map(
      (p) => p.printer_name || p.name || ''
    )
    const fromJobs = printers.jobs.map(
      (j) => j.printer_name || j.printer || ''
    )
    return Array.from(new Set([...fromHealth, ...fromJobs].filter(Boolean)))
  }, [printers.printers, printers.jobs])

  const visibleJobs = useMemo(
    () => filterPrintJobs(printers.jobs, jobFilterPrinter, jobFilterStatus),
    [printers.jobs, jobFilterPrinter, jobFilterStatus]
  )

  const indicatorClass =
    printers.summary.indicator === 'good'
      ? 'bg-success-500'
      : printers.summary.indicator === 'bad'
        ? 'bg-destructive'
        : 'bg-muted-foreground'

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
        aria-label="Printer status"
        onClick={() => setPrintersOpen(true)}
      >
        <span className="relative inline-flex">
          <Printer className="h-5 w-5" aria-hidden />
          <span
            className={cn(
              'absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background',
              indicatorClass
            )}
            aria-hidden
          />
        </span>
      </Button>

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

      <Dialog open={printersOpen} onOpenChange={setPrintersOpen}>
        <DialogContent
          variant="large"
          className="flex max-h-[85vh] flex-col gap-0 p-0"
          onClose={() => setPrintersOpen(false)}
          aria-describedby={undefined}
        >
          <DialogHeader className="flex flex-row items-center justify-between border-b border-border px-4 py-3">
            <div>
              <DialogTitle>Printers</DialogTitle>
              <p className="text-xs text-muted-foreground">
                Synced {formatSyncTime(printers.lastSyncedAt)}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={printers.loading}
              onClick={() => void printers.refreshHealth()}
            >
              Sync
            </Button>
          </DialogHeader>
          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {printers.health.status === 'unavailable' && (
              <Alert variant="warning">
                <p className="font-medium">Printer watch unavailable</p>
                <p className="text-sm">{printers.health.message}</p>
              </Alert>
            )}
            {printers.health.status === 'error' && (
              <Alert variant="danger">
                <p className="text-sm">{printers.health.message}</p>
              </Alert>
            )}
            {printers.loading && printers.printers.length === 0 && (
              <Spinner message="Checking printers…" />
            )}
            {printers.health.status === 'ok' &&
              printers.printers.length === 0 &&
              !printers.loading && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No printers reported
                </p>
              )}
            {printers.printers.map((printer, index) => {
              const label =
                printer.printer_name ||
                printer.device_name ||
                printer.name ||
                `Printer ${index + 1}`
              const online = isPrinterOnline(printer)
              const offline = isPrinterOffline(printer)
              return (
                <button
                  key={`${label}-${printer.ip_address || printer.ip || index}`}
                  type="button"
                  className="w-full rounded-lg border border-border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    setJobFilterPrinter(label)
                    setJobFilterStatus(null)
                    setPrintersOpen(false)
                    setJobsOpen(true)
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{label}</p>
                    <Badge
                      variant={
                        online ? 'success' : offline ? 'danger' : 'secondary'
                      }
                    >
                      {(printer.signal_status || 'unknown').toLowerCase()}
                    </Badge>
                  </div>
                  {printer.device_name &&
                  printer.device_name !== printer.printer_name ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {printer.device_name}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    IP: {printer.ip_address || printer.ip || '—'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Success: {printer.success ?? '—'} · Failed:{' '}
                    {printer.failed ?? '—'} · Rate:{' '}
                    {formatSuccessRate(printer.success_rate)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last updated: {formatLastUpdated(printer.last_updated)}
                  </p>
                </button>
              )
            })}
          </div>
          <footer className="flex justify-end border-t border-border px-4 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setJobFilterPrinter(null)
                setJobFilterStatus(null)
                setPrintersOpen(false)
                setJobsOpen(true)
              }}
            >
              Print jobs
            </Button>
          </footer>
        </DialogContent>
      </Dialog>

      <Dialog open={jobsOpen} onOpenChange={setJobsOpen}>
        <DialogContent
          variant="xlarge"
          className="flex max-h-[90vh] flex-col gap-0 p-0"
          onClose={() => setJobsOpen(false)}
          aria-describedby={undefined}
        >
          <DialogHeader className="flex flex-row items-center justify-between border-b border-border px-4 py-3">
            <div>
              <DialogTitle>Print jobs</DialogTitle>
              <p className="text-xs text-muted-foreground">
                Synced {formatSyncTime(printers.jobsSyncedAt)} ·{' '}
                {visibleJobs.length}
                {printers.jobs.length !== visibleJobs.length
                  ? ` of ${printers.jobs.length}`
                  : ''}{' '}
                shown
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={printers.jobsLoading}
              onClick={() => void printers.loadJobs({})}
            >
              Sync
            </Button>
          </DialogHeader>
          <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-2">
            <FilterChip
              label="All printers"
              active={!jobFilterPrinter}
              onClick={() => setJobFilterPrinter(null)}
            />
            {printerTabs.map((name) => (
              <FilterChip
                key={name}
                label={name}
                active={jobFilterPrinter === name}
                onClick={() => setJobFilterPrinter(name)}
              />
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-2">
            {['ALL', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'].map(
              (status) => (
                <FilterChip
                  key={status}
                  label={status === 'ALL' ? 'All status' : status}
                  active={
                    status === 'ALL'
                      ? !jobFilterStatus
                      : jobFilterStatus === status
                  }
                  onClick={() =>
                    setJobFilterStatus(status === 'ALL' ? null : status)
                  }
                />
              )
            )}
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {printers.jobsError && (
              <Alert variant="danger">
                <p className="text-sm">{printers.jobsError}</p>
              </Alert>
            )}
            {printers.jobsLoading && <Spinner message="Loading jobs…" />}
            {!printers.jobsLoading && visibleJobs.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No print jobs
              </p>
            )}
            {visibleJobs.map((job) => (
              <JobRow
                key={job.name}
                job={job}
                selected={printers.selectedJob?.name === job.name}
                onSelect={() =>
                  printers.setSelectedJob(
                    printers.selectedJob?.name === job.name ? null : job
                  )
                }
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'default' : 'outline'}
      className="shrink-0"
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

function JobRow({
  job,
  selected,
  onSelect,
}: {
  job: PrintJobRow
  selected: boolean
  onSelect: () => void
}) {
  const status = getPrintJobStatus(job)
  return (
    <button
      type="button"
      className={cn(
        'w-full rounded-lg border border-border p-3 text-left',
        selected && 'ring-2 ring-ring'
      )}
      onClick={onSelect}
      aria-expanded={selected}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {job.job_type || job.invoice || job.reference_name || job.name}
        </p>
        <Badge
          variant={
            status === 'FAILED'
              ? 'danger'
              : status === 'COMPLETED'
                ? 'success'
                : 'secondary'
          }
        >
          {status || 'UNKNOWN'}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {formatPrintJobTime(job)} · Printer:{' '}
        {job.printer_name || job.printer || '—'}
      </p>
      {selected && (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <Detail label="Job id" value={job.print_job_id || job.name} />
          <Detail label="Invoice" value={job.invoice || job.reference_name} />
          <Detail label="Table" value={job.table} />
          <Detail label="Owner" value={job.job_owner} />
          <Detail
            label="Failure"
            value={job.failure_reason}
            className="col-span-2"
          />
        </dl>
      )}
    </button>
  )
}

function Detail({
  label,
  value,
  className,
}: {
  label: string
  value?: string
  className?: string
}) {
  return (
    <div className={className}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{value || '—'}</dd>
    </div>
  )
}
