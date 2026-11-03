import { useEffect, useState } from 'react';
import { Clock, Phone, Users } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Textarea,
  SearchableSelect,
} from '@ury/ui';

import { TableShapeIcon } from './TableShapeIcon';
import { CustomerPicker } from './CustomerPicker';
import { DatePicker } from './DatePicker';
import { t } from '../i18n';
import {
  getAvailableTablesForReservation,
  extractErrorMessage,
  type Table,
  type TableReservation,
} from '../lib/table-api';
import type { Customer } from '../store/pos-store';
import { usePOSStore } from '../store/pos-store';

export interface EditReservationFormData {
  reservation_name: string;
  table: string;
  customer: string;
  customer_name: string;
  customer_phone: string;
  no_of_pax: number;
  reservedAt: string;
  notes: string;
}

interface TableReservationEditDialogProps {
  open: boolean;
  reservation: TableReservation | null;
  availableTables?: Table[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: EditReservationFormData) => Promise<void>;
}

const TableReservationEditDialog = ({
  open,
  reservation,
  onOpenChange,
  onConfirm,
}: TableReservationEditDialogProps) => {
  const { posProfile } = usePOSStore();
  const branch = posProfile?.branch ?? '';

  const [selectedTable, setSelectedTable] = useState('');
  const [availableTablesList, setAvailableTablesList] = useState<Table[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerPhone, setCustomerPhone] = useState('');
  const [noOfPax, setNoOfPax] = useState<number>(1);
  const [reservationDate, setReservationDate] = useState('');
  const [reservationTime, setReservationTime] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const targetBranch = reservation?.branch || branch;

  // Initialize form state when dialog opens or reservation changes
  useEffect(() => {
    if (!open || !reservation) return;

    const initialTable = reservation.reserved_table || '';
    setSelectedTable(initialTable);
    setCustomer({
      id: reservation.customer,
      name: reservation.customer_name || reservation.customer,
      phone: reservation.customer_phone || '',
    });
    setCustomerPhone(reservation.customer_phone || '');
    setNoOfPax(reservation.no_of_pax || 1);
    setNotes(reservation.comments || '');
    setValidationError(null);

    if (reservation.reserved_at) {
      let raw = reservation.reserved_at;
      if (raw.includes('T')) raw = raw.replace('T', ' ');
      const parts = raw.split(' ');
      setReservationDate(parts[0] || '');
      setReservationTime(parts[1] ? parts[1].slice(0, 5) : '19:00');
    }
  }, [open, reservation]);

  // Fetch available tables from backend when branch, date, time, or reservation changes
  useEffect(() => {
    if (!open || !targetBranch || !reservationDate || !reservationTime) {
      setAvailableTablesList([]);
      return;
    }

    let isMounted = true;
    setLoadingTables(true);

    const formattedReservedAt = `${reservationDate} ${
      reservationTime.length === 5 ? reservationTime + ':00' : reservationTime
    }`;

    getAvailableTablesForReservation(
      targetBranch,
      formattedReservedAt,
      reservation?.name
    )
      .then((tables) => {
        if (!isMounted) return;
        const list = tables || [];
        setAvailableTablesList(list);

        // If the selected table becomes unavailable after date/time change, clear table selection
        setSelectedTable((prev) => {
          if (!prev) return '';
          const isStillAvailable = list.some((t) => t.name === prev);
          return isStillAvailable ? prev : '';
        });
      })
      .catch((err) => {
        console.error('Failed to load available tables for reservation:', err);
      })
      .finally(() => {
        if (isMounted) {
          setLoadingTables(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [open, targetBranch, reservationDate, reservationTime, reservation?.name]);

  const tablesList = availableTablesList;

  const handleCustomerChange = (selected: Customer | null) => {
    setCustomer(selected);
    if (selected?.phone) {
      setCustomerPhone(selected.phone);
    }
  };

  if (!reservation) return null;

  const currentTableObj = tablesList.find((t) => t.name === selectedTable) || {
    name: selectedTable || reservation.reserved_table,
    no_of_seats: reservation.no_of_pax || 2,
    table_shape: 'Rectangle' as const,
  };

  const handleSubmit = async () => {
    setValidationError(null);

    if (!selectedTable) {
      setValidationError(t('reservations.select_table'));
      return;
    }

    if (!customer) {
      setValidationError(t('reservations.select_customer'));
      return;
    }

    if (!customerPhone.trim()) {
      setValidationError(t('reservations.enter_phone'));
      return;
    }

    if (!noOfPax || noOfPax < 1) {
      setValidationError(t('reservations.valid_pax'));
      return;
    }

    const targetTableObj = tablesList.find((t) => t.name === selectedTable);
    if (targetTableObj?.no_of_seats && Number(noOfPax) > targetTableObj.no_of_seats) {
      setValidationError(t('reservations.exceeds_capacity', { capacity: targetTableObj.no_of_seats }));
      return;
    }

    if (!reservationDate) {
      setValidationError(t('reservations.select_date'));
      return;
    }

    if (!reservationTime) {
      setValidationError(t('reservations.select_time'));
      return;
    }

    const selectedDt = new Date(`${reservationDate}T${reservationTime}:00`);
    const nowMargin = new Date(Date.now() - 60000); // 1-min grace margin
    if (!isNaN(selectedDt.getTime()) && selectedDt < nowMargin) {
      setValidationError(t('reservations.past_datetime'));
      return;
    }

    setLoading(true);

    try {
      const reservedAt = `${reservationDate} ${reservationTime}`;

      await onConfirm({
        reservation_name: reservation.name,
        table: selectedTable,
        customer: customer.id,
        customer_name: customer.name || customer.id,
        customer_phone: customerPhone.trim(),
        no_of_pax: Number(noOfPax),
        reservedAt,
        notes,
      });

      onOpenChange(false);
    } catch (err: any) {
      setValidationError(extractErrorMessage(err, t('reservations.update_failed')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="large"
        size="2xl"
        className="p-0 flex flex-col w-full max-w-2xl h-[840px] overflow-hidden"
      >
        {/* Header - Matches Reservation Dialog Header style: Table Name & Seat Count */}
        <DialogHeader className="px-8 pt-8 pb-5 shrink-0 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-emerald-100 p-3 text-emerald-700">
              <TableShapeIcon shape={currentTableObj.table_shape || 'Rectangle'} />
            </div>

            <div>
              <DialogTitle className="text-2xl font-bold text-gray-900">
                {currentTableObj.name}
              </DialogTitle>

              <DialogDescription className="mt-0.5 text-sm font-medium text-gray-500">
                {t('reservations.seats', { count: currentTableObj.no_of_seats ?? '-' })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="px-8 py-6 space-y-6 flex-1">
          {validationError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {validationError}
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 space-y-5">
            {/* Table Selection - Using Standard URY @ury/ui Select Dropdown */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">
                {t('reservations.table_label')} <span className="text-red-500">*</span>
              </label>

              <SearchableSelect
                id="edit-reservation-table"
                value={selectedTable}
                options={tablesList.map((tbl) => ({
                  value: tbl.name,
                  label: t('reservations.table_option_label', {
                    name: tbl.name,
                    room: tbl.restaurant_room,
                    seats: tbl.no_of_seats || 0,
                  }),
                }))}
                placeholder={
                  loadingTables
                    ? t('reservations.loading_tables')
                    : tablesList.length === 0
                    ? t('reservations.no_available_tables')
                    : t('reservations.select_table_placeholder')
                }
                onChange={(_, val) => setSelectedTable(val)}
                disabled={loading || loadingTables}
                strict
                openOnFocus={false}
              />
              {tablesList.length === 0 && !loadingTables && (
                <p className="text-xs text-amber-600 font-medium">
                  {t('reservations.no_tables_for_slot')}
                </p>
              )}
            </div>

            {/* Customer */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">
                {t('reservations.customer_label')} <span className="text-red-500">*</span>
              </label>

              <CustomerPicker
                value={customer}
                onChange={handleCustomerChange}
                disabled={loading}
              />
            </div>

            {/* Phone Number & Number of Persons */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  {t('reservations.phone_label')} <span className="text-red-500">*</span>
                </label>

                <div className="relative">
                  <Phone className="absolute start-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    className="ps-10"
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  {t('reservations.pax_label')} <span className="text-red-500">*</span>
                </label>

                <div className="relative">
                  <Users className="absolute start-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    className="ps-10"
                    type="number"
                    min={1}
                    value={noOfPax}
                    onChange={(e) => setNoOfPax(Math.max(1, parseInt(e.target.value) || 1))}
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            {/* Reservation Date & Reservation Time */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  {t('reservations.date_label')} <span className="text-red-500">*</span>
                </label>

                <DatePicker
                  id="edit-reservation-date"
                  value={reservationDate}
                  onChange={(_id, val) => setReservationDate(val)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  {t('reservations.time_label')} <span className="text-red-500">*</span>
                </label>

                <div className="relative">
                  <Input
                    type="time"
                    step="60"
                    className="pe-10 bg-white border border-gray-200 text-gray-700 font-medium [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                    value={reservationTime}
                    onChange={(e) => setReservationTime(e.target.value)}
                    disabled={loading}
                  />
                  <Clock className="absolute end-3 top-3 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">
                {t('reservations.notes_label')}
              </label>

              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('reservations.notes_placeholder')}
                disabled={loading}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="border-t bg-gray-50 px-8 py-5 shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {t('reservations.cancel')}
          </Button>

          <Button
            onClick={handleSubmit}
            disabled={loading || !customer || !customerPhone.trim() || !selectedTable}
          >
            {t('reservations.save_changes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TableReservationEditDialog;
