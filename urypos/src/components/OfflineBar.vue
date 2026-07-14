<template>
  <!--
    OfflineBar.vue — Sprint 5 / Task 4.1
    Fixed banner rendered directly below the nav header when offline or syncing.
    Sits at z-30 (above header z-20, below modals z-50).

    Visibility:
      hidden  → online and no queue
      amber   → offline (working without connection)
      blue    → syncing (flushing queue after reconnect)
      red     → sync completed with errors

    The extra top spacer injected into <body> via :class on a wrapper div
    keeps page content from being obscured when the bar is visible.
  -->

  <!-- Spacer: pushes page content down by bar height when bar is visible -->
  <div :class="barVisible ? 'h-9' : 'h-0'" class="transition-all duration-200" />

  <Transition name="slide-down">
    <div
      v-if="barVisible"
      class="fixed left-0 right-0 top-16 z-30 flex h-9 items-center justify-between px-4 text-sm font-medium shadow-sm sm:top-20"
      :class="barClasses"
      role="status"
      aria-live="polite"
    >
      <!-- Left: icon + message -->
      <div class="flex items-center gap-2">
        <!-- Offline icon -->
        <svg
          v-if="offline.statusClass === 'offline'"
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M3 3l18 18M9.879 9.879A3 3 0 0012 9m0 0a3 3 0 012.121.879M12 9v.01"
          />
        </svg>

        <!-- Syncing spinner -->
        <svg
          v-else-if="offline.statusClass === 'syncing'"
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4 flex-shrink-0 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>

        <!-- Error icon -->
        <svg
          v-else-if="offline.statusClass === 'error'"
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>

        <span>{{ statusMessage }}</span>

        <!-- Queue depth badge — shown when there are pending orders -->
        <span
          v-if="offline.pendingCount > 0"
          class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
          :class="badgeClasses"
        >
          {{ offline.pendingCount }} queued
        </span>
      </div>

      <!-- Right: action button(s) -->
      <div class="flex items-center gap-3">
        <!-- Retry button — only shown when there are errored records -->
        <button
          v-if="offline.errorCount > 0 && offline.isOnline && !offline.isSyncing"
          class="rounded px-2 py-0.5 text-xs font-semibold underline hover:no-underline focus:outline-none"
          :class="retryClasses"
          @click="retryErrors"
          type="button"
        >
          Retry {{ offline.errorCount }} failed
        </button>

        <!-- Last sync result — shown briefly after a flush completes -->
        <span
          v-if="showLastResult"
          class="text-xs opacity-80"
        >
          {{ lastResultText }}
        </span>
      </div>
    </div>
  </Transition>
</template>

<script>
import { useOfflineStore } from '@/stores/Offline.js';
import { offlineDB } from '@/stores/OfflineDB.js';

export default {
  name: 'OfflineBar',

  setup() {
    const offline = useOfflineStore();
    return { offline };
  },

  data() {
    return {
      /**
       * Controls whether the last sync result text is shown.
       * Auto-hides after 4 seconds.
       */
      showLastResult: false,
      _lastResultTimer: null,
    };
  },

  computed: {
    /** The bar is visible whenever we're not cleanly online with empty queue */
    barVisible() {
      return (
        !this.offline.isOnline ||
        this.offline.isSyncing ||
        this.offline.hasQueue
      );
    },

    /** Background + text colour classes driven by statusClass */
    barClasses() {
      switch (this.offline.statusClass) {
        case 'syncing':
          return 'bg-blue-500 text-white';
        case 'error':
          return 'bg-red-500 text-white';
        case 'offline':
        default:
          return 'bg-amber-400 text-gray-900';
      }
    },

    /** Badge classes — contrast-friendly against bar background */
    badgeClasses() {
      switch (this.offline.statusClass) {
        case 'syncing':
          return 'bg-blue-700 text-white';
        case 'error':
          return 'bg-red-700 text-white';
        default:
          return 'bg-amber-600 text-white';
      }
    },

    /** Retry button classes */
    retryClasses() {
      return 'text-white';
    },

    /** Human-readable status message */
    statusMessage() {
      switch (this.offline.statusClass) {
        case 'syncing':
          return 'Syncing changes…';
        case 'error':
          return `${this.offline.errorCount} order${this.offline.errorCount !== 1 ? 's' : ''} failed to sync`;
        case 'offline':
          return this.offline.pendingCount > 0
            ? `Offline — ${this.offline.pendingCount} change${this.offline.pendingCount !== 1 ? 's' : ''} queued`
            : 'Working offline — changes will sync when reconnected';
        default:
          // online with pending count > 0 (rare — flushing in progress)
          return 'Reconnected — syncing queued changes…';
      }
    },

    /** Summary text shown for 4 seconds after a flush completes */
    lastResultText() {
      if (!this.offline.lastSyncResult) return '';
      const { success, errors } = this.offline.lastSyncResult;
      if (errors === 0) return `✓ ${success} order${success !== 1 ? 's' : ''} synced`;
      return `✓ ${success} synced · ${errors} failed`;
    },
  },

  watch: {
    /**
     * Watch lastSyncResult — show the result text for 4 seconds whenever
     * a flush completes (result object is replaced with a new one).
     */
    'offline.lastSyncResult'(newVal) {
      if (!newVal) return;
      this.showLastResult = true;
      clearTimeout(this._lastResultTimer);
      this._lastResultTimer = setTimeout(() => {
        this.showLastResult = false;
      }, 4000);
    },
  },

  methods: {
    /**
     * Reset all errored records back to 'pending' and trigger a flush.
     * Bound to the "Retry N failed" button.
     */
    async retryErrors() {
      // Fetch all errored records from IDB and reset them to 'pending'
      try {
        const summary = await offlineDB.getQueueSummary();
        if (summary.error === 0) return;

        // There is no bulk-reset method — iterate via internal store refresh
        // by calling resetToRetry on each errored record.
        // We reach into IDB directly here since Offline.js doesn't expose
        // a retry-all action (keeping the store focused on the happy path).
        const db = await offlineDB.ready;
        const tx = db.transaction('pending_orders', 'readwrite');
        const store = tx.objectStore('pending_orders');
        const index = store.index('by_status');
        const erroredRecords = await new Promise((res, rej) => {
          const req = index.getAll('error');
          req.onsuccess = () => res(req.result);
          req.onerror = () => rej(req.error);
        });

        for (const record of erroredRecords) {
          await offlineDB.resetToRetry(record.local_id);
        }
      } catch (err) {
        console.error('[OfflineBar] retryErrors failed to reset records:', err);
        return;
      }

      // Now flush
      await this.offline.flush();
    },
  },

  beforeUnmount() {
    clearTimeout(this._lastResultTimer);
  },
};
</script>

<style scoped>
/* Slide-down transition for bar appear/disappear */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

.slide-down-enter-to,
.slide-down-leave-from {
  transform: translateY(0);
  opacity: 1;
}
</style>
