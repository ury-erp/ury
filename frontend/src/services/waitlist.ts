import { call } from '@ury/core';

export interface WaitEstimate {
  minutes: number | null;
  reason: 'free_now' | 'next_table' | 'no_suitable_table';
  turn_minutes: number;
  suitable_tables: number;
  ahead: number;
}

export interface WaitlistEntry {
  name: string;
  guest_name: string;
  mobile_number: string | null;
  no_of_pax: number;
  branch: string;
  restaurant_room: string | null;
  status: 'Waiting' | 'Notified' | 'Seated' | 'Cancelled' | 'No Show';
  joined_at: string;
  notified_at: string | null;
  seated_at: string | null;
  table: string | null;
  quoted_minutes: number;
  notes: string | null;
  source: string;
  waited_minutes: number;
  position?: number;
  estimate?: WaitEstimate;
}

export interface WaitlistSummary {
  waiting: number;
  guests_waiting: number;
  seated_today: number;
  left_today: number;
  average_wait: number;
  average_quote: number;
  turn_minutes: number;
}

export interface SuggestedTable {
  name: string;
  no_of_seats: number;
  restaurant_room: string | null;
  occupied: boolean;
  free_in_minutes: number;
  preferred_room: boolean;
}

const unwrap = <T,>(res: any): T => res?.message ?? res;

export const waitlistService = {
  async getWaitlist(includeClosed = false): Promise<{ entries: WaitlistEntry[]; turn_minutes: number }> {
    return unwrap(
      await call('ury.ury.api.waitlist.get_waitlist', { include_closed: includeClosed ? 1 : 0 }),
    );
  },

  async getSummary(): Promise<WaitlistSummary> {
    return unwrap(await call('ury.ury.api.waitlist.get_waitlist_summary'));
  },

  async quote(no_of_pax: number): Promise<WaitEstimate> {
    return unwrap(await call('ury.ury.api.waitlist.get_wait_quote', { no_of_pax }));
  },

  async join(payload: {
    guest_name: string;
    no_of_pax: number;
    mobile_number?: string;
    restaurant_room?: string;
    notes?: string;
    quoted_minutes?: number | null;
    source?: string;
  }): Promise<{ name: string; quoted_minutes: number }> {
    return unwrap(await call('ury.ury.api.waitlist.join_waitlist', payload));
  },

  async setStatus(entry: string, status: string, table?: string): Promise<WaitlistEntry> {
    return unwrap(await call('ury.ury.api.waitlist.set_status', { entry, status, table }));
  },

  async suggestTables(entry: string): Promise<SuggestedTable[]> {
    return unwrap(await call('ury.ury.api.waitlist.suggest_tables', { entry }));
  },
};
