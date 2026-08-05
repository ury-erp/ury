/**
 * @file conflict.types.ts
 * @description Types and Interfaces for URY POS Conflict Resolution Subsystem.
 */

export type ConflictCode =
  | 'TABLE_OCCUPIED'
  | 'INVOICE_DELETED'
  | 'INVOICE_ALREADY_PAID'
  | 'MERGE_FAILED'
  | 'SPLIT_FAILED'
  | 'PAYMENT_DUPLICATED'
  | 'PERMISSION_CHANGED'
  | 'SESSION_EXPIRED'
  | 'MENU_UPDATED'
  | 'CUSTOMER_DELETED'
  | 'ROLE_CHANGED'
  | 'UNKNOWN_CONFLICT';

export type ResolutionStrategy = 'AUTOMATIC' | 'MANUAL' | 'RETRY' | 'ROLLBACK' | 'IGNORE';

export interface ConflictResolutionResult {
  conflictCode: ConflictCode;
  strategy: ResolutionStrategy;
  message: string;
  remedyAction?: () => Promise<void>;
  shouldRetry: boolean;
  shouldNotifyUser: boolean;
}
