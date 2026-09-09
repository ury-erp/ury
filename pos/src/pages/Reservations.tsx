import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  BookLock,
  CalendarClock,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  List,
  MoreVertical,
  Pencil,
  Phone,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  SearchableSelect,
  showToast,
} from '@ury/ui';
import { useNavigate } from 'react-router-dom';
import { usePOSStore } from '../store/pos-store';
import { useRootStore } from '../store/root-store';
import { derivePOSCapabilities } from '@ury/core';
import {
  getActiveReservations,
  getBranchReservationSettings,
  getRooms,
  getTables,
  updateTableReservation,
  updateTableReservationStatus,
  Room,
  Table,
  TableReservation,
} from '../lib/table-api';
import TableReservationEditDialog, {
  EditReservationFormData,
} from '../components/TableReservationEditDialog';
import TableReservationCancelDialog from '../components/TableReservationCancelDialog';
import TableReservationCompleteDialog from '../components/TableReservationCompleteDialog';
import TableReservationTimeline from '../components/TableReservationTimeline';
import { DatePicker } from '../components/DatePicker';

function formatDateToYYYYMMDD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isSameCalendarDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function formatDisplayDate(d: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameCalendarDay(d, today)) {
    return `Today, ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }
  if (isSameCalendarDay(d, tomorrow)) {
    return `Tomorrow, ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }
  if (isSameCalendarDay(d, yesterday)) {
    return `Yesterday, ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function Reservations() {
  const navigate = useNavigate();
  const { posProfile, searchQuery } = usePOSStore();
  const user = useRootStore((state) => state.user);
  const branch = posProfile?.branch ?? '';

  const isManagerOrCashier = useMemo(() => {
    if (!user) return false;
    if (user.name === 'Administrator' || user.roles?.includes('System Manager')) {
      return true;
    }
    const capabilities = derivePOSCapabilities(user, posProfile);
    return Boolean(capabilities?.canAccessOtherCaptainsTables);
  }, [user, posProfile]);

  useEffect(() => {
    if (!branch) return;
    getBranchReservationSettings(branch).then((settings) => {
      if (settings && Number(settings.enable_reservation) !== 1) {
        navigate('/tables', { replace: true });
      }
    }).catch(() => {
      // ignore
    });
  }, [branch, navigate]);

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');

  const [reservations, setReservations] = useState<TableReservation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [availableTables, setAvailableTables] = useState<Table[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [selectedTableFilter, setSelectedTableFilter] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);

  // Active action menu popover state
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // Dialog states
  const [editReservation, setEditReservation] = useState<TableReservation | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState<boolean>(false);
  const [cancelReservation, setCancelReservation] = useState<TableReservation | null>(null);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState<boolean>(false);
  const [completeReservation, setCompleteReservation] = useState<TableReservation | null>(null);
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState<boolean>(false);
  const [completeLoading, setCompleteLoading] = useState<boolean>(false);
  const [cancelLoading, setCancelLoading] = useState<boolean>(false);

  const isToday = useMemo(() => {
    const today = new Date();
    return isSameCalendarDay(selectedDate, today);
  }, [selectedDate]);

  const handlePrevDay = () => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() - 1);
      return next;
    });
  };

  const handleNextDay = () => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 1);
      return next;
    });
  };

  const handleToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
  };

  const fetchReservationsData = useCallback(async (targetDate?: Date) => {
    if (!branch) return;
    try {
      const d = targetDate || selectedDate;
      const dateStr = formatDateToYYYYMMDD(d);
      const data = await getActiveReservations(branch, dateStr);
      setReservations(data || []);
    } catch (err) {
      console.error('Failed to fetch reservations:', err);
    }
  }, [branch, selectedDate]);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const roomList = await getRooms(branch);
      setRooms(roomList || []);

      let allTables: Table[] = [];
      for (const r of roomList) {
        const roomTables = await getTables(r.name);
        const mappedTables = (roomTables || []).map((tbl) => ({
          ...tbl,
          restaurant_room: tbl.restaurant_room || r.name,
        }));
        allTables = [...allTables, ...mappedTables];
      }
      setAvailableTables(allTables);

      await fetchReservationsData(selectedDate);
    } catch (err) {
      console.error('Failed to initialize reservations page:', err);
    } finally {
      setLoading(false);
    }
  }, [branch, fetchReservationsData, selectedDate]);

  const RESERVATION_POLL_INTERVAL_MS = 30000;

  // Initial load
  const isInitialLoadedRef = useRef(false);
  useEffect(() => {
    if (isInitialLoadedRef.current) return;
    isInitialLoadedRef.current = true;
    loadInitialData();
  }, [loadInitialData]);

  // Fetch when selectedDate changes (after initial mount)
  useEffect(() => {
    if (!isInitialLoadedRef.current || !branch) return;
    fetchReservationsData(selectedDate);
  }, [branch, selectedDate, fetchReservationsData]);

  // Periodic polling
  useEffect(() => {
    if (!branch) return;

    const intervalId = setInterval(() => {
      fetchReservationsData(selectedDate);
    }, RESERVATION_POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [fetchReservationsData, branch, selectedDate]);

  const handleOpenEdit = (res: TableReservation) => {
    setEditReservation(res);
    setIsEditDialogOpen(true);
    setMenuOpenId(null);
  };

  const handleOpenCancel = (res: TableReservation) => {
    setCancelReservation(res);
    setIsCancelDialogOpen(true);
    setMenuOpenId(null);
  };

  const handleOpenComplete = (res: TableReservation) => {
    setCompleteReservation(res);
    setIsCompleteDialogOpen(true);
    setMenuOpenId(null);
  };

  const handleConfirmEdit = async (data: EditReservationFormData) => {
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
      });
      await fetchReservationsData(selectedDate);
    } catch (err) {
      console.error('Failed to update reservation:', err);
      throw err;
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelReservation) return;
    if (!isManagerOrCashier) {
      showToast.error('Not authorized to cancel reservation');
      return;
    }
    setCancelLoading(true);
    try {
      await updateTableReservationStatus(cancelReservation.name, 'Cancelled');
      await fetchReservationsData(selectedDate);
      setIsCancelDialogOpen(false);
      setCancelReservation(null);
    } catch (err) {
      console.error('Failed to cancel reservation:', err);
      throw err;
    } finally {
      setCancelLoading(false);
    }
  };

  const handleConfirmComplete = async () => {
    if (!completeReservation) return;
    if (!isManagerOrCashier) {
      showToast.error('Not authorized to complete reservation');
      return;
    }
    setCompleteLoading(true);
    try {
      await updateTableReservationStatus(completeReservation.name, 'Completed');
      await fetchReservationsData(selectedDate);
      setIsCompleteDialogOpen(false);
      setCompleteReservation(null);
    } catch (err) {
      console.error('Failed to confirm customer arrival:', err);
      throw err;
    } finally {
      setCompleteLoading(false);
    }
  };

  const handleRoomChange = (val: string) => {
    setSelectedRoom(val);
    if (val !== 'all' && selectedTableFilter !== 'all') {
      const tbl = availableTables.find((t) => t.name === selectedTableFilter);
      if (tbl && tbl.restaurant_room !== val) {
        setSelectedTableFilter('all');
      }
    }
  };

  // Tables list for the Table filter dropdown (filtered by selected Room if set)
  const filteredTablesForFilter = useMemo(() => {
    if (selectedRoom === 'all') return availableTables;
    return availableTables.filter((t) => t.restaurant_room === selectedRoom);
  }, [availableTables, selectedRoom]);

  // Tables list for Timeline view (filtered by selected Room and/or Table filter)
  const filteredTablesForTimeline = useMemo(() => {
    let list = availableTables;
    if (selectedRoom !== 'all') {
      list = list.filter((t) => t.restaurant_room === selectedRoom);
    }
    if (selectedTableFilter !== 'all') {
      list = list.filter((t) => t.name === selectedTableFilter);
    }
    return list;
  }, [availableTables, selectedRoom, selectedTableFilter]);

  // Filter reservations based on Room filter, Table filter, and global Search query
  const filteredReservations = useMemo(() => {
    return reservations.filter((res) => {
      const resTable = res.reserved_table || (res as any).table || '';

      // 1. Room filter
      if (selectedRoom !== 'all') {
        const matchedTable = availableTables.find((t) => t.name === resTable);
        if (!matchedTable || matchedTable.restaurant_room !== selectedRoom) {
          return false;
        }
      }

      // 2. Table filter
      if (selectedTableFilter !== 'all') {
        if (resTable !== selectedTableFilter) {
          return false;
        }
      }

      // 3. Search Query from global POS header
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const tableName = resTable.toLowerCase();
        const custName = (res.customer_name || res.customer || '').toLowerCase();
        const custPhone = (res.customer_phone || '').toLowerCase();
        const matchesSearch =
          tableName.includes(q) || custName.includes(q) || custPhone.includes(q);
        if (!matchesSearch) return false;
      }

      return true;
    });
  }, [reservations, availableTables, selectedRoom, selectedTableFilter, searchQuery]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Confirmed':
        return <Badge variant="success">Confirmed</Badge>;
      case 'Active':
        return <Badge variant="warning">Active</Badge>;
      case 'Requested':
        return <Badge variant="outline">Requested</Badge>;
      case 'Completed':
        return <Badge variant="completed">Completed</Badge>;
      case 'Cancelled':
        return <Badge variant="cancelled">Cancelled</Badge>;
      case 'No Show':
        return <Badge variant="noshow">No Show</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDateTime = (raw?: string) => {
    if (!raw) return '-';
    try {
      const d = new Date(raw.replace(' ', 'T'));
      if (isNaN(d.getTime())) return raw;
      return d.toLocaleString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return raw;
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
            <BookLock className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              Reservations
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {filteredReservations.length}
              </span>
            </h1>
          </div>
        </div>

        {/* Right side: Room Filter -> Table Filter -> Date Selector -> View Mode Switcher */}
        <div className="flex items-center gap-3">
          <div className="w-40">
            <SearchableSelect
              id="room-filter"
              value={selectedRoom}
              options={[
                { value: 'all', label: 'All Rooms' },
                ...rooms.map((r) => ({ value: r.name, label: r.name })),
              ]}
              placeholder="All Rooms"
              onChange={(_, val) => handleRoomChange(val)}
              strict
            />
          </div>

          <div className="w-40">
            <SearchableSelect
              id="table-filter"
              value={selectedTableFilter}
              options={[
                { value: 'all', label: 'All Tables' },
                ...filteredTablesForFilter.map((t) => ({ value: t.name, label: t.name })),
              ]}
              placeholder="All Tables"
              onChange={(_, val) => setSelectedTableFilter(val)}
              strict
            />
          </div>

          {/* Calendar Date / Day Selection Control */}
          <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={handlePrevDay}
              className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              title="Previous Day"
              aria-label="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <DatePicker
              id="reservation-date-selector"
              value={formatDateToYYYYMMDD(selectedDate)}
              formatDisplay={() => formatDisplayDate(selectedDate)}
              buttonClassName="border-0 shadow-none px-2.5 py-1 text-xs font-bold text-gray-800 hover:bg-gray-50 focus:outline-none"
              onChange={(_id, val) => {
                if (!val) return;
                const parts = val.split('-');
                if (parts.length === 3) {
                  setSelectedDate(
                    new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
                  );
                }
              }}
              className="w-auto"
              align="right"
            />

            <button
              type="button"
              onClick={handleNextDay}
              className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              title="Next Day"
              aria-label="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* View Mode Toggle: List / Timeline (Icons Only) */}
          <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              title="List View"
              aria-label="List View"
              className={`p-1.5 rounded-md transition-all ${
                viewMode === 'list'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              title="Timeline View"
              aria-label="Timeline View"
              className={`p-1.5 rounded-md transition-all ${
                viewMode === 'timeline'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <CalendarClock className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div
        className={`flex-1 min-h-0 ${
          viewMode === 'timeline' ? 'p-6 flex flex-col overflow-hidden' : 'overflow-y-auto p-6'
        }`}
        onClick={() => setMenuOpenId(null)}
      >
        {viewMode === 'timeline' ? (
          <TableReservationTimeline
            reservations={filteredReservations}
            selectedDate={selectedDate}
            loading={loading}
          />
        ) : loading ? (
          <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
            Loading reservations...
          </div>
        ) : filteredReservations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="p-4 bg-gray-100 rounded-full text-gray-400 mb-3">
              <BookLock className="w-8 h-8" />
            </div>
            <h3 className="text-base font-semibold text-gray-800">No Reservations Found</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm">
              There are currently no reservations for {formatDisplayDate(selectedDate)} matching your selected filter.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredReservations.map((res) => {
              const isMenuOpen = menuOpenId === res.name;
              return (
                <Card
                  key={res.name}
                  className="relative bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                    {/* Top Row: Table Name, Status, 3-Dot Action Menu */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wider text-gray-400">
                          Table
                        </div>
                        <div className="text-lg font-bold text-gray-900 mt-0.5">
                          {res.reserved_table}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {getStatusBadge(res.status)}

                        {/* Three-Dot Action Menu (Only for actionable statuses) */}
                        {['Confirmed', 'Active', 'Requested'].includes(res.status) && (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpenId(isMenuOpen ? null : res.name);
                              }}
                              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors focus:outline-none"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {isMenuOpen && (
                              <div
                                className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(res)}
                                  className="w-full text-left px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                >
                                  <Pencil className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Edit Reservation</span>
                                </button>

                                {isManagerOrCashier && ['Confirmed', 'Active'].includes(res.status) && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenComplete(res)}
                                    className="w-full text-left px-4 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 flex items-center gap-2"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Complete Reservation</span>
                                  </button>
                                )}

                                {isManagerOrCashier && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenCancel(res)}
                                    className="w-full text-left px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2"
                                  >
                                    <XCircle className="w-3.5 h-3.5 text-red-600" />
                                    <span>Cancel Reservation</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Middle Info Section */}
                    <div className="space-y-2 pt-2 border-t border-gray-100 text-sm">
                      {/* Customer Name */}
                      <div className="flex items-center gap-2.5 text-gray-700">
                        <User className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="font-semibold text-gray-900 truncate">
                          {res.customer_name || res.customer}
                        </span>
                      </div>

                      {/* Customer Phone */}
                      {res.customer_phone && (
                        <div className="flex items-center gap-2.5 text-gray-600 text-xs">
                          <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{res.customer_phone}</span>
                        </div>
                      )}

                      {/* Guest Count */}
                      <div className="flex items-center gap-2.5 text-gray-600 text-xs">
                        <Users className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span>{res.no_of_pax ?? 1} guests</span>
                      </div>

                      {/* Reservation Time */}
                      <div className="flex items-center gap-2.5 text-gray-600 text-xs pt-1">
                        <CalendarClock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span className="font-medium text-blue-900">
                          {formatDateTime(res.reserved_at)}
                        </span>
                      </div>

                      {/* Comments / Notes */}
                      {res.comments && (
                        <p className="text-xs text-gray-500 italic pt-1 border-t border-gray-50 line-clamp-2">
                          "{res.comments}"
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <TableReservationEditDialog
        open={isEditDialogOpen}
        reservation={editReservation}
        onOpenChange={setIsEditDialogOpen}
        onConfirm={handleConfirmEdit}
      />

      {/* Customer Arrival Confirmation Dialog */}
      <TableReservationCompleteDialog
        open={isCompleteDialogOpen}
        reservation={completeReservation}
        onClose={() => {
          setIsCompleteDialogOpen(false);
          setCompleteReservation(null);
        }}
        onConfirm={handleConfirmComplete}
        loading={completeLoading}
      />

      {/* Cancel Dialog */}
      <TableReservationCancelDialog
        open={isCancelDialogOpen}
        reservation={cancelReservation}
        tableName={cancelReservation?.reserved_table || ''}
        onClose={() => {
          setIsCancelDialogOpen(false);
          setCancelReservation(null);
        }}
        onConfirm={handleConfirmCancel}
        loading={cancelLoading}
      />
    </div>
  );
}
