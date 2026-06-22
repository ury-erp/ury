import { type MouseEvent } from 'react';
import { Eye, Loader2, Printer, Users } from 'lucide-react';
import { cn, formatInvoiceTime } from '../lib/utils';
import type { Table } from '../lib/table-api';
import { Badge } from './ui/badge';
import { TableShapeIcon } from './TableShapeIcon';
import TableActionsMenu from './TableActionsMenu';
import { t } from '../i18n';

interface TableCardProps {
  table: Table;
  className?: string;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onMerge: () => void;
  onUnmerge: () => void;
  onNavigate: () => void;
  onPreview: (event: MouseEvent<HTMLButtonElement>) => void;
  onPrint: (event: MouseEvent<HTMLButtonElement>) => void;
  isPrinting: boolean;
}

const TableCard = ({
  table,
  className,
  menuOpen,
  onMenuOpenChange,
  onMerge,
  onUnmerge,
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
        'relative flex flex-col justify-between gap-y-4 rounded-lg border-2 bg-white p-4 transition-all',
        isOccupied
          ? 'border-amber-400 bg-amber-50 text-amber-900'
          : 'cursor-pointer border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-400 hover:shadow-md',
        menuOpen ? 'z-20' : 'z-0',
        className
      )}
    >
      <div>
        <div className="mb-3 flex items-start justify-between gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <div className="shrink-0">
              <TableShapeIcon shape={table.table_shape || 'Rectangle'} />
            </div>
            <span className="truncate text-lg font-semibold text-gray-900" title={table.name}>
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
            />
          </div>
        </div>

        <div className="space-y-2 text-sm text-gray-700">
          <div className="flex items-center justify-between">
            <span className="font-medium">{t('tables.room')}</span>
            <span>{table.restaurant_room}</span>
          </div>
          {isOccupied && (
            <div className="flex items-center justify-between">
              <span className="font-medium">{t('tables.started_at')}</span>
              <span>{formatInvoiceTime(table.latest_invoice_time)}</span>
            </div>
          )}
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

      {isOccupied ? (
        <div className="mt-3 flex gap-2 border-t border-amber-200 pt-3">
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
        </div>
      ) : null}
    </div>
  );
};

export default TableCard;
