/**
 * @file db.ts
 * @description Dexie IndexedDB Database initialization, schema versioning,
 * index definitions, and migration handlers for URY POS Storage Layer.
 */

import Dexie, { type Table } from 'dexie';
import type {
  OrderEntity,
  TableEntity,
  MenuItemEntity,
  CustomerEntity,
  SyncQueueEntity,
  MetadataEntity,
  SettingsEntity,
} from './types';

export class UryPosDatabase extends Dexie {
  // 7 Dexie Table collections (payment_modes/aggregators/aggregator_items removed in v6, menu restored in v7)
  orders!: Table<OrderEntity, string>;
  restaurantTables!: Table<TableEntity, string>;
  menu!: Table<MenuItemEntity, string>;
  customers!: Table<CustomerEntity, string>;
  sync_queue!: Table<SyncQueueEntity, string>;
  metadata!: Table<MetadataEntity, string>;
  settings!: Table<SettingsEntity, string>;

  constructor(databaseName = 'UryPosOfflineDB') {
    super(databaseName);

    // ==========================================
    // VERSION 1: INITIAL SCHEMA DEFINITION
    // ==========================================
    this.version(1).stores({
      orders: 'id, table, status, order_type, customer, cashier, sync_status, createdAt, updatedAt',
      restaurantTables: 'name, restaurant_room, occupied, merged_with',
      menu: 'id, category, course, special_dish, disabled',
      customers: 'id, phone, name, customer_group',
      payment_modes: 'id, name, enabled',
      aggregators: 'name, customer, enabled',
      sync_queue: 'id, status, priority, timestamp',
      metadata: 'key, updatedAt',
      settings: 'key, updatedAt',
    });

    // ==========================================
    // VERSION 2: MIGRATION & SCHEMATIC EXTENSION
    // ==========================================
    this.version(2)
      .stores({
        orders: 'id, table, status, order_type, customer, cashier, sync_status, createdAt, updatedAt',
        restaurantTables: 'name, restaurant_room, occupied, merged_with',
        menu: 'id, category, course, special_dish, disabled',
        customers: 'id, phone, name, customer_group',
        payment_modes: 'id, name, enabled',
        aggregators: 'name, customer, enabled',
        sync_queue: 'id, status, priority, timestamp',
        metadata: 'key, updatedAt',
        settings: 'key, updatedAt',
      })
      .upgrade(tx => {
        // Schema Migration Hook for version 2 upgrades
        return tx.table('metadata').put({
          key: 'schema_version',
          value: '2',
          updatedAt: new Date().toISOString(),
        });
      });

    // ==========================================
    // VERSION 3: REDESIGNED COMMAND QUEUE SCHEMATIC
    // ==========================================
    this.version(3)
      .stores({
        orders: 'id, table, status, order_type, customer, cashier, sync_status, createdAt, updatedAt',
        restaurantTables: 'name, restaurant_room, occupied, merged_with',
        menu: 'id, category, course, special_dish, disabled',
        customers: 'id, phone, name, customer_group',
        payment_modes: 'id, name, enabled',
        aggregators: 'name, customer, enabled',
        sync_queue: 'id, command_id, status, operation_type, created_at, *dependency_ids',
        metadata: 'key, updatedAt',
        settings: 'key, updatedAt',
      })
      .upgrade(tx => {
        return tx.table('metadata').put({
          key: 'schema_version',
          value: '3',
          updatedAt: new Date().toISOString(),
        });
      });

    // ==========================================
    // VERSION 4: AGGREGATOR ITEM CATALOG STORE
    // ==========================================
    this.version(4)
      .stores({
        orders: 'id, table, status, order_type, customer, cashier, sync_status, createdAt, updatedAt',
        restaurantTables: 'name, restaurant_room, occupied, merged_with',
        menu: 'id, category, course, special_dish, disabled',
        customers: 'id, phone, name, customer_group',
        payment_modes: 'id, name, enabled',
        aggregators: 'name, customer, enabled',
        aggregator_items: 'id, aggregator, item, [aggregator+item]',
        sync_queue: 'id, command_id, status, operation_type, created_at, *dependency_ids',
        metadata: 'key, updatedAt',
        settings: 'key, updatedAt',
      })
      .upgrade(tx => {
        return tx.table('metadata').put({
          key: 'schema_version',
          value: '4',
          updatedAt: new Date().toISOString(),
        });
      });

    // ==========================================
    // VERSION 5: AGGREGATOR ITEM STALENESS INDEX
    // ==========================================
    this.version(5)
      .stores({
        orders: 'id, table, status, order_type, customer, cashier, sync_status, createdAt, updatedAt',
        restaurantTables: 'name, restaurant_room, occupied, merged_with',
        menu: 'id, category, course, special_dish, disabled',
        customers: 'id, phone, name, customer_group',
        payment_modes: 'id, name, enabled',
        aggregators: 'name, customer, enabled',
        aggregator_items: 'id, aggregator, item, [aggregator+item], updatedAt',
        sync_queue: 'id, command_id, status, operation_type, created_at, *dependency_ids',
        metadata: 'key, updatedAt',
        settings: 'key, updatedAt',
      })
      .upgrade(tx => {
        return tx.table('metadata').put({
          key: 'schema_version',
          value: '5',
          updatedAt: new Date().toISOString(),
        });
      });

    // ==========================================
    // VERSION 6: REMOVE SERVER-CACHED COLLECTIONS
    // ==========================================
    this.version(6)
      .stores({
        orders: 'id, table, status, order_type, customer, cashier, sync_status, createdAt, updatedAt',
        restaurantTables: 'name, restaurant_room, occupied, merged_with',
        menu: null, // Dexie deletion marker
        customers: 'id, phone, name, customer_group',
        payment_modes: null,
        aggregators: null,
        aggregator_items: null,
        sync_queue: 'id, command_id, status, operation_type, created_at, *dependency_ids',
        metadata: 'key, updatedAt',
        settings: 'key, updatedAt',
      })
      .upgrade(tx => {
        return tx.table('metadata').put({
          key: 'schema_version',
          value: '6',
          updatedAt: new Date().toISOString(),
        });
      });

    // ==========================================
    // VERSION 7: RESTORE MENU COLLECTION FOR OFFLINE FALLBACK
    // ==========================================
    this.version(7)
      .stores({
        orders: 'id, table, status, order_type, customer, cashier, sync_status, createdAt, updatedAt',
        restaurantTables: 'name, restaurant_room, occupied, merged_with',
        menu: 'id, category, course, special_dish, disabled',
        customers: 'id, phone, name, customer_group',
        sync_queue: 'id, command_id, status, operation_type, created_at, *dependency_ids',
        metadata: 'key, updatedAt',
        settings: 'key, updatedAt',
      })
      .upgrade(tx => {
        return tx.table('metadata').put({
          key: 'schema_version',
          value: '7',
          updatedAt: new Date().toISOString(),
        });
      });
  }
}

/** Singleton instance for general app use */
export const db = new UryPosDatabase();
