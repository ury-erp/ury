import { Fragment, useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
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
  updateTableReservation,
  updateTableReservationStatus,
  getActiveReservations,
  getBranchReservationSettings,
  type Room,
  type Table,
  type TableReservation,
  type BranchReservationSettings,
} from '../lib/table-api';
import { getMergeGroupMembers, formatMergedTableLabelFromGroup, getTableRenderGroups, sortTablesByMergeGroups } from '../lib/table-utils';
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
import TableCard, { TABLE_STATE_STYLES } from '../components/TableCard';
import MergeLinkConnector from '../components/MergeLinkConnector';
import TableReservationDialog, { type ReservationFormData } from '../components/TableReservationDialog';
import TableReservationEditDialog, { type EditReservationFormData } from '../components/TableReservationEditDialog';
import TableReservationWarningDialog from '../components/TableReservationWarningDialog';
import TableReservationCancelDialog from '../components/TableReservationCancelDialog';

const TableView = () => {
  const navigate = useNavigate();
  const { posProfile, setSelectedTable, setSelectedCustomer, setSelectedOrderType } = usePOSStore();
  const user = useRootStore((state) => state.user);
  const showCaptainTransfer = canCaptainTransfer(user, posProfile);
  const isRestricted = isUserRestrictedFromTableOrders(user, posProfile);

  const branch = posProfile?.branch ?? null;
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [allBranchTables, setAllBranchTables] = useState<Table[]>([]);
  const [tablesCache, setTablesCache] = useState<Record<string, Table[]>>({});
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);
  const [roomCounts, setRoomCounts] = useState<Record<string, number>>({});

  const [branchSettings, setBranchSettings] = useState<BranchReservationSettings | null>(null);
  const [activeReservationsList, setActiveReservationsList] = useState<TableReservation[]>([]);

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

  // Reservation dialogs state
  const [reservationTable, setReservationTable] = useState<Table | null>(null);
  const [editReservation, setEditReservation] = useState<TableReservation | null>(null);
  const [reservationWarningOpen, setReservationWarningOpen] = useState(false);
  const [pendingTable, setPendingTable] = useState<string | null>(null);
  const [reservationInfo, setReservationInfo] = useState<TableReservation | null>(null);
  const [cancelReservationTable, setCancelReservationTable] = useState<string | null>(null);
  const [cancelReservationInfo, setCancelReservationInfo] = useState<TableReservation | null>(null);
  const [cancelReservationLoading, setCancelReservationLoading] = useState(false);
  const [confirmArrivalLoading, setConfirmArrivalLoading] = useState(false);

  const [isLayoutView, setIsLayoutView] = useState(false);

  const persistRoomCounts = useCallback((counts: Record<string, number>) => {
    if (!branch) return;
    sessionStorage.setItem(`ury_room_counts_${branch}`, JSON.stringify(counts));
  }, [branch]);

  // Load branch reservation settings safely
  useEffect(() => {
    if (!branch) return;
    getBranchReservationSettings(branch)
      .then((settings) => setBranchSettings(settings))
      .catch((err) => console.error('Failed to load branch reservation settings', err));
  }, [branch]);

  // Fetch rooms
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
        setError('Failed to load rooms');
      } finally {
        setLoadingRooms(false);
      }
    }

    fetchRooms();
  }, [branch]);

  // Fetch room table counts
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
        if (branch) {
          getActiveReservations(branch)
            .then((res) => setActiveReservationsList(res || []))
            .catch(() => setActiveReservationsList([]));
        }
        return;
      }

      setLoadingTables(true);
      try {
        const fetchedTables = await getTables(roomName);
        const sortedTables = sortTablesByMergeGroups(fetchedTables);
        setTables(sortedTables);
        setTablesCache((prev) => ({ ...prev, [roomName]: sortedTables }));

        if (branch) {
          getActiveReservations(branch)
            .then((res) => setActiveReservationsList(res || []))
            .catch(() => setActiveReservationsList([]));
        }
      } catch (e) {
        console.error('Failed to load tables:', e);
        setError('Failed to load tables');
        setTables([]);
      } finally {
        setLoadingTables(false);
      }
    },
    [branch, tablesCache]
  );

  useEffect(() => {
    if (!selectedRoom) return;
    loadTables(selectedRoom);
  }, [selectedRoom, loadTables]);

  // Fetch all branch tables for edit dialog dropdown
  useEffect(() => {
    if (!branch) return;
    getVacantTablesForBranch(branch)
      .then((tList) => setAllBranchTables(tList))
      .catch(console.error);
  }, [branch]);
  // Derived reservation maps
  const { lockActiveReservationsByTable, upcomingReservationsByTable, allReservationsByTable } = useMemo(() => {
    const lockMap = new Map<string, TableReservation>();
    const upcomingMap = new Map<string, TableReservation>();
    const allMap = new Map<string, TableReservation>();

    for (const res of activeReservationsList) {
      if (!allMap.has(res.reserved_table)) {
        allMap.set(res.reserved_table, res);
      }
      if (res.is_lock_window_active) {
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
      allReservationsByTable: allMap,
    };
  }, [activeReservationsList]);

  const isReservationEnabled = branchSettings ? branchSettings.enable_reservation !== 0 : true;

  const handleNavigateToPOS = async (tableName: string) => {
    if (!selectedRoom) return;

    // Check if user is restricted from taking table orders
    if (isUserRestrictedFromTableOrders(user, posProfile)) {
      showToast.error(t('errors.dine_in_restricted') || 'Dine In is not available for your role');
      return;
    }

    // Check if table is under active reservation lock window
    const activeLockRes = lockActiveReservationsByTable.get(tableName);
    if (activeLockRes) {
      setPendingTable(tableName);
      setReservationInfo(activeLockRes);
      setReservationWarningOpen(true);
      return;
    }

    try {
      const reservation = await checkTableReservation(tableName);

      if (reservation && reservation.is_lock_window_active) {
        setPendingTable(tableName);
        setReservationInfo(reservation);
        setReservationWarningOpen(true);
        return;
      }

      setSelectedOrderType(DINE_IN);
      setSelectedTable(tableName, selectedRoom);
      navigate('/');
    } catch {
      setSelectedOrderType(DINE_IN);
      setSelectedTable(tableName, selectedRoom);
      navigate('/');
    }
  };

  const handleReservationContinue = async () => {
    if (!pendingTable || !selectedRoom) return;

    setConfirmArrivalLoading(true);

    try {
      if (reservationInfo?.name) {
        await updateTableReservationStatus(reservationInfo.name, 'Completed');
      }

      // Pre-populate customer in store
      if (reservationInfo?.customer) {
        setSelectedCustomer({
          id: reservationInfo.customer,
          name: reservationInfo.customer_name || reservationInfo.customer,
          phone: reservationInfo.customer_phone || '',
        });
      }

      showToast.success('Customer arrival confirmed. Table is now occupied.');
      setSelectedOrderType(DINE_IN);
      setSelectedTable(pendingTable, selectedRoom);
      navigate('/');
    } catch (error) {
      console.error(error);
      showToast.error(error instanceof Error ? error.message : 'Failed to confirm arrival');
    } finally {
      setConfirmArrivalLoading(false);
      setReservationWarningOpen(false);
      setPendingTable(null);
      setReservationInfo(null);
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
      showToast.success('Table reserved successfully');
      if (selectedRoom) {
        await loadTables(selectedRoom, { useCache: false });
      }
      setReservationTable(null);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Failed to reserve table');
      throw error;
    }
  };

  const handleEditReservationOpen = async (tableName: string) => {
    try {
      const existing = allReservationsByTable.get(tableName) || (await checkTableReservation(tableName));
      if (!existing) {
        showToast.error('No reservation found for this table');
        return;
      }
      setEditReservation(existing);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Failed to fetch reservation details');
    }
  };

  const handleEditReservationConfirm = async (data: EditReservationFormData) => {
    try {
      await updateTableReservation({
        reservation_name: data.reservation_name,
        table: data.table,
        customer: data.customer,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        no_of_pax: data.no_of_pax,
        reserved_at: data.reservedAt,
        notes: data.notes,
        branch: branch || undefined,
      });
      showToast.success('Reservation updated successfully');
      if (selectedRoom) {
        await loadTables(selectedRoom, { useCache: false });
      }
      setEditReservation(null);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Failed to update reservation');
      throw error;
    }
  };

  const handleCancelReservation = async (tableName: string) => {
    try {
      const reservation = allReservationsByTable.get(tableName) || (await checkTableReservation(tableName));
      if (!reservation) {
        showToast.error('This table has no active reservation');
        return;
      }
      setCancelReservationTable(tableName);
      setCancelReservationInfo(reservation);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Failed to fetch reservation details');
    }
  };

  const handleCancelReservationConfirm = async () => {
    if (!cancelReservationTable || !cancelReservationInfo) return;
    setCancelReservationLoading(true);
    try {
      await updateTableReservationStatus(cancelReservationInfo.name, 'Cancelled');
      showToast.success('Reservation cancelled successfully');
      if (selectedRoom) {
        await loadTables(selectedRoom, { useCache: false });
      }
      setCancelReservationTable(null);
      setCancelReservationInfo(null);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Failed to cancel reservation');
    } finally {
      setCancelReservationLoading(false);
    }
  };

  const handleReservationCancel = () => {
    if (pendingTable && reservationInfo) {
      const formattedTime = reservationInfo.reserved_at ? reservationInfo.reserved_at.replace('T', ' ') : '';
      showToast.error(`Table ${pendingTable} is reserved for ${formattedTime}.`);
    }
    setReservationWarningOpen(false);
    setPendingTable(null);
    setReservationInfo(null);
  };

  const handlePreviewTable = (table: Table, event?: MouseEvent<HTMLButtonElement>) => {
    event?.stopPropagation();
    handleNavigateToPOS(table.name);
  };

  const handlePrintTable = async (table: Table, event?: MouseEvent<HTMLButtonElement>) => {
    event?.stopPropagation();
    setPrintingTable(table.name);
    try {
      const order = await getTableOrder(table.name);
      if (!order) {
        showToast.error('No active order found for this table');
        return;
      }

      const printFormatName = await resolvePrintFormat(order.order_type);
      await printOrder(order.name, printFormatName);
      showToast.success('Order sent to printer');
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Failed to print order');
    } finally {
      setPrintingTable(null);
    }
  };

  const handleOpenTransferTable = async (table: Table) => {
    if (!branch) return;
    setTransferSourceTable(table);
    setTransferDestinationsLoading(true);

    try {
      const [order, vacantTables] = await Promise.all([
        getTableOrder(table.name),
        getVacantTablesForBranch(branch, table.name),
      ]);

      setTransferInvoiceName(order?.name ?? null);
      setTransferDestinationTables(vacantTables);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Failed to prepare table transfer');
      setTransferSourceTable(null);
    } finally {
      setTransferDestinationsLoading(false);
    }
  };

  const handleTableTransferConfirm = async (targetTable: string) => {
    if (!transferSourceTable) return;
    try {
      await tableTransfer(transferSourceTable.name, targetTable);
      showToast.success(`Table transferred from ${transferSourceTable.name} to ${targetTable}`);
      if (selectedRoom) {
        await loadTables(selectedRoom, { useCache: false });
      }
      setTransferSourceTable(null);
      setTransferInvoiceName(null);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Failed to transfer table');
    }
  };

  const handleOpenCaptainTransfer = async (table: Table) => {
    try {
      const order = await getTableOrder(table.name);
      if (!order) {
        showToast.error('No active order found for this table');
        return;
      }
      setCaptainTransferContext({
        table,
        invoiceName: order.name,
        currentCaptain: order.captain ?? '',
      });
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Failed to fetch order details');
    }
  };

  const handleCaptainTransferConfirm = async (newCaptain: string) => {
    if (!captainTransferContext) return;
    try {
      await captainTransfer(captainTransferContext.invoiceName, newCaptain);
      showToast.success(`Captain transferred to ${newCaptain}`);
      if (selectedRoom) {
        await loadTables(selectedRoom, { useCache: false });
      }
      setCaptainTransferContext(null);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Failed to transfer captain');
    }
  };

  const handleMergeConfirm = async (selectedTableNames: string[]) => {
    if (!mergeSourceTable) return;
    try {
      await mergeTablesBatch(mergeSourceTable.name, selectedTableNames);
      showToast.success('Tables merged successfully');
      if (selectedRoom) {
        await loadTables(selectedRoom, { useCache: false });
      }
      setMergeSourceTable(null);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Failed to merge tables');
    }
  };

  const handleUnmergeConfirm = async () => {
    if (!unmergeSourceTable) return;
    try {
      await unmergeTables(unmergeSourceTable.name);
      showToast.success('Tables unmerged successfully');
      if (selectedRoom) {
        await loadTables(selectedRoom, { useCache: false });
      }
      setUnmergeSourceTable(null);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Failed to unmerge tables');
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
        onReserve={() => setReservationTable(table)}
        onNavigate={() => handleNavigateToPOS(table.name)}
        onPreview={(event) => handlePreviewTable(table, event)}
        onPrint={(event) => handlePrintTable(table, event)}
        isPrinting={printingTable === table.name}
        isRestricted={isRestricted}
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
      {/* Header with Rooms and Layout View */}
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

      {/* Main Grid View */}
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

      {/* Dialogs */}
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

      <TableReservationWarningDialog
        open={reservationWarningOpen}
        reservation={reservationInfo}
        tableName={pendingTable ?? ''}
        loading={confirmArrivalLoading}
        onConfirmArrival={handleReservationContinue}
        onCancel={handleReservationCancel}
      />

      {/* Status Legend */}
      <div className="fixed bottom-[4.5rem] w-full p-4 bg-white border-t border-gray-200">
        <div className="max-w-screen-xl mx-auto">
          <div className="flex items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-emerald-50 border border-emerald-300 rounded"></div>
              <span>{t('tables.available')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-amber-100 border border-amber-300 rounded"></div>
              <span>{t('tables.occupied')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-50/40 border border-blue-200/70 rounded"></div>
              <span>{t('tables.merged')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TableView;
