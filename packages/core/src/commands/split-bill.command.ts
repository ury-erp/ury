/**
 * @file split-bill.command.ts
 * @description Command encapsulating bill splitting operation.
 */

import { BaseCommand, type CommandEnvelope } from './command.interface';

export interface SplitBillPayload {
  source_invoice: string;
  items_to_move: Array<{ name: string; qty: number }>;
  customer?: string | null;
}

export class SplitBillCommand extends BaseCommand<SplitBillPayload> {
  static readonly ENDPOINT = 'ury.ury.doctype.ury_order.ury_order.split_bill';
  static readonly ACTION_NAME = 'SplitBillCommand';

  constructor(
    payload: SplitBillPayload,
    options?: { id?: string; priority?: number; dependencies?: string[] }
  ) {
    const envelope: CommandEnvelope<SplitBillPayload> = {
      id: options?.id || `CMD-SPLIT-BILL-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      endpoint: SplitBillCommand.ENDPOINT,
      payload,
      retryCount: 0,
      priority: options?.priority ?? 1,
      dependencies: options?.dependencies || [],
      status: 'PENDING',
      timestamp: new Date().toISOString(),
      version: 1,
      actionName: SplitBillCommand.ACTION_NAME,
    };
    super(envelope);
  }
}
