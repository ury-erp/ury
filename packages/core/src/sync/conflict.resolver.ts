/**
 * @file conflict.resolver.ts
 * @description Domain Conflict Resolver for URY POS. Detects 11 conflict scenarios
 * and executes resolution strategies (AUTOMATIC, MANUAL, RETRY, ROLLBACK, IGNORE).
 */

import type { CommandEnvelope } from '../commands';
import type { ConflictCode, ConflictResolutionResult } from './conflict.types';
import { repositories, type StorageRepositories } from '../storage';
import { projectionBus } from '../projections';

export class ConflictResolver {
  private repos: StorageRepositories;

  constructor(customRepos?: StorageRepositories) {
    this.repos = customRepos || repositories;
  }

  /**
   * Classifies error traceback string into one of the 11 Conflict Codes
   */
  classifyError(error: any): ConflictCode {
    const msg = (typeof error === 'string' ? error : error?.message || JSON.stringify(error)).toLowerCase();

    if (msg.includes('already occupied') || msg.includes('table occupied')) {
      return 'TABLE_OCCUPIED';
    }
    if (msg.includes('doesnotexisterror') || msg.includes('invoice not found') || msg.includes('not found')) {
      return 'INVOICE_DELETED';
    }
    if (msg.includes('already billed') || msg.includes('already paid') || msg.includes('invoice already billed')) {
      return 'INVOICE_ALREADY_PAID';
    }
    if (msg.includes('cannot merge') || msg.includes('occupied tables cannot be merged') || msg.includes('already merged')) {
      return 'MERGE_FAILED';
    }
    if (msg.includes('cannot split') || msg.includes('split bill failed') || msg.includes('invalid items to move')) {
      return 'SPLIT_FAILED';
    }
    if (msg.includes('payment entry already exists') || msg.includes('duplicate payment') || msg.includes('already submitted')) {
      return 'PAYMENT_DUPLICATED';
    }
    if (msg.includes('permissionerror') || msg.includes('not permitted') || msg.includes('not allowed for billing')) {
      return 'PERMISSION_CHANGED';
    }
    if (msg.includes('sessionexpired') || msg.includes('please log in') || msg.includes('user is not associated')) {
      return 'SESSION_EXPIRED';
    }
    if (msg.includes('item price changed') || msg.includes('item disabled') || msg.includes('active menu')) {
      return 'MENU_UPDATED';
    }
    if (msg.includes('customer not found') || msg.includes('customer deleted')) {
      return 'CUSTOMER_DELETED';
    }
    if (msg.includes('role changed') || msg.includes('role updated')) {
      return 'ROLE_CHANGED';
    }

    return 'UNKNOWN_CONFLICT';
  }

  /**
   * Evaluates a command failure and applies the domain resolution strategy
   */
  async resolveConflict(command: CommandEnvelope, error: any): Promise<ConflictResolutionResult> {
    const code = this.classifyError(error);

    switch (code) {
      // 1. Table Already Occupied -> AUTOMATIC
      case 'TABLE_OCCUPIED': {
        return {
          conflictCode: code,
          strategy: 'AUTOMATIC',
          message: `Table ${command.payload?.table || 'assigned'} was occupied. Converted order to Unassigned Takeaway.`,
          shouldRetry: true,
          shouldNotifyUser: true,
          remedyAction: async () => {
            // Detach occupied table, convert order type to Takeaway
            command.payload.table = null;
            command.payload.order_type = 'Takeaway';
            const targetId = command.payload.invoice || command.id;
            if (targetId) {
              const localOrd = await this.repos.orders.getById(targetId);
              if (localOrd) {
                localOrd.table = null;
                localOrd.order_type = 'Takeaway';
                await this.repos.orders.put(localOrd);
              }
            }
            projectionBus.emit('ORDERS_UPDATED');
            projectionBus.emit('TABLES_UPDATED');
          },
        };
      }

      // 2. Invoice Deleted -> ROLLBACK
      case 'INVOICE_DELETED': {
        return {
          conflictCode: code,
          strategy: 'ROLLBACK',
          message: 'Draft Invoice was deleted on server. Removing local draft.',
          shouldRetry: false,
          shouldNotifyUser: true,
          remedyAction: async () => {
            const targetId = command.payload?.invoice || command.id;
            if (targetId) {
              await this.repos.orders.delete(targetId);
            }
            projectionBus.emit('ORDERS_UPDATED');
          },
        };
      }

      // 3. Invoice Already Paid -> IGNORE / ROLLBACK
      case 'INVOICE_ALREADY_PAID': {
        return {
          conflictCode: code,
          strategy: 'IGNORE',
          message: 'Invoice has already been billed on server. Marking order as Paid.',
          shouldRetry: false,
          shouldNotifyUser: false,
          remedyAction: async () => {
            const targetId = command.payload?.invoice || command.id;
            if (targetId) {
              const localOrd = await this.repos.orders.getById(targetId);
              if (localOrd) {
                localOrd.status = 'Paid';
                await this.repos.orders.put(localOrd);
              }
            }
            projectionBus.emit('ORDERS_UPDATED');
          },
        };
      }

      // 4. Merge Failed -> ROLLBACK
      case 'MERGE_FAILED': {
        const isTableMerge =
          command.payload?.anchor_table || command.endpoint?.includes('merge_tables_batch');

        if (isTableMerge) {
          return {
            conflictCode: code,
            strategy: 'ROLLBACK',
            message: 'Table merge failed on server. Reverting table merge linkages.',
            shouldRetry: false,
            shouldNotifyUser: true,
            remedyAction: async () => {
              if (command.payload?.anchor_table) {
                const anchor = await this.repos.tables.getById(command.payload.anchor_table);
                if (anchor) {
                  anchor.merged_with = null;
                  await this.repos.tables.put(anchor);
                }
              }
              projectionBus.emit('TABLES_UPDATED');
            },
          };
        }

        // Bill merge failure: clear the bidirectional merge link on both local orders
        return {
          conflictCode: code,
          strategy: 'ROLLBACK',
          message: 'Bill merge failed on server. Reverting merge linkages.',
          shouldRetry: false,
          shouldNotifyUser: true,
          remedyAction: async () => {
            const primaryId = command.payload?.primary_invoice as string | undefined;
            const secondaryId = command.payload?.secondary_invoice as string | undefined;

            if (primaryId) {
              const primary = await this.repos.orders.getById(primaryId);
              if (primary) {
                primary.custom_merged_pos_invoice = null;
                primary.custom_merged_total = null;
                primary.custom_merged_pos_invoice_details = null;
                primary.updatedAt = new Date().toISOString();
                await this.repos.orders.put(primary);
              }
            }

            if (secondaryId) {
              const secondary = await this.repos.orders.getById(secondaryId);
              if (secondary) {
                secondary.custom_merged_pos_invoice = null;
                secondary.custom_merged_total = null;
                secondary.custom_merged_pos_invoice_details = null;
                secondary.updatedAt = new Date().toISOString();
                await this.repos.orders.put(secondary);
              }
            }

            projectionBus.emit('ORDERS_UPDATED');
          },
        };
      }

      // 5. Split Failed -> MANUAL
      case 'SPLIT_FAILED': {
        return {
          conflictCode: code,
          strategy: 'MANUAL',
          message: 'Bill split failed on server. Cashier action required.',
          shouldRetry: false,
          shouldNotifyUser: true,
        };
      }

      // 6. Payment Duplicated -> IGNORE
      case 'PAYMENT_DUPLICATED': {
        return {
          conflictCode: code,
          strategy: 'IGNORE',
          message: 'Payment was already registered on server.',
          shouldRetry: false,
          shouldNotifyUser: false,
        };
      }

      // 7. Permission Changed -> MANUAL
      case 'PERMISSION_CHANGED': {
        return {
          conflictCode: code,
          strategy: 'MANUAL',
          message: 'User permissions modified. Admin credential authorization required.',
          shouldRetry: false,
          shouldNotifyUser: true,
        };
      }

      // 8. Session Expired -> RETRY
      case 'SESSION_EXPIRED': {
        return {
          conflictCode: code,
          strategy: 'RETRY',
          message: 'Frappe session expired. Re-authenticating session.',
          shouldRetry: true,
          shouldNotifyUser: true,
        };
      }

      // 9. Menu Updated -> AUTOMATIC
      case 'MENU_UPDATED': {
        return {
          conflictCode: code,
          strategy: 'AUTOMATIC',
          message: 'Menu rates updated on server. Re-calculating order total.',
          shouldRetry: true,
          shouldNotifyUser: true,
          remedyAction: async () => {
            projectionBus.emit('MENU_UPDATED');
          },
        };
      }

      // 10. Customer Deleted -> AUTOMATIC
      case 'CUSTOMER_DELETED': {
        return {
          conflictCode: code,
          strategy: 'AUTOMATIC',
          message: 'Assigned customer record deleted on server. Fallback to Guest customer.',
          shouldRetry: true,
          shouldNotifyUser: false,
          remedyAction: async () => {
            command.payload.customer = 'Guest';
          },
        };
      }

      // 11. Role Changed -> MANUAL
      case 'ROLE_CHANGED': {
        return {
          conflictCode: code,
          strategy: 'MANUAL',
          message: 'Cashier user role changed. Refresh session required.',
          shouldRetry: false,
          shouldNotifyUser: true,
        };
      }

      default: {
        return {
          conflictCode: 'UNKNOWN_CONFLICT',
          strategy: 'RETRY',
          message: `Unknown server error: ${error?.message || String(error)}`,
          shouldRetry: true,
          shouldNotifyUser: true,
        };
      }
    }
  }
}

export const conflictResolver = new ConflictResolver();
