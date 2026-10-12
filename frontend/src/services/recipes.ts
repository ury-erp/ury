import { call } from '@ury/core';

const API = 'ury.ury.api.recipes';
const CONSUMPTION = 'ury.ury.api.consumption';

export type CostSource = 'warehouse' | 'average' | 'purchase' | 'none';

export interface UomOption {
  uom: string;
  /** Stock units per one of this unit. */
  conversion_factor: number;
  whole_number: boolean;
}

export interface LastPurchase {
  rate: number;
  date: string;
  supplier?: string | null;
  invoice: string;
}

export interface RecipeSetup {
  company: string;
  currency: string;
  warehouses: { name: string; label: string }[];
  default_warehouse: string | null;
  production_units: { name: string; label: string; warehouse: string | null; item_groups: string[] }[];
  allow_negative_stock: number;
  permissions: { write: boolean };
}

export interface RecipeRow {
  item_code: string;
  item_name: string;
  item_group: string;
  image?: string | null;
  is_stock_item: number;
  recipe: string | null;
  ingredient_count: number;
  cost: number | null;
  cost_complete: boolean;
  price: number | null;
  food_cost_percent: number | null;
  warning: 'stock_item' | null;
}

export interface RecipeList {
  rows: RecipeRow[];
  summary: { products: number; with_recipe: number; without_recipe: number; average_food_cost_percent: number | null };
}

export interface Ingredient {
  item_code: string;
  item_name: string;
  is_kit: boolean;
  qty: number;
  uom: string;
  stock_uom: string;
  conversion_factor: number;
  stock_qty: number;
  source_warehouse: string | null;
  /** Per stock unit. */
  unit_cost: number;
  cost_source: CostSource;
  line_cost: number | null;
  uoms: UomOption[];
  whole_number: boolean;
  available_qty: number | null;
  last_purchase?: LastPurchase | null;
}

export interface RecipeDetail {
  item: { item_code: string; item_name: string; item_group: string; image?: string | null; is_stock_item: number; stock_uom: string };
  recipe: string | null;
  source_warehouse: string | null;
  default_warehouse: string | null;
  ingredients: Ingredient[];
  cost: number;
  cost_complete: boolean;
  price: number | null;
  food_cost_percent: number | null;
  history: { name: string; creation: string; by: string; current: boolean }[];
  warning: 'stock_item' | null;
}

export interface IngredientOption {
  item_code: string;
  item_name: string;
  item_group: string;
  stock_uom: string;
  is_kit: boolean;
  uoms: UomOption[];
  unit_cost: number;
  cost_source: CostSource;
  available_qty: number | null;
}

export interface IngredientPrice {
  unit_cost: number;
  cost_source: CostSource;
  available_qty: number | null;
  last_purchase?: LastPurchase | null;
}

export interface ConsumptionReport {
  from_date: string;
  to_date: string;
  cost: number;
  counts: { Done: number; Failed: number; Pending: number; Cancelled: number };
  ingredients: { item_code: string; item_name: string; stock_uom: string; qty: number; cost: number }[];
  products: { sold_item: string; item_name: string; cost: number; invoices: number }[];
  problems: { name: string; pos_invoice: string; status: 'Failed' | 'Pending'; posting_date: string; error: string | null; attempts: number; modified: string }[];
}

const unwrap = <T,>(res: unknown): T => ((res as { message?: T })?.message ?? res) as T;

export const recipeService = {
  async setup(branch?: string): Promise<RecipeSetup> {
    return unwrap(await call(`${API}.get_recipe_setup`, { branch }));
  },
  async list(branch?: string, search?: string, status?: string): Promise<RecipeList> {
    return unwrap(await call(`${API}.get_recipes`, { branch, search, status }));
  },
  async get(itemCode: string, branch?: string): Promise<RecipeDetail> {
    return unwrap(await call(`${API}.get_recipe`, { item_code: itemCode, branch }));
  },
  async searchIngredients(term: string, warehouse?: string, exclude?: string): Promise<IngredientOption[]> {
    return unwrap(await call(`${API}.search_ingredients`, { term, warehouse, exclude }));
  },
  async price(itemCodes: string[], warehouse?: string): Promise<Record<string, IngredientPrice>> {
    return unwrap(await call(`${API}.price_ingredients`, { item_codes: JSON.stringify(itemCodes), warehouse }));
  },
  async save(
    itemCode: string,
    data: {
      recipe: string | null;
      branch?: string;
      source_warehouse?: string | null;
      ingredients: { item_code: string; qty: number; uom: string; source_warehouse?: string | null }[];
    },
  ): Promise<{ recipe: string; changed: boolean }> {
    return unwrap(await call(`${API}.save_recipe`, { item_code: itemCode, data: JSON.stringify(data) }));
  },
  async remove(itemCode: string, recipe: string | null): Promise<void> {
    await call(`${API}.remove_recipe`, { item_code: itemCode, recipe });
  },
  async consumption(branch?: string, from_date?: string, to_date?: string): Promise<ConsumptionReport> {
    return unwrap(await call(`${CONSUMPTION}.get_consumption`, { branch, from_date, to_date }));
  },
  async retry(names?: string[], branch?: string): Promise<Record<string, number>> {
    return unwrap(await call(`${CONSUMPTION}.retry`, { names: names ? JSON.stringify(names) : undefined, branch }));
  },
};

/** Food cost % bands: the usual restaurant targets. Always shown with a label, never color alone. */
export function foodCostBand(percent: number | null): 'good' | 'watch' | 'high' | null {
  if (percent === null || percent === undefined) return null;
  if (percent <= 35) return 'good';
  if (percent <= 45) return 'watch';
  return 'high';
}
