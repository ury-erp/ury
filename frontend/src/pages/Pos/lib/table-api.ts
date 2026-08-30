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
    limit: '*' as unknown as number,
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

