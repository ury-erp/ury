import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call } from '@ury/core';
import { getRestaurantMenu, getAggregatorMenu } from '../menu-api';

type MockableCall = typeof call & {
  get: typeof call.get;
};

const mockGet = (handler: typeof call.get) => {
  const originalGet = call.get;
  (call as MockableCall).get = handler;
  return () => {
    (call as MockableCall).get = originalGet;
  };
};

test('getRestaurantMenu calls endpoint and returns items', async () => {
  const restore = mockGet(async (_endpoint: string, params: Record<string, unknown>) => {
    assert.equal(params.pos_profile, 'Test Profile');
    assert.equal(params.room, 'Dining');
    assert.equal(params.order_type, 'Dine In');
    return {
      message: {
        items: [
          { item: 'BIR', item_name: 'Biryani', rate: 250, item_image: null, course: 'Main' },
        ],
      },
    };
  });

  try {
    const items = await getRestaurantMenu('Test Profile', 'Dining', 'Dine In');
    assert.equal(items.length, 1);
    assert.equal(items[0].item, 'BIR');
    assert.equal(items[0].item_name, 'Biryani');
  } finally {
    restore();
  }
});

test('getAggregatorMenu calls endpoint and returns items', async () => {
  const restore = mockGet(async (_endpoint: string, params: Record<string, unknown>) => {
    assert.equal(params.aggregator, 'Swiggy');
    return {
      message: [
        { item: 'SZF', item_name: 'Sizzling Arabian Chicken Full', rate: 530, item_image: null },
        { item: 'SZC', item_name: 'Sizzling Arabian Chicken Single', rate: 160, item_image: '/swiggy.jpg' },
      ],
    };
  });

  try {
    const items = await getAggregatorMenu('Swiggy');
    assert.equal(items.length, 2);
    assert.equal(items[0].item, 'SZF');
    assert.equal(items[0].item_name, 'Sizzling Arabian Chicken Full');
    assert.equal(items[0].rate, 530);
  } finally {
    restore();
  }
});

test('network errors propagate from getAggregatorMenu', async () => {
  const restore = mockGet(async () => {
    throw new Error('Network Disconnected');
  });

  try {
    await assert.rejects(
      () => getAggregatorMenu('Swiggy'),
      /Network Disconnected/
    );
  } finally {
    restore();
  }
});
