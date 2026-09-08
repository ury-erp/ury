import { Lock, User, Users } from 'lucide-react'
import { cn, Badge, TableActionsMenu, type TableActionsMenuLabels } from '@ury/ui'
import { formatCurrency } from '@ury/core'
import type { Table } from '../lib/table-api'
import type { ActiveTableOrder } from '../lib/captain-table-api'

export type CaptainTableOwnership = 'free' | 'mine' | 'other' | 'occupied-unknown'

export interface CaptainTableCardProps {
  table: Table
  order?: ActiveTableOrder
  ownership: CaptainTableOwnership
  ownerName?: string
  /** Names of other tables merged into this one's cluster (excludes `table.name` itself). */
  mergePartners?: string[]
  onTap: () => void
  menuOpen?: boolean
  onMenuOpenChange?: (open: boolean) => void
  onMerge?: () => void
  onUnmerge?: () => void
  onTransferTable?: () => void
  onTransferCaptain?: () => void
  showCaptainTransfer?: boolean
  canUnmerge?: boolean
  menuLabels?: TableActionsMenuLabels
}

const DEFAULT_MENU_LABELS: TableActionsMenuLabels = {
  tableActions: 'Table actions',
  mergeTables: 'Merge tables',
  unmergeTables: 'Unmerge tables',
  transferTable: 'Transfer table',
  transferCaptain: 'Transfer captain',
}

const elapsedLabel = (isoTimestamp: string | null): string | null => {
  if (!isoTimestamp) return null
  const started = new Date(isoTimestamp).getTime()
  if (Number.isNaN(started)) return null

  const minutes = Math.max(0, Math.round((Date.now() - started) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

/**
 * Large, touch-friendly table card for the Captain's mobile "Tables" home
 * screen. Sized for ~44px+ tap targets and readable labels, aligned with POS
 * `TableCard` status coloring (free / mine / other / billed) without cashier
 * chrome. Optional rows stay reserved so free and occupied cards share height.
 */
const CaptainTableCard = ({
  table,
  order,
  ownership,
  ownerName,
  mergePartners,
  onTap,
  menuOpen = false,
  onMenuOpenChange,
  onMerge,
  onUnmerge,
  onTransferTable,
  onTransferCaptain,
  showCaptainTransfer = false,
  canUnmerge = false,
  menuLabels = DEFAULT_MENU_LABELS,
}: CaptainTableCardProps) => {
  const isOccupied = table.occupied === 1
  const isAvailable = table.occupied === 0
  const isBilled = Boolean(order?.invoicePrinted)
  const hasMergePartners = Boolean(mergePartners && mergePartners.length > 0)
  const elapsed = isOccupied ? elapsedLabel(table.latest_invoice_time) : null
  const showOwner = isOccupied && ownership !== 'mine' && Boolean(ownerName)
  const showMenu = Boolean(onMenuOpenChange)

  const colorClasses = isBilled
    ? 'border-slate-400 bg-slate-100 text-slate-900'
    : ownership === 'mine'
      ? 'border-sky-400 bg-sky-50 text-sky-900'
      : ownership === 'free'
        ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
        : 'border-amber-400 bg-amber-50 text-amber-900'

  const statusLabel = isBilled
    ? 'Billed'
    : ownership === 'mine'
      ? 'Mine'
      : ownership === 'free'
        ? 'Free'
        : 'Occupied'

  const statusBadgeVariant = isBilled
    ? 'secondary'
    : ownership === 'mine'
      ? 'info'
      : ownership === 'free'
        ? 'success'
        : 'warning'

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={table.name}
      onClick={onTap}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onTap()
        }
      }}
      className={cn(
        'relative flex w-full min-h-[11.5rem] flex-col items-stretch rounded-xl border-2 p-4 text-left transition-all active:scale-[0.98]',
        colorClasses,
        menuOpen ? 'z-20' : 'z-0'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-xl font-bold leading-tight tracking-tight" title={table.name}>
          {table.name}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {isBilled && <Lock className="h-5 w-5 shrink-0" aria-label="Billed / locked" />}
          {showMenu && onMenuOpenChange && (
            <TableActionsMenu
              isOpen={menuOpen}
              onOpenChange={onMenuOpenChange}
              isAvailable={isAvailable}
              isOccupied={isOccupied}
              canUnmerge={canUnmerge}
              onMerge={onMerge}
              onUnmerge={onUnmerge}
              onTransferTable={onTransferTable}
              onTransferCaptain={onTransferCaptain}
              showCaptainTransfer={showCaptainTransfer}
              labels={menuLabels}
            />
          )}
        </div>
      </div>

      <p
        className={cn(
          'mt-1 min-h-[1.25rem] truncate text-sm font-medium opacity-80',
          hasMergePartners ? undefined : 'invisible'
        )}
        title={hasMergePartners ? `Merged with ${mergePartners!.join(', ')}` : undefined}
      >
        {hasMergePartners ? `+ ${mergePartners!.join(', ')}` : '\u00a0'}
      </p>

      <div className="mt-3 flex flex-1 flex-col justify-end gap-2">
        <Badge variant={statusBadgeVariant} size="sm" className="w-fit max-w-full truncate text-xs">
          {statusLabel}
        </Badge>

        <span
          className={cn(
            'flex min-h-[1.25rem] items-center gap-1.5 truncate text-sm font-medium opacity-80',
            showOwner ? undefined : 'invisible'
          )}
        >
          <User className="h-3.5 w-3.5 shrink-0" />
          {showOwner ? ownerName : '\u00a0'}
        </span>

        <div className="flex min-h-[1.25rem] items-center justify-between text-sm font-semibold opacity-90">
          <span>{isOccupied && elapsed ? elapsed : '—'}</span>
          <span>
            {isOccupied && typeof order?.grandTotal === 'number'
              ? formatCurrency(order.grandTotal)
              : '\u00a0'}
          </span>
        </div>

        {typeof table.no_of_seats === 'number' && (
          <span className="flex items-center gap-1.5 text-sm opacity-70">
            <Users className="h-3.5 w-3.5" />
            {table.no_of_seats}
          </span>
        )}
      </div>
    </div>
  )
}

export default CaptainTableCard
