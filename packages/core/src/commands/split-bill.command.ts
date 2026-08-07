/**
 * @file split-bill.command.ts
 * @description Command encapsulating bill splitting operation.
 */

import { BaseCommand, type CommandEnvelope } from './command.interface';
import { apiRegistry } from '../api/api-registry';

export interface SplitBillPayload {
  source_invoice: string;
  items_to_move: Array<{ name: string; qty: number }>;
  customer?: string | null;
}

export class SplitBillCommand extends BaseCommand<SplitBillPayload> {
  static readonly ENDPOINT = apiRegistry.getUrl('SPLIT_BILL');
  static readonly ACTION_NAME = 'SplitBillCommand';

  constructor(
    payload: SplitBillPayload,
    options?: {
      id?: string;
      priority?: number;
      dependencies?: string[];
      temporaryId?: string;
    }
  ) {
    const envelope: CommandEnvelope<SplitBillPayload> = {
      id: options?.id || `CMD-SPLIT-BILL-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      endpoint: SplitBillCommand.ENDPOINT,
      payload,
      retryCount: 0,
      priority: options?.priority ?? 3,
      dependencies: options?.dependencies || [],
      status: 'PENDING',
      timestamp: new Date().toISOString(),
      version: 1,
      actionName: SplitBillCommand.ACTION_NAME,
      operation_type: 'SPLIT_BILL',
      entity_type: 'Order',
      entity_id: payload.source_invoice,
      temporary_id: options?.temporaryId || null,
    };
    super(envelope);
  }
}
