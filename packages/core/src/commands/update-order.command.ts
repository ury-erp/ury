/**
 * @file update-order.command.ts
 * @description Command encapsulating draft order modification / cart update.
 */

import { BaseCommand, type CommandEnvelope } from './command.interface';
import { apiRegistry } from '../api/api-registry';

export interface UpdateOrderPayload {
  invoice: string;
  last_invoice?: string | null;
  table?: string;
  order_type: string;
  no_of_pax: number;
  items: Array<{
    item: string;
    item_name: string;
    rate: number;
    qty: number;
    comment?: string;
  }>;
  comments?: string | null;
}

export class UpdateOrderCommand extends BaseCommand<UpdateOrderPayload> {
  static readonly ENDPOINT = apiRegistry.getUrl('SYNC_ORDER');
  static readonly ACTION_NAME = 'UpdateOrderCommand';

  constructor(
    payload: UpdateOrderPayload,
    options?: { id?: string; priority?: number; dependencies?: string[] }
  ) {
    const envelope: CommandEnvelope<UpdateOrderPayload> = {
      id: options?.id || `CMD-UPDATE-ORD-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      endpoint: UpdateOrderCommand.ENDPOINT,
      payload,
      retryCount: 0,
      priority: options?.priority ?? 1,
      dependencies: options?.dependencies || [],
      status: 'PENDING',
      timestamp: new Date().toISOString(),
      version: 1,
      actionName: UpdateOrderCommand.ACTION_NAME,
    };
    super(envelope);
  }
}
