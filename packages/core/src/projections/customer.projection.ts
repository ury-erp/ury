/**
 * @file customer.projection.ts
 * @description Customer Projection Engine. Computes customer directory read models from repositories.
 */

import { repositories, type CustomerEntity } from '../storage';
import { projectionBus } from './projection.bus';

export interface CustomerProjectionItem {
  id: string;
  name: string;
  phone: string;
  group: string;
  territory: string;
}

export interface CustomerProjectionData {
  customers: CustomerProjectionItem[];
  totalCount: number;
}

/**
 * Computes and returns the Customer Projection read model from repositories.
 */
export async function getCustomerProjection(searchQuery?: string, repos = repositories): Promise<CustomerProjectionData> {
  const rawCustomers: CustomerEntity[] = searchQuery
    ? await repos.customers.searchByNameOrPhone(searchQuery)
    : await repos.customers.getAll();

  const customers: CustomerProjectionItem[] = rawCustomers.map((c: CustomerEntity) => ({
    id: c.id,
    name: c.name,
    phone: c.phone || '',
    group: c.customer_group || 'All Customer Groups',
    territory: c.territory || 'All Territories',
  }));

  return {
    customers,
    totalCount: customers.length,
  };
}

/**
 * Emits customer projection update event.
 */
export function notifyCustomersProjectionUpdated(): void {
  projectionBus.emit('CUSTOMERS_UPDATED');
}
