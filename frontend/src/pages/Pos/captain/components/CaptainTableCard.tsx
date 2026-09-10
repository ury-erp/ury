import { AlertTriangle, Lock, User, Users } from 'lucide-react';
import { cn } from '@ury/ui';
import { Badge } from '@ury/ui';
import { formatCurrency } from '@ury/core';
import type { Table } from '../../lib/table-api';
import type { ActiveTableOrder } from '../lib/captain-table-api';
import TableActionsMenu from '../../components/TableActionsMenu';

export type CaptainTableOwnership = 'free' | 'mine' | 'other' | 'occupied-unknown';

export interface CaptainTableCardProps {
  table: Table;
  order?: ActiveTableOrder;
  ownership: CaptainTableOwnership;
  ownerName?: string;
  /** Names of other tables merged into this one's cluster (excludes `table.name` itself). */
  mergePartners?: string[];
  onTap: () => void;
  /** Attention threshold from `get_table_attention_config` (backend, per branch). `null`
   * while unresolved or when the feature is disabled for this branch — the indicator
   * renders nothing in either case, matching the previous "not implemented" behavior. */
  attentionThresholdMinutes?: number | null;
  /** Table-level merge/unmerge overflow menu (sa-v3-captain-app-parity/GAPS.md Gap 3).
   * Omit both handlers to hide the menu entirely (e.g. while permissions are loading). */
  showTableActions?: boolean;
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  onMerge?: () => void;
  onUnmerge?: () => void;
}

/**
 * `URY Table.latest_invoice_time` is a Frappe `Time` field — a bare
 * "HH:MM:SS(.ffffff)" string with no date component, not a full timestamp.
 * `new Date("16:45:26.537906")` is not valid ISO 8601 and parses to
 * `Invalid Date` in every browser, so this was silently broken (returning
 * `null`, no elapsed label at all) before this attention-indicator feature
 * existed too — reusing the field's actual value on today's date is the
 * only way to get a real elapsed duration out of it. This assumes the table
 * was last occupied today, which holds for the normal case (a captain
 * screen showing live floor state) but can undercount right after midnight
 * for a table that's been open since the previous day — an inherent limit
 * of the field being Time-only, not something a client-side parse fix can
 * fully correct.
 */
const minutesElapsed = (time: string | null): number | null => {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2}):(\d{2})/.exec(time);
  if (!match) return null;

  const [, hours, minutes, seconds] = match;
  const started = new Date();
  started.setHours(Number(hours), Number(minutes), Number(seconds), 0);

  const startedMs = started.getTime();
  if (Number.isNaN(startedMs)) return null;

  return Math.max(0, Math.round((Date.now() - startedMs) / 60000));
};

const elapsedLabel = (minutes: number | null): string | null => {
  if (minutes === null) return null;
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

/**
 * Large, touch-friendly table card for the Captain's mobile "Tables" home
 * screen. Deliberately minimal cashier-oriented chrome (no print/preview/
 * payment affordances) — a card here is primarily a single tap target, per
 * PLAN.md §5/§6, with a small overflow menu for table-level merge/unmerge
 * (Gap 3) and an "Attention" indicator (Gap 4) layered on top of that.
 *
 * The outer element is a `div` (not `button`) so the overflow menu's own
 * trigger button can nest inside it without invalid nested-`<button>` HTML —
 * same structural choice as the main POS's `TableCard.tsx`, which this
 * mirrors for the menu itself (`TableActionsMenu`, reused as-is).
 */
const CaptainTableCard = ({
  table,
  order,
  ownership,
  ownerName,
  mergePartners,
  onTap,
  attentionThresholdMinutes,
  showTableActions = false,
  menuOpen = false,
  onMenuOpenChange,
  onMerge,
  onUnmerge,
}: CaptainTableCardProps) => {
  const isOccupied = table.occupied === 1;
  const isBilled = Boolean(order?.invoicePrinted);
  const hasMergePartners = Boolean(mergePartners && mergePartners.length > 0);
  const minutesOpen = isOccupied ? minutesElapsed(table.latest_invoice_time) : null;
  const elapsed = elapsedLabel(minutesOpen);
  const needsAttention =
    isOccupied &&
    !isBilled &&
    typeof attentionThresholdMinutes === 'number' &&
    minutesOpen !== null &&
    minutesOpen >= attentionThresholdMinutes;

  const colorClasses = isBilled
    ? 'border-success-tint-border bg-success-tint text-success'
    : needsAttention
      ? 'border-destructive bg-destructive/10 text-destructive'
      : ownership === 'mine'
        ? 'border-primary bg-primary-tint text-primary'
        : ownership === 'free'
          ? 'border-gray-300 bg-muted text-muted-foreground'
          : 'border-warning-tint-border bg-warning-tint text-warning';

  const statusLabel = isBilled
    ? 'Billed'
    : ownership === 'mine'
      ? 'Mine'
      : ownership === 'free'
        ? 'Free'
        : ownerName
          ? ownerName
          : 'Occupied';

  const statusBadgeVariant = isBilled
    ? 'secondary'
    : ownership === 'mine'
      ? 'info'
      : ownership === 'free'
        ? 'success'
        : 'warning';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onTap}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onTap();
        }
      }}
      className={cn(
        'relative flex min-h-[7.5rem] flex-col items-stretch touch-manipulation select-none rounded-lg border border-s-4 p-3 text-left transition-colors duration-150 ease-out active:scale-[0.98]',
        colorClasses
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-lg font-bold" title={table.name}>
          {table.name}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {needsAttention && (
            <AlertTriangle
              className="h-4 w-4 shrink-0"
              aria-label={`Needs attention — open ${elapsed ?? `${minutesOpen}m`}`}
            />
          )}
          {isBilled && <Lock className="h-4 w-4 shrink-0" aria-label="Billed / locked" />}
          {showTableActions && (onMerge || onUnmerge) && (
            <TableActionsMenu
              table={table}
              isOpen={menuOpen}
              onOpenChange={(open) => onMenuOpenChange?.(open)}
              onMerge={onMerge}
              onUnmerge={onUnmerge}
            />
          )}
        </div>
      </div>

      {hasMergePartners && (
        <span
          className="mt-0.5 truncate text-xs font-medium opacity-80"
          title={`Merged with ${mergePartners!.join(', ')}`}
        >
          + {mergePartners!.join(', ')}
        </span>
      )}

      <div className="mt-2 flex flex-1 flex-col justify-end gap-1">
        <Badge variant={statusBadgeVariant} size="sm" className="w-fit truncate max-w-full">
          {statusLabel}
        </Badge>

        {isOccupied && ownership !== 'mine' && ownerName && (
          <span className="flex items-center gap-1 truncate text-xs font-medium opacity-80">
            <User className="h-3 w-3 shrink-0" />
            {ownerName}
          </span>
        )}

        {isOccupied && (elapsed || typeof order?.grandTotal === 'number') && (
          <div className="flex items-center justify-between text-xs font-medium opacity-80">
            <span>{elapsed ?? '—'}</span>
            {typeof order?.grandTotal === 'number' && (
              <span>{formatCurrency(order.grandTotal)}</span>
            )}
          </div>
        )}

        {typeof table.no_of_seats === 'number' && (
          <span className="flex items-center gap-1 text-xs opacity-70">
            <Users className="h-3 w-3" />
            {table.no_of_seats}
          </span>
        )}
      </div>
    </div>
  );
};

export default CaptainTableCard;
