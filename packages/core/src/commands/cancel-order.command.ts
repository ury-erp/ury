/**
 * @file cancel-order.command.ts
 * @description Command encapsulating active order cancellation.
 */

import { BaseCommand, type CommandEnvelope } from './command.interface';
import { apiRegistry } from '../api/api-registry';

export interface CancelOrderPayload {
  invoice: string;
  cancel_reason: string;
  table?: string;
}

export class CancelOrderCommand extends BaseCommand<CancelOrderPayload> {
  static readonly ENDPOINT = apiRegistry.getUrl('CANCEL_ORDER');
  static readonly ACTION_NAME = 'CancelOrderCommand';

  constructor(
    payload: CancelOrderPayload,
    options?: { id?: string; priority?: number; dependencies?: string[] }
  ) {
    const envelope: CommandEnvelope<CancelOrderPayload> = {
      id: options?.id || `CMD-CANCEL-ORD-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      endpoint: CancelOrderCommand.ENDPOINT,
      payload,
      retryCount: 0,
      priority: options?.priority ?? 1,
      dependencies: options?.dependencies || [],
      status: 'PENDING',
      timestamp: new Date().toISOString(),
      version: 1,
      actionName: CancelOrderCommand.ACTION_NAME,
    };
    super(envelope);
  }
}
