/**
 * @file sync.engine.ts
 * @description Bulletproof SyncEngine Orchestrator.
 *
 * Two-Stage Sync Architecture:
 *  Stage 1 — Order Commands: sync_order commands execute first. On success, the real server
 *             invoice ID (POS-INV-*) is registered in TempIDMapper and any pending
 *             make_invoice commands referencing the temp ID are patched in-place in the queue.
 *  Stage 2 — Payment Commands: make_invoice commands execute only after their parent order
 *             command has completed and their invoice field points to a real server ID.
 *
 * Hardening principles applied in this file:
 *  1. Strict endpoint response validation — a command is NEVER marked COMPLETED unless the
 *     backend response proves the ERP document was created/updated successfully.
 *  2. Atomic IndexedDB transactions — command status changes, TempID mappings, payment
 *     patches, and local order promotions are committed together or rolled back together.
 *  3. No error swallowing — non-critical steps log warnings, but any failure that breaks
 *     the completion invariant fails the command and halts the sync cycle.
 *  4. Dependency enforcement — dependents wait until all dependency_ids are COMPLETED; a
 *     FAILED or missing parent never satisfies a dependency.
 */

import { call } from '../frappe/client';
import { commandQueue, CommandQueueManager, type CommandEnvelope } from '../commands';
import { repositories, type OrderEntity, type StorageRepositories } from '../storage';
import type { UryPosDatabase } from '../storage/db';
import { TempIDMapper } from './temp-id-mapper';
import { calculateBackoffDelay, isMaxAttemptsReached } from './backoff';
import { projectionBus, type ProjectionEventType } from '../projections';
import { conflictResolver, ConflictResolver } from './conflict.resolver';
import { apiRegistry } from '../api/api-registry';

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
  'kot_reprint',
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

/** Returns true if this command is a cancellation */
function isCancelCommand(env: CommandEnvelope): boolean {
  return env.endpoint.includes('cancel_order');
}

/** Returns true if this command updates print status */
function isPrintCommand(env: CommandEnvelope): boolean {
  return env.endpoint.includes('qz_print_update');
}

/** Returns true if this command splits a bill */
function isSplitCommand(env: CommandEnvelope): boolean {
  return env.endpoint.includes('split_bill') || env.operation_type === 'SPLIT_BILL';
}

/**
 * Unwraps a Frappe JS SDK response. Production responses are usually
 * `{ message: <payload> }` or `{ data: <payload> }`; tests and some legacy
 * endpoints return the payload directly.
 */
function unwrapFrappeResponse(raw: any): any {
  if (raw == null) return raw;
  if (raw.message !== undefined) return raw.message;
  if (raw.data !== undefined) return raw.data;
  return raw;
}

/** Extracts a human-readable error message from a backend response. */
function extractErrorMessage(body: any): string {
  if (!body) return 'Unknown server error';
  if (typeof body === 'string') return body;
  return (
    body.message?.message ||
    body.message ||
    body.error?.message ||
    body.error ||
    body.exception ||
    JSON.stringify(body)
  );
}

interface ValidationSuccess {
  valid: true;
  serverId?: string;
  body: any;
}

interface ValidationFailure {
  valid: false;
  error: string;
}

type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Strict endpoint response validator. NEVER mark a command complete unless the
 * response shape proves the ERP document exists and the operation succeeded.
 */
function validateEndpointResponse(env: CommandEnvelope, rawResponse: any): ValidationResult {
  const body = unwrapFrappeResponse(rawResponse);

  // Explicit backend failure indicators
  const topLevelStatus = rawResponse?.status;
  const bodyStatus = body?.status;
  const failureMessage =
    topLevelStatus === 'Failure' || bodyStatus === 'Failure'
      ? extractErrorMessage(body)
      : null;
  if (failureMessage) {
    return { valid: false, error: `SERVER_REJECTED: ${failureMessage}` };
  }

  if (topLevelStatus === 'error' || bodyStatus === 'error') {
    return { valid: false, error: `SERVER_ERROR: ${extractErrorMessage(body)}` };
  }

  const endpoint = env.endpoint;

  // Order creation/update MUST return the created POS Invoice name.
  if (isOrderSyncCommand(env)) {
    const serverId = body?.name;
    if (!serverId || typeof serverId !== 'string') {
      return { valid: false, error: 'sync_order response missing POS Invoice name' };
    }
    return { valid: true, serverId, body };
  }

  // Payment submission MUST confirm success or return the submitted invoice name.
  if (isPaymentCommand(env)) {
    const serverId = body?.name || body?.message?.name;
    const success = body?.status === 'success' || !!serverId;
    if (!success) {
      return { valid: false, error: 'make_invoice did not confirm success or return invoice name' };
    }
    return { valid: true, serverId, body };
  }

  // Bill split MUST return the new invoice identifier.
  if (endpoint.includes('split_bill')) {
    const newInvoice = body?.new_invoice || body?.message?.new_invoice;
    if (!newInvoice) {
      return { valid: false, error: 'split_bill response missing new_invoice' };
    }
    return { valid: true, serverId: newInvoice as string, body };
  }

  // Customer creation MUST return a customer identifier.
  if (endpoint.includes('create_customer')) {
    const serverId = body?.customer_name || body?.name || body?.message?.customer_name;
    if (!serverId) {
      return { valid: false, error: 'create_customer response missing customer identifier' };
    }
    return { valid: true, serverId: serverId as string, body };
  }

  // Merge bills should report success and return the primary invoice name when available.
  if (endpoint.includes('merge_bills')) {
    if (body?.status === 'error') {
      return { valid: false, error: extractErrorMessage(body) };
    }
    return { valid: true, serverId: body?.name as string | undefined, body };
  }

  // Table operations, cancellations, print updates, and KOT reprints only need to
  // avoid explicit failure. Where a status is returned it must not be Failure/error.
  if (
    endpoint.includes('merge_tables_batch') ||
    endpoint.includes('unmerge_tables') ||
    endpoint.includes('table_transfer') ||
    endpoint.includes('captain_transfer') ||
    isCancelCommand(env) ||
    isPrintCommand(env) ||
    endpoint.includes('kot_reprint') ||
    endpoint.includes('delete_draft_invoice')
  ) {
    return { valid: true, body };
  }

  // Unknown/legacy endpoint: accept only if there is no explicit failure payload.
  return { valid: true, body };
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
    this.repos = options?.repositories || repositories;
    this.queueMgr = customQueueMgr || commandQueue;
    this.idMapper = customIdMapper || new TempIDMapper(this.repos);
    this.resolver = customResolver || conflictResolver;
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
   * Triggers dependency-based queue draining.
   * Processes one ready command at a time and halts on the first failure so that
   * dependents never run against a failed or incomplete parent state.
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

    // Recover commands left in SYNCING state from a previous crash or abrupt
    // disconnect so they are picked up by getPendingCommands() and retried.
    try {
      const allCommands = await this.repos.syncQueue.getAll();
      const stuckCommands = allCommands.filter(
        (cmd: any) => cmd.status === 'SYNCING'
      );
      for (const cmd of stuckCommands) {
        const cmdId = cmd.command_id || cmd.id;
        if (cmdId) {
          console.warn(`[SyncEngine] Recovering stuck SYNCING command ${cmdId} back to PENDING.`);
          await this.queueMgr.markPending(cmdId);
        }
      }
    } catch (recoverErr) {
      console.error('[SyncEngine] Failed to recover stuck SYNCING commands:', recoverErr);
    }

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
          console.warn(
            `[SyncEngine] Command ${nextCommand.command_id || nextCommand.id} failed. Halting sync cycle to protect dependents.`
          );
          break;
        }
      }
    } catch (err) {
      console.error('[SyncEngine] Unexpected error during sync cycle:', err);
    } finally {
      this.isSyncing = false;
    }

    // Post-sync housekeeping is best-effort but errors are surfaced, not swallowed.
    try {
      await this._cleanupAfterSync();
    } catch (cleanupErr) {
      console.error('[SyncEngine] Post-sync cleanup failed:', cleanupErr);
    }

    // Final reconciliation pass: ensure IndexedDB is a 1:1 mirror of server state
    // by purging any leftover temp records, remapping stale split metadata, and
    // releasing tables that no longer have active orders.
    try {
      await this.reconcileLocalStateWithServer();
    } catch (reconcileErr) {
      console.error('[SyncEngine] Post-sync reconciliation failed:', reconcileErr);
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
      console.warn(
        `[SyncEngine] Command ${cmdId} reached max retry attempts (${currentRetries}). Skipping.`
      );
      return false;
    }

    try {
      await this.queueMgr.markSyncing(cmdId);

      // Customer Mobile Reconciliation (Phase 6 Customer Strategy)
      if (env.operation_type === 'CREATE_CUSTOMER' || env.endpoint.includes('create_customer')) {
        const phone = (env.payload as any)?.mobile_number || (env.payload as any)?.phone;
        if (phone) {
          try {
            const searchResponse: any = await call.get('api/resource/Customer', {
              filters: [['mobile_number', '=', phone]],
              fields: ['name'],
            });
            const existingCustName =
              searchResponse?.data?.[0]?.name || searchResponse?.message?.[0]?.name;
            if (existingCustName) {
              console.log(`[SyncEngine] Mapped existing customer: ${phone} -> ${existingCustName}`);
              await this.completeCommandTransaction(env, cmdId, async () => {
                await this.idMapper.registerMapping(env.temporary_id || cmdId, existingCustName);
              });
              return true;
            }
          } catch (searchErr) {
            console.warn('[SyncEngine] Search Customer by phone failed, proceeding to create:', searchErr);
          }
        }
      }

      // 1. Remap Payload IDs using TempIDMapper (replaces TEMP-* IDs with real server IDs)
      const remappedPayload = await this.idMapper.remapPayload(env.payload);

      // Inject idempotency key into the API payload so retries cannot create duplicate
      // server records. Preserve an explicit payload key if one is already present.
      if (remappedPayload && typeof remappedPayload === 'object' && !Array.isArray(remappedPayload)) {
        (remappedPayload as Record<string, unknown>).idempotency_key =
          env.idempotency_key || env.client_request_id || env.command_id || env.id;
      }

      // 2. Payment commands MUST NOT run while their invoice reference is still a TEMP-* ID.
      const tempOrderRef = remappedPayload.invoice || remappedPayload.temp_id || env.temporary_id;
      if (isPaymentCommand(env) || env.operation_type === 'PAY_ORDER') {
        if (
          tempOrderRef &&
          typeof tempOrderRef === 'string' &&
          tempOrderRef.startsWith('TEMP-')
        ) {
          console.warn(
            `[SyncEngine] Payment command ${cmdId} deferred: parent server_invoice_id does not exist yet.`
          );
          await this.queueMgr.markPending(cmdId);
          return false;
        }
      }

      console.log(
        `[SyncEngine] Executing ${env.endpoint} for command ${cmdId}...`,
        remappedPayload
      );

      // 3. Execute Whitelisted Frappe API using the registered HTTP method.
      const httpMethod = this.getEndpointMethod(env.endpoint);
      const rawResponse: any =
        httpMethod === 'GET'
          ? await call.get(env.endpoint, remappedPayload)
          : await call.post(env.endpoint, remappedPayload);

      // 4. Strict response validation — fail the command if the backend did not
      //    prove the ERP document was created/updated successfully.
      const validation = validateEndpointResponse(env, rawResponse);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
      const { serverId, body: responseBody } = validation;

      // Capture payment invoice id and merge-payment table cluster info before the
      // transaction clears the order linkage.
      let paidInvoiceId: string | undefined;
      let mergedPaymentTables: string[] = [];
      if (isPaymentCommand(env) || env.operation_type === 'PAY_ORDER') {
        paidInvoiceId = (remappedPayload.invoice as string) || serverId;
        if (paidInvoiceId) {
          mergedPaymentTables = await this._getMergedPaymentTables(paidInvoiceId);
        }
      }

      // 5. Apply all command-completion side effects atomically. If any critical
      //    IndexedDB write fails, the entire completion rolls back and the command
      //    remains in a non-COMPLETED state.
      await this.completeCommandTransaction(env, cmdId, async () => {
        await this.applyCommandSuccess(env, cmdId, remappedPayload, responseBody, serverId);
      });

      // 6. Trigger Projection Updates outside the DB transaction.
      this.notifyProjectionsForEndpoint(env.endpoint);

      // Cancellation also releases table clusters on the backend; make sure the
      // Table page reflects the freed cluster without waiting for a full refresh.
      if (isCancelCommand(env) || env.operation_type === 'DELETE_ORDER') {
        await this._releaseTableClusterForCancelledOrder(remappedPayload, serverId);
        projectionBus.emit('TABLES_UPDATED');
      }

      // Payment commands release table occupancy when no active orders remain.
      if (paidInvoiceId) {
        await this._reconcileTableOccupancyAfterPayment(paidInvoiceId);
      }

      // Merged bill payments release their cluster after the linkage is cleared.
      if (mergedPaymentTables.length > 0) {
        for (const table of mergedPaymentTables) {
          try {
            const clusterTables = await this.repos.tables.getClusterTables(table);
            await this.repos.tables.releaseCluster(clusterTables);
          } catch (err) {
            console.warn(`[SyncEngine] Error releasing merge table cluster for ${table}:`, err);
          }
        }
        projectionBus.emit('TABLES_UPDATED');
      }

      // 7. For split commands, refresh the split-group metadata from the server so
      //    local index/total/sibling values match the backend exactly.
      if (isSplitCommand(env) && serverId) {
        await this._refreshSplitGroup(serverId);
      }

      console.log(
        `[SyncEngine] Command ${env.id} completed successfully. Server ID: ${serverId || 'N/A'}`
      );
      return true;
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      console.error(`[SyncEngine] Command ${env.id} execution failed:`, errorMsg);

      // Explicit backend rejections (HTTP 200 with status Failure / missing required
      // document proof) must NEVER be converted into IGNORE. The ERP document did not
      // get created/updated, so marking the command completed would leave dependents
      // running against a non-existent document.
      if (
        errorMsg.startsWith('SERVER_REJECTED:') ||
        errorMsg.startsWith('SERVER_ERROR:')
      ) {
        console.warn(
          `[SyncEngine] Command ${env.id} rejected by server; failing directly without conflict resolution.`
        );
        await this.queueMgr.markFailed(env.id, errorMsg);
        return false;
      }

      // Evaluate Conflict & Resolution Strategy for network/HTTP/exception failures.
      const conflictResult = await this.resolver.resolveConflict(env, error);
      console.log(
        `[SyncEngine] Conflict detected: ${conflictResult.conflictCode} -> Strategy: ${conflictResult.strategy}`
      );

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
      const backoffDelay = calculateBackoffDelay(
        (env.retry_count ?? env.retryCount ?? 0) + 1,
        {
          baseMs: this.options.baseBackoffMs,
          maxMs: this.options.maxBackoffMs,
        }
      );

      console.warn(`[SyncEngine] Command ${env.id} scheduled for retry in ${backoffDelay}ms.`);

      await this.queueMgr.markFailed(env.id, `${conflictResult.conflictCode}: ${errorMsg}`);
      return false;
    }
  }

  /**
   * Executes all command-completion side effects inside an atomic IndexedDB
   * transaction. The command is marked COMPLETED only if every critical step
   * inside the callback succeeds.
   */
  private async completeCommandTransaction(
    _env: CommandEnvelope,
    cmdId: string,
    callback: () => Promise<void>
  ): Promise<void> {
    const db = this.getDb();

    await db.transaction('rw', db.sync_queue, db.orders, db.metadata, async () => {
      // Run caller-specific side effects first (mappings, payment patches, order updates).
      await callback();

      // Mark command completed and clear satisfied dependencies inside the same
      // transaction so dependents cannot observe a COMPLETED parent before its
      // side effects are persisted.
      await this.queueMgr.markCompleted(cmdId);
      await this.queueMgr.clearDependencyId(cmdId);
    });

    // Purge completed queue entries after the transaction commits. This is
    // idempotent cleanup; a failure here does not threaten correctness.
    try {
      await this.queueMgr.clearCompleted();
    } catch (cleanupErr) {
      console.warn('[SyncEngine] clearCompleted cleanup failed after transaction:', cleanupErr);
    }
  }

  /**
   * Applies the success side effects for a validated command. Called inside the
   * atomic completion transaction.
   */
  private async applyCommandSuccess(
    env: CommandEnvelope,
    cmdId: string,
    remappedPayload: any,
    responseBody: any,
    serverId?: string
  ): Promise<void> {
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

      // Critical: If this was a sync_order command, patch any pending make_invoice
      // commands that still reference the temp ID.
      if (
        isOrderSyncCommand(env) ||
        env.operation_type === 'CREATE_ORDER' ||
        env.operation_type === 'UPDATE_ORDER'
      ) {
        const candidates: (string | undefined)[] = [
          remappedPayload.invoice as string | undefined,
          remappedPayload.temp_id as string | undefined,
          cmdId,
          env.temporary_id || undefined,
        ];
        const tempIds = candidates.filter(
          (id): id is string => id !== undefined && id !== null && id.startsWith('TEMP-')
        );

        for (const tempId of tempIds) {
          await this._patchPaymentCommandsForTempId(tempId, serverId);
          await this._patchMergeBillCommandsForTempId(tempId, serverId);
          await this._patchSplitBillCommandsForTempId(tempId, serverId, responseBody?.items);
          await this._patchCommandsForTempId(tempId, serverId, cmdId);
        }
      }
    }

    // Post-completion state updates in IndexedDB
    if (
      isOrderSyncCommand(env) ||
      env.operation_type === 'CREATE_ORDER' ||
      env.operation_type === 'UPDATE_ORDER'
    ) {
      const tempInvId = (remappedPayload.invoice ||
        remappedPayload.temp_id ||
        env.temporary_id ||
        cmdId) as string;
      if (tempInvId && typeof tempInvId === 'string' && tempInvId.startsWith('TEMP-')) {
        const backendStatus: OrderEntity['status'] | undefined =
          responseBody?.status || responseBody?.message?.status || responseBody?.data?.status;
        await this._promoteTempOrder(tempInvId, serverId, backendStatus);
      }
    }

    if (isPaymentCommand(env) || env.operation_type === 'PAY_ORDER') {
      const paidInvoiceId = (remappedPayload.invoice as string) || serverId;
      if (paidInvoiceId) {
        await this.repos.orders.markPaid(paidInvoiceId);
        // The payment was acknowledged by the server, so the local record is
        // synced. Without this, a promoted temp record keeps sync_status
        // 'pending' and post-sync housekeeping can never purge it.
        const paidRecord = await this.repos.orders.getById(paidInvoiceId);
        if (paidRecord && paidRecord.sync_status !== 'synced') {
          await this.repos.orders.put({ ...paidRecord, sync_status: 'synced' });
        }
        // Defensive cleanup: if the payment referenced a temp ID that has now been mapped,
        // delete any stale local temp record so it does not resurface in the UI.
        const rawInvoice = (env.payload as any)?.invoice;
        if (rawInvoice && typeof rawInvoice === 'string' && rawInvoice.startsWith('TEMP-')) {
          try {
            await this.repos.orders.delete(rawInvoice);
          } catch (cleanupErr) {
            console.warn(
              '[SyncEngine] Error deleting stale temp order after payment sync:',
              cleanupErr
            );
          }
        }
        // When a merged bill is paid, the backend `sync_merged_invoice` hook
        // submits the linked invoice and the linkage is no longer active. Clear
        // the local merge metadata so the UI stays consistent after sync.
        await this._clearMergedOrderLinkagesAfterPayment(paidInvoiceId);
      }
    }

    if (isCancelCommand(env) || env.operation_type === 'DELETE_ORDER') {
      const cancelledInvoiceId =
        (remappedPayload.invoice_id as string) || (remappedPayload.invoice as string) || serverId;
      if (cancelledInvoiceId) {
        try {
          await this.repos.orders.markCancelled(cancelledInvoiceId);
          // The cancellation was acknowledged by the server; mark the local
          // record synced so post-sync housekeeping can purge it.
          const cancelledRecord = await this.repos.orders.getById(cancelledInvoiceId);
          if (cancelledRecord && cancelledRecord.sync_status !== 'synced') {
            await this.repos.orders.put({ ...cancelledRecord, sync_status: 'synced' });
          }
        } catch (cancelErr) {
          console.warn('[SyncEngine] Error marking order as Cancelled after cancel sync:', cancelErr);
        }
      }
    }

    if (
      env.endpoint.includes('merge_bills') ||
      env.operation_type === 'MERGE_BILLS'
    ) {
      const primaryInvoice = (remappedPayload.primary_invoice as string) || serverId;
      const secondaryInvoice = remappedPayload.secondary_invoice as string;
      if (primaryInvoice && secondaryInvoice) {
        try {
          await this._reconcileMergedBillLocalState(primaryInvoice, secondaryInvoice);
        } catch (mergeReconcileErr) {
          console.warn('[SyncEngine] Error reconciling merged bill local state:', mergeReconcileErr);
        }
      }
    }

    if (isSplitCommand(env)) {
      const sourceInvoice = (remappedPayload.source_invoice as string) || '';
      const childTempId = env.temporary_id;

      if (serverId && childTempId && childTempId.startsWith('TEMP-')) {
        try {
          await this.idMapper.registerMapping(childTempId, serverId);
          await this.idMapper.registerMapping(env.id, serverId);
          await this._patchCommandsForTempId(childTempId, serverId, cmdId);
          await this._promoteSplitChild(childTempId, serverId, sourceInvoice);
        } catch (splitReconcileErr) {
          console.warn('[SyncEngine] Error reconciling split child local state:', splitReconcileErr);
          throw splitReconcileErr;
        }
      }

      if (sourceInvoice) {
        try {
          const source = await this.repos.orders.getById(sourceInvoice);
          if (source) {
            source.updatedAt = new Date().toISOString();
            await this.repos.orders.put(source);
          }
        } catch (sourceErr) {
          console.warn('[SyncEngine] Error touching source invoice after split:', sourceErr);
        }
      }
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

    // Preserve the local lifecycle status for any non-terminal order. The backend
    // always reports POS Invoice status as 'Draft' for unprinted table orders, but
    // the offline state machine distinguishes 'Unbilled' (unprinted table order)
    // from 'Draft' (printed/counter order). Only allow the server status to win
    // when it represents a terminal transition (Paid) or when no local status exists.
    const terminalStatuses: OrderEntity['status'][] = ['Paid', 'Cancelled'];
    const promotedStatus: OrderEntity['status'] = terminalStatuses.includes(existing.status)
      ? existing.status
      : backendStatus && terminalStatuses.includes(backendStatus)
      ? backendStatus
      : existing.status;
    const promoted: OrderEntity = {
      ...existing,
      id: targetId,
      status: promotedStatus,
      // Preserve Aggregator metadata so the Orders page and projections continue
      // to render the Aggregator badge after a temp order is promoted.
      order_type: existing.order_type,
      custom_aggregator_id: existing.custom_aggregator_id,
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
        // Update envelope metadata so the command no longer references the stale
        // TEMP-* ID after promotion.
        await this.queueMgr.updateEnvelopeMetadata(cmd.id, {
          temporary_id: cmd.temporary_id === tempId ? null : cmd.temporary_id,
          server_id: cmd.temporary_id === tempId ? serverId : cmd.server_id,
          entity_id: cmd.entity_id === tempId ? serverId : cmd.entity_id,
        });
        // Also register the temp→server mapping for the payment's perspective
        await this.idMapper.registerMapping(tempId, serverId);
        console.log(
          `[SyncEngine] Patched payment command ${cmd.id}: invoice ${tempId} → ${serverId}`
        );
      }
    } catch (patchErr) {
      console.warn(
        `[SyncEngine] Failed to patch payment commands for temp ID ${tempId}:`
      );
      console.warn(patchErr);
      // Payment patching is critical for correctness; rethrow so the transaction rolls back.
      throw patchErr;
    }
  }

  /**
   * Patches all pending merge_bills commands whose primary or secondary invoice
   * still references the given temp ID, replacing it with the real server invoice ID.
   * Also clears the satisfied dependency so the command becomes ready once the
   * parent sync_order record is purged.
   */
  private async _patchMergeBillCommandsForTempId(tempId: string, serverId: string): Promise<void> {
    try {
      const allCmds = await this.repos.syncQueue.getAll();
      const mergeCmds = allCmds.filter((e: any) =>
        e.status === 'PENDING' &&
        (e.action === 'merge_bills' || e.operation_type === 'MERGE_BILLS') &&
        (
          e.payload?.primary_invoice === tempId ||
          e.payload?.secondary_invoice === tempId
        )
      );

      for (const cmd of mergeCmds) {
        const payload = cmd.payload as Record<string, unknown>;
        const cmdId = cmd.id || cmd.command_id || '';
        const updatedPayload = {
          ...payload,
          primary_invoice: payload.primary_invoice === tempId ? serverId : payload.primary_invoice,
          secondary_invoice: payload.secondary_invoice === tempId ? serverId : payload.secondary_invoice,
        };
        await this.queueMgr.updatePayload(cmdId, updatedPayload);
        await this.queueMgr.updateDependencies(cmdId, []);
        await this.idMapper.registerMapping(tempId, serverId);
        console.log(
          `[SyncEngine] Patched merge_bills command ${cmdId}: ${tempId} → ${serverId}`
        );
      }
    } catch (patchErr) {
      console.warn(`[SyncEngine] Failed to patch merge_bills commands for temp ID ${tempId}:`, patchErr);
      throw patchErr;
    }
  }

  /**
   * Patches pending split_bill commands that reference a temporary source_invoice.
   * Crucially, replaces the offline row identifier (which is just the item_code) 
   * in items_to_move with the actual server-assigned row hash.
   */
  private async _patchSplitBillCommandsForTempId(
    tempId: string,
    serverId: string,
    serverItems: any[] | undefined
  ): Promise<void> {
    if (!serverItems || !Array.isArray(serverItems) || serverItems.length === 0) return;
    try {
      const allCmds = await this.repos.syncQueue.getAll();
      const splitCmds = allCmds.filter((e: any) =>
        e.status === 'PENDING' &&
        (e.action === 'split_bill' || e.operation_type === 'SPLIT_BILL') &&
        e.payload?.source_invoice === tempId
      );

      for (const cmd of splitCmds) {
        const payload = cmd.payload as Record<string, unknown>;
        const itemsToMove = payload.items_to_move as Array<{ name: string; qty: number }>;
        
        let patched = false;
        const patchedItems = (itemsToMove || []).map(itm => {
          // In offline mode, the row name was set to the item_code.
          // We must map it to the actual server row name (the Hash).
          const match = serverItems.find(si => si.item_code === itm.name || si.item === itm.name);
          if (match && match.name && match.name !== itm.name) {
            patched = true;
            return { ...itm, name: match.name };
          }
          return itm;
        });

        const cmdId = cmd.id || cmd.command_id || '';
        const updatedPayload = {
          ...payload,
          source_invoice: serverId,
          items_to_move: patchedItems,
        };
        await this.queueMgr.updatePayload(cmdId, updatedPayload);
        await this.queueMgr.updateDependencies(cmdId, []);
        await this.idMapper.registerMapping(tempId, serverId);
        console.log(
          `[SyncEngine] Patched split_bill command ${cmdId}: ${tempId} → ${serverId} (items patched: ${patched})`
        );
      }
    } catch (patchErr) {
      console.warn(`[SyncEngine] Failed to patch split_bill commands for temp ID ${tempId}:`, patchErr);
      throw patchErr;
    }
  }

  /**
   * Reconciles local IndexedDB order records after a merge_bills command succeeds.
   * Ensures both invoices carry the bidirectional merge link and the mirrored item
   * details, matching the backend state created by merge_bills().
   */
  private async _reconcileMergedBillLocalState(
    primaryInvoice: string,
    secondaryInvoice: string
  ): Promise<void> {
    const primary = await this.repos.orders.getById(primaryInvoice);
    const secondary = await this.repos.orders.getById(secondaryInvoice);
    if (!primary || !secondary) return;

    const now = new Date().toISOString();

    const primaryMirror: OrderEntity['custom_merged_pos_invoice_details'] =
      secondary.items.map(i => ({
        item: i.item,
        item_name: i.item_name,
        rate: i.rate,
        qty: i.qty,
        amount: i.amount || i.rate * i.qty,
      }));

    const secondaryMirror: OrderEntity['custom_merged_pos_invoice_details'] =
      primary.items.map(i => ({
        item: i.item,
        item_name: i.item_name,
        rate: i.rate,
        qty: i.qty,
        amount: i.amount || i.rate * i.qty,
      }));

    await this.repos.orders.put({
      ...primary,
      custom_merged_pos_invoice: secondaryInvoice,
      custom_merged_total: secondary.grand_total,
      custom_merged_pos_invoice_details: primaryMirror,
      updatedAt: now,
    });

    await this.repos.orders.put({
      ...secondary,
      custom_merged_pos_invoice: primaryInvoice,
      custom_merged_total: primary.grand_total,
      custom_merged_pos_invoice_details: secondaryMirror,
      updatedAt: now,
    });

    console.log(`[SyncEngine] Reconciled merged bill local state: ${primaryInvoice} <> ${secondaryInvoice}`);
  }

  /**
   * Replaces a temporary ID with its server ID in the payload of every pending
   * command that references it. This is the generic counterpart to the payment
   * and merge patches; it keeps dependent print, payment, cancel, and further
   * split commands valid after a TEMP-* invoice is promoted.
   */
  private async _patchCommandsForTempId(
    tempId: string,
    serverId: string,
    parentCmdId: string
  ): Promise<void> {
    try {
      const allCmds = await this.repos.syncQueue.getAll();
      const affected = allCmds.filter((e: any) => {
        if (e.status !== 'PENDING') return false;
        if (e.temporary_id === tempId || e.entity_id === tempId) return true;
        return JSON.stringify(e.payload || {}).includes(tempId);
      });

      for (const cmd of affected) {
        const payload = cmd.payload as Record<string, unknown>;
        const updatedPayload = this._replaceTempIdInPayload(payload, tempId, serverId);
        const cmdId = (cmd.command_id || cmd.id) as string;
        await this.queueMgr.updatePayload(cmdId, updatedPayload);

        // Update envelope metadata so the queued command no longer references the
        // stale TEMP-* ID after promotion. This is essential for split children,
        // whose dependent payment/print commands carry temporary_id/entity_id.
        await this.queueMgr.updateEnvelopeMetadata(cmdId, {
          temporary_id: cmd.temporary_id === tempId ? null : cmd.temporary_id,
          server_id: cmd.temporary_id === tempId ? serverId : cmd.server_id,
          entity_id: cmd.entity_id === tempId ? serverId : cmd.entity_id,
        });

        const currentDeps = (cmd.dependency_ids || cmd.dependencies || []) as string[];
        const nextDeps = currentDeps.filter(d => d !== parentCmdId);
        await this.queueMgr.updateDependencies(cmdId, nextDeps);
        await this.idMapper.registerMapping(tempId, serverId);
        console.log(`[SyncEngine] Patched command ${cmdId}: ${tempId} -> ${serverId}`);
      }
    } catch (patchErr) {
      console.warn(`[SyncEngine] Failed to patch commands for temp ID ${tempId}:`, patchErr);
      throw patchErr;
    }
  }

  /**
   * Recursively replaces a temp ID string with its server ID inside a payload.
   */
  private _replaceTempIdInPayload<T = any>(payload: T, tempId: string, serverId: string): T {
    if (payload === null || payload === undefined) return payload;
    if (typeof payload === 'string') {
      return (payload === tempId ? serverId : payload) as unknown as T;
    }
    if (Array.isArray(payload)) {
      return payload.map(item => this._replaceTempIdInPayload(item, tempId, serverId)) as unknown as T;
    }
    if (typeof payload === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(payload as Record<string, unknown>)) {
        result[key] = this._replaceTempIdInPayload(val, tempId, serverId);
      }
      return result as T;
    }
    return payload;
  }

  /**
   * Clears the bidirectional merge linkage on order records after a merged
   * invoice payment syncs. The partner invoice is marked Paid (matching the
   * backend `sync_merged_invoice` hook behavior) and both records lose their
   * merge metadata. This runs inside the atomic completion transaction; table
   * cluster release happens outside the transaction.
   */
  private async _clearMergedOrderLinkagesAfterPayment(invoiceId: string): Promise<void> {
    const order = await this.repos.orders.getById(invoiceId);
    if (!order?.custom_merged_pos_invoice) return;

    const partnerId = order.custom_merged_pos_invoice;
    const partner = await this.repos.orders.getById(partnerId);
    const now = new Date().toISOString();

    if (partner) {
      await this.repos.orders.put({
        ...partner,
        status: 'Paid',
        is_locked: 1,
        custom_merged_pos_invoice: null,
        custom_merged_total: null,
        custom_merged_pos_invoice_details: null,
        updatedAt: now,
      } as any);
    }

    await this.repos.orders.put({
      ...order,
      custom_merged_pos_invoice: null,
      custom_merged_total: null,
      custom_merged_pos_invoice_details: null,
      updatedAt: now,
    } as any);
  }

  /**
   * Returns the distinct table names belonging to a merged invoice and its
   * partner, captured before the merge linkage is cleared inside the completion
   * transaction.
   */
  private async _getMergedPaymentTables(invoiceId: string): Promise<string[]> {
    const order = await this.repos.orders.getById(invoiceId);
    if (!order?.custom_merged_pos_invoice) return [];

    const partner = await this.repos.orders.getById(order.custom_merged_pos_invoice);
    const tables = new Set<string>();
    if (order.table) tables.add(order.table);
    if (partner?.table) tables.add(partner.table);
    return Array.from(tables);
  }

  /**
   * Releases a table after payment if no active (non-terminal) orders remain
   * linked to it. This keeps local table occupancy in lock-step with the server
   * when an invoice is paid offline and later synced.
   */
  private async _reconcileTableOccupancyAfterPayment(invoiceId: string): Promise<void> {
    const order = await this.repos.orders.getById(invoiceId);
    if (!order?.table) return;

    const table = await this.repos.tables.getById(order.table);
    if (!table) return;

    // Include the merge cluster so a split/merged payment releases the cluster
    // when all bills are settled.
    const clusterTables = await this.repos.tables.getClusterTables(order.table);
    const allOrders = await this.repos.orders.getAll();

    const hasActiveOrder = clusterTables.some(tableName =>
      allOrders.some(
        o =>
          o.table === tableName &&
          o.status !== 'Paid' &&
          o.status !== 'Cancelled'
      )
    );

    if (!hasActiveOrder) {
      await this.repos.tables.releaseCluster(clusterTables);
      projectionBus.emit('TABLES_UPDATED');
    }
  }

  /**
   * Promotes a locally-created TEMP-SPLIT-* child order to its real server invoice
   * ID after split_bill succeeds. Preserves the local lifecycle status, clears the
   * pending command link, and rewrites split metadata so sibling references point
   * to real server IDs instead of stale temp IDs.
   */
  private async _promoteSplitChild(
    tempId: string,
    serverId: string,
    sourceInvoice: string
  ): Promise<void> {
    const existing = await this.repos.orders.getById(tempId);
    if (!existing) return;

    await this.repos.orders.delete(tempId);

    const promoted: OrderEntity = {
      ...existing,
      id: serverId,
      custom_split_from: sourceInvoice,
      sync_status: existing.status === 'Paid' || existing.status === 'Cancelled' ? existing.sync_status : 'synced',
      pending_command_id: null,
      updatedAt: new Date().toISOString(),
    };

    const serverExisting = await this.repos.orders.getById(serverId);
    if (serverExisting) {
      await this.repos.orders.put({
        ...serverExisting,
        ...promoted,
        status: serverExisting.status === 'Paid' || promoted.status === 'Paid' ? 'Paid' : promoted.status,
        items: promoted.items?.length ? promoted.items : serverExisting.items,
      });
    } else {
      await this.repos.orders.put(promoted);
    }

    // Rewrite sibling references on the source invoice so they use the real server
    // ID instead of the now-deleted temp child ID. This guarantees the RelatedBills
    // panel and order cards stay consistent even when offline.
    if (sourceInvoice) {
      try {
        const source = await this.repos.orders.getById(sourceInvoice);
        if (source && source.split_siblings?.some(id => id === tempId)) {
          source.split_siblings = Array.from(
            new Set(
              source.split_siblings.map(id => (id === tempId ? serverId : id))
            )
          );
          source.updatedAt = new Date().toISOString();
          await this.repos.orders.put(source);
        }
      } catch (sourceErr) {
        console.warn('[SyncEngine] Error rewriting source split_siblings after child promotion:', sourceErr);
      }
    }

    console.log(`[SyncEngine] Promoted split child ${tempId} -> ${serverId}`);
  }

  /**
   * Releases the table cluster for a cancelled invoice after the command
   * transaction has committed. Mirrors the backend `release_merge_cluster_tables`
   * side effect so the local Table UI shows the full cluster as Available.
   * Called outside the atomic completion transaction because it touches the
   * restaurantTables store, which is not part of that transaction scope.
   */
  private async _releaseTableClusterForCancelledOrder(
    remappedPayload: any,
    serverId?: string
  ): Promise<void> {
    try {
      const cancelledInvoiceId =
        (remappedPayload.invoice_id as string) || (remappedPayload.invoice as string) || serverId;
      if (!cancelledInvoiceId) return;

      const cancelledOrder = await this.repos.orders.getById(cancelledInvoiceId);
      if (cancelledOrder?.table) {
        const clusterTables = await this.repos.tables.getClusterTables(cancelledOrder.table);
        await this.repos.tables.releaseCluster(clusterTables);
      }
    } catch (err) {
      console.warn('[SyncEngine] Error releasing table cluster after cancel sync:', err);
    }
  }

  /**
   * Refreshes local split-group metadata from the backend so that indexes,
   * sibling lists and the group id match the server exactly. Called outside the
   * completion transaction because it issues a network read.
   */
  private async _refreshSplitGroup(newInvoiceId: string): Promise<void> {
    try {
      const endpoint = apiRegistry.getUrl('GET_SPLIT_GROUP');
      const raw: any = await call.get(endpoint, { invoice: newInvoiceId });
      const group = raw?.message ?? raw;
      if (!group?.group || !Array.isArray(group.invoices)) return;

      const now = new Date().toISOString();
      for (const inv of group.invoices) {
        const local = await this.repos.orders.getById(inv.name);
        if (!local) continue;

        const terminalStatuses: OrderEntity['status'][] = ['Paid', 'Cancelled'];
        let status: OrderEntity['status'] = local.status;
        if (!terminalStatuses.includes(local.status)) {
          const backendStatus = (inv.status as OrderEntity['status']) || local.status;
          const printed =
            typeof inv.invoice_printed === 'number' ? inv.invoice_printed : local.invoice_printed ?? 0;
          status =
            backendStatus === 'Draft' && inv.restaurant_table && printed === 0
              ? 'Unbilled'
              : backendStatus;
        }

        await this.repos.orders.put({
          ...local,
          custom_split_group: group.group,
          custom_split_from: inv.custom_split_from ?? local.custom_split_from ?? null,
          split_index: inv.split_index,
          split_total: inv.split_total,
          split_siblings: inv.split_siblings,
          customer: inv.customer ?? local.customer,
          grand_total: inv.grand_total ?? local.grand_total,
          invoice_printed:
            typeof inv.invoice_printed === 'number' ? inv.invoice_printed : local.invoice_printed,
          status,
          sync_status: terminalStatuses.includes(local.status) ? local.sync_status : 'synced',
          updatedAt: now,
        });
      }
      console.log(`[SyncEngine] Refreshed split group ${group.group} for ${newInvoiceId}`);
    } catch (err) {
      console.warn('[SyncEngine] Failed to refresh split group metadata:', err);
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

    // 3. Purge fully paid/synced orders to enforce minimal storage footprint.
    try {
      const purged = await this.repos.orders.purgeSyncedPaidOrders();
      if (purged > 0) {
        console.log(`[SyncEngine] Purged ${purged} synced paid order(s) from local IndexedDB.`);
      }
    } catch (purgeErr) {
      console.warn('[SyncEngine] Failed to purge synced paid orders:', purgeErr);
    }

    // 4. Emit projection update so the UI refreshes and any cleared cards vanish.
    projectionBus.emit('ORDERS_UPDATED');
  }

  /**
   * Final post-sync reconciliation pass. Complements the per-command side effects
   * by ensuring the local IndexedDB snapshot is a 1:1 mirror of server state:
   *   1. Any remaining TEMP-* order with a registered server mapping is deleted.
   *   2. Split metadata references are rewritten from TEMP-* IDs to real server IDs.
   *   3. Tables with no active (non-terminal) orders are released.
   *
   * This addresses stale cache regressions where reconnecting, syncing, and then
   * going offline again surfaces old draft/temp records.
   */
  async reconcileLocalStateWithServer(): Promise<void> {
    const localOrders = await this.repos.orders.getAll();
    const allTables = await this.repos.tables.getAll();
    let ordersChanged = false;
    let tablesChanged = false;

    // Build a map of known temp -> server mappings.
    const mappings = new Map<string, string>();
    for (const order of localOrders) {
      if (order.id.startsWith('TEMP-')) {
        const serverId = await this.idMapper.getServerId(order.id);
        if (serverId && serverId !== order.id) {
          mappings.set(order.id, serverId);
        }
      }
    }

    // 1. Delete any mapped TEMP-* orders that survived per-command cleanup.
    for (const [tempId, serverId] of mappings) {
      try {
        const stillExists = await this.repos.orders.getById(tempId);
        if (stillExists) {
          await this.repos.orders.delete(tempId);
          ordersChanged = true;
          console.log(`[SyncEngine] Reconcile deleted temp order ${tempId} -> ${serverId}`);
        }
      } catch (delErr) {
        console.warn(`[SyncEngine] Reconcile failed to delete temp order ${tempId}:`, delErr);
      }
    }

    // 2. Rewrite split_siblings / custom_split_from references to use real server IDs.
    for (const order of localOrders) {
      let patched = false;
      const patchedOrder = { ...order };

      if (order.split_siblings?.length) {
        const rewritten = order.split_siblings.map(id => mappings.get(id) || id);
        if (rewritten.some((id, idx) => id !== order.split_siblings![idx])) {
          patchedOrder.split_siblings = Array.from(new Set(rewritten));
          patched = true;
        }
      }

      if (order.custom_split_from && mappings.has(order.custom_split_from)) {
        patchedOrder.custom_split_from = mappings.get(order.custom_split_from)!;
        patched = true;
      }

      if (patched) {
        try {
          patchedOrder.updatedAt = new Date().toISOString();
          await this.repos.orders.put(patchedOrder);
          ordersChanged = true;
        } catch (patchErr) {
          console.warn(`[SyncEngine] Reconcile failed to patch split metadata for ${order.id}:`, patchErr);
        }
      }
    }

    // 3. Release table occupancy when no active orders remain on the table/cluster.
    for (const table of allTables) {
      if (table.occupied !== 1) continue;

      const clusterTables = await this.repos.tables.getClusterTables(table.name);
      const hasActiveOrder = localOrders.some(
        o =>
          o.table &&
          clusterTables.includes(o.table) &&
          o.status !== 'Paid' &&
          o.status !== 'Cancelled'
      );

      if (!hasActiveOrder) {
        try {
          await this.repos.tables.releaseCluster(clusterTables);
          tablesChanged = true;
        } catch (releaseErr) {
          console.warn(`[SyncEngine] Reconcile failed to release table cluster ${table.name}:`, releaseErr);
        }
      }
    }

    if (ordersChanged) projectionBus.emit('ORDERS_UPDATED');
    if (tablesChanged) projectionBus.emit('TABLES_UPDATED');
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
   * Resolves the registered HTTP method for an endpoint, defaulting to POST
   * when the endpoint is not in the registry (e.g. hardcoded legacy URLs).
   */
  private getEndpointMethod(endpoint: string): 'GET' | 'POST' | 'PUT' | 'DELETE' {
    try {
      const config = apiRegistry.getAll().find(e => e.url === endpoint);
      if (config && (config.httpMethod === 'GET' || config.httpMethod === 'POST')) {
        return config.httpMethod;
      }
    } catch {
      // Endpoint not registered; fall back to POST.
    }
    return 'POST';
  }

  private getDb(): UryPosDatabase {
    return this.repos.syncQueue.dbInstance;
  }

  /**
   * Check if sync cycle is currently active
   */
  get active(): boolean {
    return this.isSyncing;
  }
}

export const syncEngine = new SyncEngine();
