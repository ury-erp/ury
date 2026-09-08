import { Lock, User, Users } from 'lucide-react';
import { cn } from '@ury/ui';
import { Badge } from '@ury/ui';
import { formatCurrency } from '@ury/core';
import type { Table } from '../lib/table-api';
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
 * screen. Sized for ~44px+ tap targets and readable labels, aligned with POS
 * `TableCard` status coloring (free / mine / other / billed) without cashier
 * chrome.
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
        : 'border-amber-400 bg-amber-50 text-amber-900';

  const statusLabel = isBilled
    ? 'Billed'
    : ownership === 'mine'
      ? 'Mine'
      : ownership === 'free'
        ? 'Free'
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
        'flex w-full min-h-[9.5rem] flex-col items-stretch rounded-xl border-2 p-4 text-left transition-all active:scale-[0.98]',
        colorClasses
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-xl font-bold leading-tight tracking-tight" title={table.name}>
          {table.name}
        </span>
        {isBilled && <Lock className="h-5 w-5 shrink-0" aria-label="Billed / locked" />}
      </div>

      {hasMergePartners && (
        <span
          className="mt-1 truncate text-sm font-medium opacity-80"
          title={`Merged with ${mergePartners!.join(', ')}`}
        >
          + {mergePartners!.join(', ')}
        </span>
      )}

      <div className="mt-3 flex flex-1 flex-col justify-end gap-2">
        <Badge variant={statusBadgeVariant} size="sm" className="w-fit max-w-full truncate text-xs">
          {statusLabel}
        </Badge>

        {isOccupied && ownership !== 'mine' && ownerName && (
          <span className="flex items-center gap-1.5 truncate text-sm font-medium opacity-80">
            <User className="h-3.5 w-3.5 shrink-0" />
            {ownerName}
          </span>
        )}

        {isOccupied && (elapsed || typeof order?.grandTotal === 'number') && (
          <div className="flex items-center justify-between text-sm font-semibold opacity-90">
            <span>{elapsed ?? '—'}</span>
            {typeof order?.grandTotal === 'number' && (
              <span>{formatCurrency(order.grandTotal)}</span>
            )}
          </div>
        )}

        {typeof table.no_of_seats === 'number' && (
          <span className="flex items-center gap-1.5 text-sm opacity-70">
            <Users className="h-3.5 w-3.5" />
            {table.no_of_seats}
          </span>
        )}
      </div>
    </button>
  );
};

export default CaptainTableCard;
