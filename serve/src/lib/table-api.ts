import { DOCTYPES } from '../data/doctypes';
import { db, call } from '@ury/core';
import type { Filter } from 'frappe-js-sdk/lib/db/types';
import { parseMergedWith } from './table-utils';

export interface Room {
  name: string;
  branch: string;
}

/** Assignment row from `getRoom()` / `get_captain_context().rooms` (room may be null). */
export interface AssignedRoom {
  name: string | null;
  branch?: string | null;
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

/**
 * RN `MenuContext.getRooms` parity for the Serve room tabs.
 *
 * - Single-cashier: all branch rooms.
 * - Multi-cashier: only `getRoom()` assignments.
 * - Multi-cashier + null/empty assignment name: branch-wide → all rooms
 *   (same meaning as backend `_enforce_order_access` / `get_table_order_context`).
 */
export function resolveAllowedRooms(params: {
  multipleCashier: boolean;
  assignedRooms: AssignedRoom[];
  branchRooms: Room[];
}): Room[] {
  const { multipleCashier, assignedRooms, branchRooms } = params;

  if (!multipleCashier) {
    return branchRooms;
  }

  const hasBranchWideAccess = assignedRooms.some(
    (room) => room.name == null || room.name === ''
  );
  if (hasBranchWideAccess) {
    return branchRooms;
  }

  const allowedNames = new Set(
    assignedRooms
      .map((room) => room.name)
      .filter((name): name is string => Boolean(name))
  );
  if (allowedNames.size === 0) {
    return [];
  }

  const fromBranch = branchRooms.filter((room) => allowedNames.has(room.name));
  if (fromBranch.length > 0) {
    return fromBranch;
  }

  return [...allowedNames].map((name) => ({
    name,
    branch: assignedRooms.find((room) => room.name === name)?.branch ?? '',
  }));
}

export async function getRestaurantMenu(posProfile: string, room?: string | null) {
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
    limit: 0,
    asDict: true,
  });
  return rooms as Room[];
}

export async function getTableCount(room: string, branch?: string): Promise<number> {
  const filters: Filter[] = [
    ['restaurant_room', '=', room],
    ...(branch ? ([['branch', '=', branch]] as Filter[]) : []),
  ];
  const rows = (await db.getDocList(DOCTYPES.URY_TABLE, {
    fields: ['count(name) as count'],
    filters,
    limit: 1,
    asDict: true,
  } as unknown as Parameters<typeof db.getDocList>[1])) as Array<{ count?: number | string }>;
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
    limit: 0,
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
    limit: 0,
    asDict: true,
  } as unknown as Parameters<typeof db.getDocList>[1]);

  const rows = tables as Table[];
  const vacant = excludeTable ? rows.filter((table) => table.name !== excludeTable) : rows

  // Transfer destinations must be free and not part of a merge cluster.
  return vacant
    .filter((table) => !parseMergedWith(table.merged_with).length)
    .sort(
      (a, b) =>
        a.restaurant_room.localeCompare(b.restaurant_room) || a.name.localeCompare(b.name)
    )
}


export async function updateTableLayout(name: string, data: Partial<Table>) {
  return db.updateDoc(DOCTYPES.URY_TABLE, name, data);
}

export async function mergeTablesBatch(anchor: string, tables: string[]) {
  return call.post('ury.ury.doctype.ury_order.ury_order.merge_tables_batch', {
    anchor_table: anchor,
    tables,
  });
}

export async function unmergeTables(table: string) {
  return call.post('ury.ury.doctype.ury_order.ury_order.unmerge_tables', {
    table,
  });
}

