/**
 * URY Restaurant POS — Offline Pinia Store
 * Sprint 5 / Task 4.1 + 4.2
 *
 * Responsibilities:
 *   1. Track online/offline state reactively (isOnline, queueDepth, isSyncing)
 *   2. Expose enqueueOrder(payload) — called by invoiceData.js instead of
 *      the direct frappe.call when offline
 *   3. Expose flush() — drains pending_orders oldest-first when back online
 *   4. Cache menu and settings to IDB after successful API calls
 *   5. Register the SW Background Sync tag and listen for URY_SYNC_FLUSH
 *      messages from the service worker
 *
 * Usage in invoiceData.js (File 6):
 *   import { useOfflineStore } from '@/stores/Offline.js'
 *   const offline = useOfflineStore()
 *   ...
 *   if (!navigator.onLine) {
 *     return offline.enqueueOrder(payload)
 *   }
 *
 * This store deliberately does NOT import invoiceData or any other store
 * that imports it, to avoid circular Pinia store dependencies. The flush()
 * method receives the frappe call instance as a parameter from the caller.
 */

import { defineStore } from 'pinia';
import { offlineDB } from './OfflineDB.js';
import frappe from './frappeSdk.js';

export const useOfflineStore = defineStore('offline', {
  state: () => ({
    /** True when navigator.onLine and last API call succeeded */
    isOnline: navigator.onLine,

    /** Number of sync_order payloads waiting to be sent */
    pendingCount: 0,

    /** Number of records that previously failed and need attention */
    errorCount: 0,

    /** True while flush() is running — prevents concurrent flushes */
    isSyncing: false,

    /** Last flush result for display in OfflineBar */
    lastSyncResult: null, // null | { success: number, errors: number, at: number }

    /** Internal frappe.call() instance — set once in init() */
    _call: null,
  }),

  getters: {
    /** Total items in queue (pending + errored) for badge display */
    totalQueued: (state) => state.pendingCount + state.errorCount,

    /** True if there are queued items the user should know about */
    hasQueue: (state) => state.pendingCount > 0 || state.errorCount > 0,

    /** CSS-friendly status string for OfflineBar.vue */
    statusClass: (state) => {
      if (state.isSyncing) return 'syncing';
      if (state.errorCount > 0) return 'error';
      if (!state.isOnline) return 'offline';
      return 'online';
    },
  },

  actions: {
    // ─── Initialisation ─────────────────────────────────────────────────────

    /**
     * Call once from main.js after createPinia().
     * Sets up network listeners, SW message listener, and refreshes
     * the queue depth from IDB.
     */
    async init() {
      this._call = frappe.call();

      // Sync initial online state with the real browser value
      this.isOnline = navigator.onLine;

      // Refresh badge counts from IDB (in case of page reload mid-queue)
      await this._refreshCounts();

      // Network event listeners
      window.addEventListener('online', this._handleOnline.bind(this));
      window.addEventListener('offline', this._handleOffline.bind(this));

      // Listen for flush signals from the service worker
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener(
          'message',
          this._handleSWMessage.bind(this)
        );
      }
    },

    // ─── Network event handlers ──────────────────────────────────────────────

    async _handleOnline() {
      this.isOnline = true;
      await this._refreshCounts();

      // Tell the SW so it can broadcast to other tabs
      this._notifySW('URY_ONLINE');

      // Try to flush any queued orders
      if (this.pendingCount > 0) {
        await this.flush();
      }
    },

    _handleOffline() {
      this.isOnline = false;
    },

    _handleSWMessage(event) {
      if (event.data?.type === 'URY_SYNC_FLUSH') {
        // SW signalled that connectivity is restored — flush the queue.
        // Check online first: the SW may broadcast slightly before
        // navigator.onLine reflects the change.
        if (navigator.onLine && !this.isSyncing) {
          this.flush();
        }
      }
    },

    _notifySW(type) {
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type });
      }
    },

    // ─── Queue operations ────────────────────────────────────────────────────

    /**
     * Persist a sync_order payload to IDB when offline.
     * Returns a stub response shaped like a successful frappe.call result
     * so callers in invoiceData.js don't need extra error handling.
     *
     * @param {object} payload  The args object from invoiceCreation()
     * @returns {Promise<object>} Stub { message: { name: null, status: 'Queued', ... } }
     */
    async enqueueOrder(payload) {
      const localId = await offlineDB.enqueueOrder(payload);
      await this._refreshCounts();

      // Register a Background Sync tag so the SW can flush when the
      // browser regains connectivity in the background.
      this._registerBackgroundSync();

      return {
        message: {
          name: null,
          status: 'Queued',
          grand_total: null,
          modified: null,
          items: payload.items || [],
          _offline: true,
          _local_id: localId,
        },
      };
    },

    /**
     * Drain all pending_orders oldest-first.
     * Each record is sent via sync_order; on success it is removed from IDB;
     * on failure it is marked 'error' and the flush continues.
     *
     * Called by:
     *   - _handleOnline()
     *   - _handleSWMessage() on URY_SYNC_FLUSH
     *   - OfflineBar.vue retry button (future)
     *
     * @returns {Promise<{success: number, errors: number}>}
     */
    async flush() {
      if (this.isSyncing) return { success: 0, errors: 0 };
      if (!navigator.onLine) return { success: 0, errors: 0 };

      const pending = await offlineDB.getPendingOrders();
      if (pending.length === 0) return { success: 0, errors: 0 };

      this.isSyncing = true;
      let success = 0;
      let errors = 0;

      for (const record of pending) {
        // Guard: skip records already being synced by a concurrent flush
        if (record.status === 'syncing') continue;

        try {
          await offlineDB.markSyncing(record.local_id);

          const response = await this._callSyncOrder(record.payload);

          // sync_order returns the POS Invoice as_dict() or { status: 'Failure' }
          if (response?.message?.status === 'Failure') {
            throw new Error(response.message._error_message || 'Server returned Failure');
          }

          const serverName = response?.message?.name ?? null;
          await offlineDB.markSynced(record.local_id, serverName);
          await offlineDB.removeOrder(record.local_id);
          success++;
        } catch (err) {
          const msg = err?.message ?? String(err);
          console.error('[URY Offline] flush error for local_id', record.local_id, msg);
          await offlineDB.markError(record.local_id, msg);
          errors++;
        }
      }

      this.isSyncing = false;
      await this._refreshCounts();

      this.lastSyncResult = { success, errors, at: Date.now() };

      if (success > 0) {
        // Trigger a table status refresh so occupied/free indicators update.
        // We import lazily here to avoid a circular store dependency.
        try {
          const { useTableStore } = await import('./Table.js');
          useTableStore().fetchTable();
        } catch {
          // Non-fatal — table colours will refresh on next manual navigation
        }
      }

      return { success, errors };
    },

    // ─── Frappe call wrapper ─────────────────────────────────────────────────

    /**
     * Execute a sync_order call using the frappe-js-sdk call() instance.
     * Returns the raw response object.
     * @param {object} payload
     * @returns {Promise<object>}
     */
    _callSyncOrder(payload) {
      return new Promise((resolve, reject) => {
        this._call
          .post('ury.ury.doctype.ury_order.ury_order.sync_order', payload)
          .then(resolve)
          .catch(reject);
      });
    },

    // ─── Menu cache helpers ──────────────────────────────────────────────────

    /**
     * Persist a getRestaurantMenu() result to IDB.
     * Called from Table.js after a successful getMenu() response.
     *
     * @param {string} branch
     * @param {string|null} room
     * @param {object} data  result.message from getRestaurantMenu
     */
    async cacheMenu(branch, room, data) {
      try {
        await offlineDB.setMenuCache(branch, room, data);
      } catch (err) {
        console.warn('[URY Offline] cacheMenu failed:', err);
      }
    },

    /**
     * Retrieve cached menu or null.
     * @param {string} branch
     * @param {string|null} room
     * @returns {Promise<object|null>}
     */
    async getCachedMenu(branch, room) {
      try {
        return await offlineDB.getMenuCache(branch, room);
      } catch {
        return null;
      }
    },

    // ─── Settings cache helpers ───────────────────────────────────────────────

    /**
     * Persist a getPosProfile() result to IDB.
     * Called from invoiceData.js after a successful fetchInvoiceDetails().
     *
     * @param {string} branch
     * @param {object} data  result.message from getPosProfile
     */
    async cacheSettings(branch, data) {
      try {
        await offlineDB.setSettingsCache(branch, data);
      } catch (err) {
        console.warn('[URY Offline] cacheSettings failed:', err);
      }
    },

    /**
     * Retrieve cached settings or null.
     * @param {string} branch
     * @returns {Promise<object|null>}
     */
    async getCachedSettings(branch) {
      try {
        return await offlineDB.getSettingsCache(branch);
      } catch {
        return null;
      }
    },

    // ─── Internal helpers ────────────────────────────────────────────────────

    /**
     * Refresh pendingCount and errorCount from IDB.
     * Called after any IDB write and on init.
     */
    async _refreshCounts() {
      try {
        const summary = await offlineDB.getQueueSummary();
        this.pendingCount = summary.pending;
        this.errorCount = summary.error;
      } catch (err) {
        console.warn('[URY Offline] _refreshCounts failed:', err);
      }
    },

    /**
     * Request a Background Sync registration so the SW can flush
     * even when all tabs are in the background.
     * Fails silently if the API is not supported.
     */
    async _registerBackgroundSync() {
      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready;
          if ('sync' in reg) {
            await reg.sync.register('ury-pos-sync');
          }
        }
      } catch {
        // Background Sync not supported — window 'online' event is fallback
      }
    },
  },
});
