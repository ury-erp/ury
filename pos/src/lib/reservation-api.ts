import { call } from '@ury/core';

export interface TableReservationHint {
  reservation: string;
  guest_name: string;
  no_of_pax: number;
  reserved_from: string;
  status: string;
  /** True once the booked time has arrived — the guest is due now, not later. */
  in_progress: boolean;
}

/** Keyed by table name. A table with no entry is free. */
export type ReservationsByTable = Record<string, TableReservationHint>;

/**
 * Which tables are spoken for now or shortly.
 *
 * This is the half of a reservation system that decides whether staff use
 * it. A cashier about to seat a walk-in has to see that table 7 is booked in
 * twenty minutes *on the table map*, at the moment of seating — a booking
 * list on another screen is a notepad with extra steps.
 */
export async function getTableReservationStatus(): Promise<ReservationsByTable> {
  try {
    const res = await call<{ message: ReservationsByTable }>(
      'ury.ury.api.reservations.get_table_reservation_status',
    );
    return res?.message ?? {};
  } catch {
    // A table map that fails to load reservations still has to show tables.
    // Losing the hint is bad; losing the floor plan mid-service is worse.
    return {};
  }
}
