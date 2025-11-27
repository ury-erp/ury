import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Eye, Loader2, Printer, Square, Users } from 'lucide-react';
import { cn } from '../lib/utils';
import { usePOSStore } from '../store/pos-store';
import { getRooms, getTables, getTableCount, type Room, type Table } from '../lib/table-api';
import { Spinner } from '../components/ui/spinner';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { DINE_IN } from '../data/order-types';
import { TableShapeIcon } from '../components/TableShapeIcon';
import { getTableOrder } from '../lib/order-api';
import { printOrder } from '../lib/print';
import { showToast } from '../components/ui/toast';

const sortTables = (tables: Table[]) => [...tables].sort((a, b) => a.name.localeCompare(b.name));

const TableView = () => {
  const navigate = useNavigate();
  const { posProfile, setSelectedTable, setSelectedOrderType } = usePOSStore();

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
        return;
      }

      setLoadingTables(true);
      try {
        const fetchedTables = await getTables(roomName);
        const sortedTables = sortTables(fetchedTables);
        setTables(sortedTables);
        setTablesCache(prev => ({ ...prev, [roomName]: sortedTables }));
      } catch (e) {
        console.error(e);
        setError('Failed to load tables');
        setTables([]);
      } finally {
        setLoadingTables(false);
      }
    },
    [tablesCache]
  );

  const refreshRoomCount = useCallback(async (roomName: string) => {
    const roomMeta = rooms.find(room => room.name === roomName);
    const branchName = roomMeta?.branch ?? branch;
    if (!roomName || !branchName) return;

    try {
      const count = await getTableCount(roomName, branchName);
      setRoomCounts(prev => {
        const next = { ...prev, [roomName]: count };
        persistRoomCounts(next);
        return next;
      });
    } catch (error) {
      console.error(`Failed to refresh count for room ${roomName}`, error);
    }
  }, [rooms, branch, persistRoomCounts]);

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

  const handlePrintTable = async (table: Table, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (!posProfile) {
      showToast.error('POS profile not loaded yet');
      return;
    }

    setPrintingTable(table.name);
    try {
      const orderResponse = await getTableOrder(table.name);
      const invoiceId = orderResponse.message?.name;

      if (!invoiceId) {
        showToast.error('No active order found for this table');
        return;
      }

      await printOrder({ orderId: invoiceId, posProfile });
      showToast.success('Printed successfully');
      await loadTables(table.restaurant_room, { useCache: false });
      await refreshRoomCount(table.restaurant_room);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Failed to print order');
    } finally {
      setPrintingTable(null);
    }
  };

  const formatInvoiceTime = (timestamp: string | null) => {
    if (!timestamp) return 'No bill activity yet';

    const parsedDate = new Date(timestamp);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: 'numeric' });
    }

    const timeOnlyMatch = timestamp.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
    if (timeOnlyMatch) {
      const [, hours, minutes, seconds] = timeOnlyMatch;
      const date = new Date();
      date.setHours(Number(hours), Number(minutes), Number(seconds), 0);
      const formatted = date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      if (/^\d{1,2}:\d{2}$/.test(formatted)) {
        return formatted;
      }
      return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
    }

    return timestamp;
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

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 bg-white border-b border-gray-200">
        <div className="max-w-screen-xl mx-auto">
          <div className="flex flex-col gap-3">
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
                  ) : loadingRoomCounts ? (
                    <Badge variant="outline" className="ml-2 bg-white/60">
                      --
                    </Badge>
                  ) : null}
                </Button>
              ))}
            </div>

            {/* <div className="flex justify-end">
              <Button
                variant="ghost"
                className="flex items-center gap-2 text-sm"
                onClick={() => console.log('Layout view coming soon')}
              >
                <Layout className="w-4 h-4" />
                Layout view
              </Button>
            </div> */}
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
            <Spinner message="Loading tables..." />
          ) : tablesToDisplay.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-500">
              <Square className="w-10 h-10" />
              <p>No tables found for this room</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {tablesToDisplay.map(table => {
                const isOccupied = table.occupied === 1;

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
                      'relative bg-white rounded-lg border-2 p-4 transition-all flex flex-col justify-between gap-y-4',
                      isOccupied
                        ? 'border-amber-400 bg-amber-50 text-amber-900'
                        : 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-400 hover:shadow-md cursor-pointer',
                    )}
                  >
                    <div>
                        <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <TableShapeIcon shape={table.table_shape || 'Rectangle'} />
                            <span className="font-semibold text-lg text-gray-900">{table.name}</span>
                        </div>
                        <Badge variant={isOccupied ? 'warning' : 'success'}>
                            {isOccupied ? 'Occupied' : 'Available'}
                        </Badge>
                        </div>

                        <div className="space-y-2 text-sm text-gray-700">
                        <div className="flex items-center justify-between">
                            <span className="font-medium">Room</span>
                            <span>{table.restaurant_room}</span>
                        </div>
                        {isOccupied && (
                            <div className="flex items-center justify-between">
                            <span className="font-medium">Started at</span>
                            <span>{formatInvoiceTime(table.latest_invoice_time)}</span>
                            </div>
                        )}
                        {typeof table.no_of_seats === 'number' && (
                            <div className="flex items-center justify-between">
                            <span className="font-medium">Seats</span>
                            <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
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
                      <div className="flex gap-2 pt-3 mt-3 border-t border-amber-200">
                        <button
                          onClick={(event) => handlePreviewTable(table, event)}
                          className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded bg-white hover:bg-amber-100 transition"
                        >
                          <Eye className="w-3 h-3" />
                          Preview
                        </button>
                        <button
                          onClick={(event) => handlePrintTable(table, event)}
                          disabled={printingTable === table.name}
                          className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded bg-white hover:bg-amber-100 transition disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {printingTable === table.name ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Printing...
                            </>
                          ) : (
                            <>
                              <Printer className="w-3 h-3" />
                              Print
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">Tap to start a new dine-in order</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Status Legend */}
      <div className="fixed bottom-[4.5rem] w-full p-4 bg-white border-t border-gray-200">
        <div className="max-w-screen-xl mx-auto">
          <div className="flex items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-100 border border-green-300 rounded"></div>
              <span>Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-100 border border-red-300 rounded"></div>
              <span>Occupied</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TableView;