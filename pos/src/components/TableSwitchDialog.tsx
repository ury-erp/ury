import { ArrowRight, Loader2, Users, X } from 'lucide-react';
import { Button } from './ui';
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

  // Same card shape as the table grid: white body, green top strip (every
  // target here is free by definition), number big, seats small.
  const renderTable = (target: Table) => {
    const isSwitching = switching === target.name;
    return (
      <button
        key={target.name}
        type="button"
        disabled={!!switching}
        onClick={() => onSelect(target)}
        className="relative h-20 flex flex-col overflow-hidden rounded-lg bg-white border border-gray-200 border-t-4 border-t-emerald-400 shadow-sm hover:shadow-md hover:border-emerald-300 disabled:opacity-50 transition-all"
      >
        <div className="flex justify-end px-1.5 pt-1">
          {target.no_of_seats ? (
            <span className="flex items-center gap-0.5 text-[11px] text-gray-500">
              <Users className="w-3 h-3" />
              {target.no_of_seats}
            </span>
          ) : null}
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center px-1.5 -mt-1">
          {isSwitching ? (
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
          ) : (
            <span className="font-bold text-lg leading-6 text-gray-900 truncate max-w-full" title={target.name}>
              {target.name}
            </span>
          )}
        </div>
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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">{list.map(renderTable)}</div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg p-5 w-full max-w-3xl mx-4 shadow-xl">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-semibold text-gray-900">Transfer Table</h2>
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
