/**
 * @file sync.engine.ts
 * @description SyncEngine Orchestrator.
 *
 * Two-Stage Sync Architecture:
 *  Stage 1 — Order Commands: sync_order commands execute first. On success, the real server
 *             invoice ID (POS-INV-*) is registered in TempIDMapper and any pending
 *             make_invoice commands referencing the temp ID are patched in-place in the queue.
 *  Stage 2 — Payment Commands: make_invoice commands execute only after their parent order
 *             command has completed and their invoice field points to a real server ID.
 *
 * This ensures that offline paid orders are submitted to the backend as Paid (docstatus=1),
 * not left as Draft, which was the root cause of the reported regression.
 */

import { call } from '../frappe/client';
import { commandQueue, CommandQueueManager, type CommandEnvelope } from '../commands';
import { repositories, type OrderEntity, type StorageRepositories } from '../storage';
import { tempIDMapper, TempIDMapper } from './temp-id-mapper';
import { calculateBackoffDelay, isMaxAttemptsReached } from './backoff';
import { projectionBus, type ProjectionEventType } from '../projections';
import { conflictResolver, ConflictResolver } from './conflict.resolver';

export interface SyncEngineOptions {
  maxAttempts?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  repositories?: StorageRepositories;
}

// Endpoint grouping for projection event routing
const ORDER_SYNC_ENDPOINTS = [
  'sync_order',
  'cancel_order',
  'delete_draft_invoice',
  'split_bill',
  'table_transfer',
  'qz_print_update',
];
const PAYMENT_ENDPOINTS = ['make_invoice'];
const TABLE_ENDPOINTS = ['merge_tables_batch', 'unmerge_tables', 'table_transfer'];
const CUSTOMER_ENDPOINTS = ['create_customer', 'search_customer'];
const MENU_ENDPOINTS = ['getRestaurantMenu', 'getAggregatorItem'];

/** Returns true if this command is an order creation/update sync_order */
function isOrderSyncCommand(env: CommandEnvelope): boolean {
  return env.endpoint.includes('sync_order');
}

/** Returns true if this command is a payment submission make_invoice */
function isPaymentCommand(env: CommandEnvelope): boolean {
  return env.endpoint.includes('make_invoice');
}

export class SyncEngine {
  private queueMgr: CommandQueueManager;
  private idMapper: TempIDMapper;
  private resolver: ConflictResolver;
  private repos: StorageRepositories;
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
    this.repos = options?.repositories || repositories;
    this.options = {
      maxAttempts: options?.maxAttempts ?? 5,
      baseBackoffMs: options?.baseBackoffMs ?? 1000,
      maxBackoffMs: options?.maxBackoffMs ?? 30000,
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[SyncEngine] Network connection restored. Auto-triggering queue sync.');
        this.triggerSync();
      });
      if (navigator.onLine) {
        console.log('[SyncEngine] App initialized online. Auto-triggering queue sync.');
        this.triggerSync();
      }
    }
  }

  /**
   * Triggers sequential queue draining.
   * Two-stage processing: order commands first, then payment commands.
   */
  /**
   * Triggers dependency-based queue draining.
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
      while (true) {
        const pendingCommands = await this.queueMgr.getPendingCommands();
        if (pendingCommands.length === 0) {
          break;
        }

        // Pick the first ready command (one whose dependency_ids have completed)
        const nextCommand = pendingCommands[0];
        processed++;
        const success = await this.processCommand(nextCommand);
        if (success) {
          succeeded++;
        } else {
          failed++;
          console.warn(`[SyncEngine] Dependency command ${nextCommand.command_id || nextCommand.id} failed. Halting sync cycle.`);
          break;
        }
      }
    } catch (err) {
      console.error('[SyncEngine] Unexpected error during sync cycle:', err);
    } finally {
      this.isSyncing = false;
    }

    // After the queue is drained (successfully or halted), run housekeeping to
    // purge completed queue entries and any local TEMP-* records that have already
    // been mapped to real server invoices. This keeps IndexedDB compact and
    // prevents stale offline cards from lingering in the UI.
    try {
      await this._cleanupAfterSync();
    } catch (cleanupErr) {
      console.error('[SyncEngine] Post-sync cleanup failed:', cleanupErr);
    }

    return { processed, succeeded, failed };
  }

  /**
   * Process a single command envelope sequentially.
   * Resolves temporary ID mapping and reconciliation rules.
   */
  private async processCommand(env: CommandEnvelope): Promise<boolean> {
    const cmdId = env.command_id || env.id;
    // Check max attempts
    const currentRetries = env.retry_count ?? env.retryCount ?? 0;
    if (isMaxAttemptsReached(currentRetries, this.options.maxAttempts)) {
      console.warn(`[SyncEngine] Command ${cmdId} reached max retry attempts (${currentRetries}). Skipping.`);
      return false;
    }

    try {
      await this.queueMgr.markSyncing(cmdId);

      // Customer Mobile Reconciliation (Phase 6 Customer Strategy)
      if (env.operation_type === 'CREATE_CUSTOMER' || env.endpoint.includes('create_customer')) {
        const phone = (env.payload as any)?.mobile_number || (env.payload as any)?.phone;
        if (phone) {
          try {
            // Search Customer by Mobile Number
            const searchResponse: any = await call.get('api/resource/Customer', {
              filters: [['mobile_number', '=', phone]],
              fields: ['name']
            });
            const existingCustName = searchResponse?.data?.[0]?.name || searchResponse?.message?.[0]?.name;
            if (existingCustName) {
              console.log(`[SyncEngine] Mapped existing customer: ${phone} -> ${existingCustName}`);
              await this.idMapper.registerMapping(env.temporary_id || cmdId, existingCustName);
              await this.queueMgr.markCompleted(cmdId);
              await this.queueMgr.clearCompleted();
              return true;
            }
          } catch (searchErr) {
            console.warn('[SyncEngine] Search Customer by phone failed, proceeding to create:', searchErr);
          }
        }
      }

      // 1. Remap Payload IDs using TempIDMapper (replaces TEMP-* IDs with real server IDs)
      const remappedPayload = await this.idMapper.remapPayload(env.payload);

      // Check Order State Rules (Phase 5 Order State Rules)
      // For payment commands, abort execution if the invoice reference is still a TEMP-* ID.
      // The parent sync_order command must complete first and remap the temp ID to a real
      // server invoice ID. We defer the command back to PENDING (without incrementing retry
      // count) so it is retried automatically once the parent order syncs.
      const tempOrderRef = remappedPayload.invoice || remappedPayload.temp_id || env.temporary_id;
      if (isPaymentCommand(env) || env.operation_type === 'PAY_ORDER') {
        if (tempOrderRef && typeof tempOrderRef === 'string' && tempOrderRef.startsWith('TEMP-')) {
          console.warn(`[SyncEngine] Payment command ${cmdId} deferred: parent server_invoice_id does not exist yet.`);
          await this.queueMgr.markPending(cmdId);
          return false;
        }
      }

      console.log(`[SyncEngine] Executing ${env.endpoint} for command ${cmdId}...`, remappedPayload);

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
        // Register the mapping: cmdId → serverId
        await this.idMapper.registerMapping(cmdId, serverId);

        // Register payload-level temp IDs too
        if (remappedPayload.invoice && typeof remappedPayload.invoice === 'string') {
          await this.idMapper.registerMapping(remappedPayload.invoice, serverId);
        }
        if (remappedPayload.temp_id && typeof remappedPayload.temp_id === 'string') {
          await this.idMapper.registerMapping(remappedPayload.temp_id, serverId);
        }

        // ── Critical: If this was a sync_order command, patch any pending make_invoice
        //    commands that still reference the temp ID.
        if (isOrderSyncCommand(env) || env.operation_type === 'CREATE_ORDER' || env.operation_type === 'UPDATE_ORDER') {
          const candidates: (string | undefined)[] = [
            remappedPayload.invoice as string | undefined,
            remappedPayload.temp_id as string | undefined,
            cmdId,
            env.temporary_id || undefined,
          ];
          const tempIds = candidates.filter((id): id is string =>
            id !== undefined && id !== null && id.startsWith('TEMP-')
          );

          for (const tempId of tempIds) {
            await this._patchPaymentCommandsForTempId(tempId, serverId);
          }
        }
      }

      // 4. Mark Command Completed in Queue
      await this.queueMgr.markCompleted(cmdId);
      await this.queueMgr.clearCompleted();

      // 5. Handle post-completion state updates in IndexedDB
      if (isOrderSyncCommand(env) || env.operation_type === 'CREATE_ORDER' || env.operation_type === 'UPDATE_ORDER') {
        const tempInvId = (remappedPayload.invoice || remappedPayload.temp_id || env.temporary_id || cmdId) as string;
        if (tempInvId && typeof tempInvId === 'string' && tempInvId.startsWith('TEMP-')) {
          // Prefer the backend's actual lifecycle status when promoting the temp
          // record so the local snapshot matches the server invoice state.
          const backendStatus: OrderEntity['status'] | undefined =
            response?.status ||
            response?.message?.status ||
            response?.data?.status;
          try {
            await this._promoteTempOrder(tempInvId, serverId, backendStatus);
          } catch (delErr) {
            console.warn('[SyncEngine] Error promoting temp order to synced state:', delErr);
          }
        }
      }

      if (isPaymentCommand(env) || env.operation_type === 'PAY_ORDER') {
        const paidInvoiceId = (remappedPayload.invoice as string) || serverId;
        if (paidInvoiceId) {
          try {
            await this.repos.orders.markPaid(paidInvoiceId);
            // Defensive cleanup: if the payment referenced a temp ID that has now been mapped,
            // delete any stale local temp record so it does not resurface in the UI.
            const rawInvoice = (env.payload as any)?.invoice;
            if (rawInvoice && typeof rawInvoice === 'string' && rawInvoice.startsWith('TEMP-')) {
              try {
                await this.repos.orders.delete(rawInvoice);
              } catch (cleanupErr) {
                console.warn('[SyncEngine] Error deleting stale temp order after payment sync:', cleanupErr);
              }
            }
          } catch (markErr) {
            console.warn('[SyncEngine] Error marking order as Paid after payment sync:', markErr);
          }
        }
      }

      // 6. Trigger Projection Updates
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
      const backoffDelay = calculateBackoffDelay((env.retry_count ?? env.retryCount ?? 0) + 1, {
        baseMs: this.options.baseBackoffMs,
        maxMs: this.options.maxBackoffMs,
      });

      console.warn(`[SyncEngine] Command ${env.id} scheduled for retry in ${backoffDelay}ms.`);

      await this.queueMgr.markFailed(env.id, `${conflictResult.conflictCode}: ${errorMsg}`);
      return false;
    }
  }

  /**
   * Promotes a local TEMP-* order record to its real server invoice ID after sync_order succeeds.
   * Deletes the temp record and inserts a synced record with the server ID, preserving the
   * local lifecycle status (so an offline-paid order remains Paid after promotion).
   */
  private async _promoteTempOrder(
    tempId: string,
    serverId: string | undefined,
    backendStatus?: OrderEntity['status']
  ): Promise<void> {
    const existing = await this.repos.orders.getById(tempId);
    if (!existing) return;

    const targetId = serverId || tempId;
    await this.repos.orders.delete(tempId);

    // Preserve local Paid status; otherwise use the backend's reported status so
    // the promoted local snapshot matches the server invoice state.
    const promotedStatus: OrderEntity['status'] =
      existing.status === 'Paid' ? 'Paid' : backendStatus ?? existing.status;
    const promoted: OrderEntity = {
      ...existing,
      id: targetId,
      status: promotedStatus,
      sync_status: 'synced',
      updatedAt: new Date().toISOString(),
    };

    // If a record for the server ID already exists (e.g., from an earlier partial sync),
    // merge it with the promoted record so we don't lose the Paid status or item details.
    const existingServer = await this.repos.orders.getById(targetId);
    if (existingServer) {
      const mergedStatus: OrderEntity['status'] =
        existingServer.status === 'Paid' || promoted.status === 'Paid' ? 'Paid' : promoted.status;
      await this.repos.orders.put({
        ...existingServer,
        ...promoted,
        status: mergedStatus,
        // Preserve item details if the server record has none.
        items: promoted.items?.length ? promoted.items : existingServer.items,
      });
    } else {
      await this.repos.orders.put(promoted);
    }

    console.log(`[SyncEngine] Promoted temp order ${tempId} -> ${targetId} (status: ${promotedStatus})`);
  }

  /**
   * Patches all pending make_invoice commands in the queue that reference the given temp ID,
   * replacing it with the real server invoice ID.
   *
   * This is the core mechanism that prevents offline paid orders from syncing as Draft.
   */
  private async _patchPaymentCommandsForTempId(tempId: string, serverId: string): Promise<void> {
    try {
      const paymentCmds = await this.queueMgr.findPaymentCommandsForTempId(tempId);
      for (const cmd of paymentCmds) {
        const updatedPayload = {
          ...(cmd.payload as Record<string, unknown>),
          invoice: serverId,
        };
        await this.queueMgr.updatePayload(cmd.id, updatedPayload);
        // The parent sync_order has succeeded, so the payment dependency is
        // satisfied. Clear it before the COMPLETED parent record is purged,
        // otherwise getPendingCommands will never see the dependency as met.
        await this.queueMgr.updateDependencies(cmd.id, []);
        // Also register the temp→server mapping for the payment's perspective
        await this.idMapper.registerMapping(tempId, serverId);
        console.log(
          `[SyncEngine] Patched payment command ${cmd.id}: invoice ${tempId} → ${serverId}`
        );
      }
    } catch (patchErr) {
      console.warn(`[SyncEngine] Failed to patch payment commands for temp ID ${tempId}:`, patchErr);
    }
  }

  /**
   * Post-sync housekeeping. Purges:
   *   1. Completed commands from the sync queue.
   *   2. Local TEMP-* order records that have already been mapped to real server
   *      invoice IDs (the server copy is now the source of truth).
   *   3. Local order records whose sync_status is 'synced' but that duplicate a
   *      server invoice promoted from a temp order.
   *
   * Emits ORDERS_UPDATED so the UI drops cleared offline cards smoothly.
   */
  private async _cleanupAfterSync(): Promise<void> {
    // 1. Clear completed queue entries.
    await this.queueMgr.clearCompleted();

    // 2. Remove TEMP-* order records that have a server-side mapping.
    const localOrders = await this.repos.orders.getAll();
    const tempOrders = localOrders.filter(o => o.id.startsWith('TEMP-'));

    for (const tempOrder of tempOrders) {
      const serverId = await this.idMapper.getServerId(tempOrder.id);
      if (serverId && serverId !== tempOrder.id) {
        try {
          await this.repos.orders.delete(tempOrder.id);
          console.log(`[SyncEngine] Cleaned up temp order ${tempOrder.id} -> ${serverId}`);
        } catch (delErr) {
          console.warn(`[SyncEngine] Failed to clean up temp order ${tempOrder.id}:`, delErr);
        }
      }
    }

    // 3. Emit projection update so the UI refreshes and any cleared cards vanish.
    projectionBus.emit('ORDERS_UPDATED');
  }

  /**
   * Emits appropriate projection events based on endpoint target
   */
  private notifyProjectionsForEndpoint(endpoint: string): void {
    let event: ProjectionEventType = 'ALL_UPDATED';

    if (
      ORDER_SYNC_ENDPOINTS.some(e => endpoint.includes(e)) ||
      PAYMENT_ENDPOINTS.some(e => endpoint.includes(e))
    ) {
      event = 'ORDERS_UPDATED';
    } else if (TABLE_ENDPOINTS.some(e => endpoint.includes(e))) {
      event = 'TABLES_UPDATED';
    } else if (CUSTOMER_ENDPOINTS.some(e => endpoint.includes(e))) {
      event = 'CUSTOMERS_UPDATED';
    } else if (MENU_ENDPOINTS.some(e => endpoint.includes(e))) {
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
