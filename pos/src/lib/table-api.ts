import { DOCTYPES } from '../data/doctypes';
import { db, repositories, apiRegistry, call, projectionBus } from '@ury/core';
import { isNetworkError, unwrapResponse } from './network-utils';

export function extractErrorMessage(error: any, fallback = 'Failed to process reservation.'): string {
  if (!error) return fallback;

  if (typeof error === 'object' && error !== null) {
    if ('_server_messages' in error && typeof (error as any)._server_messages === 'string') {
      try {
        const messages = JSON.parse((error as any)._server_messages);
        if (Array.isArray(messages) && messages.length > 0) {
          const messageObj = typeof messages[0] === 'string' ? JSON.parse(messages[0]) : messages[0];
          if (messageObj && messageObj.message) {
            return messageObj.message.replace(/<[^>]*>?/gm, '').trim();
          }
        }
      } catch {}
    }

    if ('message' in error && typeof (error as any).message === 'string') {
      const msg = (error as any).message;
      if (msg.includes('_server_messages')) {
        try {
          const parsed = JSON.parse(msg);
          return extractErrorMessage(parsed, fallback);
        } catch {}
      }
      return msg.replace(/<[^>]*>?/gm, '').trim();
    }
  }

  if (error instanceof Error && error.message) {
    return error.message.replace(/<[^>]*>?/gm, '').trim();
  }

  if (typeof error === 'string') {
    return error.replace(/<[^>]*>?/gm, '').trim();
  }

  return fallback;
}

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
  const endpoint = apiRegistry.getUrl('GET_RESTAURANT_MENU');
  const params: Record<string, string> = { pos_profile: posProfile };
  if (room) {
    params.room = room;
  }
  const res = await call.get(endpoint, params);
  return unwrapResponse(res);
}

export async function getRooms(branch?: string | null): Promise<Room[]> {
  if (branch) {
    try {
      const rooms = await db.getDocList(DOCTYPES.URY_ROOM, {
        fields: ['name', 'branch'],
        filters: [['branch', 'like', branch]],
        limit: "*" as unknown as number,
        asDict: true,
      });
      if (rooms && rooms.length > 0) {
        return rooms as Room[];
      }
    } catch (error) {
      console.warn('Network getRooms with branch filter failed:', error);
    }
  }

  // Fallback 1: Query all rooms without branch constraint
  try {
    const allRooms = await db.getDocList(DOCTYPES.URY_ROOM, {
      fields: ['name', 'branch'],
      limit: "*" as unknown as number,
      asDict: true,
    });
    if (allRooms && allRooms.length > 0) {
      return allRooms as Room[];
    }
  } catch (error) {
    console.warn('Network getRooms all rooms failed:', error);
  }

  // Fallback 2: Derive unique rooms from cached tables repository in IndexedDB
  try {
    const cachedTables = await repositories.tables.getAll();
    const uniqueRoomNames = Array.from(new Set(cachedTables.map(t => t.restaurant_room).filter(Boolean)));
    if (uniqueRoomNames.length > 0) {
      return uniqueRoomNames.map(name => ({ name, branch: branch || 'Default' }));
    }
  } catch {}

  throw new Error(`Offline: no cached rooms available${branch ? ` for branch ${branch}` : ''}. Please check your network connection.`);
}



export async function getTableCount(room: string, branch?: string): Promise<number> {
  const filters = [
    ['restaurant_room', '=', room],
    ...(branch ? [['branch', '=', branch]] : []),
  ];
  try {
    const rows = await db.getDocList(DOCTYPES.URY_TABLE, {
      fields: ['count(name) as count'],
      filters: filters as any,
      limit: 1,
      asDict: true,
    }) as Array<{ count?: number | string }>;
    const countValue = rows[0]?.count ?? 0;
    return typeof countValue === 'number' ? countValue : Number(countValue) || 0;
  } catch {
    const cached = await repositories.tables.findByRoom(room);
    return cached.length;
  }
}


export async function getTables(room: string): Promise<Table[]> {
  try {
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
    }) as Table[];

    // When there are queued table mutations still syncing, merge server tables
    // with local pending occupancy/merge state so optimistic local mutations
    // (e.g. offline payment release, merge/unmerge, transfer) are not
    // clobbered by stale server data before they sync. If there are no pending
    // mutations, trust the server response and avoid overwriting it with stale
    // IndexedDB fields.
    const pendingCommands = await repositories.syncQueue.getAll();
    const hasPendingTableMutations = pendingCommands.some(
      c => (c.status === 'PENDING' || c.status === 'SYNCING') &&
           (c.action === 'merge_tables_batch' || c.action === 'unmerge_tables' || c.action === 'table_transfer' || c.action === 'sync_order')
    );

    let mergedTables = tables;
    if (hasPendingTableMutations) {
      const localTables = await repositories.tables.findByRoom(room);
      const localMap = new Map(localTables.map(t => [t.name, t]));

      mergedTables = tables.map(serverTable => {
        const local = localMap.get(serverTable.name);
        if (!local) return serverTable;

        const serverOccupied = serverTable.occupied ?? 0;
        const localMerged = local.merged_with ?? null;
        const serverMerged = serverTable.merged_with ?? null;

        if (local.occupied !== serverOccupied || localMerged !== serverMerged) {
          return {
            ...serverTable,
            occupied: local.occupied,
            latest_invoice_time: local.latest_invoice_time ?? null,
            merged_with: localMerged,
          };
        }

        return serverTable;
      });
    }

    // Cache tables in local repository with full server schema parity.
    // Filter out records without a valid primary key to avoid IndexedDB
    // DataError on putMany.
    const validTables = mergedTables.filter(
      t => t && typeof t.name === 'string' && t.name.trim().length > 0
    );
    if (validTables.length > 0) {
      await repositories.tables.putMany(
        validTables.map(t => ({
          name: t.name,
          restaurant_room: t.restaurant_room,
          no_of_seats: t.no_of_seats || 4,
          occupied: t.occupied || 0,
          latest_invoice_time: t.latest_invoice_time,
          merged_with: t.merged_with,
          layout_x: t.layout_x,
          layout_y: t.layout_y,
          table_shape: t.table_shape,
          is_take_away: t.is_take_away ?? 0,
          minimum_seating: t.minimum_seating,
        }))
      );
    }

    return mergedTables;
  } catch (error) {
    console.warn('Network getTables failed, falling back to local tables repository:', error);
    const cachedTables = await repositories.tables.findByRoom(room);
    if (cachedTables.length === 0) {
      throw new Error(`Offline: no cached tables available for room ${room}. Please check your network connection.`);
    }
    return cachedTables.map(ct => ({
      name: ct.name,
      occupied: ct.occupied,
      latest_invoice_time: ct.latest_invoice_time || null,
      is_take_away: ct.is_take_away ?? 0,
      restaurant_room: ct.restaurant_room,
      table_shape: (ct.table_shape as any) || 'Square',
      merged_with: ct.merged_with || null,
      no_of_seats: ct.no_of_seats,
      layout_x: ct.layout_x,
      layout_y: ct.layout_y,
      minimum_seating: ct.minimum_seating,
    }));
  }
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
  try {
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
  } catch {
    const cached = await repositories.tables.getAll();
    const vacant = cached.filter(t => t.occupied === 0 && (!excludeTable || t.name !== excludeTable));
    return vacant.map(ct => ({
      name: ct.name,
      occupied: ct.occupied,
      latest_invoice_time: ct.latest_invoice_time || null,
      is_take_away: ct.is_take_away ?? 0,
      restaurant_room: ct.restaurant_room,
      table_shape: (ct.table_shape as any) || 'Square',
      merged_with: ct.merged_with || null,
      no_of_seats: ct.no_of_seats,
      layout_x: ct.layout_x,
      layout_y: ct.layout_y,
      minimum_seating: ct.minimum_seating,
    }));
  }
}

export async function updateTableLayout(name: string, data: Partial<Table>) {
  try {
    await db.updateDoc(DOCTYPES.URY_TABLE, name, data);
  } catch (err) {
    console.warn('Network updateTableLayout failed:', err);
  }
  const existing = await repositories.tables.getById(name);
  if (existing) {
    await repositories.tables.put({
      ...existing,
      ...data,
    } as any);
  }
}

export async function mergeTablesBatch(anchor: string, tables: string[]) {
  const endpoint = apiRegistry.getUrl('MERGE_TABLES_BATCH');
  try {
    const result = await call.post(endpoint, {
      anchor_table: anchor,
      tables,
    });

    await repositories.tables.mergeCluster(anchor, tables);
    projectionBus.emit('TABLES_UPDATED');

    return result;
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }
    console.warn('Network mergeTablesBatch failed, queuing offline sync command:', error);

    // Apply the merge locally so the Table UI renders the merged cluster
    // immediately, matching the online API response shape.
    await repositories.tables.mergeCluster(anchor, tables);
    projectionBus.emit('TABLES_UPDATED');

    await repositories.syncQueue.put({
      id: `SYNC-MERGE-${anchor}-${[...tables].sort().join('-')}`,
      action: 'merge_tables_batch',
      endpoint: endpoint,
      payload: { anchor_table: anchor, tables },
      timestamp: new Date().toISOString(),
      status: 'PENDING',
      attempts: 0,
      priority: 1,
    });
    return { status: 'Queued Offline' };
  }
}

export async function unmergeTables(table: string) {
  const endpoint = apiRegistry.getUrl('UNMERGE_TABLES');
  try {
    const result = await call.post(endpoint, {
      table,
    });

    const cluster = await repositories.tables.getClusterTables(table);
    const allOrders = await repositories.orders.getAll();
    const activeOrderTables: string[] = [];
    for (const name of cluster) {
      const hasOwnActiveOrder = allOrders.some(
        o => o.table === name && o.status !== 'Paid' && o.status !== 'Cancelled'
      );
      if (hasOwnActiveOrder) {
        activeOrderTables.push(name);
      }
    }
    await repositories.tables.unmergeCluster(table, activeOrderTables);
    projectionBus.emit('TABLES_UPDATED');

    return result;
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }
    console.warn('Network unmergeTables failed, queuing offline sync command:', error);

    // Apply the unmerge locally: dissolve the cluster and keep any tables with
    // active local orders occupied so the UI matches online behavior.
    const cluster = await repositories.tables.getClusterTables(table);
    const allOrders = await repositories.orders.getAll();
    const activeOrderTables: string[] = [];
    for (const name of cluster) {
      const hasOwnActiveOrder = allOrders.some(
        o => o.table === name && o.status !== 'Paid' && o.status !== 'Cancelled'
      );
      if (hasOwnActiveOrder) {
        activeOrderTables.push(name);
      }
    }
    await repositories.tables.unmergeCluster(table, activeOrderTables);
    projectionBus.emit('TABLES_UPDATED');

    await repositories.syncQueue.put({
      id: `SYNC-UNMERGE-${table}`,
      action: 'unmerge_tables',
      endpoint: endpoint,
      payload: { table },
      timestamp: new Date().toISOString(),
      status: 'PENDING',
      attempts: 0,
      priority: 1,
    });
    return { status: 'Queued Offline' };
  }
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

export async function getActiveReservations(branch?: string, date?: string): Promise<TableReservation[]> {
  const { call } = await import('@ury/core');
  
  const response = await call.get('ury.ury.api.table_reservation.get_active_reservations', {
    branch: branch || undefined,
    date: date || undefined,
  });
  return response.message ?? [];
}

export async function getAvailableTablesForReservation(
  branch: string,
  reservedAt: string,
  excludeReservation?: string
): Promise<Table[]> {
  const { call } = await import('@ury/core');

  const response = await call.get(
    'ury.ury.api.table_reservation.get_available_tables_for_reservation',
    {
      branch,
      reserved_at: reservedAt,
      exclude_reservation: excludeReservation || undefined,
    }
  );
  return response.message ?? [];
}

