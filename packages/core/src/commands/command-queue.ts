/**
 * @file command-queue.ts
 * @description Persistent Command Queue Manager wrapping IndexedDB storage.
 */

import { repositories, type SyncQueueRepository } from '../storage';
import type { CommandEnvelope, ICommand } from './command.interface';

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

    await this.queueRepo.put({
      id: env.id,
      action: env.actionName || env.endpoint,
      endpoint: env.endpoint,
      payload: env.payload as Record<string, unknown>,
      timestamp: env.timestamp,
      status: env.status,
      attempts: env.retryCount,
      priority: env.priority,
      last_error: env.lastError || null,
      dependencies: env.dependencies || [],
    } as any);

    return env.id;
  }

  /**
   * Returns all pending commands ready for processing, sorted by priority and dependencies
   */
  async getPendingCommands(): Promise<CommandEnvelope[]> {
    const rawEntities = await this.queueRepo.findPending();

    const envelopes: CommandEnvelope[] = rawEntities.map(entity => ({
      id: entity.id,
      endpoint: entity.endpoint,
      payload: entity.payload,
      retryCount: entity.attempts || 0,
      priority: entity.priority || 1,
      dependencies: (entity as any).dependencies || [],
      status: entity.status as any,
      timestamp: entity.timestamp,
      version: (entity as any).version || 1,
      actionName: entity.action,
      lastError: entity.last_error || null,
    }));

    // Filter out commands whose prerequisite dependencies have not completed yet
    const completedIds = new Set(
      (await this.queueRepo.getAll())
        .filter(e => e.status === 'COMPLETED')
        .map(e => e.id)
    );

    const readyEnvelopes = envelopes.filter(env => {
      if (!env.dependencies || env.dependencies.length === 0) return true;
      return env.dependencies.every(depId => completedIds.has(depId));
    });

    return readyEnvelopes.sort((a, b) => a.priority - b.priority || a.timestamp.localeCompare(b.timestamp));
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
      existing.last_error = error;
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
        await this.queueRepo.delete(item.id);
      }
    }
  }
}

export const commandQueue = new CommandQueueManager();
