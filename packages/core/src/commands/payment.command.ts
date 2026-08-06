/**
 * @file payment.command.ts
 * @description Command encapsulating invoice payment submission.
 */

import { BaseCommand, type CommandEnvelope } from './command.interface';
import { apiRegistry } from '../api/api-registry';

export interface PaymentPayload {
  invoice: string;
  payments: Array<{
    mode_of_payment: string;
    amount: number;
  }>;
  cashier?: string;
}

export class PaymentCommand extends BaseCommand<PaymentPayload> {
  static readonly ENDPOINT = apiRegistry.getUrl('MAKE_INVOICE');
  static readonly ACTION_NAME = 'PaymentCommand';

  constructor(
    payload: PaymentPayload,
    options?: { id?: string; priority?: number; dependencies?: string[] }
  ) {
    const envelope: CommandEnvelope<PaymentPayload> = {
      id: options?.id || `CMD-PAYMENT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      endpoint: PaymentCommand.ENDPOINT,
      payload,
      retryCount: 0,
      priority: options?.priority ?? 1,
      dependencies: options?.dependencies || [],
      status: 'PENDING',
      timestamp: new Date().toISOString(),
      version: 1,
      actionName: PaymentCommand.ACTION_NAME,
    };
    super(envelope);
  }
}
