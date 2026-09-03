import { useEffect, useState } from 'react';
import { CalendarClock, Phone, Users } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@ury/ui';

import { Button } from '@ury/ui';
import { Input } from '@ury/ui';
import { Textarea } from '@ury/ui';

import { TableShapeIcon } from './TableShapeIcon';
import { CustomerPicker } from './CustomerPicker';

import type { Table } from '../lib/table-api';
import type { Customer } from '../store/pos-store';

export interface ReservationFormData {
  customer: string;
  customer_name: string;
  customer_phone: string;
  no_of_pax: number;
  reservedAt: string;
  notes: string;
}

interface TableReservationDialogProps {
  open: boolean;
  table: Table | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: ReservationFormData) => Promise<void>;
}

const TableReservationDialog = ({
  open,
  table,
  onOpenChange,
  onConfirm,
}: TableReservationDialogProps) => {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerPhone, setCustomerPhone] = useState('');
  const [noOfPax, setNoOfPax] = useState<number>(1);
  const [reservedAt, setReservedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setCustomer(null);
    setCustomerPhone('');
    setNoOfPax(table?.no_of_seats || 1);
    setNotes('');
    setValidationError(null);

    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());

    setReservedAt(now.toISOString().slice(0, 16));
  }, [open, table]);

  const handleCustomerChange = (selected: Customer | null) => {
    setCustomer(selected);
    if (selected?.phone) {
      setCustomerPhone(selected.phone);
    }
  };

  if (!table) return null;

  const handleSubmit = async () => {
    setValidationError(null);

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

    if (!reservedAt) {
      setValidationError('Please select a reservation time.');
      return;
    }

    setLoading(true);

    try {
      await onConfirm({
        customer: customer.id,
        customer_name: customer.name || customer.id,
        customer_phone: customerPhone.trim(),
        no_of_pax: Number(noOfPax),
        reservedAt,
        notes,
      });

      onOpenChange(false);
    } catch (err: any) {
      setValidationError(err.message || 'Failed to reserve table.');
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
        <DialogHeader className="px-8 pt-8 pb-5 shrink-0">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-emerald-100 p-3">
              <TableShapeIcon shape={table.table_shape || 'Rectangle'} />
            </div>

            <div>
              <DialogTitle className="text-2xl">
                Reserve {table.name}
              </DialogTitle>

              <DialogDescription className="mt-1">
                Create a reservation for this table.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="px-8 pb-8 space-y-6 overflow-y-auto min-h-0">
          {validationError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {validationError}
            </div>
          )}

          {/* Table Card */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Selected Table
                </p>

                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {table.name}
                </p>
              </div>

              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Seats
                </p>

                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {table.no_of_seats ?? '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Form Card */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-6">
            <div className="space-y-5">
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

              {/* Customer Phone */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  Phone Number <span className="text-red-500">*</span>
                </label>

                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    className="pl-10"
                    type="tel"
                    placeholder="e.g. +1 555-0199"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Number of Persons & Reservation Time */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">
                    Reservation Time <span className="text-red-500">*</span>
                  </label>

                  <div className="relative">
                    <CalendarClock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      className="pl-10"
                      type="datetime-local"
                      value={reservedAt}
                      onChange={(e) => setReservedAt(e.target.value)}
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
            disabled={loading || !customer || !customerPhone.trim()}
          >
            {loading ? 'Creating Reservation...' : 'Reserve Table'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TableReservationDialog;