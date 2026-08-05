/**
 * @file create-order.command.ts
 * @description Command encapsulating initial order draft creation.
 */

import { BaseCommand, type CommandEnvelope } from './command.interface';
import { apiRegistry } from '../api/api-registry';

export interface CreateOrderPayload {
  table?: string;
  room?: string;
  order_type: string;
  no_of_pax: number;
  customer?: string;
  waiter?: string;
  cashier?: string;
  pos_profile: string;
  items: Array<{
    item: string;
    item_name: string;
    rate: number;
    qty: number;
    comment?: string;
  }>;
}

export class CreateOrderCommand extends BaseCommand<CreateOrderPayload> {
  static readonly ENDPOINT = apiRegistry.getUrl('SYNC_ORDER');
  static readonly ACTION_NAME = 'CreateOrderCommand';

  constructor(
    payload: CreateOrderPayload,
    options?: { id?: string; priority?: number; dependencies?: string[] }
  ) {
    const envelope: CommandEnvelope<CreateOrderPayload> = {
      id: options?.id || `CMD-CREATE-ORD-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      endpoint: CreateOrderCommand.ENDPOINT,
      payload,
      retryCount: 0,
      priority: options?.priority ?? 1,
      dependencies: options?.dependencies || [],
      status: 'PENDING',
      timestamp: new Date().toISOString(),
      version: 1,
      actionName: CreateOrderCommand.ACTION_NAME,
    };

    super(envelope);
  }
}
