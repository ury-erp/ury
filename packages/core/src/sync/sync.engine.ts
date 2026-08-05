/**
 * @file sync.engine.ts
 * @description SyncEngine Orchestrator. Sequentially processes command queue, respects dependency
 * chains, remaps Temp IDs to Server IDs, applies exponential backoff, resolves conflicts, and updates projections.
 */

import { call } from '../frappe/client';
import { commandQueue, CommandQueueManager, type CommandEnvelope } from '../commands';
import { tempIDMapper, TempIDMapper } from './temp-id-mapper';
import { calculateBackoffDelay, isMaxAttemptsReached } from './backoff';
import { projectionBus, type ProjectionEventType } from '../projections';
import { conflictResolver, ConflictResolver } from './conflict.resolver';

export interface SyncEngineOptions {
  maxAttempts?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

export class SyncEngine {
  private queueMgr: CommandQueueManager;
  private idMapper: TempIDMapper;
  private resolver: ConflictResolver;
  private isSyncing = false;
  private options: SyncEngineOptions;

  constructor(
    customQueueMgr?: CommandQueueManager,
    customIdMapper?: TempIDMapper,
    customResolver?: ConflictResolver,
    options?: SyncEngineOptions
  ) {
    this.queueMgr = customQueueMgr || commandQueue;
    this.idMapper = customIdMapper || tempIDMapper;
    this.resolver = customResolver || conflictResolver;
    this.options = {
      maxAttempts: options?.maxAttempts ?? 5,
      baseBackoffMs: options?.baseBackoffMs ?? 1000,
      maxBackoffMs: options?.maxBackoffMs ?? 30000,
    };
  }

  /**
   * Triggers sequential queue draining. Guaranteed request deduplication via atomic lock.
   */
  async triggerSync(): Promise<{ processed: number; succeeded: number; failed: number }> {
    if (this.isSyncing) {
      console.log('[SyncEngine] Sync already in progress. Skipping duplicate trigger.');
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    this.isSyncing = true;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    try {
      const pendingCommands = await this.queueMgr.getPendingCommands();
      if (pendingCommands.length === 0) {
        return { processed: 0, succeeded: 0, failed: 0 };
      }

      console.log(`[SyncEngine] Starting sequential sync of ${pendingCommands.length} queued commands.`);

      for (const env of pendingCommands) {
        processed++;
        const success = await this.processCommand(env);
        if (success) {
          succeeded++;
        } else {
          failed++;
          console.warn(`[SyncEngine] Command ${env.id} failed. Halting current sync batch.`);
          break;
        }
      }
    } catch (err) {
      console.error('[SyncEngine] Unexpected error during sync cycle:', err);
    } finally {
      this.isSyncing = false;
    }

    return { processed, succeeded, failed };
  }

  /**
   * Process a single command sequentially
   */
  private async processCommand(env: CommandEnvelope): Promise<boolean> {
    // Check max attempts
    if (isMaxAttemptsReached(env.retryCount, this.options.maxAttempts)) {
      console.warn(`[SyncEngine] Command ${env.id} reached max retry attempts (${env.retryCount}). Skipping.`);
      return false;
    }

    try {
      await this.queueMgr.markSyncing(env.id);

      // 1. Remap Payload IDs using TempIDMapper
      const remappedPayload = await this.idMapper.remapPayload(env.payload);

      console.log(`[SyncEngine] Executing ${env.endpoint} for command ${env.id}...`, remappedPayload);

      // 2. Execute Whitelisted Frappe API
      const response: any = await call.post(env.endpoint, remappedPayload);

      // 3. Extract Server Assigned ID
      const serverId =
        response?.name ||
        response?.message?.name ||
        response?.data?.name ||
        response?.message?.new_invoice ||
        response?.message?.customer_name;

      if (serverId) {
        await this.idMapper.registerMapping(env.id, serverId);
        if (remappedPayload.invoice && typeof remappedPayload.invoice === 'string') {
          await this.idMapper.registerMapping(remappedPayload.invoice, serverId);
        }
        if (remappedPayload.temp_id && typeof remappedPayload.temp_id === 'string') {
          await this.idMapper.registerMapping(remappedPayload.temp_id, serverId);
        }
      }

      // 4. Mark Command Completed in Queue
      await this.queueMgr.markCompleted(env.id);

      // 5. Trigger Projection Updates
      this.notifyProjectionsForEndpoint(env.endpoint);

      console.log(`[SyncEngine] Command ${env.id} completed successfully. Server ID: ${serverId || 'N/A'}`);
      return true;
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      console.error(`[SyncEngine] Command ${env.id} execution failed:`, errorMsg);

      // Evaluate Conflict & Resolution Strategy
      const conflictResult = await this.resolver.resolveConflict(env, error);
      console.log(`[SyncEngine] Conflict detected: ${conflictResult.conflictCode} -> Strategy: ${conflictResult.strategy}`);

      if (conflictResult.remedyAction) {
        try {
          await conflictResult.remedyAction();
        } catch (remedyErr) {
          console.error('[SyncEngine] Remedy action failed:', remedyErr);
        }
      }

      if (conflictResult.strategy === 'IGNORE') {
        await this.queueMgr.markCompleted(env.id);
        return true;
      }

      // Calculate backoff delay
      const backoffDelay = calculateBackoffDelay(env.retryCount + 1, {
        baseMs: this.options.baseBackoffMs,
        maxMs: this.options.maxBackoffMs,
      });

      console.warn(`[SyncEngine] Command ${env.id} scheduled for retry in ${backoffDelay}ms.`);

      await this.queueMgr.markFailed(env.id, `${conflictResult.conflictCode}: ${errorMsg}`);
      return false;
    }
  }

  /**
   * Emits appropriate projection events based on endpoint target
   */
  private notifyProjectionsForEndpoint(endpoint: string): void {
    let event: ProjectionEventType = 'ALL_UPDATED';

    if (endpoint.includes('sync_order') || endpoint.includes('createPaymentEntry') || endpoint.includes('cancel_order')) {
      event = 'ORDERS_UPDATED';
    } else if (endpoint.includes('merge_tables') || endpoint.includes('unmerge_tables') || endpoint.includes('table_transfer')) {
      event = 'TABLES_UPDATED';
    } else if (endpoint.includes('create_customer') || endpoint.includes('search_customer')) {
      event = 'CUSTOMERS_UPDATED';
    } else if (endpoint.includes('getRestaurantMenu') || endpoint.includes('getAggregatorItem')) {
      event = 'MENU_UPDATED';
    }

    projectionBus.emit(event);
  }

  /**
   * Check if sync cycle is currently active
   */
  get active(): boolean {
    return this.isSyncing;
  }
}

export const syncEngine = new SyncEngine();
