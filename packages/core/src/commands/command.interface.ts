/**
 * @file command.interface.ts
 * @description Core types and base interfaces for URY POS Command Queue Architecture.
 */

export type CommandStatus = 'PENDING' | 'SYNCING' | 'FAILED' | 'COMPLETED';

/**
 * 9 Mandatory Fields on CommandEnvelope as specified by system requirements
 */
export interface CommandEnvelope<P = any> {
  /** 1. Unique UUID */
  id: string;
  /** 2. Whitelisted API Endpoint Name */
  endpoint: string;
  /** 3. Command payload object */
  payload: P;
  /** 4. Retry count for failed attempts */
  retryCount: number;
  /** 5. Priority level (1 = Highest) */
  priority: number;
  /** 6. Array of prerequisite command UUIDs */
  dependencies: string[];
  /** 7. Lifecycle execution status */
  status: CommandStatus;
  /** 8. Creation timestamp ISO string */
  timestamp: string;
  /** 9. Command schema version */
  version: number;
  /** Optional action name tag */
  actionName?: string;
  /** Optional last error message */
  lastError?: string | null;
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
