/**
 * @file tables.projection.ts
 * @description Tables Projection Engine. Computes spatial table layout read models from repositories.
 */

import { repositories, type TableEntity } from '../storage';
import { projectionBus } from './projection.bus';

export interface TableProjectionItem {
  name: string;
  room: string;
  seats: number;
  isOccupied: boolean;
  latestInvoiceTime: string | null;
  mergedWith: string | null;
  layoutX: number;
  layoutY: number;
  shape: string;
}

export interface TablesProjectionData {
  tables: TableProjectionItem[];
  rooms: string[];
  totalTables: number;
  occupiedCount: number;
  vacantCount: number;
  mergedCount: number;
}

/**
 * Computes and returns the Tables Projection read model from repositories.
 */
export async function getTablesProjection(roomFilter?: string, repos = repositories): Promise<TablesProjectionData> {
  const rawTables: TableEntity[] = await repos.tables.getAll();

  const tables: TableProjectionItem[] = rawTables.map((t: TableEntity) => ({
    name: t.name,
    room: t.restaurant_room,
    seats: t.no_of_seats || 4,
    isOccupied: t.occupied === 1,
    latestInvoiceTime: t.latest_invoice_time || null,
    mergedWith: t.merged_with || null,
    layoutX: t.layout_x || 0,
    layoutY: t.layout_y || 0,
    shape: t.table_shape || 'Square',
  }));

  const rooms = Array.from(new Set(tables.map(t => t.room))).sort();
  const totalTables = tables.length;
  const occupiedCount = tables.filter(t => t.isOccupied).length;
  const vacantCount = totalTables - occupiedCount;
  const mergedCount = tables.filter(t => Boolean(t.mergedWith)).length;

  const filteredTables = roomFilter && roomFilter !== 'all'
    ? tables.filter(t => t.room.toLowerCase() === roomFilter.toLowerCase())
    : tables;

  return {
    tables: filteredTables,
    rooms,
    totalTables,
    occupiedCount,
    vacantCount,
    mergedCount,
  };
}

/**
 * Emits tables projection update event.
 */
export function notifyTablesProjectionUpdated(): void {
  projectionBus.emit('TABLES_UPDATED');
}
