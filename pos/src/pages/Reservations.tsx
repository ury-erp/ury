import { useEffect, useState, useCallback } from 'react';
import {
  BookOpenCheck,
  CalendarClock,
  MoreVertical,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Select,
  SelectItem,
} from '@ury/ui';
import { usePOSStore } from '../store/pos-store';
import {
  getActiveReservations,
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

export default function Reservations() {
  const { posProfile } = usePOSStore();
  const branch = posProfile?.branch ?? '';

  const [reservations, setReservations] = useState<TableReservation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [availableTables, setAvailableTables] = useState<Table[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Active action menu popover state
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // Dialog states
  const [editReservation, setEditReservation] = useState<TableReservation | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState<boolean>(false);
  const [cancelReservation, setCancelReservation] = useState<TableReservation | null>(null);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState<boolean>(false);

  const fetchReservationsData = useCallback(async () => {
    if (!branch) return;
    try {
      const data = await getActiveReservations(branch);
      setReservations(data || []);
    } catch (err) {
      console.error('Failed to fetch reservations:', err);
    }
  }, [branch]);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const roomList = await getRooms();
      setRooms(roomList || []);

      let allTables: Table[] = [];
      for (const r of roomList) {
        const roomTables = await getTables(r.name);
        allTables = [...allTables, ...roomTables];
      }
      setAvailableTables(allTables);

      await fetchReservationsData();
    } catch (err) {
      console.error('Failed to initialize reservations page:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchReservationsData]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchReservationsData();
    setRefreshing(false);
  };

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

  const handleConfirmEdit = async (data: EditReservationFormData) => {
    try {
      await updateTableReservation({
        reservation_name: data.reservation_name,
        table: data.table,
        customer: data.customer,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        no_of_pax: data.no_of_pax,
        reservedAt: data.reservedAt,
        notes: data.notes,
      });
      await fetchReservationsData();
    } catch (err) {
      console.error('Failed to update reservation:', err);
      throw err;
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelReservation) return;
    try {
      await updateTableReservationStatus(cancelReservation.name, 'Cancelled');
      await fetchReservationsData();
    } catch (err) {
      console.error('Failed to cancel reservation:', err);
      throw err;
    }
  };

  // Filter reservations
  const filteredReservations = reservations.filter((res) => {
    if (selectedRoom !== 'all') {
      const matchedTable = availableTables.find((t) => t.name === res.reserved_table);
      if (!matchedTable || matchedTable.restaurant_room !== selectedRoom) {
        return false;
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const tableName = (res.reserved_table || '').toLowerCase();
      const custName = (res.customer_name || res.customer || '').toLowerCase();
      const custPhone = (res.customer_phone || '').toLowerCase();
      return tableName.includes(q) || custName.includes(q) || custPhone.includes(q);
    }

    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Confirmed':
        return <Badge variant="success">Confirmed</Badge>;
      case 'Active':
        return <Badge variant="warning">Active</Badge>;
      case 'Requested':
        return <Badge variant="outline">Requested</Badge>;
      case 'Completed':
        return <Badge variant="default">Completed</Badge>;
      case 'Cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      case 'No Show':
        return <Badge variant="destructive">No Show</Badge>;
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
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
            <BookOpenCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              Table Reservations
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {filteredReservations.length}
              </span>
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Manage all upcoming and active table reservations
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {/* Room Selector */}
          <div className="w-44">
            <Select value={selectedRoom} onValueChange={setSelectedRoom} placeholder="All Rooms">
              <SelectItem value="all">All Rooms</SelectItem>
              {rooms.map((r) => (
                <SelectItem key={r.name} value={r.name}>
                  {r.name}
                </SelectItem>
              ))}
            </Select>
          </div>

          {/* Search */}
          <div className="relative w-64">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              className="pl-9 text-sm"
              placeholder="Search table, customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0" onClick={() => setMenuOpenId(null)}>
        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
            Loading reservations...
          </div>
        ) : filteredReservations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="p-4 bg-gray-100 rounded-full text-gray-400 mb-3">
              <BookOpenCheck className="w-8 h-8" />
            </div>
            <h3 className="text-base font-semibold text-gray-800">No Reservations Found</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm">
              There are currently no active reservations matching your selected filter.
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

                        {/* Three-Dot Action Menu */}
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
                              className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1"
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

                              <button
                                type="button"
                                onClick={() => handleOpenCancel(res)}
                                className="w-full text-left px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2"
                              >
                                <XCircle className="w-3.5 h-3.5 text-red-600" />
                                <span>Cancel Reservation</span>
                              </button>
                            </div>
                          )}
                        </div>
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
        availableTables={availableTables}
        onOpenChange={setIsEditDialogOpen}
        onConfirm={handleConfirmEdit}
      />

      {/* Cancel Dialog */}
      <TableReservationCancelDialog
        open={isCancelDialogOpen}
        reservation={cancelReservation}
        tableName={cancelReservation?.reserved_table || ''}
        onClose={() => setIsCancelDialogOpen(false)}
        onConfirm={handleConfirmCancel}
      />
    </div>
  );
}
