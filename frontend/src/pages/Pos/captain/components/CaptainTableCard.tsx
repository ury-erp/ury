import { Lock, User, Users } from 'lucide-react';
import { cn } from '@ury/ui';
import { Badge } from '@ury/ui';
import { formatCurrency } from '@ury/core';
import type { Table } from '../../lib/table-api';
import type { ActiveTableOrder } from '../lib/captain-table-api';

export type CaptainTableOwnership = 'free' | 'mine' | 'other' | 'occupied-unknown';

export interface CaptainTableCardProps {
  table: Table;
  order?: ActiveTableOrder;
  ownership: CaptainTableOwnership;
  ownerName?: string;
  /** Names of other tables merged into this one's cluster (excludes `table.name` itself). */
  mergePartners?: string[];
  onTap: () => void;
}

const elapsedLabel = (isoTimestamp: string | null): string | null => {
  if (!isoTimestamp) return null;
  const started = new Date(isoTimestamp).getTime();
  if (Number.isNaN(started)) return null;

  const minutes = Math.max(0, Math.round((Date.now() - started) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

/**
 * Large, touch-friendly table card for the Captain's mobile "Tables" home
 * screen. Deliberately no cashier-oriented chrome (no print/preview/payment
 * affordances) — a card here only communicates status and is a single tap
 * target, per PLAN.md §5/§6.
 *
 * Visual states implemented: Free, Mine, Occupied-by-another-Captain,
 * Billed/locked, Merged. "Attention" is intentionally not implemented — see
 * report; the data it would need (a time threshold) isn't exposed by
 * `get_captain_context()` today.
 */
const CaptainTableCard = ({
  table,
  order,
  ownership,
  ownerName,
  mergePartners,
  onTap,
}: CaptainTableCardProps) => {
  const isOccupied = table.occupied === 1;
  const isBilled = Boolean(order?.invoicePrinted);
  const hasMergePartners = Boolean(mergePartners && mergePartners.length > 0);
  const elapsed = isOccupied ? elapsedLabel(table.latest_invoice_time) : null;

  const colorClasses = isBilled
    ? 'border-slate-400 bg-slate-100 text-slate-900'
    : ownership === 'mine'
      ? 'border-sky-400 bg-sky-50 text-sky-900'
      : ownership === 'free'
        ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
        : 'border-amber-400 bg-warning-tint text-warning';

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
    <button
      type="button"
      onClick={onTap}
      className={cn(
        'flex min-h-[7.5rem] flex-col items-stretch rounded-xl border-2 p-3 text-left transition-all active:scale-[0.98]',
        colorClasses
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-lg font-bold" title={table.name}>
          {table.name}
        </span>
        {isBilled && <Lock className="h-4 w-4 shrink-0" aria-label="Billed / locked" />}
      </div>

      {hasMergePartners && (
        <span
          className="mt-0.5 truncate text-xs font-medium opacity-80"
          title={`Merged with ${mergePartners!.join(', ')}`}
        >
          + {mergePartners!.join(', ')}
        </span>
      )}

      <div className="mt-2 flex flex-1 flex-col justify-end gap-1.5">
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
    </button>
  );
};

export default CaptainTableCard;
