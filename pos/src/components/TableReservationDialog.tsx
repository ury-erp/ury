import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';

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

interface ReservationData {
  customer: string;
  reservedAt: string;
  notes: string;
}

interface TableReservationDialogProps {
  open: boolean;
  table: Table | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: ReservationData) => Promise<void>;
}

const TableReservationDialog = ({
  open,
  table,
  onOpenChange,
  onConfirm,
}: TableReservationDialogProps) => {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [reservedAt, setReservedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    setCustomer(null);
    setNotes('');

    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());

    setReservedAt(now.toISOString().slice(0, 16));
  }, [open]);

  if (!table) return null;

  const handleSubmit = async () => {
    if (!customer) return;

    setLoading(true);

    try {
      await onConfirm({
        customer: customer.id,
        reservedAt,
        notes,
      });

      onOpenChange(false);
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

            <div className="space-y-6">

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  Customer
                </label>

                <CustomerPicker
                  value={customer}
                  onChange={setCustomer}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  Reservation Time
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

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  Notes
                </label>

                <Textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special requests, occasion, seating preference..."
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
            disabled={loading || !customer}
          >
            {loading ? 'Creating Reservation...' : 'Reserve Table'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TableReservationDialog;