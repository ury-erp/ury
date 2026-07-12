import { ArrowRight, Loader2, X } from 'lucide-react';
import { Button } from './ui';
import { TableShapeIcon } from './TableShapeIcon';
import type { Table } from '../lib/table-api';

interface TableSwitchDialogProps {
  isOpen: boolean;
  fromTable: Table | null;
  tables: Table[];
  switching: string | null;
  onClose: () => void;
  onSelect: (target: Table) => void;
}

/**
 * Pick a destination table for an open order.
 * Only free tables in the same room are offered — the server rejects
 * cross-room transfers and occupied targets.
 *
 * Dine-in and take-away tables are listed separately so the choice is
 * deliberate. Note the order's type is decided at creation (order_type_update
 * runs on before_insert); transferring never rewrites it, so a Dine In order
 * parked on a take-away table stays Dine In.
 */
const TableSwitchDialog = ({
  isOpen,
  fromTable,
  tables,
  switching,
  onClose,
  onSelect,
}: TableSwitchDialogProps) => {
  if (!isOpen || !fromTable) return null;

  const targets = tables.filter(
    (t) =>
      t.name !== fromTable.name &&
      t.occupied !== 1 &&
      t.restaurant_room === fromTable.restaurant_room
  );

  const dineInTables = targets.filter((t) => t.is_take_away !== 1);
  const takeAwayTables = targets.filter((t) => t.is_take_away === 1);

  const renderTable = (target: Table) => {
    const isSwitching = switching === target.name;
    return (
      <button
        key={target.name}
        type="button"
        disabled={!!switching}
        onClick={() => onSelect(target)}
        className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 p-4 hover:border-blue-500 hover:bg-blue-50 disabled:opacity-50 transition-colors"
      >
        {isSwitching ? (
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        ) : (
          <TableShapeIcon shape={target.table_shape} className="w-5 h-5 text-gray-500" />
        )}
        <span className="text-sm font-medium text-gray-900">{target.name}</span>
        {target.no_of_seats ? (
          <span className="text-xs text-gray-500">{target.no_of_seats} seats</span>
        ) : null}
      </button>
    );
  };

  const renderSection = (title: string, hint: string | null, list: Table[]) => {
    if (list.length === 0) return null;
    return (
      <div className="mb-5 last:mb-0">
        <div className="flex items-baseline gap-2 mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
          {hint ? <span className="text-xs text-gray-400">{hint}</span> : null}
        </div>
        <div className="grid grid-cols-3 gap-3">{list.map(renderTable)}</div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4 shadow-xl">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-semibold text-gray-900">Switch Table</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-4 flex items-center gap-2">
          Move the order from <span className="font-medium text-gray-800">{fromTable.name}</span>
          <ArrowRight className="w-4 h-4" />
          <span>pick a free table in {fromTable.restaurant_room}</span>
        </p>

        {targets.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            No free tables available in this room.
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {renderSection('Dine In', null, dineInTables)}
            {renderSection('Take Away', 'parcel counter — order type stays unchanged', takeAwayTables)}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={onClose} disabled={!!switching}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TableSwitchDialog;
