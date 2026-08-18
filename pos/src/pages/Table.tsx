import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Coins, Layout, Loader2, Square, Users } from 'lucide-react';
import { cn, formatInvoiceTime } from '../lib/utils';
import { usePOSStore } from '../store/pos-store';
import { getRooms, getTables, getTableCount, getTableInvoiceStatus, transferTable, type Room, type Table, type TableInvoiceStatus } from '../lib/table-api';
import { Spinner } from '../components/ui/spinner';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { DINE_IN } from '../data/order-types';
import { getTableOrder } from '../lib/order-api';
import { reprintKot } from '../lib/invoice-api';
import { printOrder } from '../lib/print';
import { showToast } from '../components/ui/toast';
import { canUserBill } from '../lib/role-utils';
import { useRootStore } from '../store/root-store';
import type { RootState } from '../store/root-store';
import { t } from '../i18n';

import LayoutView from '../components/LayoutView';
import TableSwitchDialog from '../components/TableSwitchDialog';
import PrintChoiceDialog from '../components/PrintChoiceDialog';
import PaymentDialog from '../components/PaymentDialog';

interface PendingPayment {
  invoice: string;
  customer: string;
  table: string;
  room: string;
  grandTotal: number;
  roundedTotal: number;
}

const sortTables = (tables: Table[]) => [...tables].sort((a, b) => a.name.localeCompare(b.name));

const TableView = () => {
  const navigate = useNavigate();
  const { posProfile, setSelectedTable, setSelectedOrderType } = usePOSStore();
  const user = useRootStore((state: RootState) => state.user);
  const userCanBill = canUserBill(user, posProfile);

  const branch = posProfile?.branch ?? null;
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [tablesCache, setTablesCache] = useState<Record<string, Table[]>>({});
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);
  const [roomCounts, setRoomCounts] = useState<Record<string, number>>({});
  const [loadingRoomCounts, setLoadingRoomCounts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printingTable, setPrintingTable] = useState<string | null>(null);
  const [switchFromTable, setSwitchFromTable] = useState<Table | null>(null);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [printChoiceTable, setPrintChoiceTable] = useState<Table | null>(null);
  const [printBusy, setPrintBusy] = useState<'kot' | 'bill' | null>(null);
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  const [invoiceStatus, setInvoiceStatus] = useState<Record<string, TableInvoiceStatus>>({});

  const persistRoomCounts = useCallback((counts: Record<string, number>) => {
    if (!branch) return;
    sessionStorage.setItem(`ury_room_counts_${branch}`, JSON.stringify(counts));
  }, [branch]);

  useEffect(() => {
    async function fetchRooms() {
      if (!branch) return;
      setLoadingRooms(true);
      setError(null);

      try {
        const sessionKey = `ury_rooms_${branch}`;
        const cachedRooms = sessionStorage.getItem(sessionKey);

        if (cachedRooms) {
          const parsedRooms = JSON.parse(cachedRooms) as Room[];
          setRooms(parsedRooms);
          setSelectedRoom(prev => prev ?? (parsedRooms[0]?.name ?? null));
        } else {
          const fetchedRooms = await getRooms(branch);
          setRooms(fetchedRooms);
          setSelectedRoom(prev => prev ?? (fetchedRooms[0]?.name ?? null));
          sessionStorage.setItem(sessionKey, JSON.stringify(fetchedRooms));
        }
      } catch (e) {
        console.error(e);
        setError('Failed to load rooms');
      } finally {
        setLoadingRooms(false);
      }
    }

    fetchRooms();
  }, [branch]);

  useEffect(() => {
    if (!branch || rooms.length === 0) return;
    const cacheKey = `ury_room_counts_${branch}`;
    const cachedCounts = sessionStorage.getItem(cacheKey);
    let shouldFetch = true;

    if (cachedCounts) {
      try {
        const parsedCounts = JSON.parse(cachedCounts) as Record<string, number>;
        setRoomCounts(parsedCounts);
        const hasAllRooms = rooms.every(room => typeof parsedCounts[room.name] === 'number');
        if (hasAllRooms) {
          shouldFetch = false;
        }
      } catch {
        sessionStorage.removeItem(cacheKey);
      }
    }

    if (!shouldFetch) return;

  async function fetchRoomCounts() {
      setLoadingRoomCounts(true);
      try {
        const counts = await Promise.all(
          rooms.map(room => getTableCount(room.name, room.branch))
        );
        const nextCounts = rooms.reduce((acc, room, index) => {
          acc[room.name] = counts[index];
          return acc;
        }, {} as Record<string, number>);
        setRoomCounts(nextCounts);
        persistRoomCounts(nextCounts);
      } catch (error) {
        console.error('Failed to load room counts', error);
      } finally {
        setLoadingRoomCounts(false);
      }
    }

    fetchRoomCounts();
  }, [branch, rooms, persistRoomCounts]);

  const loadTables = useCallback(
    async (roomName: string, options?: { useCache?: boolean }) => {
      if (!roomName) return;
      setError(null);

      const shouldUseCache = options?.useCache !== false;
      if (shouldUseCache && tablesCache[roomName]) {
        setTables(sortTables(tablesCache[roomName]));
        setLoadingTables(false);
        // Printed-bill state is never cached: it changes with every print.
        getTableInvoiceStatus(roomName).then(setInvoiceStatus).catch(() => setInvoiceStatus({}));
        return;
      }

      setLoadingTables(true);
      try {
        const [fetchedTables, fetchedStatus] = await Promise.all([
          getTables(roomName),
          getTableInvoiceStatus(roomName).catch(() => ({})),
        ]);
        setInvoiceStatus(fetchedStatus);
        const sortedTables = sortTables(fetchedTables);
        setTables(sortedTables);
        setTablesCache(prev => ({ ...prev, [roomName]: sortedTables }));

        // Keep the room chip in sync: the cached count is otherwise never
        // invalidated when tables are added or removed.
        setRoomCounts(prev => {
          if (prev[roomName] === sortedTables.length) return prev;
          const next = { ...prev, [roomName]: sortedTables.length };
          persistRoomCounts(next);
          return next;
        });
      } catch (e) {
        console.error(e);
        setError('Failed to load tables');
        setTables([]);
      } finally {
        setLoadingTables(false);
      }
    },
    [tablesCache, persistRoomCounts]
  );

  useEffect(() => {
    if (!selectedRoom) return;
    loadTables(selectedRoom);
  }, [selectedRoom, loadTables]);

  const handleNavigateToPOS = (tableName: string) => {
    if (!selectedRoom) return;
    setSelectedOrderType(DINE_IN);
    setSelectedTable(tableName, selectedRoom);
    navigate('/');
  };

  const handlePreviewTable = (table: Table, event?: MouseEvent<HTMLButtonElement>) => {
    event?.stopPropagation();
    handleNavigateToPOS(table.name);
  };

  const handlePrintBill = async (table: Table, event?: MouseEvent<HTMLButtonElement>) => {
    event?.stopPropagation();

    if (!posProfile) {
      showToast.error('POS profile not loaded yet');
      return;
    }

    setPrintingTable(table.name);
    try {
      const orderResponse = await getTableOrder(table.name);
      const order = orderResponse.message;
      const invoiceId = order?.name;

      if (!order || !invoiceId) {
        showToast.error('No active order found for this table');
        return;
      }

      // Print only once — a second tap goes straight to payment instead of
      // producing a duplicate bill. The table stays occupied until settled.
      if (order.invoice_printed !== 1) {
        await printOrder({ orderId: invoiceId, posProfile });
        showToast.success('Printed successfully');
      }
      setInvoiceStatus(prev => ({
        ...prev,
        [table.name]: { invoice: invoiceId, invoice_printed: 1 },
      }));

      // Waiters may print the bill but not collect payment.
      if (!userCanBill) return;

      setPendingPayment({
        invoice: invoiceId,
        customer: order.customer,
        table: table.name,
        room: table.restaurant_room,
        grandTotal: order.grand_total,
        roundedTotal: order.rounded_total ?? order.grand_total,
      });
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Failed to print order');
    } finally {
      setPrintingTable(null);
    }
  };

  // Full-order KOT to the billing-area printer (POS Profile table/parcel
  // order printer). Never touches invoice_printed and never opens payment.
  const handlePrintKot = async (table: Table) => {
    try {
      const orderResponse = await getTableOrder(table.name);
      const order = orderResponse.message;

      if (!order?.name) {
        showToast.error('No active order found for this table');
        return;
      }

      await reprintKot(order.name);
      showToast.success('KOT printed');
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Failed to print KOT');
    }
  };

  // Print button: with KOT reprint enabled offer KOT vs Bill, otherwise keep
  // the one-tap bill flow. Waiters (no billing role) never get the Bill
  // option — their Print goes straight to KOT.
  const kotReprintEnabled = posProfile?.custom_enable_kot_reprint === 1;

  const handlePrintTable = (table: Table, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (kotReprintEnabled && userCanBill) {
      setPrintChoiceTable(table);
    } else if (kotReprintEnabled) {
      void (async () => {
        setPrintingTable(table.name);
        try {
          await handlePrintKot(table);
        } finally {
          setPrintingTable(null);
        }
      })();
    } else if (userCanBill) {
      void handlePrintBill(table);
    }
  };

  const handleChooseKot = async () => {
    if (!printChoiceTable) return;
    setPrintBusy('kot');
    try {
      await handlePrintKot(printChoiceTable);
    } finally {
      setPrintBusy(null);
      setPrintChoiceTable(null);
    }
  };

  const handleChooseBill = async () => {
    if (!printChoiceTable) return;
    setPrintBusy('bill');
    try {
      await handlePrintBill(printChoiceTable);
    } finally {
      setPrintBusy(null);
      setPrintChoiceTable(null);
    }
  };

  const handlePayTable = async (table: Table, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    setPrintingTable(table.name);
    try {
      const orderResponse = await getTableOrder(table.name);
      const order = orderResponse.message;

      if (!order?.name) {
        showToast.error('No active order found for this table');
        return;
      }

      setPendingPayment({
        invoice: order.name,
        customer: order.customer,
        table: table.name,
        room: table.restaurant_room,
        grandTotal: order.grand_total,
        roundedTotal: order.rounded_total ?? order.grand_total,
      });
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Failed to load order');
    } finally {
      setPrintingTable(null);
    }
  };

  const handleOpenSwitch = (table: Table, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setSwitchFromTable(table);
  };

  const handleSwitchTable = async (target: Table) => {
    if (!switchFromTable) return;

    setSwitchingTo(target.name);
    try {
      const orderResponse = await getTableOrder(switchFromTable.name);
      const invoiceId = orderResponse.message?.name;

      if (!invoiceId) {
        showToast.error('No active order found for this table');
        return;
      }

      await transferTable(switchFromTable.name, target.name, invoiceId);
      showToast.success(`Order moved to ${target.name}`);
      setSwitchFromTable(null);
      await loadTables(switchFromTable.restaurant_room, { useCache: false });
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Failed to switch table');
    } finally {
      setSwitchingTo(null);
    }
  };

  const tablesToDisplay = useMemo(() => sortTables(tables), [tables]);

  const hasRooms = rooms.length > 0;
  const showGridSkeleton = loadingTables || !selectedRoom;

  const handleRoomChange = (roomName: string) => {
    if (roomName === selectedRoom) {
      loadTables(roomName, { useCache: false });
      return;
    }

    setSelectedRoom(roomName);

    if (tablesCache[roomName]) {
      setTables(sortTables(tablesCache[roomName]));
      setLoadingTables(false);
    } else {
      setLoadingTables(true);
      setTables([]);
    }
  };

  const [isLayoutView, setIsLayoutView] = useState(false);

  const handleLayoutView = () => {
    if (selectedRoom) {
      loadTables(selectedRoom, { useCache: false });
    }
    setIsLayoutView(true);
  };

  if (isLayoutView && selectedRoom) {
    return (
      <LayoutView
        selectedRoom={selectedRoom}
        tables={tablesToDisplay}
        onBackToGrid={() => setIsLayoutView(false)}
        onRefresh={() => loadTables(selectedRoom, { useCache: false })}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 bg-white border-b border-gray-200">
        <div className="max-w-screen-xl mx-auto">
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-start gap-4">
              <div className="flex flex-wrap gap-2">
                {loadingRooms && (
                  <div className="flex-1 min-w-[160px]">
                    <Spinner message="Loading rooms..." />
                  </div>
                )}

                {!loadingRooms && !hasRooms && (
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    No rooms found for this branch
                  </div>
                )}

                {rooms.map(room => (
                  <Button
                    key={room.name}
                    variant="tab"
                    data-selected={selectedRoom === room.name}
                    onClick={() => handleRoomChange(room.name)}
                    className="h-fit"
                  >
                    {room.name}
                    {typeof roomCounts[room.name] === 'number' ? (
                      <Badge variant="outline" className="ml-2 bg-white/60">
                        {roomCounts[room.name]}
                      </Badge>
                    ) : null}
                  </Button>
                ))}
              </div>

              <div className="flex-shrink-0">
                <Button
                  variant="tab"
                  className="flex items-center gap-2 text-sm"
                  onClick={() => handleLayoutView()}
                >
                  <Layout className="w-4 h-4" />
                  {t('tables.layout_view')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* no max-width cap: the grid should use the whole screen so a wide
          monitor shows more tables per row, not wider cards */}
      <div className="flex-1 overflow-auto bg-gray-50 p-3">
        <div className="h-full">
          {error && !loadingTables ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-red-500">
              <AlertTriangle className="w-10 h-10" />
              <p>{error}</p>
            </div>
          ) : showGridSkeleton ? (
            <Spinner message={t('common.loading_tables')} />
          ) : tablesToDisplay.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-500">
              <Square className="w-10 h-10" />
              <p>{t('tables.no_tables_found')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
              {tablesToDisplay.map(table => {
                const isOccupied = table.occupied === 1;
                const isBillPrinted = invoiceStatus[table.name]?.invoice_printed === 1;
                // Three states, three colours: green free, red running order,
                // yellow bill printed and waiting to be settled. The old
                // status badge, room name and shape icon are gone — the colour
                // carries the status and the room is already the selected tab.
                const awaitingPayment = isOccupied && isBillPrinted;

                return (
                  <div
                    key={table.name}
                    role={isOccupied ? 'group' : 'button'}
                    tabIndex={isOccupied ? -1 : 0}
                    onClick={() => {
                      if (!isOccupied) {
                        handleNavigateToPOS(table.name);
                      }
                    }}
                    className={cn(
                      // The whole card carries the status colour — that is what
                      // makes a full room readable in one glance — with a
                      // saturated top strip on top of the soft body tint.
                      'relative h-28 flex flex-col overflow-hidden rounded-lg border border-t-4 shadow-md shadow-cyan-900/25 transition-all',
                      awaitingPayment
                        ? 'bg-amber-50 border-amber-200 border-t-amber-400'
                        : isOccupied
                          ? 'bg-red-50 border-red-200 border-t-red-500'
                          : 'bg-emerald-50 border-emerald-200 border-t-emerald-400 hover:shadow-md hover:border-emerald-300 cursor-pointer',
                    )}
                  >
                    {/* Fixed-height rows, not centred blocks: with a centred
                        layout the table number sat at a different height on
                        cards that carry an action strip, so a row of cards
                        never lined up. */}
                    <div className="h-5 flex items-center justify-between px-2">
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full flex-shrink-0',
                          awaitingPayment ? 'bg-amber-400' : isOccupied ? 'bg-red-500' : 'bg-emerald-400'
                        )}
                        aria-hidden
                      />
                      {typeof table.no_of_seats === 'number' && (
                        <span className="flex items-center gap-0.5 text-[11px] text-gray-500 flex-shrink-0">
                          <Users className="w-3 h-3" />
                          {table.no_of_seats}
                        </span>
                      )}
                    </div>

                    <div className="h-7 flex items-center justify-center px-2">
                      <span className="font-bold text-xl leading-7 text-gray-900 truncate max-w-full" title={table.name}>
                        {table.name}
                      </span>
                    </div>

                    <div className="h-5 flex items-center justify-center gap-1 px-2">
                      {isOccupied && (
                        <span className="text-[11px] text-gray-500 tabular-nums leading-4">
                          {formatInvoiceTime(table.latest_invoice_time)}
                        </span>
                      )}
                      {table.is_take_away === 1 && (
                        <Badge variant="pending" className="text-[10px] px-1.5 py-0">
                          Take away
                        </Badge>
                      )}
                    </div>

                    {awaitingPayment ? (
                      // Bill already printed: the only remaining action is
                      // collecting payment (the table frees on settle).
                      userCanBill ? (
                        <button
                          onClick={(event) => handlePayTable(table, event)}
                          disabled={printingTable === table.name}
                          className="mt-auto h-8 flex items-center justify-center gap-1 text-[11px] font-semibold bg-primary-600 text-white hover:bg-primary-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {printingTable === table.name ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              <Coins className="w-3 h-3" />
                              Payment
                            </>
                          )}
                        </button>
                      ) : (
                        <p className="mt-auto h-8 flex items-center justify-center text-[10px] font-semibold text-amber-700 bg-white/70 border-t border-gray-200">
                          Awaiting payment
                        </p>
                      )
                    ) : isOccupied ? (
                      // Segmented action strip. Waiters take and view orders
                      // only: Transfer and Print belong to whoever may bill.
                      <div className={cn(
                        'mt-auto grid divide-x divide-gray-200 border-t border-gray-200 bg-white/70',
                        userCanBill ? 'grid-cols-3' : 'grid-cols-1'
                      )}>
                        <button
                          onClick={(event) => handlePreviewTable(table, event)}
                          title="Kot-View"
                          className="h-8 px-0.5 text-[9.5px] font-semibold tracking-tight whitespace-nowrap text-gray-800 hover:bg-white transition"
                        >
                          Kot-View
                        </button>
                        {userCanBill && (
                          <>
                            <button
                              onClick={(event) => handleOpenSwitch(table, event)}
                              title="Transfer"
                              className="h-8 px-0.5 text-[9.5px] font-semibold tracking-tight whitespace-nowrap text-gray-800 hover:bg-white transition"
                            >
                              Transfer
                            </button>
                            <button
                              onClick={(event) => handlePrintTable(table, event)}
                              disabled={printingTable === table.name}
                              title="Print"
                              className="h-8 px-0.5 flex items-center justify-center text-[9.5px] font-semibold tracking-tight whitespace-nowrap text-gray-800 hover:bg-white transition disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {printingTable === table.name ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                'Print'
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Status Legend — in the column flow, not fixed: as an overlay it hid
          the bottom row of table cards, which the grid never scrolled past. */}
      <div className="flex-shrink-0 p-3 bg-white border-t border-gray-200">
        <div className="max-w-screen-xl mx-auto">
          <div className="flex items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-emerald-50 border border-emerald-300 rounded"></div>
              <span>{t('tables.available')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-50 border border-red-400 rounded"></div>
              <span>{t('tables.occupied')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-amber-50 border border-amber-400 rounded"></div>
              <span>Bill printed — awaiting payment</span>
            </div>
          </div>
        </div>
      </div>

      <TableSwitchDialog
        isOpen={!!switchFromTable}
        fromTable={switchFromTable}
        tables={tables}
        switching={switchingTo}
        onClose={() => setSwitchFromTable(null)}
        onSelect={handleSwitchTable}
      />

      <PrintChoiceDialog
        isOpen={!!printChoiceTable}
        tableName={printChoiceTable?.name ?? null}
        busy={printBusy}
        onClose={() => setPrintChoiceTable(null)}
        onPrintKot={handleChooseKot}
        onPrintBill={handleChooseBill}
      />

      {pendingPayment && posProfile && (
        <PaymentDialog
          onClose={() => setPendingPayment(null)}
          grandTotal={pendingPayment.grandTotal}
          roundedTotal={pendingPayment.roundedTotal}
          invoice={pendingPayment.invoice}
          customer={pendingPayment.customer}
          posProfile={posProfile.name}
          table={pendingPayment.table}
          cashier={posProfile.cashier}
          owner={posProfile.owner}
          fetchOrders={() => loadTables(pendingPayment.room, { useCache: false })}
          clearSelectedOrder={() => setPendingPayment(null)}
        />
      )}
    </div>
  );
};

export default TableView;