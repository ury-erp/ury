/**
 * @file types.ts
 * @description Comprehensive TypeScript type definitions for URY POS Storage Layer entities,
 * collection schemas, and generic CRUD Repository Interfaces.
 */

// ==========================================
// 1. ENTITY TYPE DEFINITIONS (9 COLLECTIONS)
// ==========================================

/**
 * 1. Order Entity (Collection: 'orders')
 */
export interface OrderEntity {
  /** Unique primary key (Doc ID or Temp Client UUID e.g. TEMP-ORD-XXXX) */
  id: string;
  /** Linked restaurant table name if Dine-In */
  table?: string | null;
  /** Restaurant room name */
  room?: string | null;
  /** Order type e.g., Dine-In, Takeaway, Aggregators */
  order_type: string;
  /** Aggregator partner ID (Swiggy, Zomato, etc.) for Aggregator orders */
  custom_aggregator_id?: string | null;
  /** Linked merged POS Invoice name (bill-merge feature) */
  custom_merged_pos_invoice?: string | null;
  /** Total of the linked merged invoice */
  custom_merged_total?: number | null;
  /** Mirror of the linked invoice's item rows for merged print/display */
  custom_merged_pos_invoice_details?: Array<{
    item: string;
    item_name: string;
    rate: number;
    qty: number;
    amount: number;
  }> | null;
  /** Shared split-bill group id (backend `custom_split_group`) */
  custom_split_group?: string | null;
  /** Parent invoice name when this order was created by a split (backend `custom_split_from`) */
  custom_split_from?: string | null;
  /** 1-based position within the split group */
  split_index?: number;
  /** Total number of invoices in the split group */
  split_total?: number;
  /** Names of the other invoices in the split group */
  split_siblings?: string[];
  /** Order lifecycle status e.g., Draft, Paid, Unbilled, Cancelled */
  status: 'Draft' | 'Unbilled' | 'Recently Paid' | 'Paid' | 'Cancelled';
  /**
   * Id of the pending sync command that created this temporary order (e.g. a
   * SplitBillCommand for a TEMP-SPLIT-* child). Dependent commands use this to
   * wait on the correct creator instead of a non-existent SYNC-ORDER-* record.
   */
  pending_command_id?: string | null;
  /**
   * Local print-state flag. 0 = unprinted (Unbilled table orders), 1 = printed.
   * This mirrors the backend POS Invoice `invoice_printed` field for offline
   * classification between Unbilled and Draft tabs.
   */
  invoice_printed?: number;
  /** Total pax count */
  no_of_pax?: number;
  /** Customer ID or phone */
  customer?: string;
  /** Assigned waiter */
  waiter?: string;
  /** Assigned cashier */
  cashier?: string;
  /** POS profile reference */
  pos_profile?: string;
  /** Order items JSON string or parsed array */
  items: Array<{
    /** POS Invoice Item row name (server row id); falls back to item code locally */
    name?: string;
    item: string;
    item_name: string;
    rate: number;
    qty: number;
    amount: number;
    comment?: string;
  }>;
  /** Grand total amount */
  grand_total: number;
  /** Creation timestamp ISO string */
  createdAt: string;
  /** Modification timestamp ISO string */
  updatedAt: string;
  /** Synchronization state for offline tracking */
  sync_status: 'synced' | 'pending' | 'failed';
}

/**
 * 2. Table Entity (Collection: 'tables')
 */
export interface TableEntity {
  /** Primary Key: Table Name (e.g. T-01) */
  name: string;
  /** Assigned room name */
  restaurant_room: string;
  /** Seat capacity */
  no_of_seats: number;
  /** Occupation flag: 1 = Occupied, 0 = Free */
  occupied: number;
  /** Latest invoice timestamp string */
  latest_invoice_time?: string | null;
  /** Merged partner table CSV string */
  merged_with?: string | null;
  /** Spatial layout X coordinate */
  layout_x?: number;
  /** Spatial layout Y coordinate */
  layout_y?: number;
  /** Table shape for rendering */
  table_shape?: string;
  /** Take-away table flag (server API parity) */
  is_take_away?: number;
  /** Minimum seating capacity (server API parity) */
  minimum_seating?: number;
  /** Active order identifier(s) cached on the table record */
  active_orders?: string | null;
}

/**
 * 3. Menu Item Entity (Collection: 'menu')
 */
export interface MenuItemEntity {
  id: string;
  item_name: string;
  rate: number | string;
  category?: string;
  course?: string | null;
  course_label?: string;
  special_dish?: 1 | 0;
  disabled?: number;
  item_image?: string | null;
  image?: string | null;
  description?: string;
  variants?: Array<{ name: string; price: number | string }>;
  addons?: Array<{ name: string; price: number | string; category?: string }>;
}

/**
 * 4. Customer Entity (Collection: 'customers')
 */
export interface CustomerEntity {
  /** Primary Key: Customer ID or Phone */
  id: string;
  /** Full customer name */
  name: string;
  /** Mobile phone number */
  phone: string;
  /** Customer Name explicit field */
  customer_name?: string;
  /** Mobile Number explicit field */
  mobile_number?: string;
  /** Customer Group reference */
  customer_group?: string;
  /** Territory reference */
  territory?: string;
  /** Content formatted string */
  content?: string;
}

/**
 * 5. Payment Mode Entity (Collection: 'payment_modes')
 */
export interface PaymentModeEntity {
  /** Primary Key: Payment Mode Name (Cash, Card, UPI) */
  id: string;
  /** Display name */
  name: string;
  /** Enabled status */
  enabled: boolean;
  /** Default account reference */
  account?: string;
}

/**
 * 6. Aggregator Entity (Collection: 'aggregators')
 */
export interface AggregatorEntity {
  /** Primary Key: Aggregator Name (Zomato, Swiggy, UberEats) */
  name: string;
  /** Associated default customer name */
  customer: string;
  /** Status flag */
  enabled: boolean;
  /** Specific price list override */
  price_list?: string;
}

/**
 * 6a. Aggregator Item Entity (Collection: 'aggregator_items')
 */
export interface AggregatorItemEntity {
  /** Composite primary key: `${aggregator}::${item}` */
  id: string;
  /** Aggregator partner name (e.g. Swiggy, Zomato) */
  aggregator: string;
  /** Item code */
  item: string;
  /** Display name */
  item_name: string;
  /** Unit rate from aggregator price list */
  rate: number;
  /** Image URL or asset path */
  item_image?: string | null;
  /** Last sync timestamp */
  updatedAt: string;
}

export interface SyncQueueEntity {
  id: string; // compatibility mapping
  action: string; // compatibility mapping
  endpoint: string; // compatibility mapping
  priority: number; // compatibility mapping
  timestamp: string; // compatibility mapping

  command_id?: string;
  client_request_id?: string;
  operation_type?: string;
  entity_type?: string;
  entity_id?: string;
  temporary_id?: string | null;
  server_id?: string | null;
  dependency_ids?: string[];
  dependencies?: string[]; // legacy alias used by some enqueue sites
  /** Idempotency key stored on the envelope, not in the API payload */
  idempotency_key?: string;
  payload: Record<string, unknown>;
  payload_hash?: string;
  retry_count?: number;
  status: 'PENDING' | 'SYNCING' | 'FAILED' | 'COMPLETED';
  created_at?: string;
  updated_at?: string;
  version?: number;
  last_error?: string | null;
  attempts?: number;
}

/**
 * 8. Metadata Entity (Collection: 'metadata')
 */
export interface MetadataEntity {
  /** Primary Key: Metadata key name (e.g. last_menu_sync, schema_version) */
  key: string;
  /** Metadata value (stringified JSON or scalar string) */
  value: string;
  /** Last updated ISO timestamp */
  updatedAt: string;
}

/**
 * 9. Settings Entity (Collection: 'settings')
 */
export interface SettingsEntity {
  /** Primary Key: Setting key name (e.g. pos_profile, currency, qz_host) */
  key: string;
  /** Setting value payload */
  value: unknown;
  /** Last updated ISO timestamp */
  updatedAt: string;
}

// ==========================================
// 2. QUERY & PAGINATION OPTIONS
// ==========================================

export interface QueryOptions<T> {
  where?: Partial<T>;
  limit?: number;
  offset?: number;
  orderBy?: keyof T;
  orderDirection?: 'asc' | 'desc';
}

// ==========================================
// 3. GENERIC REPOSITORY INTERFACE (CRUD ONLY)
// ==========================================

export interface IBaseRepository<T, K = string> {
  /** Get record by primary key */
  getById(id: K): Promise<T | undefined>;
  /** Get all records in collection */
  getAll(options?: QueryOptions<T>): Promise<T[]>;
  /** Insert or update a single record */
  put(item: T): Promise<K>;
  /** Bulk insert or update records */
  putMany(items: T[]): Promise<K[]>;
  /** Delete record by primary key */
  delete(id: K): Promise<void>;
  /** Clear all records in collection */
  clear(): Promise<void>;
  /** Count records matching query or total */
  count(query?: Partial<T>): Promise<number>;
  /** Query records with filters */
  query(options: QueryOptions<T>): Promise<T[]>;
  /** Execute write operations inside an atomic IndexedDB transaction */
  runTransaction<R>(mode: 'r' | 'rw', fn: () => Promise<R>): Promise<R>;
}

// ==========================================
// 4. COLLECTION SPECIFIC REPOSITORY INTERFACES
// ==========================================

export interface IOrderRepository extends IBaseRepository<OrderEntity, string> {
  findByStatus(status: OrderEntity['status']): Promise<OrderEntity[]>;
  findByTable(table: string): Promise<OrderEntity | undefined>;
  upsertStatus(
    id: string,
    status: OrderEntity['status']
  ): Promise<OrderEntity | null>;
  purgeSyncedPaidOrders(): Promise<number>;
}

export interface ITableRepository extends IBaseRepository<TableEntity, string> {
  findByRoom(room: string): Promise<TableEntity[]>;
  findOccupied(): Promise<TableEntity[]>;
  setOccupied(name: string, occupied: boolean): Promise<void>;
  getClusterTables(primary: string): Promise<string[]>;
  releaseCluster(tableNames: string[]): Promise<void>;
  mergeCluster(anchor: string, targets: string[]): Promise<void>;
  unmergeCluster(table: string, activeOrderTables?: string[]): Promise<void>;
  transferTable(source: string, target: string): Promise<void>;
}

export interface IMenuRepository extends IBaseRepository<MenuItemEntity, string> {
  findByCategory(category: string): Promise<MenuItemEntity[]>;
}

export interface ICustomerRepository extends IBaseRepository<CustomerEntity, string> {
  findByPhone(phone: string): Promise<CustomerEntity | undefined>;
  searchByNameOrPhone(query: string): Promise<CustomerEntity[]>;
}

export interface IPaymentModeRepository extends IBaseRepository<PaymentModeEntity, string> {
  findEnabled(): Promise<PaymentModeEntity[]>;
}

export interface IAggregatorRepository extends IBaseRepository<AggregatorEntity, string> {
  findEnabled(): Promise<AggregatorEntity[]>;
}

export interface IAggregatorItemRepository extends IBaseRepository<AggregatorItemEntity, string> {
  /** Find all cached items for a specific aggregator partner */
  findByAggregator(aggregator: string): Promise<AggregatorItemEntity[]>;
  /** Replace the cached catalog for an aggregator partner */
  putManyByAggregator(
    aggregator: string,
    items: Array<Omit<AggregatorItemEntity, 'id' | 'aggregator' | 'updatedAt'>>
  ): Promise<string[]>;
}

export interface ISyncQueueRepository extends IBaseRepository<SyncQueueEntity, string> {
  findPending(): Promise<SyncQueueEntity[]>;
  getNextBatch(batchSize: number): Promise<SyncQueueEntity[]>;
}

export interface IMetadataRepository extends IBaseRepository<MetadataEntity, string> {
  getValue(key: string): Promise<string | null>;
  setValue(key: string, value: string): Promise<string>;
}

export interface ISettingsRepository extends IBaseRepository<SettingsEntity, string> {
  getSetting<V = unknown>(key: string): Promise<V | null>;
  setSetting<V = unknown>(key: string, value: V): Promise<string>;
}
