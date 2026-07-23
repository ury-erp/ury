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
import { CalendarClock, User } from "lucide-react";

interface Reservation {
    customer: string;
    reserved_at: string;
}

interface Props {
    open: boolean;
    reservation: Reservation | null;
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

                        <div className="mb-5 flex items-start justify-between">
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

                        <div className="space-y-4">

                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white">
                                    <User className="h-4 w-4 text-gray-500" />
                                </div>

                                <div>
                                    <p className="text-xs text-gray-500">
                                        Customer
                                    </p>

                                    <p className="font-medium text-gray-900">
                                        {reservation.customer}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white">
                                    <CalendarClock className="h-4 w-4 text-gray-500" />
                                </div>

                                <div>
                                    <p className="text-xs text-gray-500">
                                        Reservation Time
                                    </p>

                                    <p className="font-medium text-gray-900">
                                        {reservation.reserved_at}
                                    </p>
                                </div>
                            </div>

                        </div>

                    </div>

                    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                        <p className="text-sm leading-6 text-red-700">
                            This action cannot be undone.
                            <br />
                            The reservation will be permanently marked as cancelled.
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
                        {loading ? "Cancelling..." : "Cancel Reservation"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default TableReservationCancelDialog;
