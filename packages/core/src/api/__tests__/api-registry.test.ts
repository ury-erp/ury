/**
 * @file api-registry.test.ts
 * @description Unit tests for ApiRegistry module.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiRegistry, ApiRegistry } from '../api-registry';

test('1. ApiRegistry — Lookup registered production endpoints', () => {
  const customerSearchConfig = apiRegistry.get('SEARCH_CUSTOMER');
  assert.equal(customerSearchConfig.url, 'api/resource/Customer');
  assert.equal(customerSearchConfig.category, 'Search');
  assert.equal(customerSearchConfig.cacheStrategy, 'NetworkFirst');
  assert.equal(customerSearchConfig.offlineCapability, true);

  const syncOrderUrl = apiRegistry.getUrl('SYNC_ORDER');
  assert.equal(syncOrderUrl, 'ury.ury.doctype.ury_order.ury_order.sync_order');
});

test('2. ApiRegistry — Register custom endpoint dynamically', () => {
  const customRegistry = new ApiRegistry();
  customRegistry.register({
    endpointKey: 'CUSTOM_TEST_ENDPOINT',
    url: 'ury.ury_pos.api.custom_test',
    httpMethod: 'POST',
    category: 'Command',
    cacheStrategy: 'NoCache',
    offlineCapability: true,
    syncBehavior: 'QUEUED',
    timeoutMs: 5000,
    retryPolicy: { maxRetries: 3, backoffBaseMs: 1000 },
    authRequired: true,
    description: 'Custom test endpoint',
  });

  const resolved = customRegistry.get('CUSTOM_TEST_ENDPOINT');
  assert.equal(resolved.url, 'ury.ury_pos.api.custom_test');
  assert.equal(resolved.category, 'Command');
});

test('3. ApiRegistry — Throw error on unregistered endpoint lookup', () => {
  assert.throws(() => {
    apiRegistry.get('NON_EXISTENT_ENDPOINT_KEY');
  }, /is not registered in ApiRegistry/);
});
