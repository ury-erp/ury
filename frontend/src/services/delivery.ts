import { call } from '@ury/core';

export interface Lateness {
  late: boolean;
  minutes: number;
  over_by: number;
  against: 'promise' | 'limit' | null;
}

export interface DeliveryRow {
  latitude: number | null;
  longitude: number | null;
  name: string;
  invoice: string;
  zone: string | null;
  customer_name: string | null;
  mobile_number: string | null;
  address: string;
  status: 'Pending' | 'Assigned' | 'On The Way' | 'Delivered' | 'Failed' | 'Returned';
  driver: string | null;
  promised_minutes: number;
  ordered_at: string;
  delivery_fee: number;
  order_total: number;
  cash_on_delivery: number;
  cash_settled: number;
  failure_reason: string | null;
  notes: string | null;
  elapsed_minutes: number;
  lateness: Lateness;
}

export interface DriverRow {
  last_latitude: number | null;
  last_longitude: number | null;
  position_updated_at: string | null;
  position_accuracy: number | null;
  /** null when this driver has never reported a position today. */
  position_age_minutes: number | null;
  position_stale: boolean;
  name: string;
  driver_name: string;
  mobile_number: string | null;
  vehicle: string | null;
  active: number;
  open_deliveries: number;
  cash_held: number;
}

export interface DeliverySummary {
  orders: number;
  open: number;
  delivered: number;
  failed: number;
  average_minutes: number;
  late: number;
  /** null when nothing has been delivered yet — not a rate of zero. */
  on_time_rate: number | null;
  cash_with_drivers: number;
}

const unwrap = <T,>(res: any): T => res?.message ?? res;

export const deliveryService = {
  async board(includeClosed = false): Promise<{ deliveries: DeliveryRow[]; unassigned: number; late: number }> {
    return unwrap(await call('ury.ury.api.delivery.get_board', { include_closed: includeClosed ? 1 : 0 }));
  },
  async drivers(): Promise<DriverRow[]> {
    return unwrap(await call('ury.ury.api.delivery.get_drivers'));
  },
  async summary(): Promise<DeliverySummary> {
    return unwrap(await call('ury.ury.api.delivery.get_delivery_summary'));
  },
  async assign(delivery: string, driver: string) {
    return unwrap(await call('ury.ury.api.delivery.assign_driver', { delivery, driver }));
  },
  async setStatus(delivery: string, status: string, failure_reason?: string) {
    return unwrap(
      await call('ury.ury.api.delivery.set_delivery_status', { delivery, status, failure_reason }),
    );
  },
  async settleCash(driver: string): Promise<{ settled: number; amount: number }> {
    return unwrap(await call('ury.ury.api.delivery.settle_driver_cash', { driver }));
  },
  async setLocation(delivery: string, latitude: number, longitude: number) {
    return unwrap(
      await call('ury.ury.api.delivery.set_delivery_location', { delivery, latitude, longitude }),
    );
  },
  async driverLink(driver: string): Promise<{ url: string; driver_name: string }> {
    return unwrap(await call('ury.ury.api.driver_app.get_driver_link', { driver }));
  },
};
