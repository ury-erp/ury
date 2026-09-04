import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@ury/ui";

import { Button } from "@ury/ui";
import { Badge } from "@ury/ui";
import { CalendarClock, CheckSquare, Phone, User, Users } from "lucide-react";
import type { TableReservation } from '../lib/table-api';

interface Props {
    open: boolean;
    reservation: TableReservation | null;
    tableName: string;
    onConfirmArrival: () => void;
    onCancel: () => void;
    loading?: boolean;
}

const TableReservationWarningDialog = ({
    open,
    reservation,
    tableName,
    onConfirmArrival,
    onCancel,
    loading = false,
}: Props) => {
    const [confirmedArrival, setConfirmedArrival] = useState(false);

    useEffect(() => {
        if (open) {
            setConfirmedArrival(false);
        }
    }, [open]);

    if (!reservation) return null;

    const formattedTime = reservation.reserved_at ? reservation.reserved_at.replace('T', ' ') : '-';

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !loading && onCancel()}>
            <DialogContent
                variant="large"
                size="sm"
                className="max-w-xl p-0 flex flex-col max-h-[90vh] overflow-hidden"
            >
                {/* Header */}
                <DialogHeader className="px-8 pt-8 pb-5 shrink-0">
                    <DialogTitle className="text-xl">Reserved Table — Customer Verification</DialogTitle>
                    <DialogDescription>
                        This table has an active reservation. Verify customer arrival before seating.
                    </DialogDescription>
                </DialogHeader>

                <div className="px-8 pb-8 space-y-5 overflow-y-auto min-h-0">
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-5 shadow-sm">
                        <div className="mb-4 flex items-start justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-gray-500">
                                    Table
                                </p>
                                <p className="mt-1 text-xl font-bold text-gray-900">
                                    {tableName}
                                </p>
                            </div>

                            <Badge variant="warning">
                                Reserved
                            </Badge>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
                                    <User className="h-4 w-4 text-indigo-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Customer Name</p>
                                    <p className="font-semibold text-gray-900">
                                        {reservation.customer_name || reservation.customer}
                                    </p>
                                </div>
                            </div>

                            {reservation.customer_phone && (
                                <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
                                        <Phone className="h-4 w-4 text-indigo-600" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500">Phone Number</p>
                                        <p className="font-medium text-gray-900">
                                            {reservation.customer_phone}
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
                                    <Users className="h-4 w-4 text-indigo-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Number of Persons</p>
                                    <p className="font-medium text-gray-900">
                                        {reservation.no_of_pax || 1} guest{(reservation.no_of_pax || 1) > 1 ? 's' : ''}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
                                    <CalendarClock className="h-4 w-4 text-indigo-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Reservation Time</p>
                                    <p className="font-medium text-gray-900">
                                        {formattedTime}
                                    </p>
                                </div>
                            </div>

                            {reservation.comments && (
                                <div className="mt-2 rounded-lg bg-white/80 p-3 text-xs text-gray-700">
                                    <span className="font-semibold">Notes:</span> {reservation.comments}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Explicit Verification Checkbox */}
                    <div
                        onClick={() => setConfirmedArrival(!confirmedArrival)}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                            confirmedArrival
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-950'
                                : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                        }`}
                    >
                        <input
                            type="checkbox"
                            id="confirm-arrival"
                            checked={confirmedArrival}
                            onChange={(e) => setConfirmedArrival(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <label htmlFor="confirm-arrival" className="cursor-pointer text-sm font-medium leading-5">
                            This is the reserved customer and they are sitting at the reserved table.
                        </label>
                    </div>
                </div>

                <DialogFooter className="border-t bg-white px-8 py-5 shrink-0">
                    <Button
                        variant="outline"
                        onClick={onCancel}
                        disabled={loading}
                    >
                        Cancel
                    </Button>

                    <Button
                        onClick={onConfirmArrival}
                        disabled={!confirmedArrival || loading}
                    >
                        {loading ? 'Confirming...' : 'Confirm Arrival & Start Order'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default TableReservationWarningDialog;