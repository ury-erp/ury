/**
 * @file command.interface.ts
 * @description Core types and base interfaces for URY POS Command Queue Architecture.
 */

export type CommandStatus = 'PENDING' | 'SYNCING' | 'FAILED' | 'COMPLETED';

/**
 * 9 Mandatory Fields on CommandEnvelope as specified by system requirements
 */
export type OperationType =
  | 'CREATE_ORDER'
  | 'UPDATE_ORDER'
  | 'DELETE_ORDER'
  | 'PAY_ORDER'
  | 'PRINT_ORDER'
  | 'MERGE_TABLE'
  | 'MERGE_BILLS'
  | 'TRANSFER_TABLE'
  | 'SPLIT_BILL'
  | 'CREATE_CUSTOMER'
  | 'UPDATE_CUSTOMER'
  | 'AGGREGATOR_ORDER';

export interface CommandEnvelope<P = any> {
  command_id?: string; // matches old 'id'
  client_request_id?: string;
  operation_type?: OperationType;
  entity_type?: string;
  entity_id?: string;
  temporary_id?: string | null;
  server_id?: string | null;
  dependency_ids?: string[]; // matches old 'dependencies'
  /** Idempotency key stored on the envelope, not in the API payload */
  idempotency_key?: string;
  payload: P;
  payload_hash?: string;
  retry_count?: number; // matches old 'retryCount'
  status: CommandStatus;
  created_at?: string; // matches old 'timestamp'
  updated_at?: string;
  version: number;
  actionName?: string;
  lastError?: string | null;

  // Compatibility mapping for existing references
  id: string;
  endpoint: string;
  priority: number;
  retryCount?: number;
  dependencies?: string[];
  timestamp?: string;
}

export interface ICommand<P = any> {
  readonly envelope: CommandEnvelope<P>;
  toEnvelope(): CommandEnvelope<P>;
}

export abstract class BaseCommand<P = any> implements ICommand<P> {
  readonly envelope: CommandEnvelope<P>;

  constructor(envelope: CommandEnvelope<P>) {
    this.envelope = envelope;
  }

  toEnvelope(): CommandEnvelope<P> {
    return this.envelope;
  }
}
