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
  /** Order lifecycle status e.g., Draft, Paid, Unbilled, Cancelled */
  status: 'Draft' | 'Unbilled' | 'Recently Paid' | 'Paid' | 'Cancelled';
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
}

/**
 * 3. Menu Item Entity (Collection: 'menu')
 */
export interface MenuItemEntity {
  /** Primary Key: Item Code */
  id: string;
  /** Item display name */
  item_name: string;
  /** Base unit rate */
  rate: number;
  /** Category or Item Group */
  category?: string;
  /** Course name (Starters, Mains, Desserts) */
  course?: string | null;
  /** Special dish flag: 1 = Special, 0 = Regular */
  special_dish?: 1 | 0;
  /** Disabled flag */
  disabled?: number;
  /** Image URL or asset path */
  image?: string | null;
  /** Tax rate percentage */
  tax_rate?: number;
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
 * 7. Sync Queue Item Entity (Collection: 'sync_queue')
 */
export interface SyncQueueEntity {
  /** Primary Key: Auto-generated UUID */
  id: string;
  /** Operation action name (e.g. sync_order, make_payment) */
  action: string;
  /** Target API endpoint or doctype */
  endpoint: string;
  /** Command payload data object */
  payload: Record<string, unknown>;
  /** Creation ISO timestamp */
  timestamp: string;
  /** Execution status */
  status: 'PENDING' | 'SYNCING' | 'FAILED' | 'COMPLETED';
  /** Number of failed retry attempts */
  attempts: number;
  /** Priority ordering (1 = Highest) */
  priority: number;
  /** Error message if execution failed */
  last_error?: string | null;
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
}

export interface ITableRepository extends IBaseRepository<TableEntity, string> {
  findByRoom(room: string): Promise<TableEntity[]>;
  findOccupied(): Promise<TableEntity[]>;
}

export interface IMenuRepository extends IBaseRepository<MenuItemEntity, string> {
  findByCategory(category: string): Promise<MenuItemEntity[]>;
  findSpecials(): Promise<MenuItemEntity[]>;
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
