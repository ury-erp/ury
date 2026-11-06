import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call } from '@ury/core';
import { getAggregators } from '../aggregator-api';

type CallType = typeof call;

function overrideCallGet(fn: CallType['get']): CallType['get'] {
  const originalGet = call.get;
  (call as unknown as { get: CallType['get'] }).get = fn;
  return originalGet;
}

test('getAggregators returns response.message', async () => {
  const restore = overrideCallGet(async () => ({
    message: [{ customer: 'Swiggy' }, { customer: 'Zomato' }],
  }));

  try {
    const result = await getAggregators();

    assert.deepEqual(result, [{ customer: 'Swiggy' }, { customer: 'Zomato' }]);
  } finally {
    overrideCallGet(restore);
  }
});

test('getAggregators propagates errors from call.get', async () => {
  const restore = overrideCallGet(async () => {
    throw new Error('Network Disconnected');
  });

  try {
    await assert.rejects(getAggregators(), /Network Disconnected/);
  } finally {
    overrideCallGet(restore);
  }
});
