import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Badge,
} from '@ury/ui';
import { CalendarClock, Phone, User, Users, CheckCircle2 } from 'lucide-react';
import type { TableReservation } from '../lib/table-api';

interface Props {
  open: boolean;
  reservation: TableReservation | null;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
}

const TableReservationCompleteDialog: React.FC<Props> = ({
  open,
  reservation,
  onConfirm,
  onClose,
  loading = false,
}) => {
  if (!reservation) return null;

  const tableName = reservation.reserved_table || '';

  let formattedTime = reservation.reserved_at ? reservation.reserved_at.replace('T', ' ') : '-';
  try {
    const d = new Date(reservation.reserved_at.replace(' ', 'T'));
    if (!isNaN(d.getTime())) {
      formattedTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  } catch {}

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !loading && onClose()}>
      <DialogContent
        variant="large"
        size="sm"
        className="max-w-xl p-0 flex flex-col max-h-[90vh] overflow-hidden"
      >
        <DialogHeader className="px-8 pt-8 pb-5 shrink-0">
          <DialogTitle className="text-xl flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            Confirm Reservation
          </DialogTitle>

          <DialogDescription className="text-sm text-gray-600 mt-1">
            Confirm that the customer has arrived for table{' '}
            <span className="font-semibold text-gray-900">{tableName}</span> at{' '}
            <span className="font-semibold text-gray-900">{formattedTime}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="px-8 pb-8 space-y-5 overflow-y-auto min-h-0">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Table</p>
                <p className="mt-1 text-xl font-bold text-gray-900">{tableName}</p>
              </div>

              <Badge variant="success">Confirmed</Badge>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
                  <User className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Customer</p>
                  <p className="font-semibold text-gray-900">
                    {reservation.customer_name || reservation.customer}
                  </p>
                </div>
              </div>

              {reservation.customer_phone && (
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
                    <Phone className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Phone Number</p>
                    <p className="font-medium text-gray-900">{reservation.customer_phone}</p>
                  </div>
                </div>
              )}

              {reservation.no_of_pax && (
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
                    <Users className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Number of Persons</p>
                    <p className="font-medium text-gray-900">
                      {reservation.no_of_pax} guest{reservation.no_of_pax > 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
                  <CalendarClock className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Reservation Time</p>
                  <p className="font-medium text-gray-900">{formattedTime}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t bg-white px-8 py-5 shrink-0 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>

          <Button
            onClick={onConfirm}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? 'Confirming...' : 'Confirm Arrival'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TableReservationCompleteDialog;
