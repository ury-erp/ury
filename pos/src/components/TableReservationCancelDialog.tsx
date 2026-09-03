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
import { CalendarClock, Phone, User, Users } from "lucide-react";
import type { TableReservation } from '../lib/table-api';

interface Props {
    open: boolean;
    reservation: TableReservation | null;
    tableName: string;
    onConfirm: () => void;
    onClose: () => void;
    loading?: boolean;
}

const TableReservationCancelDialog = ({
    open,
    reservation,
    tableName,
    onConfirm,
    onClose,
    loading = false,
}: Props) => {
    if (!reservation) return null;

    const formattedTime = reservation.reserved_at ? reservation.reserved_at.replace('T', ' ') : '-';

    return (
        <Dialog open={open} onOpenChange={(open) => !open && !loading && onClose()}>
            <DialogContent
                variant="large"
                size="sm"
                className="max-w-xl p-0 flex flex-col max-h-[90vh] overflow-hidden"
            >
                <DialogHeader className="px-8 pt-8 pb-5 shrink-0">
                    <DialogTitle>Cancel Reservation</DialogTitle>

                    <DialogDescription>
                        Are you sure you want to cancel this reservation?
                    </DialogDescription>
                </DialogHeader>
                <div className="px-8 pb-8 space-y-5 overflow-y-auto min-h-0">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">

                        <div className="mb-4 flex items-start justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-gray-500">
                                    Table
                                </p>

                                <p className="mt-1 text-xl font-semibold text-gray-900">
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
                                    <User className="h-4 w-4 text-gray-500" />
                                </div>

                                <div>
                                    <p className="text-xs text-gray-500">
                                        Customer
                                    </p>

                                    <p className="font-semibold text-gray-900">
                                        {reservation.customer_name || reservation.customer}
                                    </p>
                                </div>
                            </div>

                            {reservation.customer_phone && (
                                <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
                                        <Phone className="h-4 w-4 text-gray-500" />
                                    </div>

                                    <div>
                                        <p className="text-xs text-gray-500">
                                            Phone Number
                                        </p>

                                        <p className="font-medium text-gray-900">
                                            {reservation.customer_phone}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {reservation.no_of_pax && (
                                <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
                                        <Users className="h-4 w-4 text-gray-500" />
                                    </div>

                                    <div>
                                        <p className="text-xs text-gray-500">
                                            Number of Persons
                                        </p>

                                        <p className="font-medium text-gray-900">
                                            {reservation.no_of_pax} guest{reservation.no_of_pax > 1 ? 's' : ''}
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
                                    <CalendarClock className="h-4 w-4 text-gray-500" />
                                </div>

                                <div>
                                    <p className="text-xs text-gray-500">
                                        Reservation Time
                                    </p>

                                    <p className="font-medium text-gray-900">
                                        {formattedTime}
                                    </p>
                                </div>
                            </div>

                        </div>

                    </div>

                    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                        <p className="text-sm leading-6 text-red-700">
                            This action will release the table for new reservations and walk-ins.
                            <br />
                            The reservation record will be marked as Cancelled.
                        </p>
                    </div>

                </div>
                <DialogFooter className="border-t bg-white px-8 py-5 shrink-0">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        disabled={loading}
                    >
                        Keep Reservation
                    </Button>

                    <Button
                        variant="destructive"
                        onClick={onConfirm}
                        disabled={loading}
                    >
                        {loading ? "Cancelling..." : "Confirm Cancellation"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default TableReservationCancelDialog;
