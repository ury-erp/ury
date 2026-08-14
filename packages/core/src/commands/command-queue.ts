/**
 * @file command-queue.ts
 * @description Persistent Command Queue Manager wrapping IndexedDB storage.
 */

import { repositories, type SyncQueueRepository } from '../storage';
import type { CommandEnvelope, ICommand } from './command.interface';

/** Returns true if the envelope targets the make_invoice payment endpoint. */
function isPaymentEnvelope(env: CommandEnvelope): boolean {
  const action = env.actionName || '';
  const endpoint = env.endpoint || '';
  return (
    action.includes('make_invoice') ||
    endpoint.includes('make_invoice') ||
    env.operation_type === 'PAY_ORDER'
  );
}

/**
 * Normalizes command priority so the queue drains in strict lifecycle order:
 *   1 — Table operations (merge/unmerge/transfer)
 *   2 — Order creation/update (sync_order)
 *   3 — Print status (qz_print_update)
 *   4 — Payment (make_invoice)
 *   5 — Cancellation (cancel_order)
 *
 * Callers may enqueue with legacy priority 1; this guard ensures the dependency
 * graph is respected regardless of what the caller supplied.
 */
function getNormalizedPriority(env: CommandEnvelope): number {
  const action = env.actionName || '';
  const endpoint = env.endpoint || '';
  const op = env.operation_type || '';

  if (
    endpoint.includes('merge_tables_batch') ||
    endpoint.includes('unmerge_tables') ||
    endpoint.includes('table_transfer') ||
    action.includes('merge_tables_batch') ||
    action.includes('unmerge_tables') ||
    action.includes('table_transfer') ||
    op === 'MERGE_TABLE' ||
    op === 'TRANSFER_TABLE'
  ) {
    return 1;
  }

  if (
    endpoint.includes('sync_order') ||
    action.includes('sync_order') ||
    op === 'CREATE_ORDER' ||
    op === 'UPDATE_ORDER'
  ) {
    return 2;
  }

  if (
    endpoint.includes('merge_bills') ||
    action.includes('merge_bills') ||
    op === 'MERGE_BILLS'
  ) {
    return 2;
  }

  if (
    endpoint.includes('split_bill') ||
    action.includes('split_bill') ||
    op === 'SPLIT_BILL'
  ) {
    return 3;
  }

  if (
    endpoint.includes('qz_print_update') ||
    action.includes('qz_print_update') ||
    endpoint.includes('kot_reprint') ||
    action.includes('kot_reprint') ||
    op === 'PRINT_ORDER'
  ) {
    return 3;
  }

  if (isPaymentEnvelope(env)) {
    return 4;
  }

  if (
    endpoint.includes('cancel_order') ||
    action.includes('cancel_order') ||
    op === 'DELETE_ORDER'
  ) {
    return 5;
  }

  return env.priority || 1;
}

export class CommandQueueManager {
  private queueRepo: SyncQueueRepository;

  constructor(customQueueRepo?: SyncQueueRepository) {
    this.queueRepo = customQueueRepo || repositories.syncQueue;
  }

  /**
   * Persists a new Command into IndexedDB Command Queue
   */
  async enqueue<P = any>(command: ICommand<P>): Promise<string> {
    const env = command.toEnvelope();

    const dbEntity: any = {
      command_id: env.command_id || env.id,
      client_request_id: env.client_request_id || `REQ-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      operation_type: env.operation_type || null,
      entity_type: env.entity_type || 'Order',
      entity_id: env.entity_id || env.id,
      temporary_id: env.temporary_id || null,
      server_id: env.server_id || null,
      dependency_ids: env.dependency_ids || env.dependencies || [],
      payload: env.payload as Record<string, unknown>,
      payload_hash: env.payload_hash || '',
      retry_count: env.retry_count ?? env.retryCount ?? 0,
      status: env.status || 'PENDING',
      created_at: env.created_at || env.timestamp || new Date().toISOString(),
      updated_at: env.updated_at || new Date().toISOString(),
      version: env.version || 1,
      last_error: env.lastError || null,

      // Compatibility fields
      id: env.id,
      action: env.actionName || env.endpoint,
      endpoint: env.endpoint,
      priority: env.priority ?? 1,
      timestamp: env.timestamp || new Date().toISOString(),
    };

    await this.queueRepo.put(dbEntity);
    return dbEntity.command_id;
  }

  /**
   * Returns all pending commands ready for processing, sorted by priority and dependencies
   */
  async getPendingCommands(): Promise<CommandEnvelope[]> {
    const rawEntities = await this.queueRepo.findPending();

    const envelopes: CommandEnvelope[] = rawEntities.map(entity => {
      const e = entity as any;
      const cmdId = e.command_id || e.id;
      return {
        command_id: cmdId,
        client_request_id: e.client_request_id || '',
        operation_type: e.operation_type || '',
        entity_type: e.entity_type || '',
        entity_id: e.entity_id || '',
        temporary_id: e.temporary_id || null,
        server_id: e.server_id || null,
        dependency_ids: e.dependency_ids || e.dependencies || [],
        payload: e.payload,
        payload_hash: e.payload_hash || '',
        retry_count: e.retry_count ?? e.attempts ?? 0,
        status: e.status || 'PENDING',
        created_at: e.created_at || e.timestamp,
        updated_at: e.updated_at || e.timestamp,
        version: e.version || 1,
        actionName: e.action,
        lastError: e.last_error || null,

        // Compatibility
        id: cmdId,
        endpoint: e.endpoint || '',
        priority: e.priority || 1,
        dependencies: e.dependency_ids || e.dependencies || [],
        retryCount: e.retry_count ?? e.attempts ?? 0,
        timestamp: e.created_at || e.timestamp,
      };
    });

    // Filter out commands whose prerequisite dependencies have not completed yet.
    // A FAILED or missing parent never satisfies a dependency; dependents wait until
    // the parent is explicitly COMPLETED or manually resolved.
    const allItems = await this.queueRepo.getAll();
    const completedIds = new Set(
      allItems
        .filter(e => e.status === 'COMPLETED')
        .map(e => e.command_id || e.id)
    );
    const failedIds = new Set(
      allItems
        .filter(e => e.status === 'FAILED')
        .map(e => e.command_id || e.id)
    );

    const blockedByFailed: { id: string; reason: string }[] = [];

    const readyEnvelopes = envelopes.filter(env => {
      const deps = env.dependency_ids;
      if (!deps || deps.length === 0) {
        // Strict guard: payment commands that still reference a TEMP-* invoice must not
        // execute until the parent sync_order command has completed and remapped the temp
        // ID to a real server invoice. This prevents make_invoice from creating empty
        // paid invoices when the parent order has not synced yet.
        if (isPaymentEnvelope(env)) {
          const invoice = (env.payload as any)?.invoice;
          if (invoice && typeof invoice === 'string' && invoice.startsWith('TEMP-')) {
            const parentCompleted = allItems.some(item => {
              if (item.status !== 'COMPLETED') return false;
              const p = item.payload as any;
              const itemId = item.command_id || item.id;
              return (
                itemId === `SYNC-ORDER-${invoice}` ||
                itemId === `CMD-CREATE-ORD-${invoice}` ||
                p?.temp_id === invoice ||
                p?.invoice === invoice
              );
            });
            if (!parentCompleted) {
              console.warn(`[CommandQueueManager] Payment command ${env.command_id || env.id} deferred: parent sync_order for ${invoice} has not completed.`);
              return false;
            }
          }
        }
        return true;
      }
      const failedDep = deps.find(depId => failedIds.has(depId));
      if (failedDep) {
        const cmdId = env.command_id || env.id;
        console.warn(
          `[CommandQueueManager] Command ${cmdId} blocked: dependency ${failedDep} has FAILED.`
        );
        blockedByFailed.push({ id: cmdId, reason: `Blocked by failed dependency: ${failedDep}` });
        return false;
      }
      return deps.every(depId => completedIds.has(depId));
    });

    await Promise.all(
      blockedByFailed.map(({ id, reason }) => this.markFailed(id, reason))
    );

    return readyEnvelopes.sort(
      (a, b) =>
        getNormalizedPriority(a) - getNormalizedPriority(b) ||
        (a.created_at || '').localeCompare(b.created_at || '')
    );
  }

  /**
   * Peek next executable command without removing it
   */
  async peek(): Promise<CommandEnvelope | undefined> {
    const pending = await this.getPendingCommands();
    return pending[0];
  }

  /**
   * Mark command status as SYNCING
   */
  async markSyncing(id: string): Promise<void> {
    const existing = await this.queueRepo.getById(id);
    if (existing) {
      existing.status = 'SYNCING';
      existing.updated_at = new Date().toISOString();
      await this.queueRepo.put(existing);
    }
  }

  /**
   * Mark command status as PENDING (used to defer a command without incrementing retry count).
   */
  async markPending(id: string): Promise<void> {
    const existing = await this.queueRepo.getById(id);
    if (existing) {
      existing.status = 'PENDING';
      existing.updated_at = new Date().toISOString();
      await this.queueRepo.put(existing);
    }
  }

  /**
   * Mark command status as COMPLETED
   */
  async markCompleted(id: string): Promise<void> {
    const existing = await this.queueRepo.getById(id);
    if (existing) {
      existing.status = 'COMPLETED';
      existing.updated_at = new Date().toISOString();
      await this.queueRepo.put(existing);
    }
  }

  /**
   * Mark command status as FAILED and increment retryCount
   */
  async markFailed(id: string, error: string): Promise<void> {
    const existing = await this.queueRepo.getById(id);
    if (existing) {
      existing.status = 'FAILED';
      existing.attempts = (existing.attempts || 0) + 1;
      existing.retry_count = (existing.retry_count || 0) + 1;
      existing.last_error = error;
      existing.updated_at = new Date().toISOString();
      await this.queueRepo.put(existing);
    }
  }

  /**
   * Total pending commands count in IndexedDB queue
   */
  async countPending(): Promise<number> {
    const pending = await this.getPendingCommands();
    return pending.length;
  }

  /**
   * Clear all completed commands from IndexedDB queue
   */
  async clearCompleted(): Promise<void> {
    const all = await this.queueRepo.getAll();
    for (const item of all) {
      if (item.status === 'COMPLETED') {
        const delId = item.id || item.command_id || '';
        if (delId) {
          await this.queueRepo.delete(delId);
        }
      }
    }
  }

  /**
   * Update the payload of a queued command in-place.
   * Used by SyncEngine to patch payment command invoice IDs after temp→server ID resolution.
   */
  async updatePayload(id: string, newPayload: Record<string, unknown>): Promise<void> {
    const existing = await this.queueRepo.getById(id);
    if (existing) {
      existing.payload = newPayload;
      existing.updated_at = new Date().toISOString();
      await this.queueRepo.put(existing);
    }
  }

  /**
   * Replace a queued command's dependency list. Used once a parent command has
   * succeeded so that dependent commands are no longer gated on a COMPLETED
   * queue record that is about to be purged.
   */
  async updateDependencies(id: string, newDependencies: string[]): Promise<void> {
    const existing = await this.queueRepo.getById(id);
    if (existing) {
      existing.dependency_ids = newDependencies;
      existing.dependencies = newDependencies;
      existing.updated_at = new Date().toISOString();
      await this.queueRepo.put(existing);
    }
  }

  /**
   * Update the envelope temp/server/entity metadata for a queued command.
   * Used after a TEMP-* invoice is promoted to a real server ID so that
   * dependent commands do not keep stale envelope references.
   */
  async updateEnvelopeMetadata(
    id: string,
    metadata: {
      temporary_id?: string | null;
      server_id?: string | null;
      entity_id?: string;
    }
  ): Promise<void> {
    const existing = await this.queueRepo.getById(id);
    if (existing) {
      if ('temporary_id' in metadata) existing.temporary_id = metadata.temporary_id;
      if ('server_id' in metadata) existing.server_id = metadata.server_id;
      if ('entity_id' in metadata && metadata.entity_id !== undefined) {
        existing.entity_id = metadata.entity_id;
      }
      existing.updated_at = new Date().toISOString();
      await this.queueRepo.put(existing);
    }
  }

  /**
   * Removes a completed parent command id from the dependency lists of all other
   * pending commands. This is required because completed commands are purged from
   * the queue immediately after execution; if dependents still referenced the
   * purged id they would be stuck waiting for a command that no longer exists.
   */
  async clearDependencyId(completedId: string): Promise<void> {
    const all = await this.queueRepo.getAll();
    for (const item of all) {
      if (item.status === 'COMPLETED') continue;
      const deps = item.dependency_ids || item.dependencies || [];
      if (deps.includes(completedId)) {
        const nextDeps = deps.filter(id => id !== completedId);
        item.dependency_ids = nextDeps;
        item.dependencies = nextDeps;
        item.updated_at = new Date().toISOString();
        await this.queueRepo.put(item);
      }
    }
  }

  /**
   * Find all pending MAKE_INVOICE commands whose invoice field matches a given temp ID.
   * Used to patch payment commands after sync_order resolves the real server invoice ID.
   */
  async findPaymentCommandsForTempId(tempId: string): Promise<CommandEnvelope[]> {
    const all = await this.queueRepo.getAll();
    const paymentCmds = all.filter(e =>
      e.status === 'PENDING' &&
      (e.action === 'make_invoice' || e.action === 'PaymentCommand' || e.operation_type === 'PAY_ORDER') &&
      (
        (e.payload as any)?.invoice === tempId ||
        e.temporary_id === tempId ||
        e.entity_id === tempId
      )
    );

    return paymentCmds.map(entity => {
      const e = entity as any;
      const cmdId = e.command_id || e.id;
      return {
        command_id: cmdId,
        client_request_id: e.client_request_id || '',
        operation_type: e.operation_type || 'PAY_ORDER',
        entity_type: e.entity_type || '',
        entity_id: e.entity_id || '',
        temporary_id: e.temporary_id || null,
        server_id: e.server_id || null,
        dependency_ids: e.dependency_ids || e.dependencies || [],
        payload: e.payload,
        payload_hash: e.payload_hash || '',
        retry_count: e.retry_count ?? e.attempts ?? 0,
        status: e.status || 'PENDING',
        created_at: e.created_at || e.timestamp,
        updated_at: e.updated_at || e.timestamp,
        version: e.version || 1,
        actionName: e.action,
        lastError: e.last_error || null,

        // Compatibility
        id: cmdId,
        endpoint: e.endpoint || '',
        priority: e.priority || 1,
        dependencies: e.dependency_ids || e.dependencies || [],
        retryCount: e.retry_count ?? e.attempts ?? 0,
        timestamp: e.created_at || e.timestamp,
      };
    });
  }

  /**
   * Finds the command_id of a pending command that is responsible for creating a
   * temporary entity (temporary_id/entity_id matches tempId). Falls back to a
   * command whose payload references the temp id. Returns undefined if no pending
   * creator is found.
   */
  async findPendingCommandIdForTempId(tempId: string): Promise<string | undefined> {
    const all = await this.queueRepo.getAll();
    const creator = all.find((e: any) =>
      e.status === 'PENDING' &&
      (e.temporary_id === tempId || e.entity_id === tempId)
    );
    if (creator) {
      return (creator.command_id || creator.id) as string;
    }

    // Fallback: search payload references for commands that do not set temp metadata.
    const payloadMatch = all.find((e: any) => {
      if (e.status !== 'PENDING') return false;
      const payloadStr = JSON.stringify(e.payload || {});
      return payloadStr.includes(tempId);
    });
    return payloadMatch ? ((payloadMatch.command_id || payloadMatch.id) as string) : undefined;
  }
}

export const commandQueue = new CommandQueueManager();
