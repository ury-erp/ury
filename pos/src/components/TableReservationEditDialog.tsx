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
} from '@ury/ui';

import { CustomerPicker } from './CustomerPicker';
import { DatePicker } from './DatePicker';
import type { Table, TableReservation } from '../lib/table-api';
import type { Customer } from '../lib/customer-api';

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
  availableTables: Table[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: EditReservationFormData) => Promise<void>;
}

const TableReservationEditDialog = ({
  open,
  reservation,
  availableTables,
  onOpenChange,
  onConfirm,
}: TableReservationEditDialogProps) => {
  const [selectedTable, setSelectedTable] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerPhone, setCustomerPhone] = useState('');
  const [noOfPax, setNoOfPax] = useState<number>(1);
  const [reservationDate, setReservationDate] = useState('');
  const [reservationTime, setReservationTime] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !reservation) return;

    setSelectedTable(reservation.reserved_table || '');
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

  const handleCustomerChange = (selected: Customer | null) => {
    setCustomer(selected);
    if (selected?.phone) {
      setCustomerPhone(selected.phone);
    }
  };

  if (!reservation) return null;

  const handleSubmit = async () => {
    setValidationError(null);

    if (!selectedTable) {
      setValidationError('Please select a table.');
      return;
    }

    if (!customer) {
      setValidationError('Please select a customer.');
      return;
    }

    if (!customerPhone.trim()) {
      setValidationError("Please enter the customer's phone number.");
      return;
    }

    if (!noOfPax || noOfPax < 1) {
      setValidationError('Please enter a valid number of persons (minimum 1).');
      return;
    }

    if (!reservationDate) {
      setValidationError('Please select a reservation date.');
      return;
    }

    if (!reservationTime) {
      setValidationError('Please select a reservation time.');
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
      setValidationError(err.message || 'Failed to update reservation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="large"
        size="2xl"
        className="p-0 flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <DialogHeader className="px-8 pt-8 pb-5 shrink-0 border-b border-gray-100">
          <div>
            <DialogTitle className="text-2xl font-bold text-gray-900">
              Edit Reservation ({reservation.name})
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm font-medium text-gray-500">
              Update reservation details for this table.
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="px-8 py-6 space-y-6 overflow-y-auto min-h-0">
          {validationError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {validationError}
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 space-y-5">
            {/* Table Selection */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">
                Table <span className="text-red-500">*</span>
              </label>

              <select
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-100"
                value={selectedTable}
                onChange={(e) => setSelectedTable(e.target.value)}
                disabled={loading}
              >
                {availableTables.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name} ({t.restaurant_room} - {t.no_of_seats || 0} seats)
                  </option>
                ))}
              </select>
            </div>

            {/* Customer */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">
                Customer <span className="text-red-500">*</span>
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
                  Phone Number <span className="text-red-500">*</span>
                </label>

                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    className="pl-10"
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  Number of Persons <span className="text-red-500">*</span>
                </label>

                <div className="relative">
                  <Users className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    className="pl-10"
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
                  Reservation Date <span className="text-red-500">*</span>
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
                  Reservation Time <span className="text-red-500">*</span>
                </label>

                <div className="relative">
                  <Clock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    className="pl-10"
                    type="time"
                    value={reservationTime}
                    onChange={(e) => setReservationTime(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">
                Notes / Special Requests
              </label>

              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Special requests, occasion, dietary requirements..."
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
            Cancel
          </Button>

          <Button
            onClick={handleSubmit}
            disabled={loading || !customer || !customerPhone.trim() || !selectedTable}
          >
            {loading ? 'Saving Changes...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TableReservationEditDialog;
