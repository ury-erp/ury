/**
 * @file merge-table.command.ts
 * @description Command encapsulating table merging operation.
 */

import { BaseCommand, type CommandEnvelope } from './command.interface';
import { apiRegistry } from '../api/api-registry';

export interface MergeTablePayload {
  anchor_table: string;
  tables: string[];
}

export class MergeTableCommand extends BaseCommand<MergeTablePayload> {
  static readonly ENDPOINT = apiRegistry.getUrl('MERGE_TABLES_BATCH');
  static readonly ACTION_NAME = 'MergeTableCommand';

  constructor(
    payload: MergeTablePayload,
    options?: { id?: string; priority?: number; dependencies?: string[] }
  ) {
    const envelope: CommandEnvelope<MergeTablePayload> = {
      id: options?.id || `CMD-MERGE-TBL-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      endpoint: MergeTableCommand.ENDPOINT,
      payload,
      retryCount: 0,
      priority: options?.priority ?? 2,
      dependencies: options?.dependencies || [],
      status: 'PENDING',
      timestamp: new Date().toISOString(),
      version: 1,
      actionName: MergeTableCommand.ACTION_NAME,
    };
    super(envelope);
  }
}
