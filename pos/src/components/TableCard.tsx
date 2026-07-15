import { type MouseEvent } from 'react';
import { Eye, Loader2, Printer, Users } from 'lucide-react';
import { cn } from '@ury/ui';
import { formatInvoiceTime } from '@ury/core';
import type { Table } from '../lib/table-api';
import { Badge } from '@ury/ui';
import { TableShapeIcon } from './TableShapeIcon';
import TableActionsMenu from './TableActionsMenu';
import { t } from '../i18n';

interface TableCardProps {
  table: Table;
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
}

const TableCard = ({
  table,
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
}: TableCardProps) => {
  const isOccupied = table.occupied === 1;

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
        'relative flex min-h-[15.5rem] flex-col rounded-lg border-2 bg-white p-4 transition-all',
        isOccupied
          ? 'border-amber-400 bg-amber-50 text-amber-900'
          : 'cursor-pointer border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-400 hover:shadow-md',
        menuOpen ? 'z-20' : 'z-0',
        className
      )}
    >
      <div className="flex flex-1 flex-col">
        <div className="mb-3 flex items-start justify-between gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <div className="shrink-0">
              <TableShapeIcon shape={table.table_shape || 'Rectangle'} />
            </div>
            <span className="truncate text-lg font-semibold text-gray-900" title={mergeGroupLabel ?? table.name}>
              {table.name}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Badge variant={isOccupied ? 'warning' : 'success'} className="whitespace-nowrap">
              {isOccupied ? t('tables.occupied') : t('tables.available')}
            </Badge>
            <TableActionsMenu
              table={table}
              isOpen={menuOpen}
              onOpenChange={onMenuOpenChange}
              onMerge={onMerge}
              onUnmerge={onUnmerge}
              onTransferTable={onTransferTable}
              onTransferCaptain={onTransferCaptain}
              showCaptainTransfer={showCaptainTransfer}
            />
          </div>
        </div>

        <p
          className={cn(
            'mb-2 min-h-[1.25rem] truncate text-xs font-medium',
            mergeGroupLabel && mergeGroupLabel !== table.name
              ? 'text-primary-700'
              : 'invisible'
          )}
          title={mergeGroupLabel ?? undefined}
        >
          {mergeGroupLabel && mergeGroupLabel !== table.name
            ? t('tables.merged_with_list', { tables: mergeGroupLabel })
            : '\u00a0'}
        </p>

        <div className="space-y-2 text-sm text-gray-700">
          <div className="flex items-center justify-between">
            <span className="font-medium">{t('tables.room')}</span>
            <span>{table.restaurant_room}</span>
          </div>
          <div className="flex min-h-[1.25rem] items-center justify-between">
            <span className="font-medium">{t('tables.started_at')}</span>
            <span>{isOccupied ? formatInvoiceTime(table.latest_invoice_time) : '—'}</span>
          </div>
          {typeof table.no_of_seats === 'number' && (
            <div className="flex items-center justify-between">
              <span className="font-medium">{t('tables.seats')}</span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {table.no_of_seats}
              </span>
            </div>
          )}
          {table.is_take_away === 1 && (
            <Badge variant="pending" className="mt-2">
              Take away
            </Badge>
          )}
        </div>
      </div>

      <div
        className={cn(
          'mt-auto flex min-h-[2.75rem] gap-2 border-t pt-3',
          isOccupied ? 'border-amber-200' : 'border-transparent'
        )}
      >
        {isOccupied ? (
          <>
            <button
              onClick={onPreview}
              className="flex flex-1 items-center justify-center gap-2 rounded bg-white py-2 text-xs font-semibold transition hover:bg-amber-100"
            >
              <Eye className="h-3 w-3" />
              Preview
            </button>
            <button
              onClick={onPrint}
              disabled={isPrinting}
              className="flex flex-1 items-center justify-center gap-2 rounded bg-white py-2 text-xs font-semibold transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPrinting ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Printing...
                </>
              ) : (
                <>
                  <Printer className="h-3 w-3" />
                  Print
                </>
              )}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default TableCard;
