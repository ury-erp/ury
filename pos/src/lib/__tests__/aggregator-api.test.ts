import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { call, repositories, projectionBus } from '@ury/core';
import { getAggregators } from '../aggregator-api';

function captureEvents() {
  const events: string[] = [];
  const unsubscribe = projectionBus.subscribe((event) => events.push(event));
  return { events, unsubscribe };
}

beforeEach(async () => {
  await repositories.aggregators.clear();
  projectionBus.clear();
});

test('getAggregators fetches list, caches in IndexedDB, and emits AGGREGATORS_UPDATED', async () => {
  const { events } = captureEvents();

  const originalGet = call.get;
  (call as any).get = async () => ({
    message: [{ customer: 'Swiggy' }, { customer: 'Zomato' }],
  });

  try {
    const result = await getAggregators();

    assert.deepEqual(result, [{ customer: 'Swiggy' }, { customer: 'Zomato' }]);

    const cached = await repositories.aggregators.getAll();
    assert.equal(cached.length, 2);
    assert.ok(cached.some(a => a.customer === 'Swiggy'));
    assert.ok(cached.some(a => a.customer === 'Zomato'));

    assert.ok(events.includes('AGGREGATORS_UPDATED'));
  } finally {
    (call as any).get = originalGet;
  }
});

test('getAggregators falls back to cached list when offline', async () => {
  await repositories.aggregators.putMany([
    { name: 'Swiggy', customer: 'Swiggy', enabled: true },
    { name: 'Zomato', customer: 'Zomato', enabled: true },
  ]);

  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('Network Disconnected');
  };

  try {
    const result = await getAggregators();

    assert.deepEqual(result, [{ customer: 'Swiggy' }, { customer: 'Zomato' }]);
  } finally {
    (call as any).get = originalGet;
  }
});

test('getAggregators throws when offline and cache is empty', async () => {
  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('Network Disconnected');
  };

  try {
    await assert.rejects(getAggregators(), /Network Disconnected/);
  } finally {
    (call as any).get = originalGet;
  }
});
