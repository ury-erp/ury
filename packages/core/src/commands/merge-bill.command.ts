/**
 * @file merge-bill.command.ts
 * @description Command encapsulating bill merge operation.
 */

import { BaseCommand, type CommandEnvelope } from './command.interface';
import { apiRegistry } from '../api/api-registry';

export interface MergeBillPayload {
  primary_invoice: string;
  secondary_invoice: string;
}

export class MergeBillCommand extends BaseCommand<MergeBillPayload> {
  static readonly ENDPOINT = apiRegistry.getUrl('MERGE_BILLS');
  static readonly ACTION_NAME = 'MergeBillCommand';

  constructor(
    payload: MergeBillPayload,
    options?: { id?: string; priority?: number; dependencies?: string[] }
  ) {
    const envelope: CommandEnvelope<MergeBillPayload> = {
      id: options?.id || `CMD-MERGE-BILL-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      endpoint: MergeBillCommand.ENDPOINT,
      payload,
      retryCount: 0,
      priority: options?.priority ?? 1,
      dependencies: options?.dependencies || [],
      status: 'PENDING',
      timestamp: new Date().toISOString(),
      version: 1,
      actionName: MergeBillCommand.ACTION_NAME,
      operation_type: 'MERGE_BILLS',
      entity_type: 'Order',
      entity_id: payload.primary_invoice,
    };
    super(envelope);
  }
}
