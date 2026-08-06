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
  PaymentModeEntity,
  AggregatorEntity,
  SyncQueueEntity,
  MetadataEntity,
  SettingsEntity,
} from './types';

export class UryPosDatabase extends Dexie {
  // 9 Dexie Table collections
  orders!: Table<OrderEntity, string>;
  restaurantTables!: Table<TableEntity, string>;
  menu!: Table<MenuItemEntity, string>;
  customers!: Table<CustomerEntity, string>;
  payment_modes!: Table<PaymentModeEntity, string>;
  aggregators!: Table<AggregatorEntity, string>;
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
  }
}

/** Singleton instance for general app use */
export const db = new UryPosDatabase();
