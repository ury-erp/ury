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
import { AlertTriangle, CalendarClock, Phone, User, Users } from "lucide-react";
import type { TableReservation } from '../lib/table-api';
import { formatReservationTime } from '../lib/table-utils';

interface Props {
    open: boolean;
    reservation: TableReservation | null;
    tableName: string;
    onClose: () => void;
}

const TableReservationWarningDialog = ({
    open,
    reservation,
    tableName,
    onClose,
}: Props) => {
    if (!reservation) return null;

    const formattedTime = formatReservationTime(reservation.reserved_at) || '-';

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent
                variant="large"
                size="sm"
                className="max-w-lg p-0 flex flex-col max-h-[90vh] overflow-hidden"
            >
                {/* Header */}
                <DialogHeader className="px-8 pt-8 pb-4 shrink-0">
                    <DialogTitle className="text-xl flex items-center gap-2 text-amber-900">
                        <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0" />
                        Table Reserved
                    </DialogTitle>
                    <DialogDescription className="text-sm text-gray-600 mt-1">
                        This table has an active reservation and is protected by buffer time.
                    </DialogDescription>
                </DialogHeader>

                <div className="px-8 pb-6 space-y-5 overflow-y-auto min-h-0">
                    {/* Primary Buffer-Time Warning Banner */}
                    <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-5 shadow-sm text-center space-y-1">
                        <p className="text-base font-bold text-amber-950">
                            Table {tableName} is reserved for {formattedTime}.
                        </p>
                        <p className="text-sm font-medium text-amber-800">
                            Please choose another table.
                        </p>
                    </div>

                    {/* Reservation Information Card */}
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
                                    <CalendarClock className="h-4 w-4 text-indigo-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Reservation Time</p>
                                    <p className="font-semibold text-gray-900">
                                        {formattedTime}
                                    </p>
                                </div>
                            </div>

                            {(reservation.customer_name || reservation.customer) && (
                                <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
                                        <User className="h-4 w-4 text-indigo-600" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500">Customer Name</p>
                                        <p className="font-medium text-gray-900">
                                            {reservation.customer_name || reservation.customer}
                                        </p>
                                    </div>
                                </div>
                            )}

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

                            {reservation.comments && (
                                <div className="mt-2 rounded-lg bg-white/80 p-3 text-xs text-gray-700">
                                    <span className="font-semibold">Notes:</span> {reservation.comments}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="border-t bg-white px-8 py-5 shrink-0 flex justify-end">
                    <Button
                        onClick={onClose}
                        className="w-full sm:w-auto"
                    >
                        Choose Another Table
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default TableReservationWarningDialog;