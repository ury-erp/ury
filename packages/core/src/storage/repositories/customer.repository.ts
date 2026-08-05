/**
 * @file customer.repository.ts
 * @description CRUD Repository implementation for 'customers' collection.
 */

import { BaseRepository } from './base.repository';
import type { CustomerEntity, ICustomerRepository } from '../types';
import type { UryPosDatabase } from '../db';

export class CustomerRepository
  extends BaseRepository<CustomerEntity, string>
  implements ICustomerRepository
{
  constructor(dbInstance: UryPosDatabase) {
    super(dbInstance.customers, dbInstance);
  }

  /** Find customer by mobile phone number */
  async findByPhone(phone: string): Promise<CustomerEntity | undefined> {
    return this.table.where('phone').equals(phone).first();
  }

  /** Search customers by partial name or phone number */
  async searchByNameOrPhone(query: string): Promise<CustomerEntity[]> {
    const q = query.toLowerCase();
    return this.table
      .filter(
        c =>
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q)
      )
      .toArray();
  }
}
