import React, { useEffect, useMemo, useState } from 'react';
import { X, Square, AlertTriangle } from 'lucide-react';
import { usePOSStore } from '../store/pos-store';
import { Dialog, DialogContent, Button, Badge, Spinner, showToast, cn } from '@ury/ui';
import { getRooms, getTables, getActiveReservations, checkTableReservation, Room, Table, TableReservation } from '../lib/table-api';
import { getTableOrder } from '../lib/order-api';
import { TableShapeIcon } from './TableShapeIcon';
import { getMergeGroupMembers, formatMergedTableLabelFromGroup, formatReservationTime } from '../lib/table-utils';
import { t } from '../i18n';

interface Props {
  onClose: () => void;
}

const TableSelectionDialog: React.FC<Props> = ({ onClose }) => {
  const { selectedTable, setSelectedTable, posProfile } = usePOSStore();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [activeReservationsList, setActiveReservationsList] = useState<TableReservation[]>([]);
  const [tablesCache, setTablesCache] = useState<Record<string, Table[]>>({});
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tableWarning, setTableWarning] = useState<string | null>(null);

  const sortTables = (tables: Table[]): Table[] => {
    return [...tables].sort((a, b) => a.name.localeCompare(b.name));
  };

  // Fetch active reservations for the branch
  useEffect(() => {
    if (!posProfile?.branch) return;
    getActiveReservations(posProfile.branch)
      .then((res) => setActiveReservationsList(res || []))
      .catch(() => setActiveReservationsList([]));
  }, [posProfile?.branch]);

  const lockActiveReservationsByTable = useMemo(() => {
    const map = new Map<string, TableReservation>();
    for (const res of activeReservationsList) {
      if (res.is_lock_window_active && res.status === 'Confirmed') {
        map.set(res.reserved_table, res);
      }
    }
    return map;
  }, [activeReservationsList]);

  const formatReservedLabel = (reservedAt?: string) => {
    if (!reservedAt) return 'Reserved';
    const formatted = formatReservationTime(reservedAt);
    return formatted ? `Reserved for ${formatted}` : 'Reserved';
  };

  // Fetch rooms on mount with session storage
  useEffect(() => {
    async function fetchRooms() {
      if (!posProfile?.branch) return;
      setLoadingRooms(true);
      setError(null);

      try {
        const sessionKey = `ury_rooms_${posProfile.branch}`;
        const cachedRooms = sessionStorage.getItem(sessionKey);
        
        if (cachedRooms) {
          const parsedRooms = JSON.parse(cachedRooms) as Room[];
          setRooms(parsedRooms);
          if (parsedRooms.length > 0) {
            setSelectedRoom(parsedRooms[0].name);
          }
        } else {
          const fetchedRooms = await getRooms(posProfile.branch);
          setRooms(fetchedRooms);
          if (fetchedRooms.length > 0) {
            setSelectedRoom(fetchedRooms[0].name);
          }
          sessionStorage.setItem(sessionKey, JSON.stringify(fetchedRooms));
        }
      } catch (e) {
        setError(t('errors.failed_load_rooms') || 'Failed to load rooms');
      } finally {
        setLoadingRooms(false);
      }
    }
    fetchRooms();
  }, [posProfile?.branch]);

  // Fetch tables when selectedRoom changes, but cache per room
  useEffect(() => {
    async function fetchTables() {
      if (!selectedRoom) return;
      setError(null);
      if (tablesCache[selectedRoom]) {
        setTables(sortTables(tablesCache[selectedRoom]));
        setLoadingTables(false);
        return;
      }
      setLoadingTables(true);
      try {
        const fetchedTables = await getTables(selectedRoom);
        const sortedTables = sortTables(fetchedTables);
        setTables(sortedTables);
        setTablesCache(prev => ({ ...prev, [selectedRoom]: fetchedTables }));
      } catch (e) {
        setError(t('errors.failed_load_tables') || 'Failed to load tables');
        setTables([]);
      } finally {
        setLoadingTables(false);
      }
    }
    fetchTables();
  }, [selectedRoom]);

  // Clear cache when modal closes
  useEffect(() => {
    if (!selectedRoom) {
      setTablesCache({});
    }
  }, [onClose]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-white rounded-lg w-full h-5/6 max-w-2xl mx-auto p-0 overflow-y-auto">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">{t('common.select_table_title')}</h2>
          <Button onClick={onClose} variant="ghost" size="icon">
            <X className="w-5 h-5" />
          </Button>
        </div>
        <div className="p-4">
          {/* Reservation Buffer Warning Banner */}
          {tableWarning && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-amber-950 shadow-sm animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                <span className="text-sm font-semibold">{tableWarning}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setTableWarning(null)}
                className="h-7 w-7 text-amber-800 hover:text-amber-950 hover:bg-amber-100"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Room Selection */}
          {loadingRooms ? (
            <div className="mb-6">
              <Spinner message={t('common.loading_rooms')} />
            </div>
          ) : error ? (
            <div className="mb-6 flex flex-col items-center justify-center gap-2 text-red-500">
              <AlertTriangle className="w-8 h-8 mb-1" />
              <span>{error}</span>
            </div>
          ) : rooms.length === 0 ? (
            <div className="mb-6 flex flex-col items-center justify-center gap-2 text-gray-400">
              <Square className="w-8 h-8 mb-1" />
              <span>{t('common.no_rooms_found')}</span>
            </div>
          ) : (
            <div className="flex gap-2 mb-6">
              {rooms.map(room => (
                <Button
                  key={room.name}
                  onClick={() => {
                    setSelectedRoom(room.name);
                    setTableWarning(null);
                  }}
                  variant="tab"
                  data-selected={selectedRoom === room.name}
                  className="h-fit"
                >
                  {room.name}
                </Button>
              ))}
            </div>
          )}

          {/* Table Grid */}
          {loadingTables ? (
            <div className="">
              <Spinner message={t('common.loading_tables')} />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-2 text-red-500 mt-8">
              <AlertTriangle className="w-8 h-8 mb-1" />
              <span>{error}</span>
            </div>
          ) : tables.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 text-gray-400 mt-8">
              <Square className="w-8 h-8 mb-1" />
              <span>{t('common.no_tables_found')}</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-6">
              {tables.map(table => {
                const activeRes = lockActiveReservationsByTable.get(table.name);
                const isReserved = !!activeRes;

                return (
                  <Button
                    key={table.name}
                    onClick={async () => {
                      // Check if the table has an ongoing order first
                      try {
                        const orderRes = await getTableOrder(table.name);
                        const existingInvoice = orderRes?.message;
                        if (
                          existingInvoice &&
                          existingInvoice.name &&
                          existingInvoice.docstatus === 0 &&
                          existingInvoice.invoice_printed !== 1
                        ) {
                          setTableWarning(null);
                          setSelectedTable(table.name, selectedRoom);
                          onClose();
                          return;
                        }
                      } catch {}

                      let currentActiveRes = activeRes;
                      if (!currentActiveRes) {
                        try {
                          const res = await checkTableReservation(table.name);
                          if (res && res.is_lock_window_active && res.status === 'Confirmed') {
                            currentActiveRes = res;
                          }
                        } catch {}
                      }

                      if (currentActiveRes) {
                        const timeStr = formatReservationTime(currentActiveRes.reserved_at);
                        const warningMsg = `Table ${table.name} is reserved for ${timeStr}. Please choose another table.`;
                        setTableWarning(warningMsg);
                        showToast.error(warningMsg);
                        return;
                      }
                      setTableWarning(null);
                      setSelectedTable(table.name, selectedRoom);
                      onClose();
                    }}
                    variant="outline"
                    className={cn(
                      'h-fit p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-colors relative',
                      selectedTable === table.name
                        ? 'border-primary-600 bg-primary-50'
                        : table.occupied === 1
                        ? 'border-amber-500 bg-amber-50 hover:border-amber-600 hover:bg-amber-100'
                        : isReserved
                        ? 'border-indigo-400 bg-indigo-50 hover:border-indigo-500 hover:bg-indigo-100'
                        : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50',
                      'focus-visible:ring-2 focus-visible:ring-primary-600'
                    )}
                  >
                    <TableShapeIcon
                      shape={table.table_shape}
                      className={cn(
                        'w-8 h-8',
                        table.occupied === 1
                          ? 'text-amber-500'
                          : isReserved
                          ? 'text-indigo-600'
                          : 'text-gray-500'
                      )}
                    />
                    <div className="text-center">
                      <div className="font-medium">{table.name}</div>
                      {(() => {
                        const members = getMergeGroupMembers(table, tables);
                        const label =
                          members.length > 1 ? formatMergedTableLabelFromGroup(members) : null;
                        return label && label !== table.name ? (
                          <div className="mt-0.5 truncate text-xs text-primary-700">{label}</div>
                        ) : null;
                      })()}
                      <div className="mt-2 min-h-4">
                        {table.occupied === 1 ? (
                          <Badge
                            variant="secondary"
                            className="text-xs bg-amber-100 text-amber-700 hover:bg-amber-100"
                          >
                            {t('tables.occupied')}
                          </Badge>
                        ) : isReserved ? (
                          <Badge
                            variant="outline"
                            className="text-xs border-indigo-200 bg-indigo-100 text-indigo-800 hover:bg-indigo-100 font-medium"
                          >
                            {formatReservedLabel(activeRes?.reserved_at)}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TableSelectionDialog;
 