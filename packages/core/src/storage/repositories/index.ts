/**
 * @file index.ts
 * @description Repositories barrel exports and factory initializer.
 */

export * from './base.repository';
export * from './order.repository';
export * from './table.repository';
export * from './menu.repository';
export * from './customer.repository';
export * from './payment-mode.repository';
export * from './aggregator.repository';
export * from './aggregator-item.repository';
export * from './sync-queue.repository';
export * from './metadata.repository';
export * from './settings.repository';

import { db, type UryPosDatabase } from '../db';
import { OrderRepository } from './order.repository';
import { TableRepository } from './table.repository';
import { MenuRepository } from './menu.repository';
import { CustomerRepository } from './customer.repository';
import { PaymentModeRepository } from './payment-mode.repository';
import { AggregatorRepository } from './aggregator.repository';
import { AggregatorItemRepository } from './aggregator-item.repository';
import { SyncQueueRepository } from './sync-queue.repository';
import { MetadataRepository } from './metadata.repository';
import { SettingsRepository } from './settings.repository';

export interface StorageRepositories {
  orders: OrderRepository;
  tables: TableRepository;
  menu: MenuRepository;
  customers: CustomerRepository;
  paymentModes: PaymentModeRepository;
  aggregators: AggregatorRepository;
  aggregatorItems: AggregatorItemRepository;
  syncQueue: SyncQueueRepository;
  metadata: MetadataRepository;
  settings: SettingsRepository;
}

/**
 * Factory function creating all 10 repositories initialized with a Dexie DB instance
 */
export function createRepositories(customDb: UryPosDatabase = db): StorageRepositories {
  return {
    orders: new OrderRepository(customDb),
    tables: new TableRepository(customDb),
    menu: new MenuRepository(customDb),
    customers: new CustomerRepository(customDb),
    paymentModes: new PaymentModeRepository(customDb),
    aggregators: new AggregatorRepository(customDb),
    aggregatorItems: new AggregatorItemRepository(customDb),
    syncQueue: new SyncQueueRepository(customDb),
    metadata: new MetadataRepository(customDb),
    settings: new SettingsRepository(customDb),
  };
}

/** Global repositories instance singleton */
export const repositories = createRepositories(db);
