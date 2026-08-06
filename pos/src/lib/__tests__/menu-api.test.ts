import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { call, repositories } from '@ury/core';
import { getAggregatorMenu } from '../menu-api';

beforeEach(async () => {
  await repositories.aggregatorItems.clear();
  await repositories.menu.clear();
});

test('online aggregator menu fetch caches items per aggregator in aggregator_items', async () => {
  const originalGet = call.get;
  (call as any).get = async () => ({
    message: [
      { item: 'SZF', item_name: 'Sizzling Arabian Chicken Full', rate: 530, item_image: null },
      { item: 'SZC', item_name: 'Sizzling Arabian Chicken Single', rate: 160, item_image: '/swiggy.jpg' },
    ],
  });

  try {
    const items = await getAggregatorMenu('Swiggy');

    assert.equal(items.length, 2);
    assert.equal(items[0].item, 'SZF');
    assert.equal(items[0].item_name, 'Sizzling Arabian Chicken Full');
    assert.equal(items[0].rate, 530);

    const cached = await repositories.aggregatorItems.findByAggregator('Swiggy');
    assert.equal(cached.length, 2);
    assert.ok(cached.every(i => i.aggregator === 'Swiggy'));
    const cachedIds = cached.map(i => i.id).sort();
    assert.deepEqual(cachedIds, ['Swiggy::SZC', 'Swiggy::SZF']);

    // Aggregator catalog must not pollute the generic restaurant menu store
    const menu = await repositories.menu.getAll();
    assert.equal(menu.length, 0);
  } finally {
    (call as any).get = originalGet;
  }
});

test('offline aggregator menu fallback reads from cached aggregator_items', async () => {
  await repositories.aggregatorItems.putManyByAggregator('Swiggy', [
    { item: 'SZF', item_name: 'Sizzling Arabian Chicken Full', rate: 530, item_image: null },
  ]);

  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('Network Disconnected');
  };

  try {
    const items = await getAggregatorMenu('Swiggy');

    assert.equal(items.length, 1);
    assert.equal(items[0].item, 'SZF');
    assert.equal(items[0].item_name, 'Sizzling Arabian Chicken Full');
    assert.equal(items[0].rate, 530);
    assert.equal(items[0].item_image, null);
    assert.equal(items[0].course, '');
  } finally {
    (call as any).get = originalGet;
  }
});

test('per-aggregator isolation prevents catalog leakage on fallback', async () => {
  await repositories.aggregatorItems.putManyByAggregator('Swiggy', [
    { item: 'SZF', item_name: 'Swiggy Item', rate: 530, item_image: null },
  ]);
  await repositories.aggregatorItems.putManyByAggregator('Zomato', [
    { item: 'BIR', item_name: 'Zomato Item', rate: 250, item_image: null },
  ]);

  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('Network Disconnected');
  };

  try {
    const swiggyItems = await getAggregatorMenu('Swiggy');
    assert.equal(swiggyItems.length, 1);
    assert.equal(swiggyItems[0].item_name, 'Swiggy Item');

    const zomatoItems = await getAggregatorMenu('Zomato');
    assert.equal(zomatoItems.length, 1);
    assert.equal(zomatoItems[0].item_name, 'Zomato Item');
  } finally {
    (call as any).get = originalGet;
  }
});
