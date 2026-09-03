import { DOCTYPES } from '../data/doctypes';
import { db } from '@ury/core';

export interface Room {
  name: string;
  branch: string;
}

export interface Table {
  name: string;
  occupied: number;
  latest_invoice_time: string | null;
  is_take_away: number;
  restaurant_room: string;
  table_shape: 'Circle' | 'Square' | 'Rectangle';
  merged_with?: string | null;
  no_of_seats?: number;
  layout_x?: number;
  layout_y?: number;
  minimum_seating?: number;
}

export interface BranchReservationSettings {
  enable_reservation: number;
  buffer_time: number;
  grace_period: number;
  avg_table_time_last_day: number;
  avg_table_time_last_week: number;
  calculated_duration: number;
}

export interface TableReservation {
  name: string;
  branch: string;
  reserved_table: string;
  customer: string;
  customer_name?: string;
  customer_phone?: string;
  no_of_pax?: number;
  reserved_at: string;
  comments?: string;
  status: 'Requested' | 'Confirmed' | 'Completed' | 'Cancelled' | 'No Show';
  is_lock_window_active?: boolean;
  buffer_minutes?: number;
  grace_minutes?: number;
  duration_minutes?: number;
  lock_start_time?: string;
}


export async function getRestaurantMenu(posProfile: string, room?: string | null) {
  const { call } = await import('@ury/core');
  const params: Record<string, string> = { pos_profile: posProfile };
  if (room) {
    params.room = room;
  }
  const res = await call.get('ury.ury_pos.api.getRestaurantMenu', params);
  return res.message;
}

export async function getRooms(branch: string): Promise<Room[]> {
  const rooms = await db.getDocList(DOCTYPES.URY_ROOM, {
    fields: ['name', 'branch'],
    filters: [['branch', 'like', branch]],
    limit: "*" as unknown as number,
    asDict: true,
  });
  return rooms as Room[];
}

export async function getTableCount(room: string, branch?: string): Promise<number> {
  const filters = [
    ['restaurant_room', '=', room],
    ...(branch ? [['branch', '=', branch]] : []),
  ];
  const rows = await db.getDocList(DOCTYPES.URY_TABLE, {
    fields: ['count(name) as count'],
    filters: filters as any,
    limit: 1,
    asDict: true,
  }) as Array<{ count?: number | string }>;
  const countValue = rows[0]?.count ?? 0;
  return typeof countValue === 'number' ? countValue : Number(countValue) || 0;
}
export async function getTables(room: string): Promise<Table[]> {
  const tables = await db.getDocList(DOCTYPES.URY_TABLE, {
    fields: [
      'name',
      'occupied',
      'latest_invoice_time',
      'is_take_away',
      'restaurant_room',
      'table_shape',
      'merged_with',
      'no_of_seats',
      'layout_x',
      'layout_y',
      'minimum_seating'
    ],
    filters: [['restaurant_room', '=', room]],
    asDict: true,
  });

  return tables as Table[];
}

const TABLE_LIST_FIELDS = [
  'name',
  'occupied',
  'latest_invoice_time',
  'is_take_away',
  'restaurant_room',
  'table_shape',
  'merged_with',
  'no_of_seats',
  'layout_x',
  'layout_y',
  'minimum_seating',
] as const;

export async function getVacantTablesForBranch(
  branch: string,
  excludeTable?: string
): Promise<Table[]> {
  const filters: Array<[string, string, string | number]> = [
    ['branch', '=', branch],
    ['occupied', '=', 0],
  ];

  const tables = await db.getDocList(DOCTYPES.URY_TABLE, {
    fields: [...TABLE_LIST_FIELDS],
    filters,
    orderBy: { field: 'restaurant_room', order: 'asc' },
    limit: '*' as unknown as number,
    asDict: true,
  } as unknown as Parameters<typeof db.getDocList>[1]);

  const rows = tables as Table[];
  const vacant = excludeTable ? rows.filter((table) => table.name !== excludeTable) : rows;

  return vacant.sort(
    (a, b) =>
      a.restaurant_room.localeCompare(b.restaurant_room) || a.name.localeCompare(b.name)
  );
}


export async function updateTableLayout(name: string, data: Partial<Table>) {
  return db.updateDoc(DOCTYPES.URY_TABLE, name, data);
}

export async function mergeTablesBatch(anchor: string, tables: string[]) {
  const { call } = await import('@ury/core');
  return call.post('ury.ury.doctype.ury_order.ury_order.merge_tables_batch', {
    anchor_table: anchor,
    tables,
  });
}

export async function unmergeTables(table: string) {
  const { call } = await import('@ury/core');
  return call.post('ury.ury.doctype.ury_order.ury_order.unmerge_tables', {
    table,
  });
}

export async function getBranchReservationSettings(branch: string): Promise<BranchReservationSettings> {
  const { call } = await import('@ury/core');

  const response = await call.get(
    'ury.ury.api.table_reservation.get_branch_reservation_settings',
    { branch }
  );

  return response.message ?? {
    enable_reservation: 0,
    buffer_time: 30,
    grace_period: 15,
    avg_table_time_last_day: 0,
    avg_table_time_last_week: 0,
    calculated_duration: 90,
  };
}

export async function checkTableReservation(table: string): Promise<TableReservation | null> {
  const { call } = await import('@ury/core');

  const response = await call.get(
    'ury.ury.api.table_reservation.check_table_reservation',
    { table }
  );

  return response.message ?? null;
}

export async function createTableReservation(data: {
  table: string;
  customer: string;
  customer_name?: string;
  customer_phone: string;
  no_of_pax: number;
  reserved_at: string;
  notes?: string;
  branch?: string;
}) {
  const { call } = await import('@ury/core');

  const response = await call.post(
    'ury.ury.api.table_reservation.create_table_reservation',
    {
      table: data.table,
      customer: data.customer,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      no_of_pax: data.no_of_pax,
      reserved_at: data.reserved_at,
      notes: data.notes,
      branch: data.branch,
    }
  );

  return response.message;
}

export async function updateTableReservation(data: {
  reservation_name: string;
  table?: string;
  customer?: string;
  customer_name?: string;
  customer_phone?: string;
  no_of_pax?: number;
  reserved_at?: string;
  notes?: string;
  branch?: string;
}) {
  const { call } = await import('@ury/core');

  const response = await call.post(
    'ury.ury.api.table_reservation.update_table_reservation',
    data
  );

  return response.message;
}

export async function updateTableReservationStatus(reservationName: string, status: string, posInvoice?: string) {
  const { call } = await import('@ury/core');
  
  const response = await call.post(
    'ury.ury.api.table_reservation.update_reservation_status',
    {
      reservation_name: reservationName,
      status,
      pos_invoice: posInvoice,
    }
  );

  return response.message;
}

export async function getActiveReservations(branch?: string): Promise<TableReservation[]> {
  const { call } = await import('@ury/core');
  
  const response = await call.get('ury.ury.api.table_reservation.get_active_reservations', {
    branch: branch || undefined,
  });
  return response.message ?? [];
}