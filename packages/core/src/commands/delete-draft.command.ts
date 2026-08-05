/**
 * @file delete-draft.command.ts
 * @description Command encapsulating draft invoice deletion.
 */

import { BaseCommand, type CommandEnvelope } from './command.interface';
import { apiRegistry } from '../api/api-registry';

export interface DeleteDraftPayload {
  invoice: string;
  table?: string;
  reason?: string;
}

export class DeleteDraftCommand extends BaseCommand<DeleteDraftPayload> {
  static readonly ENDPOINT = apiRegistry.getUrl('DELETE_DRAFT_INVOICE');
  static readonly ACTION_NAME = 'DeleteDraftCommand';

  constructor(
    payload: DeleteDraftPayload,
    options?: { id?: string; priority?: number; dependencies?: string[] }
  ) {
    const envelope: CommandEnvelope<DeleteDraftPayload> = {
      id: options?.id || `CMD-DEL-DRAFT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      endpoint: DeleteDraftCommand.ENDPOINT,
      payload,
      retryCount: 0,
      priority: options?.priority ?? 2,
      dependencies: options?.dependencies || [],
      status: 'PENDING',
      timestamp: new Date().toISOString(),
      version: 1,
      actionName: DeleteDraftCommand.ACTION_NAME,
    };
    super(envelope);
  }
}
