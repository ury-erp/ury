/**
 * URY Restaurant POS — Offline IndexedDB Layer
 * Sprint 5 / Task 4.1
 *
 * Pure IndexedDB wrapper — no Vue, no Pinia, no Frappe SDK dependency.
 * The Offline Pinia store (Offline.js) imports this as a singleton.
 *
 * Database: ury_pos_offline  version: 1
 *
 * Object stores:
 * ┌─────────────────┬──────────────────────────────────────────────────────┐
 * │ pending_orders  │ Full sync_order payloads waiting to be sent.         │
 * │                 │ keyPath: local_id (autoIncrement)                    │
 * │                 │ indexes: by_status, by_queued_at                     │
 * ├─────────────────┼──────────────────────────────────────────────────────┤
 * │ cached_menu     │ getRestaurantMenu() responses keyed by cache_key     │
 * │                 │ (branch + "|" + room). keyPath: cache_key            │
 * ├─────────────────┼──────────────────────────────────────────────────────┤
 * │ cached_settings │ getPosProfile() responses keyed by branch.           │
 * │                 │ keyPath: branch                                      │
 * └─────────────────┴──────────────────────────────────────────────────────┘
 *
 * pending_orders record shape:
 * {
 *   local_id          : number       autoIncrement PK
 *   status            : string       'pending' | 'syncing' | 'synced' | 'error'
 *   queued_at         : number       Date.now() timestamp
 *   client_modified_at: number       Date.now() — for Sprint 6 conflict resolution
 *   error             : string|null  last error message if status === 'error'
 *   server_name       : string|null  POS Invoice name once server confirms
 *   payload           : object       full args object passed to sync_order
 * }
 *
 * The payload object mirrors exactly what invoiceData.js builds for
 * the sync_order call:
 * {
 *   table, customer, items, no_of_pax, mode_of_payment,
 *   cashier, owner, waiter, last_modified_time, pos_profile,
 *   invoice, aggregator_id, order_type, last_invoice, comments, room
 * }
 */

const DB_NAME = 'ury_pos_offline';
const DB_VERSION = 1;

class UryOfflineDB {
  constructor() {
    /** @type {IDBDatabase|null} */
    this._db = null;
    /** @type {Promise<IDBDatabase>} */
    this.ready = this._open();
  }

  // ─── Schema ───────────────────────────────────────────────────────────────

  _open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = event.target.result;

        // pending_orders
        if (!db.objectStoreNames.contains('pending_orders')) {
          const store = db.createObjectStore('pending_orders', {
            keyPath: 'local_id',
            autoIncrement: true,
          });
          store.createIndex('by_status', 'status', { unique: false });
          store.createIndex('by_queued_at', 'queued_at', { unique: false });
        }

        // cached_menu — keyed by "branch|room" string
        if (!db.objectStoreNames.contains('cached_menu')) {
          db.createObjectStore('cached_menu', { keyPath: 'cache_key' });
        }

        // cached_settings — keyed by branch name
        if (!db.objectStoreNames.contains('cached_settings')) {
          db.createObjectStore('cached_settings', { keyPath: 'branch' });
        }
      };

      req.onsuccess = (event) => {
        this._db = event.target.result;

        // Surface IDB connection errors after open
        this._db.onerror = (e) => {
          console.error('[URY IDB] Database error:', e.target.error);
        };

        resolve(this._db);
      };

      req.onerror = () => {
        console.error('[URY IDB] Failed to open database:', req.error);
        reject(req.error);
      };

      req.onblocked = () => {
        console.warn('[URY IDB] Open blocked — close other tabs using this app.');
      };
    });
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  /**
   * Wrap an IDBRequest in a Promise.
   * @param {IDBRequest} req
   * @returns {Promise<any>}
   */
  _p(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Open a transaction and return the named object store.
   * @param {string} storeName
   * @param {'readonly'|'readwrite'} mode
   * @returns {IDBObjectStore}
   */
  _store(storeName, mode = 'readonly') {
    return this._db.transaction(storeName, mode).objectStore(storeName);
  }

  // ─── pending_orders ───────────────────────────────────────────────────────

  /**
   * Add a sync_order payload to the pending queue.
   * @param {object} payload  The exact args object from invoiceCreation()
   * @returns {Promise<number>} The assigned local_id
   */
  async enqueueOrder(payload) {
    await this.ready;
    const record = {
      status: 'pending',
      queued_at: Date.now(),
      client_modified_at: Date.now(),
      error: null,
      server_name: null,
      payload,
    };
    return this._p(this._store('pending_orders', 'readwrite').add(record));
  }

  /**
   * Return all records with status === 'pending', sorted oldest-first.
   * @returns {Promise<Array>}
   */
  async getPendingOrders() {
    await this.ready;
    const all = await this._p(
      this._store('pending_orders').index('by_status').getAll('pending')
    );
    // IDB index results are in key order (by status value); sort by queued_at
    return all.sort((a, b) => a.queued_at - b.queued_at);
  }

  /**
   * Return total count of pending records (for badge display).
   * @returns {Promise<number>}
   */
  async getPendingCount() {
    await this.ready;
    return this._p(
      this._store('pending_orders').index('by_status').count('pending')
    );
  }

  /**
   * Mark a queued record as 'syncing' before attempting the network call.
   * Prevents double-flush if flush() is called concurrently.
   * @param {number} localId
   * @returns {Promise<void>}
   */
  async markSyncing(localId) {
    await this.ready;
    await this._updateRecord('pending_orders', localId, { status: 'syncing' });
  }

  /**
   * Mark a record as successfully synced and store the server-assigned name.
   * @param {number} localId
   * @param {string} serverName  POS Invoice name returned by sync_order
   * @returns {Promise<void>}
   */
  async markSynced(localId, serverName) {
    await this.ready;
    await this._updateRecord('pending_orders', localId, {
      status: 'synced',
      server_name: serverName,
      error: null,
    });
  }

  /**
   * Mark a record as errored and store the error message for diagnostics.
   * @param {number} localId
   * @param {string} errorMsg
   * @returns {Promise<void>}
   */
  async markError(localId, errorMsg) {
    await this.ready;
    await this._updateRecord('pending_orders', localId, {
      status: 'error',
      error: errorMsg,
    });
  }

  /**
   * Reset a record from 'error' back to 'pending' for manual retry.
   * @param {number} localId
   * @returns {Promise<void>}
   */
  async resetToRetry(localId) {
    await this.ready;
    await this._updateRecord('pending_orders', localId, {
      status: 'pending',
      error: null,
    });
  }

  /**
   * Permanently remove a record (call after successful sync).
   * @param {number} localId
   * @returns {Promise<void>}
   */
  async removeOrder(localId) {
    await this.ready;
    return this._p(
      this._store('pending_orders', 'readwrite').delete(localId)
    );
  }

  /**
   * Internal: read-modify-write a pending_orders record.
   * @param {string} storeName
   * @param {number} key
   * @param {object} patch
   */
  async _updateRecord(storeName, key, patch) {
    const tx = this._db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const record = await this._p(store.get(key));
    if (!record) return;
    Object.assign(record, patch);
    return this._p(store.put(record));
  }

  // ─── cached_menu ──────────────────────────────────────────────────────────

  /**
   * Persist a getRestaurantMenu() response.
   * @param {string} branch
   * @param {string|null} room   Pass null or '' for cashier-side (no room)
   * @param {object} data        The result.message from the API call
   * @returns {Promise<void>}
   */
  async setMenuCache(branch, room, data) {
    await this.ready;
    const cache_key = _menuKey(branch, room);
    return this._p(
      this._store('cached_menu', 'readwrite').put({
        cache_key,
        branch,
        room: room || null,
        data,
        cached_at: Date.now(),
      })
    );
  }

  /**
   * Retrieve a cached menu, or null if not cached.
   * @param {string} branch
   * @param {string|null} room
   * @returns {Promise<object|null>}
   */
  async getMenuCache(branch, room) {
    await this.ready;
    const record = await this._p(
      this._store('cached_menu').get(_menuKey(branch, room))
    );
    return record?.data ?? null;
  }

  // ─── cached_settings ──────────────────────────────────────────────────────

  /**
   * Persist a getPosProfile() response.
   * @param {string} branch
   * @param {object} data  The result.message from getPosProfile
   * @returns {Promise<void>}
   */
  async setSettingsCache(branch, data) {
    await this.ready;
    return this._p(
      this._store('cached_settings', 'readwrite').put({
        branch,
        data,
        cached_at: Date.now(),
      })
    );
  }

  /**
   * Retrieve cached settings, or null if not cached.
   * @param {string} branch
   * @returns {Promise<object|null>}
   */
  async getSettingsCache(branch) {
    await this.ready;
    const record = await this._p(
      this._store('cached_settings').get(branch)
    );
    return record?.data ?? null;
  }

  // ─── Diagnostics ──────────────────────────────────────────────────────────

  /**
   * Return a summary of queue state — used by OfflineBar.vue.
   * @returns {Promise<{pending: number, error: number}>}
   */
  async getQueueSummary() {
    await this.ready;
    const [pending, errored] = await Promise.all([
      this._p(this._store('pending_orders').index('by_status').count('pending')),
      this._p(this._store('pending_orders').index('by_status').count('error')),
    ]);
    return { pending, error: errored };
  }

  /**
   * Wipe all pending_orders — useful for testing and for a manual
   * "discard offline changes" action (future UI).
   * @returns {Promise<void>}
   */
  async clearPendingOrders() {
    await this.ready;
    return this._p(
      this._store('pending_orders', 'readwrite').clear()
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Stable cache key for a branch+room pair.
 * @param {string} branch
 * @param {string|null} room
 * @returns {string}
 */
function _menuKey(branch, room) {
  return `${branch}|${room || ''}`;
}

// ─── Singleton export ─────────────────────────────────────────────────────────

/**
 * Single shared instance used by the Offline Pinia store.
 * Import and await `offlineDB.ready` before any operation, or call
 * methods directly — each method awaits `this.ready` internally.
 */
// Named class export — used by unit tests to create isolated instances
// (each test gets a fresh UryOfflineDB backed by a reset fake-indexeddb).
export { UryOfflineDB };

export const offlineDB = new UryOfflineDB();
export default offlineDB;

/**
 * Testing helper — resets the singleton's IDB connection to a freshly opened
 * database. Call this in beforeEach() in Offline.test.js after setup.js has
 * replaced globalThis.indexedDB with a new IDBFactory instance.
 *
 * NOT imported or called in production code.
 */
export function _resetOfflineDBForTesting() {
  offlineDB._db = null;
  offlineDB.ready = offlineDB._open();
}
