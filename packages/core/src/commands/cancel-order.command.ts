/**
 * @file cancel-order.command.ts
 * @description Command encapsulating active order cancellation.
 */

import { BaseCommand, type CommandEnvelope } from './command.interface';
import { apiRegistry } from '../api/api-registry';

export interface CancelOrderPayload {
  invoice_id: string;
  reason: string;
}

interface CancelOrderOptions {
  id?: string;
  priority?: number;
  dependencies?: string[];
  temporary_id?: string | null;
  entity_id?: string;
}

export class CancelOrderCommand extends BaseCommand<CancelOrderPayload> {
  static readonly ENDPOINT = apiRegistry.getUrl('CANCEL_ORDER');
  static readonly ACTION_NAME = 'CancelOrderCommand';

  constructor(
    payload: CancelOrderPayload,
    options?: CancelOrderOptions
  ) {
    const envelope: CommandEnvelope<CancelOrderPayload> = {
      id: options?.id || `CMD-CANCEL-ORD-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      endpoint: CancelOrderCommand.ENDPOINT,
      payload,
      retryCount: 0,
      priority: options?.priority ?? 5,
      dependencies: options?.dependencies || [],
      status: 'PENDING',
      timestamp: new Date().toISOString(),
      version: 1,
      actionName: CancelOrderCommand.ACTION_NAME,
      operation_type: 'DELETE_ORDER',
      temporary_id: options?.temporary_id ?? null,
      entity_id: options?.entity_id || payload.invoice_id,
    };
    super(envelope);
  }
}
