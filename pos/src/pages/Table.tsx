import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Layout, Square } from 'lucide-react';
import { usePOSStore } from '../store/pos-store';
import { useRootStore } from '../store/root-store';
import {
  getRooms,
  getTables,
  getTableCount,
  getVacantTablesForBranch,
  mergeTablesBatch,
  unmergeTables,
  checkTableReservation,
  createTableReservation,
  getActiveReservations,
  getBranchReservationSettings,
  type Room,
  type Table,
  type TableReservation,
  type BranchReservationSettings,
} from '../lib/table-api';
import { getMergeGroupMembers, formatMergedTableLabelFromGroup, getTableRenderGroups, sortTablesByMergeGroups, formatReservationTime, isReservationLockWindowActive } from '../lib/table-utils';
import { Spinner } from '@ury/ui';
import { Button } from '@ury/ui';
import { Badge } from '@ury/ui';
import { DINE_IN } from '../data/order-types';
import { captainTransfer, getTableOrder, tableTransfer } from '../lib/order-api';
import { printOrder } from '../lib/print';
import { resolvePrintFormat } from '../lib/invoice-api';
import { canCaptainTransfer, isUserRestrictedFromTableOrders } from '@ury/core';
import { showToast } from '@ury/ui';
import { t } from '../i18n';
import LayoutView from '../components/LayoutView';
import TableMergeDialog from '../components/TableMergeDialog';
import TableUnmergeDialog from '../components/TableUnmergeDialog';
import TableTransferDialog from '../components/TableTransferDialog';
import CaptainTransferDialog from '../components/CaptainTransferDialog';
import TableCard from '../components/TableCard';
import MergeLinkConnector from '../components/MergeLinkConnector';
import TableReservationDialog, { type ReservationFormData } from '../components/TableReservationDialog';

const TableView = () => {
  const navigate = useNavigate();
  const { posProfile, setSelectedTable, setSelectedOrderType } = usePOSStore();
  const user = useRootStore((state) => state.user);
  const showCaptainTransfer = canCaptainTransfer(user, posProfile);

  const branch = posProfile?.branch ?? null;
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [tablesCache, setTablesCache] = useState<Record<string, Table[]>>({});
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);
  const [roomCounts, setRoomCounts] = useState<Record<string, number>>({});

  const [error, setError] = useState<string | null>(null);
  const [printingTable, setPrintingTable] = useState<string | null>(null);
  const [menuOpenForTable, setMenuOpenForTable] = useState<string | null>(null);
  const [mergeSourceTable, setMergeSourceTable] = useState<Table | null>(null);
  const [unmergeSourceTable, setUnmergeSourceTable] = useState<Table | null>(null);
  const [transferSourceTable, setTransferSourceTable] = useState<Table | null>(null);
  const [transferInvoiceName, setTransferInvoiceName] = useState<string | null>(null);
  const [transferDestinationTables, setTransferDestinationTables] = useState<Table[]>([]);
  const [transferDestinationsLoading, setTransferDestinationsLoading] = useState(false);
  const [captainTransferContext, setCaptainTransferContext] = useState<{
    table: Table;
    invoiceName: string;
    currentCaptain: string;
  } | null>(null);

  // Reservation state
  const [branchSettings, setBranchSettings] = useState<BranchReservationSettings | null>(null);
  const [activeReservationsList, setActiveReservationsList] = useState<TableReservation[]>([]);
  const [reservationTable, setReservationTable] = useState<Table | null>(null);

  // Load branch reservation settings
  useEffect(() => {
    setBranchSettings(null);
    if (!branch) return;
    let isMounted = true;
    getBranchReservationSettings(branch)
      .then((settings) => {
        if (isMounted) setBranchSettings(settings);
      })
      .catch((err) => {
        console.error('Failed to load branch reservation settings', err);
        if (isMounted) setBranchSettings(null);
      });
    return () => {
      isMounted = false;
    };
  }, [branch]);

  const isReservationEnabled = Boolean(branchSettings && Number(branchSettings.enable_reservation) === 1);

  // Periodic polling for active reservations so buffer windows and status transitions reflect in real time
  useEffect(() => {
    if (!branch) return;
    let isMounted = true;

    const fetchReservations = async () => {
      if (!isMounted) return;
      try {
        const res = await getActiveReservations(branch);
        if (isMounted && res) {
          setActiveReservationsList(res);
        }
      } catch (_e) {
        // Polling failure ignored
      }
    };

    fetchReservations();
    const intervalId = setInterval(fetchReservations, 15000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [branch]);

  // Informational toast when a table enters its reservation buffer window
  const notifiedLockReservationsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeReservationsList || activeReservationsList.length === 0) return;

    for (const res of activeReservationsList) {
      if (res.is_lock_window_active && res.status === 'Confirmed' && res.reserved_table) {
        const key = `${res.name || res.reserved_table}_${res.reserved_at}`;
        if (!notifiedLockReservationsRef.current.has(key)) {
          notifiedLockReservationsRef.current.add(key);
          const timeStr = formatReservationTime(res.reserved_at);
          showToast.warning(
            t('tables.reserved_choose_another', { table: res.reserved_table, time: timeStr })
          );
        }
      }
    }
  }, [activeReservationsList]);

  // Derived reservation maps
  const { lockActiveReservationsByTable, upcomingReservationsByTable } = useMemo(() => {
    const lockMap = new Map<string, TableReservation>();
    const upcomingMap = new Map<string, TableReservation>();

    for (const res of activeReservationsList) {
      const isLockActive =
        isReservationLockWindowActive(res, branchSettings?.buffer_time) ||
        (res.is_lock_window_active && res.status === 'Confirmed');
      if (isLockActive && res.status === 'Confirmed') {
        lockMap.set(res.reserved_table, res);
      } else {
        if (!upcomingMap.has(res.reserved_table)) {
          upcomingMap.set(res.reserved_table, res);
        }
      }
    }

    return {
      lockActiveReservationsByTable: lockMap,
      upcomingReservationsByTable: upcomingMap,
    };
  }, [activeReservationsList, branchSettings?.buffer_time]);

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
          setSelectedRoom((prev) => prev ?? (parsedRooms[0]?.name ?? null));
        } else {
          const fetchedRooms = await getRooms(branch);
          setRooms(fetchedRooms);
          setSelectedRoom((prev) => prev ?? (fetchedRooms[0]?.name ?? null));
          sessionStorage.setItem(sessionKey, JSON.stringify(fetchedRooms));
        }
      } catch (e) {
        console.error(e);
        setError(t('tables.failed_to_load_rooms'));
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
        const hasAllRooms = rooms.every((room) => typeof parsedCounts[room.name] === 'number');
        if (hasAllRooms) {
          shouldFetch = false;
        }
      } catch {
        sessionStorage.removeItem(cacheKey);
      }
    }

    if (!shouldFetch) return;

    async function fetchRoomCounts() {
      try {
        const counts = await Promise.all(
          rooms.map((room) => getTableCount(room.name, room.branch))
        );
        const nextCounts = rooms.reduce((acc, room, index) => {
          acc[room.name] = counts[index];
          return acc;
        }, {} as Record<string, number>);
        setRoomCounts(nextCounts);
        persistRoomCounts(nextCounts);
      } catch (error) {
        console.error('Failed to load room counts', error);
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
        setTables(sortTablesByMergeGroups(tablesCache[roomName]));
        setLoadingTables(false);
        return;
      }

      setLoadingTables(true);
      try {
        const fetchedTables = await getTables(roomName);
        const sortedTables = sortTablesByMergeGroups(fetchedTables);
        setTables(sortedTables);
        setTablesCache((prev) => ({ ...prev, [roomName]: sortedTables }));
      } catch (e) {
        console.error(e);
        setError(t('tables.failed_to_load_tables'));
        setTables([]);
      } finally {
        setLoadingTables(false);
      }
    },
    [tablesCache]
  );

  useEffect(() => {
    if (!selectedRoom) return;
    loadTables(selectedRoom);
  }, [selectedRoom, loadTables]);

  const handleNavigateToPOS = async (tableName: string) => {
    if (!selectedRoom) return;

    // Check if user is restricted from taking table orders
    if (isUserRestrictedFromTableOrders(user, posProfile)) {
      showToast.error(t('errors.dine_in_restricted') || 'Dine In is not available for your role');
      return;
    }

    // Check if table has an ongoing active order first
    try {
      const orderResponse = await getTableOrder(tableName);
      const existingInvoice = orderResponse?.message;
      if (
        existingInvoice &&
        existingInvoice.name &&
        existingInvoice.docstatus === 0 &&
        existingInvoice.invoice_printed !== 1
      ) {
        // Ongoing order exists - allow opening/continuing without reservation lock check
        setSelectedOrderType(DINE_IN);
        setSelectedTable(tableName, selectedRoom);
        navigate('/register');
        return;
      }
    } catch {
      // Continue to check reservation if order fetch failed
    }

    // Check if table is under active reservation lock window
    const activeLockRes = lockActiveReservationsByTable.get(tableName);
    const isActiveLockRes =
      activeLockRes &&
      (activeLockRes.is_lock_window_active ||
        isReservationLockWindowActive(activeLockRes, branchSettings?.buffer_time)) &&
      activeLockRes.status === 'Confirmed';

    if (isActiveLockRes) {
      const timeStr = formatReservationTime(activeLockRes.reserved_at);
      showToast.error(t('tables.reserved_choose_another', { table: tableName, time: timeStr }));
      return;
    }

    try {
      const reservation = await checkTableReservation(tableName);
      const isResLocked =
        reservation &&
        (reservation.is_lock_window_active ||
          isReservationLockWindowActive(reservation, branchSettings?.buffer_time)) &&
        reservation.status === 'Confirmed';

      if (isResLocked) {
        const timeStr = formatReservationTime(reservation.reserved_at);
        showToast.error(t('tables.reserved_choose_another', { table: tableName, time: timeStr }));
        return;
      }

      setSelectedOrderType(DINE_IN);
      setSelectedTable(tableName, selectedRoom);
      navigate('/register');
    } catch {
      setSelectedOrderType(DINE_IN);
      setSelectedTable(tableName, selectedRoom);
      navigate('/register');
    }
  };

  const handleReserveConfirm = async (data: ReservationFormData) => {
    if (!reservationTable) return;
    try {
      await createTableReservation({
        table: reservationTable.name,
        customer: data.customer,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        no_of_pax: data.no_of_pax,
        reserved_at: data.reservedAt,
        notes: data.notes,
        branch: branch || undefined,
      });
      showToast.success(t('reservations.reserve_success'));
      if (selectedRoom) {
        await loadTables(selectedRoom, { useCache: false });
      }
      setReservationTable(null);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : t('reservations.reserve_failed'));
      throw error;
    }
  };

  const handlePreviewTable = (table: Table, event?: MouseEvent<HTMLButtonElement>) => {
    event?.stopPropagation();
    handleNavigateToPOS(table.name);
  };

  const handlePrintTable = async (table: Table, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (!posProfile) {
      showToast.error(t('tables.pos_profile_not_loaded'));
      return;
    }

    setPrintingTable(table.name);
    try {
      const orderResponse = await getTableOrder(table.name);
      const invoiceId = orderResponse.message?.name;

      if (!invoiceId) {
        showToast.error(t('tables.no_active_order'));
        return;
      }

      await printOrder({
        orderId: invoiceId,
        posProfile,
        printFormat: resolvePrintFormat(
          orderResponse.message ?? {},
          posProfile.print_format
        ),
      });
      showToast.success(t('tables.printed_successfully'));
      await loadTables(table.restaurant_room, { useCache: false });
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Failed to print order');
    } finally {
      setPrintingTable(null);
    }
  };

  const handleMergeConfirm = async (targetNames: string[]) => {
    if (!mergeSourceTable || targetNames.length === 0) return;

    const sourceName = mergeSourceTable.name;

    try {
      await mergeTablesBatch(sourceName, targetNames);
      if (selectedRoom) {
        await loadTables(selectedRoom, { useCache: false });
      }
      showToast.success(t('tables.merge_success'));
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : t('tables.merge_failed'));
      throw error;
    }
  };

  const handleUnmergeConfirm = async () => {
    if (!unmergeSourceTable) return;

    try {
      await unmergeTables(unmergeSourceTable.name);
      if (selectedRoom) {
        await loadTables(selectedRoom, { useCache: false });
      }
      showToast.success(t('tables.unmerge_success'));
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : t('tables.unmerge_failed'));
      throw error;
    }
  };

  const validateActiveTableOrder = async (tableName: string) => {
    const orderResponse = await getTableOrder(tableName);
    const invoice = orderResponse.message;

    if (!invoice?.name) {
      throw new Error(t('tables.no_active_order'));
    }
    if (invoice.invoice_printed === 1) {
      throw new Error(t('tables.order_already_billed'));
    }

    return invoice;
  };

  const handleOpenTransferTable = async (table: Table) => {
    if (getMergeGroupMembers(table, tables).length > 1) {
      showToast.error(t('tables.transfer_not_for_merged'));
      return;
    }

    if (!branch) {
      showToast.error(t('tables.transfer_failed'));
      return;
    }

    setTransferSourceTable(table);
    setTransferInvoiceName(null);
    setTransferDestinationTables([]);
    setTransferDestinationsLoading(true);

    try {
      const invoice = await validateActiveTableOrder(table.name);
      const destinations = await getVacantTablesForBranch(branch, table.name);
      setTransferDestinationTables(destinations);
      setTransferInvoiceName(invoice.name);
    } catch (error) {
      setTransferSourceTable(null);
      setTransferInvoiceName(null);
      setTransferDestinationTables([]);
      showToast.error(error instanceof Error ? error.message : t('tables.transfer_failed'));
    } finally {
      setTransferDestinationsLoading(false);
    }
  };

  const handleOpenCaptainTransfer = async (table: Table) => {
    try {
      const invoice = await validateActiveTableOrder(table.name);
      if (!invoice.waiter) {
        throw new Error(t('tables.no_active_order'));
      }
      setCaptainTransferContext({
        table,
        invoiceName: invoice.name,
        currentCaptain: invoice.waiter,
      });
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : t('tables.transfer_failed'));
    }
  };

  const handleTableTransferConfirm = async (newTable: string) => {
    if (!transferSourceTable || !transferInvoiceName) return;

    try {
      await tableTransfer(transferSourceTable.name, newTable, transferInvoiceName);
      if (selectedRoom) {
        await loadTables(selectedRoom, { useCache: false });
      }
      showToast.success(t('tables.transfer_success'));
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : t('tables.transfer_failed'));
      throw error;
    }
  };

  const handleCaptainTransferConfirm = async (newCaptain: string) => {
    if (!captainTransferContext) return;

    const { currentCaptain, invoiceName } = captainTransferContext;

    try {
      await captainTransfer(currentCaptain, newCaptain, invoiceName);
      if (selectedRoom) {
        await loadTables(selectedRoom, { useCache: false });
      }
      showToast.success(t('tables.captain_transfer_success'));
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : t('tables.transfer_failed'));
      throw error;
    }
  };

  const mergeAvailableTables = useMemo(() => {
    if (!mergeSourceTable) return [];
    const sourceCluster = new Set(getMergeGroupMembers(mergeSourceTable, tables));
    return tables.filter((table) => {
      if (table.name === mergeSourceTable.name) return false;
      if (sourceCluster.has(table.name)) return false;
      if (table.occupied === 1 && mergeSourceTable.occupied === 1) return false;
      return true;
    });
  }, [mergeSourceTable, tables]);

  const tablesToDisplay = useMemo(() => sortTablesByMergeGroups(tables), [tables]);

  const unmergeGroupMembers = useMemo(() => {
    if (!unmergeSourceTable) return [];
    return getMergeGroupMembers(unmergeSourceTable, tablesToDisplay);
  }, [unmergeSourceTable, tablesToDisplay]);

  const tableRenderGroups = useMemo(() => getTableRenderGroups(tablesToDisplay), [tablesToDisplay]);

  const renderTableCard = (table: Table, className?: string) => {
    const mergeMembers = getMergeGroupMembers(table, tables);
    const mergeGroupLabel =
      mergeMembers.length > 1 ? formatMergedTableLabelFromGroup(mergeMembers) : undefined;
    const canTransferTable = table.occupied === 1 && mergeMembers.length <= 1;

    const isReservedLock = lockActiveReservationsByTable.has(table.name);
    const upcomingRes = upcomingReservationsByTable.get(table.name) || null;
    const activeRes = lockActiveReservationsByTable.get(table.name) || null;

    return (
    <TableCard
      key={table.name}
      table={table}
      isReserved={isReservedLock}
      upcomingReservation={upcomingRes}
      activeReservation={activeRes}
      reservationEnabled={isReservationEnabled}
      mergeGroupLabel={mergeGroupLabel}
      className={className}
      menuOpen={menuOpenForTable === table.name}
      onMenuOpenChange={(open) => setMenuOpenForTable(open ? table.name : null)}
      onMerge={() => setMergeSourceTable(table)}
      onUnmerge={() => setUnmergeSourceTable(table)}
      onTransferTable={canTransferTable ? () => void handleOpenTransferTable(table) : undefined}
      onTransferCaptain={() => void handleOpenCaptainTransfer(table)}
      showCaptainTransfer={showCaptainTransfer}
      onReserve={isReservationEnabled ? () => setReservationTable(table) : undefined}
      onNavigate={() => handleNavigateToPOS(table.name)}
      onPreview={(event) => handlePreviewTable(table, event)}
      onPrint={(event) => handlePrintTable(table, event)}
      isPrinting={printingTable === table.name}
    />
    );
  };

  const hasRooms = rooms.length > 0;
  const showGridSkeleton = loadingTables || !selectedRoom;

  const handleRoomChange = (roomName: string) => {
    if (roomName === selectedRoom) {
      loadTables(roomName, { useCache: false });
      return;
    }

    setSelectedRoom(roomName);

    if (tablesCache[roomName]) {
      setTables(sortTablesByMergeGroups(tablesCache[roomName]));
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
      <div className="p-4 bg-white border-b border-border">
        <div className="max-w-screen-xl mx-auto">
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-start gap-4">
              <div className="flex flex-wrap gap-2">
                {loadingRooms && (
                  <div className="flex-1 min-w-[160px]">
                    <Spinner message={t('common.loading_rooms')} />
                  </div>
                )}

                {!loadingRooms && !hasRooms && (
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    {t('tables.no_rooms_for_branch')}
                  </div>
                )}

                {rooms.map((room) => (
                  <Button
                    key={room.name}
                    variant="tab"
                    data-selected={selectedRoom === room.name}
                    onClick={() => handleRoomChange(room.name)}
                    className="h-fit"
                  >
                    {room.name}
                    {typeof roomCounts[room.name] === 'number' ? (
                      <Badge variant="outline" className="ms-2 bg-white/60">
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

      <div className="flex-1 overflow-auto bg-gray-50 p-6">
        <div className="max-w-screen-xl mx-auto h-full">
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
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 pb-40">
              {tableRenderGroups.map((group) =>
                group.length === 1 ? (
                  renderTableCard(group[0])
                ) : (
                  <div
                    key={group.map((t) => t.name).join('-')}
                    className="col-span-full flex flex-wrap items-stretch gap-y-2 rounded-lg border border-blue-200/70 bg-blue-50/40 p-2"
                  >
                    {group.map((table, index) => (
                      <Fragment key={table.name}>
                        {renderTableCard(
                          table,
                          'min-w-[9.5rem] flex-1 basis-[calc(50%-1.5rem)] sm:basis-[calc(33.333%-1.5rem)] md:min-w-[10rem] md:max-w-[14rem]'
                        )}
                        {index < group.length - 1 && (
                          <MergeLinkConnector
                            leftTable={table.name}
                            rightTable={group[index + 1].name}
                          />
                        )}
                      </Fragment>
                    ))}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>

      <TableMergeDialog
        open={mergeSourceTable !== null}
        onOpenChange={(open) => {
          if (!open) setMergeSourceTable(null);
        }}
        sourceTable={mergeSourceTable}
        availableTables={mergeAvailableTables}
        onConfirm={handleMergeConfirm}
      />

      <TableUnmergeDialog
        open={unmergeSourceTable !== null}
        onOpenChange={(open) => {
          if (!open) setUnmergeSourceTable(null);
        }}
        sourceTable={unmergeSourceTable}
        groupMembers={unmergeGroupMembers}
        onConfirm={handleUnmergeConfirm}
      />

      <TableTransferDialog
        open={transferSourceTable !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTransferSourceTable(null);
            setTransferInvoiceName(null);
            setTransferDestinationTables([]);
          }
        }}
        sourceTable={transferSourceTable}
        destinationTables={transferDestinationTables}
        loading={transferDestinationsLoading}
        onConfirm={handleTableTransferConfirm}
      />

      <CaptainTransferDialog
        open={captainTransferContext !== null}
        onOpenChange={(open) => {
          if (!open) setCaptainTransferContext(null);
        }}
        currentCaptain={captainTransferContext?.currentCaptain ?? ''}
        onConfirm={handleCaptainTransferConfirm}
      />

      <TableReservationDialog
        open={reservationTable !== null}
        table={reservationTable}
        onOpenChange={(open) => {
          if (!open) setReservationTable(null);
        }}
        onConfirm={handleReserveConfirm}
      />

      {/* Status Legend */}
      <div className="fixed bottom-[4.5rem] w-full p-4 bg-white border-t border-border">
        <div className="max-w-screen-xl mx-auto">
          <div className="flex items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-emerald-50 border border-emerald-300 rounded"></div>
              <span>{t('tables.available')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-amber-50 border border-amber-400 rounded"></div>
              <span>{t('tables.occupied')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-50/40 border border-blue-200/70 rounded"></div>
              <span>{t('tables.merged')}</span>
            </div>
            {isReservationEnabled && (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-primary-50 border border-primary-400 rounded"></div>
                <span>{t('tables.reserved_badge')}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TableView;
