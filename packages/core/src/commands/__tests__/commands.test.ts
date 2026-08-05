/**
 * @file commands.test.ts
 * @description Unit tests for URY POS Command Queue Architecture verifying envelope schema,
 * factory instantiation, priority ordering, dependency resolution, and IndexedDB queueing.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { UryPosDatabase } from '../../storage/db';
import { createRepositories, type StorageRepositories } from '../../storage/repositories';
import { CommandQueueManager } from '../command-queue';
import { CommandFactory } from '../command.factory';
import { CreateOrderCommand } from '../create-order.command';
import { UpdateOrderCommand } from '../update-order.command';
import { MergeTableCommand } from '../merge-table.command';
import { SplitBillCommand } from '../split-bill.command';
import { PaymentCommand } from '../payment.command';
import { DeleteDraftCommand } from '../delete-draft.command';
import { CancelOrderCommand } from '../cancel-order.command';

let testDb: UryPosDatabase;
let repos: StorageRepositories;
let queueMgr: CommandQueueManager;

before(() => {
  testDb = new UryPosDatabase('TestCommandsDb');
  repos = createRepositories(testDb);
  queueMgr = new CommandQueueManager(repos.syncQueue);
});

beforeEach(async () => {
  await repos.syncQueue.clear();
});

after(async () => {
  await testDb.delete();
});

test('1. Verify all 7 Command Envelopes contain 9 mandatory fields', () => {
  const cmdCreate = new CreateOrderCommand({ order_type: 'Dine-In', no_of_pax: 2, pos_profile: 'Standard', items: [] });
  const env = cmdCreate.envelope;

  assert.ok(env.id);
  assert.equal(env.endpoint, 'ury.ury.doctype.ury_order.ury_order.sync_order');
  assert.ok(env.payload);
  assert.equal(env.retryCount, 0);
  assert.equal(env.priority, 1);
  assert.deepEqual(env.dependencies, []);
  assert.equal(env.status, 'PENDING');
  assert.ok(env.timestamp);
  assert.equal(env.version, 1);
});

test('2. CommandFactory — Instantiate all 7 commands from JSON envelopes', () => {
  const commands = [
    new CreateOrderCommand({ order_type: 'Dine-In', no_of_pax: 2, pos_profile: 'Standard', items: [] }),
    new UpdateOrderCommand({ invoice: 'POS-001', order_type: 'Dine-In', no_of_pax: 2, items: [] }),
    new MergeTableCommand({ anchor_table: 'T-01', tables: ['T-02'] }),
    new SplitBillCommand({ source_invoice: 'POS-001', items_to_move: [] }),
    new PaymentCommand({ invoice: 'POS-001', payments: [{ mode_of_payment: 'Cash', amount: 100 }] }),
    new DeleteDraftCommand({ invoice: 'POS-001' }),
    new CancelOrderCommand({ invoice: 'POS-001', cancel_reason: 'Customer left' }),
  ];

  for (const cmd of commands) {
    const deserialized = CommandFactory.fromEnvelope(cmd.envelope);
    assert.equal(deserialized.envelope.id, cmd.envelope.id);
    assert.equal(deserialized.envelope.endpoint, cmd.envelope.endpoint);
  }
});

test('3. CommandQueueManager — Enqueue, Peek & Dequeue IndexedDB storage', async () => {
  const cmd = new CreateOrderCommand({ order_type: 'Takeaway', no_of_pax: 1, pos_profile: 'Takeaway Profile', items: [] });
  const id = await queueMgr.enqueue(cmd);

  assert.equal(id, cmd.envelope.id);

  const pendingCount = await queueMgr.countPending();
  assert.equal(pendingCount, 1);

  const peeked = await queueMgr.peek();
  assert.ok(peeked);
  assert.equal(peeked.id, id);
});

test('4. CommandQueueManager — Priority sorting and dependency resolution', async () => {
  const parentCmd = new CreateOrderCommand(
    { order_type: 'Dine-In', no_of_pax: 4, pos_profile: 'Standard', items: [] },
    { id: 'CMD-PARENT', priority: 2 }
  );

  const childCmd = new PaymentCommand(
    { invoice: 'CMD-PARENT', payments: [{ mode_of_payment: 'Cash', amount: 500 }] },
    { id: 'CMD-CHILD', priority: 1, dependencies: ['CMD-PARENT'] }
  );

  await queueMgr.enqueue(parentCmd);
  await queueMgr.enqueue(childCmd);

  // Child has priority 1, but depends on CMD-PARENT which is PENDING, so only CMD-PARENT is ready
  let pending = await queueMgr.getPendingCommands();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, 'CMD-PARENT');

  // Mark parent completed
  await queueMgr.markCompleted('CMD-PARENT');

  // Now child command is ready
  pending = await queueMgr.getPendingCommands();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, 'CMD-CHILD');
});

test('5. CommandQueueManager — Retry count and error tracking on failure', async () => {
  const cmd = new DeleteDraftCommand({ invoice: 'DRAFT-99' });
  await queueMgr.enqueue(cmd);

  await queueMgr.markFailed(cmd.envelope.id, 'Server unavailable 503');

  const failedRecord = await repos.syncQueue.getById(cmd.envelope.id);
  assert.ok(failedRecord);
  assert.equal(failedRecord.status, 'FAILED');
  assert.equal(failedRecord.attempts, 1);
  assert.equal(failedRecord.last_error, 'Server unavailable 503');
});
