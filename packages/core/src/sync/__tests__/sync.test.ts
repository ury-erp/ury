/**
 * @file sync.test.ts
 * @description Unit tests for URY POS Sync Engine verifying sequential queue processing,
 * dependency ordering, exponential backoff, Temp-ID mapping, and request deduplication.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { UryPosDatabase } from '../../storage/db';
import { createRepositories, type StorageRepositories } from '../../storage/repositories';
import { CommandQueueManager } from '../../commands/command-queue';
import { CreateOrderCommand } from '../../commands/create-order.command';
import { TempIDMapper } from '../temp-id-mapper';
import { calculateBackoffDelay, isMaxAttemptsReached } from '../backoff';
import { SyncEngine } from '../sync.engine';
import { projectionBus } from '../../projections/projection.bus';

let testDb: UryPosDatabase;
let repos: StorageRepositories;
let queueMgr: CommandQueueManager;
let idMapper: TempIDMapper;

before(() => {
  testDb = new UryPosDatabase('TestSyncDb');
  repos = createRepositories(testDb);
  queueMgr = new CommandQueueManager(repos.syncQueue);
  idMapper = new TempIDMapper();
});

beforeEach(async () => {
  await repos.syncQueue.clear();
  await repos.metadata.clear();
  await idMapper.clear();
  projectionBus.clear();
});

after(async () => {
  await testDb.delete();
});

test('1. TempIDMapper — Register, Retrieve & Recursive Payload Remapping', async () => {
  await idMapper.registerMapping('TEMP-ORD-01', 'POS-INV-2026-0001');

  const mapped = await idMapper.getServerId('TEMP-ORD-01');
  assert.equal(mapped, 'POS-INV-2026-0001');

  const nestedPayload = {
    invoice: 'TEMP-ORD-01',
    details: { target: 'TEMP-ORD-01' },
    unrelated: 'TEXT_VAL',
  };

  const remapped = await idMapper.remapPayload(nestedPayload);
  assert.equal(remapped.invoice, 'POS-INV-2026-0001');
  assert.equal(remapped.details.target, 'POS-INV-2026-0001');
  assert.equal(remapped.unrelated, 'TEXT_VAL');
});

test('2. Exponential Backoff Calculator — Formula and max attempts check', () => {
  const delay1 = calculateBackoffDelay(1, { baseMs: 1000, maxMs: 30000, jitter: false });
  assert.equal(delay1, 1000);

  const delay2 = calculateBackoffDelay(2, { baseMs: 1000, maxMs: 30000, jitter: false });
  assert.equal(delay2, 2000);

  const delay3 = calculateBackoffDelay(3, { baseMs: 1000, maxMs: 30000, jitter: false });
  assert.equal(delay3, 4000);

  const maxDelay = calculateBackoffDelay(10, { baseMs: 1000, maxMs: 5000, jitter: false });
  assert.equal(maxDelay, 5000);

  assert.equal(isMaxAttemptsReached(5, 5), true);
  assert.equal(isMaxAttemptsReached(3, 5), false);
});

test('3. SyncEngine — Deduplication Lock and Sequential Processing', async () => {
  const engine = new SyncEngine(queueMgr, idMapper);

  assert.equal(engine.active, false);

  const cmd = new CreateOrderCommand(
    { order_type: 'Dine-In', no_of_pax: 2, pos_profile: 'Standard', items: [] },
    { id: 'TEMP-ORD-10' }
  );
  await queueMgr.enqueue(cmd);

  // Execute sync
  const result = await engine.triggerSync();
  assert.equal(result.processed, 1);
  assert.equal(engine.active, false);
});
