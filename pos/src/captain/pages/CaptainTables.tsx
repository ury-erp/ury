import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Square } from 'lucide-react';
import { Button, Spinner, showToast } from '@ury/ui';
import { useCaptainContext } from '../hooks/useCaptainContext';
import { getTables, type Table } from '../../lib/table-api';
import { getMergeGroupMembers, sortTablesByMergeGroups } from '../../lib/table-utils';
import {
  getActiveTableOrders,
  getUserFullNames,
  type ActiveTableOrder,
} from '../lib/captain-table-api';
import CaptainTableCard, {
  type CaptainTableOwnership,
} from '../components/CaptainTableCard';

/**
 * Captain "Tables" home screen (`/order`). See PLAN.md §5/§6 for the
 * intended IA. Mobile-first: large single-tap table cards, room tabs,
 * no cashier-oriented chrome (no payment/discount/settlement affordances —
 * those never belong on this screen for a Captain, per PLAN §6).
 */
export default function CaptainTables() {
  const navigate = useNavigate();
  const {
    context,
    capabilities,
    branch,
    rooms,
    isLoading: contextLoading,
    error: contextError,
  } = useCaptainContext();

  const currentUser = context?.user ?? null;
  const canAccessOtherCaptainsTables = Boolean(capabilities?.canAccessOtherCaptainsTables);

  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [activeOrders, setActiveOrders] = useState<Map<string, ActiveTableOrder>>(new Map());
  const [ownerNames, setOwnerNames] = useState<Map<string, string>>(new Map());
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesError, setTablesError] = useState<string | null>(null);

  // Default to the Captain's first accessible room. `rooms` from
  // `get_captain_context()` is already scoped to the Captain's assigned
  // room(s) if any, else all branch rooms accessible to them (see
  // `getRoom()` in `ury/ury_pos/api.py`, backing `get_captain_context`) —
  // no extra "assigned vs. all" logic is needed client-side.
  useEffect(() => {
    if (!selectedRoom && rooms.length > 0) {
      setSelectedRoom(rooms[0].name);
    }
  }, [rooms, selectedRoom]);

  const loadTables = useCallback(async (roomName: string) => {
    setTablesLoading(true);
    setTablesError(null);
    try {
      const fetchedTables = await getTables(roomName);
      setTables(sortTablesByMergeGroups(fetchedTables));
    } catch (err) {
      console.error(err);
      setTablesError('Failed to load tables');
      setTables([]);
    } finally {
      setTablesLoading(false);
    }
  }, []);

  const loadActiveOrders = useCallback(async (branchName: string) => {
    try {
      const orders = await getActiveTableOrders(branchName);
      setActiveOrders(orders);

      const waiters = Array.from(orders.values()).map((order) => order.waiter);
      const names = await getUserFullNames(waiters);
      setOwnerNames(names);
    } catch (err) {
      // Non-fatal: table grid still renders with occupied/free state from
      // the bulk table list, just without waiter/total annotations.
      console.error('Failed to load active table orders', err);
    }
  }, []);

  useEffect(() => {
    if (selectedRoom) {
      loadTables(selectedRoom);
    }
  }, [selectedRoom, loadTables]);

  useEffect(() => {
    if (branch) {
      loadActiveOrders(branch);
    }
  }, [branch, loadActiveOrders]);

  const refresh = useCallback(() => {
    if (selectedRoom) loadTables(selectedRoom);
    if (branch) loadActiveOrders(branch);
  }, [selectedRoom, branch, loadTables, loadActiveOrders]);

  const tableGroups = useMemo(() => sortTablesByMergeGroups(tables), [tables]);

  const resolveOwnership = useCallback(
    (table: Table, order: ActiveTableOrder | undefined): CaptainTableOwnership => {
      if (table.occupied !== 1) return 'free';
      if (!order) return 'occupied-unknown';
      return order.waiter === currentUser ? 'mine' : 'other';
    },
    [currentUser]
  );

  const handleTableTap = (table: Table, order: ActiveTableOrder | undefined) => {
    const ownership = resolveOwnership(table, order);

    if (ownership === 'free' || ownership === 'mine') {
      navigate(`/order/table/${table.name}`);
      return;
    }

    // Occupied by someone else (or occupancy with no resolvable owner):
    // elevated/transfer access overrides the base restriction.
    if (canAccessOtherCaptainsTables) {
      navigate(`/order/table/${table.name}`);
      return;
    }

    const ownerName = order ? ownerNames.get(order.waiter) ?? order.waiter : null;
    showToast.error(ownerName ? `Assigned to ${ownerName}` : 'This table is occupied');
  };

  const isLoading = contextLoading;
  const error = contextError;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner message="Loading captain context..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-600" />
          <h2 className="mb-1 text-lg font-semibold text-gray-800">Unable to load tables</h2>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-gray-900">Tables</h1>
          <Button variant="ghost" size="sm" onClick={refresh}>
            Refresh
          </Button>
        </div>

        {rooms.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {rooms.map((room) => (
              <Button
                key={room.name}
                variant="tab"
                size="sm"
                data-selected={selectedRoom === room.name}
                onClick={() => setSelectedRoom(room.name)}
                className="h-9 shrink-0"
              >
                {room.name}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 p-3">
        {rooms.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-gray-500">
            <AlertTriangle className="h-8 w-8" />
            <p className="text-sm">No rooms available for your account.</p>
          </div>
        ) : tablesError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-red-500">
            <AlertTriangle className="h-8 w-8" />
            <p className="text-sm">{tablesError}</p>
          </div>
        ) : tablesLoading ? (
          <Spinner message="Loading tables..." />
        ) : tableGroups.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-gray-500">
            <Square className="h-8 w-8" />
            <p className="text-sm">No tables found in this room.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {tableGroups.map((table) => {
              const order = activeOrders.get(table.name);
              const ownership = resolveOwnership(table, order);
              const ownerName = order ? ownerNames.get(order.waiter) ?? order.waiter : undefined;
              const mergePartners = getMergeGroupMembers(table, tables).filter(
                (name) => name !== table.name
              );

              return (
                <CaptainTableCard
                  key={table.name}
                  table={table}
                  order={order}
                  ownership={ownership}
                  ownerName={ownership === 'mine' ? undefined : ownerName}
                  mergePartners={mergePartners}
                  onTap={() => handleTableTap(table, order)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
