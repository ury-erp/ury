import { type MouseEvent } from 'react';
import { AlertTriangle, Armchair, Building2, Clock3, Eye, Loader2, Printer, Users } from 'lucide-react';
import { cn } from '@ury/ui';
import { formatInvoiceTime } from '@ury/core';
import type { Table, TableReservation } from '../lib/table-api';
import { Badge } from '@ury/ui';
import { TableShapeIcon } from './TableShapeIcon';
import TableActionsMenu from './TableActionsMenu';
import { formatReservationTime, isReservationLockWindowActive } from '../lib/table-utils';
import { t } from '../i18n';

export const TABLE_STATE_STYLES = {
  available: 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-400',
  occupied: 'border-amber-400 bg-amber-50 text-amber-900',
  reserved: 'border-primary-400 bg-primary-50 text-primary-950 hover:border-primary-500',
} as const;

interface TableCardProps {
  table: Table;
  isReserved?: boolean;
  upcomingReservation?: TableReservation | null;
  activeReservation?: TableReservation | null;
  reservationEnabled?: boolean;
  mergeGroupLabel?: string;
  className?: string;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onMerge: () => void;
  onUnmerge: () => void;
  onTransferTable?: () => void;
  onTransferCaptain?: () => void;
  showCaptainTransfer?: boolean;
  onNavigate: () => void;
  onPreview: (event: MouseEvent<HTMLButtonElement>) => void;
  onPrint: (event: MouseEvent<HTMLButtonElement>) => void;
  isPrinting: boolean;
  onReserve?: () => void;
}

const TableCard = ({
  table,
  isReserved = false,
  activeReservation = null,
  reservationEnabled = true,
  mergeGroupLabel,
  className,
  menuOpen,
  onMenuOpenChange,
  onMerge,
  onUnmerge,
  onTransferTable,
  onTransferCaptain,
  showCaptainTransfer = false,
  onNavigate,
  onPreview,
  onPrint,
  isPrinting,
  onReserve,
}: TableCardProps) => {
  const isOccupied = table.occupied === 1;
  const isMerged = Boolean(mergeGroupLabel && mergeGroupLabel !== table.name);
  const isLockedByReservation =
    isReserved &&
    !!activeReservation &&
    (activeReservation.is_lock_window_active || isReservationLockWindowActive(activeReservation)) &&
    activeReservation.status === 'Confirmed';

  return (
    <div
      role={isOccupied ? 'group' : 'button'}
      tabIndex={isOccupied ? -1 : 0}
      onClick={() => {
        if (!isOccupied) {
          onNavigate();
        }
      }}
      className={cn(
        'relative flex h-full min-h-[13rem] min-w-0 flex-col rounded-lg border-2 p-4 transition-colors',
        isOccupied
          ? TABLE_STATE_STYLES.occupied
          : isLockedByReservation
            ? cn(TABLE_STATE_STYLES.reserved, 'cursor-pointer hover:shadow-md')
            : cn(TABLE_STATE_STYLES.available, 'cursor-pointer hover:shadow-md'),
        menuOpen ? 'z-20' : 'z-0',
        className
      )}
    >
      <div className="flex flex-1 flex-col">
        <div className="mb-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-gray-900/10 pb-3">
          <TableShapeIcon
            shape={table.table_shape || 'Rectangle'}
            className={cn(
              'h-4 w-4',
              isOccupied ? 'text-amber-600' : isLockedByReservation ? 'text-primary-600' : 'text-gray-600'
            )}
          />
          <span
            className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere] text-sm font-semibold text-gray-900"
            title={mergeGroupLabel ?? table.name}
          >
            {table.name}
          </span>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {isMerged ? (
              <>
                <Badge variant="info" size="sm" className="whitespace-nowrap">
                  {t('tables.merged')}
                </Badge>
                {isLockedByReservation && (
                  <Badge
                    variant="outline"
                    size="sm"
                    className="whitespace-nowrap border-primary-200 bg-primary-100 text-xs font-medium text-primary-800"
                  >
                    {t('tables.reserved_badge')}
                  </Badge>
                )}
              </>
            ) : isOccupied ? (
              <>
                <Badge variant="warning" size="sm" className="whitespace-nowrap">
                  {t('tables.occupied')}
                </Badge>
                {isLockedByReservation && (
                  <Badge
                    variant="outline"
                    size="sm"
                    className="whitespace-nowrap border-primary-200 bg-primary-100 text-xs font-medium text-primary-800"
                  >
                    {t('tables.reserved_badge')}
                  </Badge>
                )}
              </>
            ) : isLockedByReservation ? (
              <Badge
                variant="outline"
                size="sm"
                className="whitespace-nowrap border-primary-200 bg-primary-100 text-xs font-medium text-primary-800"
              >
                {t('tables.reserved_badge')}
              </Badge>
            ) : (
              <Badge variant="success" size="sm" className="whitespace-nowrap">
                {t('tables.available')}
              </Badge>
            )}
            <TableActionsMenu
              table={table}
              isOpen={menuOpen}
              onOpenChange={onMenuOpenChange}
              onMerge={onMerge}
              onUnmerge={onUnmerge}
              onTransferTable={onTransferTable}
              onTransferCaptain={onTransferCaptain}
              showCaptainTransfer={showCaptainTransfer}
              onReserve={reservationEnabled ? onReserve : undefined}
            />
          </div>
        </div>

        {isMerged && (
          <p
            className="mb-2 min-w-0 whitespace-normal break-words [overflow-wrap:anywhere] text-xs font-medium text-primary-700"
            title={mergeGroupLabel}
          >
            {t('tables.merged_with_list', { tables: mergeGroupLabel })}
          </p>
        )}

        <div className="space-y-2 text-sm text-gray-700">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <span className="flex shrink-0 items-center gap-1.5 font-medium">
              <Building2 className="h-3.5 w-3.5" />
              {t('tables.room')}
            </span>
            <span className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere] text-right">
              {table.restaurant_room}
            </span>
          </div>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <span className="flex shrink-0 items-center gap-1.5 font-medium">
              <Clock3 className="h-3.5 w-3.5" />
              {t('tables.started_at')}
            </span>
            <span className="min-w-0 text-right">
              {isOccupied ? formatInvoiceTime(table.latest_invoice_time) : '—'}
            </span>
          </div>
          {typeof table.no_of_seats === 'number' && (
            <div className="flex min-w-0 items-start justify-between gap-3">
              <span className="flex shrink-0 items-center gap-1.5 font-medium">
                <Armchair className="h-3.5 w-3.5" />
                {t('tables.seats')}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <Users className="h-3 w-3" />
                {table.no_of_seats}
              </span>
            </div>
          )}
        </div>

        {table.is_take_away === 1 && (
          <Badge variant="pending" size="sm" className="mt-3 self-start">
            {t('pos_ui.take_away')}
          </Badge>
        )}
        {isLockedByReservation && (
          <div className="mt-2 flex items-start gap-1.5 rounded-md border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-xs font-medium text-primary-950">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-primary-600" />
            <span className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">
              {t('tables.reserved_for', { time: formatReservationTime(activeReservation?.reserved_at) })}
            </span>
          </div>
        )}
      </div>

      {isOccupied && (
        <div className="mt-auto flex gap-2 border-t border-amber-200 pt-3">
          <button
            onClick={onPreview}
            className="flex flex-1 items-center justify-center gap-2 rounded bg-white py-2 text-xs font-semibold transition hover:bg-amber-100"
          >
            <Eye className="h-3 w-3" />
            {t('pos_ui.preview')}
          </button>
          <button
            onClick={onPrint}
            disabled={isPrinting}
            className="flex flex-1 items-center justify-center gap-2 rounded bg-white py-2 text-xs font-semibold transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPrinting ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('pos_ui.printing')}
              </>
            ) : (
              <>
                <Printer className="h-3 w-3" />
                {t('pos_ui.print')}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default TableCard;
