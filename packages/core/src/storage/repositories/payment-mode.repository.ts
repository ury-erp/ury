/**
 * @file payment-mode.repository.ts
 * @description CRUD Repository implementation for 'payment_modes' collection.
 */

import { BaseRepository } from './base.repository';
import type { PaymentModeEntity, IPaymentModeRepository } from '../types';
import type { UryPosDatabase } from '../db';

export class PaymentModeRepository
  extends BaseRepository<PaymentModeEntity, string>
  implements IPaymentModeRepository
{
  constructor(dbInstance: UryPosDatabase) {
    super(dbInstance.payment_modes, dbInstance);
  }

  /** Find all active/enabled payment modes */
  async findEnabled(): Promise<PaymentModeEntity[]> {
    return this.table.filter(m => Boolean(m.enabled)).toArray();
  }
}
