import { call } from '@ury/core';

const API = 'ury.ury.api.inventory';

export type StockStatus = 'ok' | 'low' | 'out' | 'negative';

export interface WarehouseSummary {
  name: string;
  label: string;
  parent: string | null;
  is_group: number;
  is_main: boolean;
  is_transit: boolean;
  is_rejected: number;
  item_count: number;
  total_qty: number;
  stock_value: number;
  low_count: number;
  out_count: number;
  negative_count: number;
  stagnant_count: number;
  last_movement: string | null;
}

export interface MovementPoint {
  date: string;
  in_value: number;
  out_value: number;
  in_count: number;
  out_count: number;
}

export interface RecentMovement {
  item_code: string;
  item_name: string;
  warehouse: string;
  actual_qty: number;
  stock_value_difference: number;
  voucher_type: string;
  voucher_no: string;
  posting_date: string;
  posting_time: string;
  stock_uom: string;
}

export interface InventoryOverview {
  company: string;
  currency: string;
  main_warehouse: string | null;
  today: string;
  days: number;
  warehouses: WarehouseSummary[];
  kpis: {
    stock_value: number;
    items_in_stock: number;
    low_count: number;
    out_count: number;
    negative_count: number;
    stagnant_value: number;
    stagnant_count: number;
    warehouse_count: number;
  };
  value_by_group: { item_group: string; value: number }[];
  movement: { granularity: 'day' | 'week'; points: MovementPoint[] };
  recent: RecentMovement[];
}

export interface StockRow {
  item_code: string;
  item_name: string;
  item_group: string;
  image?: string | null;
  warehouse?: string | null;
  stock_uom: string;
  actual_qty: number;
  reserved_qty: number;
  ordered_qty: number;
  projected_qty: number;
  valuation_rate: number;
  stock_value: number;
  reorder_level: number;
  status: StockStatus;
  stagnant: boolean;
  last_out: string | null;
}

export interface WarehouseStockPage {
  warehouse: string;
  rows: StockRow[];
  total: number;
  value: number;
  status_counts: Record<StockStatus, number>;
  item_groups: string[];
  page: number;
  page_size: number;
}

export interface WarehouseLayout {
  warehouse: string;
  racks: { item_group: string; items: StockRow[] }[];
  total_items: number;
  shown_items: number;
}

export interface StockFilters {
  search?: string;
  status?: string;
  item_group?: string;
  sort?: 'value' | 'qty' | 'name' | 'status';
  page?: number;
  page_size?: number;
}

const unwrap = <T,>(res: unknown): T => ((res as { message?: T })?.message ?? res) as T;

export const inventoryService = {
  async overview(branch: string | undefined, days: number): Promise<InventoryOverview> {
    return unwrap(await call(`${API}.get_inventory_overview`, { branch, days }));
  },
  async stock(warehouse: string, filters: StockFilters): Promise<WarehouseStockPage> {
    return unwrap(await call(`${API}.get_warehouse_stock`, { warehouse, ...filters }));
  },
  async layout(warehouse: string): Promise<WarehouseLayout> {
    return unwrap(await call(`${API}.get_warehouse_layout`, { warehouse }));
  },
};
