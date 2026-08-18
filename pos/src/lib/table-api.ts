import { DOCTYPES } from '../data/doctypes';
import { db, repositories, apiRegistry, call, projectionBus } from '@ury/core';

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

export async function getRestaurantMenu(posProfile: string, room?: string | null) {
  const endpoint = apiRegistry.getUrl('GET_RESTAURANT_MENU');
  const params: Record<string, string> = { pos_profile: posProfile };
  if (room) {
    params.room = room;
  }
  const res = await call.get(endpoint, params);
  return res.message;
}

export async function getRooms(branch?: string | null): Promise<Room[]> {
  if (branch) {
    try {
      const rooms = await db.getDocList(DOCTYPES.URY_ROOM, {
        fields: ['name', 'branch'],
        filters: [['branch', '=', branch]],
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

    // Merge server tables with local pending occupancy/merge state so optimistic
    // local mutations (e.g. offline payment release, merge/unmerge) are not
    // clobbered by stale server data before they sync.
    const localTables = await repositories.tables.findByRoom(room);
    const localMap = new Map(localTables.map(t => [t.name, t]));

    const mergedTables = tables.map(serverTable => {
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
    return await call.post(endpoint, {
      anchor_table: anchor,
      tables,
    });
  } catch (error) {
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
    return await call.post(endpoint, {
      table,
    });
  } catch (error) {
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
