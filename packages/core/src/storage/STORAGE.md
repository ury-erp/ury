# URY POS Storage Layer Documentation

## 1. Overview & Architectural Role

The **URY POS Storage Layer** provides a lightweight, fully typed IndexedDB storage engine built on top of **Dexie.js**. It is located inside `@ury/core/storage` and exposes clean Repository Interfaces for all offline data collections.

### Core Principles
- **Zero Business Logic**: Contains only pure CRUD database operations.
- **Strongly Typed**: All 9 entities and generic repositories expose strict TypeScript types and interfaces.
- **Transaction Safe**: Supports atomic read/write IndexedDB transactions via Dexie.
- **Schema Versioned**: Includes schema version definition and automated migration upgrade hooks.

---

## 2. Collections (9 Tables)

| Collection Name | Primary Key (`id`) | Indexed Fields | Entity Interface | Description |
|---|---|---|---|---|
| `orders` | `id` (string) | `table, status, order_type, customer, cashier, sync_status, createdAt, updatedAt` | `OrderEntity` | Offline and synced restaurant orders / draft invoices. |
| `restaurantTables` (`tables`) | `name` (string) | `restaurant_room, occupied, merged_with` | `TableEntity` | Room tables spatial layout and occupation states. |
| `menu` | `id` (string) | `category, course, special_dish, disabled` | `MenuItemEntity` | Restaurant menu items, prices, and courses. |
| `customers` | `id` (string) | `phone, name, customer_group` | `CustomerEntity` | Customer master directory for offline search & creation. |
| `payment_modes` | `id` (string) | `name, enabled` | `PaymentModeEntity` | Supported payment methods (Cash, Card, UPI). |
| `aggregators` | `name` (string) | `customer, enabled` | `AggregatorEntity` | Delivery platform channels (Zomato, Swiggy). |
| `sync_queue` | `id` (string) | `status, priority, timestamp` | `SyncQueueEntity` | Offline action queue for background syncing. |
| `metadata` | `key` (string) | `updatedAt` | `MetadataEntity` | System metadata (timestamps, sync version). |
| `settings` | `key` (string) | `updatedAt` | `SettingsEntity` | Client POS settings & environment state. |

---

## 3. Generic Repository Interface (`IBaseRepository<T, K>`)

All collection repositories implement `IBaseRepository<T, K>` exposing standard CRUD methods:

```typescript
export interface IBaseRepository<T, K = string> {
  getById(id: K): Promise<T | undefined>;
  getAll(options?: QueryOptions<T>): Promise<T[]>;
  put(item: T): Promise<K>;
  putMany(items: T[]): Promise<K[]>;
  delete(id: K): Promise<void>;
  clear(): Promise<void>;
  count(query?: Partial<T>): Promise<number>;
  query(options: QueryOptions<T>): Promise<T[]>;
  runTransaction<R>(mode: 'r' | 'rw', fn: () => Promise<R>): Promise<R>;
}
```

---

## 4. Usage Examples

### 4.1 Basic CRUD Operation
```typescript
import { repositories } from '@ury/core';

// Save a menu item
await repositories.menu.put({
  id: 'ITEM-101',
  item_name: 'Butter Chicken',
  rate: 350,
  category: 'Main Course',
  course: 'Mains',
  special_dish: 1
});

// Retrieve item by ID
const item = await repositories.menu.getById('ITEM-101');
```

### 4.2 Querying & Index Searches
```typescript
// Find all occupied tables in Main Room
const occupiedTables = await repositories.tables.findOccupied();

// Search customers by partial phone or name
const matchingCustomers = await repositories.customers.searchByNameOrPhone('9876');
```

### 4.3 Atomic Transactions
```typescript
// Execute atomic transaction across orders table
await repositories.orders.runTransaction('rw', async () => {
  await repositories.orders.put(order1);
  await repositories.orders.put(order2);
});
```

---

## 5. Schema Versioning & Migrations

Database versioning is managed inside `UryPosDatabase` (`db.ts`):

```typescript
this.version(1).stores({
  orders: 'id, table, status, order_type...',
  // ...
});

// Upgrade hook for version 2
this.version(2)
  .stores({ ... })
  .upgrade(tx => {
    return tx.table('metadata').put({
      key: 'schema_version',
      value: '2',
      updatedAt: new Date().toISOString()
    });
  });
```
