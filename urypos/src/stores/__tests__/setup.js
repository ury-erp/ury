/**
 * Global Vitest setup — runs before every test file.
 *
 * Installs fake-indexeddb into globalThis so OfflineDB.js can call
 * indexedDB.open() in a jsdom environment without a real browser.
 *
 * fake-indexeddb implements the full IDBFactory / IDBDatabase / IDBTransaction
 * / IDBObjectStore / IDBIndex / IDBRequest / IDBCursor spec surface that
 * OfflineDB.js uses.
 */

import 'fake-indexeddb/auto';

/**
 * Reset the fake IDB state between test files so each test file starts with
 * a clean database — prevents cross-file contamination when tests share the
 * same DB_NAME constant.
 *
 * fake-indexeddb/auto installs a fresh IDBFactory on import, so re-importing
 * it in beforeEach would create a new factory instance. Instead we use the
 * global reset hook provided by fake-indexeddb >= 4.x.
 */
import { IDBFactory } from 'fake-indexeddb';

beforeEach(() => {
  // Replace the global indexedDB with a fresh factory instance before each
  // test so every test gets an empty database, regardless of test order.
  globalThis.indexedDB = new IDBFactory();
});

/**
 * Suppress console.warn / console.error noise from Pinia and Vue during
 * tests that deliberately trigger error paths. Remove these if you want to
 * see all output.
 */
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
