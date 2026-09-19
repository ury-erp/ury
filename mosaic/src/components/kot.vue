<template>
  <div class="mx-auto px-4 py-5 md:px-7 md:py-7 mb-16 relative">
    <!-- Alert Modal div start-->
    <div
      v-if="this.showModal"
      class="fixed inset-0 z-50 overflow-y-auto bg-[#241914]/70 backdrop-blur-sm"
    >
      <div class="flex items-center justify-center">
        <div class="w-full rounded-2xl bg-[#fffdf8] p-7 shadow-2xl md:max-w-md border border-[#eadfce]">
          <p
            class="block text-left text-xl font-bold text-[#3f2a20]"
          >
            <span
              class="w-3 h-3 rounded-full inline-block mr-2 bg-[#f05b42]"
            ></span>{{ $t('auth.not_permitted') }}</p>
          <hr class="border-[#eadfce]" />

          <p class="text-left text-base mt-6 font-medium text-[#735d4e]">{{ $t('auth.login_required') }}</p>

          <div class="flex justify">
            <button
              @click="
                this.showModal = false;
                this.redirectToLogin();
              "
              class="mt-8 rounded-xl bg-[#f05b42] px-5 py-2.5 font-bold text-white hover:bg-[#d94c38] shadow-lg"
            >{{ $t('auth.login') }}</button>
          </div>
        </div>
      </div>
    </div>
    <!-- Alert Modal div end-->

    <!--
      Station bar: identity, shift numbers, queue controls and the alert
      settings. Everything that is about the board rather than about one
      ticket lives here, so the cards below stay purely about food.
    -->
    <KitchenToolbar
      :production="production"
      :counts="counts"
      :stats="stats"
      :sound="soundState"
      :filter="filter"
      :sort="sort"
      :connected="socketConnected"
      :fullscreen="isFullscreen"
      :recall-count="recallTickets.length"
      @update:filter="filter = $event"
      @update:sort="sort = $event"
      @toggle-mute="onToggleMute"
      @set-volume="onSetVolume"
      @test-sound="onTestSound"
      @enable-audio="onEnableAudio"
      @toggle-fullscreen="onToggleFullscreen"
      @open-recall="openRecall"
    />

    <!-- Messages from the floor. Mandatory ones take over the screen; the rest
         sit above the board until dismissed. -->
    <KitchenMessages
      v-if="branch"
      :branch="branch"
      :production="production"
      :socket="socketRef"
    />

    <!-- Load failure. Shown ahead of every empty state so a broken feed is
         never reported as a clear kitchen. Any tickets already on screen stay
         where they are; this only replaces the "nothing here" message. -->
    <div v-if="kotsError && stationKots.length === 0 && !loadingKots" class="text-center py-20 animate-fade-in">
      <div class="empty-kitchen-icon">!</div>
      <p class="text-lg font-bold text-[#3f2a20]">{{ $t('kot.load_failed') }}</p>
      <p class="mt-1 text-sm text-[#9a7e6b]">{{ $t('kot.load_failed_hint') }}</p>
      <button
        type="button"
        class="press mt-4 rounded-xl bg-[#ffca4b] px-5 py-2 font-bold text-[#3f2a20]"
        @click="retryFetchKot"
      >
        {{ $t('kot.retry') }}
      </button>
    </div>

    <div v-else-if="stationKots.length === 0 && !loadingKots" class="text-center py-20 animate-fade-in">
      <div class="empty-kitchen-icon">✓</div>
      <p class="text-lg font-bold text-[#3f2a20]">{{ $t('kot.kitchen_clear') }}</p>
      <p class="mt-1 text-sm text-[#9a7e6b]">{{ $t('kot.no_active_orders', { station: production }) }}</p>
    </div>

    <!-- Tickets exist, but the current filter hides all of them. Saying so
         beats an empty board that looks like a broken feed. -->
    <div v-else-if="visibleKots.length === 0 && !loadingKots" class="text-center py-16 animate-fade-in">
      <p class="text-base font-bold text-[#3f2a20]">{{ $t('toolbar.none_in_filter') }}</p>
      <button type="button" class="press mt-3 rounded-xl bg-[#ffca4b] px-5 py-2 font-bold text-[#3f2a20]" @click="filter = 'all'">
        {{ $t('toolbar.show_all') }}
      </button>
    </div>

    <!--
      The board.

      Plain CSS grid with no JS layout at all. This used to run Masonry over
      the same element Tailwind was already gridding, which meant two layout
      systems positioning the same nodes; a new Masonry instance was also
      constructed on every refresh without destroying the last one. Equal-height
      cards that scroll internally suit a kitchen better anyway: a ticket with
      twenty items no longer stretches its column to three times the height of
      everything beside it.
    -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      <article
        v-for="(kot, kotIndex) in visibleKots"
        :key="kot.name"
        :style="{ '--i': kotIndex }"
        :class="[kot.color, urgencyClass(kot)]"
        class="kot-card animate-fade-in-up stagger-fast relative flex flex-col overflow-hidden rounded-2xl shadow-[0_8px_24px_rgba(74,48,30,0.10)]"
      >
        <!--
          Urgency rail down the inline edge.

          Colour alone carried this before, and a ticket's colour is already
          spoken for by its type (modified / cancelled / takeaway). The rail is
          a second, independent channel for "how long has this been waiting",
          readable from across a kitchen and not in conflict with the card.
        -->
        <span class="kds-rail" :class="`kds-rail--${urgency(kot)}`" aria-hidden="true"></span>

        <!-- Header: who the ticket is for, and how long it has been waiting -->
        <header class="flex items-start justify-between gap-3 border-b border-black/5 px-4 py-3">
          <div class="min-w-0">
            <p class="truncate text-lg font-bold leading-tight text-[#3f2a20]">
              <span v-if="kot.tableortakeaway !== 'Takeaway'" class="text-[11px] font-bold uppercase tracking-wider text-[#9a7e6b] me-1">{{ $t('kot.table') }}</span>
              {{ destinationLabel(kot) }}
            </p>

            <p class="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] font-semibold uppercase tracking-wider text-[#9a7e6b]">
              <span class="bidi-isolate">
                {{ $t('kot.order') }}
                {{ daily_order_number ? kot.order_no : kot.invoice.slice(-4) }}
              </span>
              <span v-if="kot.user">· {{ kot.user }}</span>
            </p>

            <p v-if="kot.is_aggregator" class="mt-1 truncate text-xs font-semibold text-[#735d4e]">
              {{ kot.customer_name }}
              <span v-if="kot.aggregator_id" class="bidi-isolate text-[#9a7e6b]">#{{ kot.aggregator_id }}</span>
            </p>
          </div>

          <!-- Elapsed time. Tabular figures so the digits do not jitter as it
               ticks, and isolated so an RTL board cannot reorder mm:ss. -->
          <div
            :class="kot.timecolor"
            class="shrink-0 rounded-xl bg-white/80 px-3 py-1.5 text-2xl font-bold leading-none tabular-nums bidi-isolate"
          >
            {{ kot.timeRemaining }}
          </div>
        </header>

        <!-- Status + note strip, only when there is something to say -->
        <div v-if="kot.type !== 'New Order' || kot.comments || kot.start_time_prep" class="space-y-2 px-4 pt-3">
          <div class="flex flex-wrap items-center gap-2">
            <span
              v-if="kot.type !== 'New Order'"
              :class="statusClass(kot.type)"
              class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true"></span>
              {{ statusLabel(kot.type) }}
            </span>

            <!-- The middle state the board never had: somebody has this one.
                 Without it two cooks start the same ticket on a busy line. -->
            <span
              v-if="kot.start_time_prep"
              class="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-current animate-pulse-soft" aria-hidden="true"></span>
              {{ $t('kot.preparing_since', { time: kot.start_time_prep }) }}
            </span>
          </div>

          <p v-if="kot.type === 'Duplicate'" class="rounded-lg bg-[#fff0ec] px-3 py-2 text-sm font-bold text-[#c83d2d]">
            {{ $t('kot.duplicate_warning') }}
          </p>

          <p v-if="kot.comments" class="rounded-lg bg-white/70 px-3 py-2 text-sm font-medium text-[#735d4e]">
            <span class="text-[11px] font-bold uppercase tracking-wider text-[#9a7e6b]">{{ $t('kot.note') }}:</span>
            {{ kot.comments }}
          </p>
        </div>

        <!-- Items. Scrolls inside the card so one long ticket cannot distort
             the board; the header and the action stay put while it scrolls. -->
        <ul class="min-h-0 flex-1 divide-y divide-black/5 overflow-y-auto px-2 py-2">
          <li v-for="kotitem in sortedKotItems(kot)" :key="kotitem.name">
            <button
              type="button"
              @click="toggleItemStrikeThrough(kotitem, kot)"
              @pointerdown="beginLongPress(kotitem)"
              @pointerup="cancelLongPress"
              @pointerleave="cancelLongPress"
              @contextmenu.prevent="askEightySix(kotitem)"
              class="press flex w-full items-start justify-between gap-3 rounded-xl px-2 py-2.5 text-start transition-colors duration-fast hover:bg-white/70"
              :aria-pressed="!!kotitem.striked"
              :title="$t('eightysix.hint')"
            >
              <span class="min-w-0 flex-1">
                <span
                  class="block text-base font-semibold leading-snug"
                  :class="kotitem.striked ? 'text-green-700 line-through' : 'text-[#3f2a20]'"
                >
                  {{ kotitem.item_name }}
                </span>
                <span v-if="kotitem.indicate_course" class="mt-0.5 block text-xs text-[#9a7e6b]">
                  {{ kotitem.course }}
                </span>
                <span
                  v-if="isUnavailable(kotitem.item)"
                  class="mt-1 inline-flex items-center gap-1 rounded-md bg-[#fff0ec] px-2 py-0.5 text-[11px] font-bold text-[#c83d2d]"
                >
                  {{ $t('eightysix.badge') }}
                </span>
                <span
                  v-if="kot.type === 'Partially cancelled' || kot.type === 'Cancelled'"
                  class="mt-0.5 block text-xs text-[#9a7e6b] bidi-isolate"
                >
                  {{ $t('kot.old_qty') }}: {{ kotitem.quantity }}
                </span>
                <span v-if="kotitem.comments" class="mt-1 block rounded-md bg-white/70 px-2 py-1 text-xs font-medium text-[#735d4e]">
                  {{ kotitem.comments }}
                </span>
              </span>

              <!-- Fixed-width column so quantities line up down the ticket -->
              <span
                class="mt-0.5 inline-flex h-8 min-w-[2rem] shrink-0 items-center justify-center rounded-lg px-2 text-lg font-bold tabular-nums"
                :class="kotitem.striked ? 'bg-green-100 text-green-700' : 'bg-white/80 text-[#3f2a20]'"
              >
                {{ kotitem.qty }}
              </span>
            </button>
          </li>
        </ul>

        <!--
          The action is always on the card.

          It used to be hidden behind a tap-to-reveal overlay whose
          `absolute inset-0` had no positioned ancestor — so it covered the
          entire page rather than the card. A persistent footer button is both
          correct and quicker to hit on a kitchen screen.
        -->
        <footer class="border-t border-black/5 bg-white/40 px-4 py-3">
          <!-- Plated-items progress, as a bar as well as a count: a cook
               reading the board from two metres away sees the bar, not "3 / 7". -->
          <div class="mb-2.5 flex items-center gap-3">
            <span class="text-xs font-semibold text-[#9a7e6b] bidi-isolate">
              {{ $t('kot.progress', { done: doneCount(kot), total: sortedKotItems(kot).length }) }}
            </span>
            <span class="kds-progress" role="presentation">
              <span class="kds-progress__fill" :style="{ width: progressPercent(kot) + '%' }"></span>
            </span>
            <button
              type="button"
              @click="openDetails(kot)"
              class="press ms-auto rounded-lg border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-semibold text-[#735d4e] transition-colors duration-fast hover:bg-white"
              :title="$t('details.open')"
              :aria-label="$t('details.open')"
            >
              {{ $t('details.open') }}
            </button>
          </div>

          <div class="flex items-center gap-2">
            <!-- Claim the ticket. Hidden once claimed so the row does not grow
                 a dead button, and hidden on cancellations, which are verified
                 rather than cooked. -->
            <button
              v-if="!kot.start_time_prep && kot.type !== 'Cancelled' && kot.type !== 'Partially cancelled'"
              type="button"
              @click="startPrep(kot)"
              :disabled="busyKot === kot.name"
              class="press rounded-xl border-2 border-[#3f2a20]/15 bg-white/80 px-4 py-2.5 font-bold text-[#3f2a20] transition-colors duration-fast hover:bg-white disabled:opacity-50"
            >
              {{ $t('kot.start') }}
            </button>

            <button
              type="button"
              @click="kot.type === 'Cancelled' || kot.type === 'Partially cancelled' ? confirmOrder(kot) : serveOrder(kot)"
              :disabled="busyKot === kot.name"
              class="press ms-auto rounded-xl bg-[#ffca4b] px-6 py-2.5 font-bold text-[#3f2a20] shadow-md transition-colors duration-fast hover:bg-[#ffd66f] disabled:opacity-50"
            >
              {{ kot.type === 'Cancelled' || kot.type === 'Partially cancelled' ? $t('kot.confirm') : $t('kot.serve') }}
            </button>
          </div>
        </footer>
      </article>
    </div>

    <!--
      What the kitchen has run out of.

      Visible on the board itself rather than buried in a menu, because the
      whole point is that the line, the pass and the till share one answer to
      "do we still have this". Tapping a chip puts the dish back.
    -->
    <div
      v-if="unavailable.length"
      class="mt-5 rounded-2xl border border-[#f3a79a] bg-[#fff6f3] px-4 py-3"
    >
      <p class="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#c83d2d]">
        {{ $t('eightysix.title', { count: unavailable.length }) }}
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="row in unavailable"
          :key="row.item"
          type="button"
          class="press inline-flex items-center gap-2 rounded-full border border-[#f3a79a] bg-white px-3 py-1.5 text-sm font-semibold text-[#c83d2d] hover:bg-[#fff0ec]"
          :disabled="eightySixBusy"
          @click="setAvailability(row.item, true)"
        >
          {{ row.item_name }}
          <span class="text-xs font-bold" aria-hidden="true">↺</span>
        </button>
      </div>
      <p class="mt-2 text-xs font-medium text-[#a8705f]">{{ $t('eightysix.restore_hint') }}</p>
    </div>

    <!-- Taking a dish off the menu stops it being sold at every till and
         kiosk, so it is confirmed rather than done on the press itself. -->
    <div
      v-if="eightySixTarget"
      class="fixed inset-0 z-50 flex items-center justify-center bg-[#241914]/70 p-4 backdrop-blur-sm"
      @click.self="eightySixTarget = null"
    >
      <div class="w-full max-w-sm rounded-2xl border border-[#eadfce] bg-[#fffdf8] p-6 shadow-2xl animate-scale-in" role="dialog">
        <p class="text-lg font-bold text-[#3f2a20]">{{ $t('eightysix.confirm_title') }}</p>
        <p class="mt-1 text-xl font-bold text-[#c83d2d]">{{ eightySixTarget.item_name }}</p>
        <p class="mt-3 text-sm font-medium text-[#735d4e]">{{ $t('eightysix.confirm_body') }}</p>

        <div class="mt-6 flex gap-3">
          <button
            type="button"
            class="press flex-1 rounded-xl border border-[#eadfce] bg-white px-4 py-2.5 font-bold text-[#735d4e] hover:bg-[#f7f1e6]"
            @click="eightySixTarget = null"
          >
            {{ $t('eightysix.cancel') }}
          </button>
          <button
            type="button"
            class="press flex-1 rounded-xl bg-[#f05b42] px-4 py-2.5 font-bold text-white hover:bg-[#d94c38] disabled:opacity-50"
            :disabled="eightySixBusy"
            @click="setAvailability(eightySixTarget.item, false)"
          >
            {{ eightySixBusy ? $t('eightysix.working') : $t('eightysix.confirm') }}
          </button>
        </div>
      </div>
    </div>

    <!-- One sheet for the whole board rather than one per card: only a single
         ticket is ever inspected at a time. -->
    <KotDetails
      :open="!!detailsKot"
      :kot="detailsKot"
      :daily-order-number="daily_order_number"
      @close="detailsKot = null"
      @action="onDetailsAction"
    />

    <RecallPanel
      :open="recallOpen"
      :tickets="recallTickets"
      :loading="recallLoading"
      :busy="recallBusy"
      :daily-order-number="daily_order_number"
      @close="recallOpen = false"
      @recall="recallTicket"
    />

    <!-- KOT Delay Error Alert Banner -->
    <div
      v-if="showKotErrorAlert && kotErrorAlert"
      role="alert"
      class="fixed top-0 start-0 end-0 mx-auto p-4 bg-red-50 border-b-4 border-red-500 shadow-lg z-40 flex justify-between items-center animate-fade-in-up"
    >
      <div class="flex items-center gap-3">
        <div class="flex-shrink-0">
          <span class="text-3xl animate-pulse-soft">⚠️</span>
        </div>
        <div class="flex-1">
          <p class="font-bold text-red-700">{{ $t('kot.order_delayed') }}</p>
          <p class="text-red-600 text-sm mt-1">
            <span v-if="!daily_order_number" class="bidi-isolate">{{ $t('kot.invoice_label') }} {{ kotErrorAlert.invoice.slice(-4) }}</span>
            <span v-else class="bidi-isolate">{{ $t('kot.order_no_label') }} {{ kotErrorAlert.order_no }}</span>
            <span class="bidi-isolate"> | {{ $t('kot.table_label') }} {{ kotErrorAlert.tableortakeaway }} | {{ $t('kot.time_label') }} {{ kotErrorAlert.timestamp }}</span>
          </p>
        </div>
      </div>
      <button
        @click="hideKotErrorAlert"
        class="ms-4 shrink-0 rounded-md px-2 text-xl font-bold text-red-700 transition-colors duration-fast hover:bg-red-100 hover:text-red-900"
      >
        ✕
      </button>
    </div>

    <!-- Transient confirmation of the last action, and the online/offline
         state. One slot, so two notices can never stack on top of each other. -->
    <div
      v-if="statusMessage"
      class="fixed bottom-8 end-8 z-40 rounded-xl px-4 py-3 font-semibold text-white shadow-lg animate-fade-in-up"
      :class="isOnline ? 'bg-emerald-600' : 'bg-red-600'"
    >
      {{ statusMessage }}
    </div>
  </div>
</template>

<script>
import { FrappeApp } from "frappe-js-sdk";
import io from "socket.io-client";
import {
  play as playSound,
  preload as preloadSounds,
  preview as previewSound,
  setOverrides as setSoundOverrides,
  onSoundChange,
  toggleMuted,
  setVolume,
  unlock as unlockAudio,
  installUnlockOnFirstGesture,
} from "../utils/sound";
import {
  enableWakeLock,
  disableWakeLock,
  toggleFullscreen,
  isFullscreen,
} from "../utils/screen";

let host = window.location.hostname;
let port = window.location.port;
let protocol = window.location.protocol;
let url = port ? `${protocol}//${host}:${port}` : `${protocol}//${host}`;
window.globalSiteName = '';
let socket; 

async function fetchAndSetSiteName() {
    try {
        const response = await fetch('/api/method/ury.ury.api.ury_kot_display.get_site_name', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        window.globalSiteName = data.message.site_name;
    } catch (error) {
        console.error('Failed to fetch site name:', error);
    }
}

async function initializeSocket() {
    await fetchAndSetSiteName();
    if (window.globalSiteName) {
        let site = window.globalSiteName;
        let site_url = `${url}/${site}`;
        socket = io(site_url,{ withCredentials: true });
        socket.on('connect_error', (err) => {
            console.error("Socket connection error:", err);
        }); 
    } else {
        console.error('Site name is not set. Socket cannot be initialized.');
    }
}

initializeSocket(); // Initialize the socket after fetching the site name


const frappe = new FrappeApp(url);
import KitchenMessages from "./KitchenMessages.vue";
import KotDetails from "./KotDetails.vue";
import KitchenToolbar from "./KitchenToolbar.vue";
import RecallPanel from "./RecallPanel.vue";

/** Fallback when the branch has no KOT warning time configured, in minutes. */
const DEFAULT_ALERT_MINUTES = 15;

export default {
  components: { KitchenMessages, KotDetails, KitchenToolbar, RecallPanel },
  props: ["production"],
  data() {
    return {
      kot: [],
      call: frappe.call(),
      branch: "",
      kot_channel: "",
      kot_error_channel: "",
      // Per-item progress broadcast, so two screens on one station agree.
      kot_item_channel: "",
      // Menu availability broadcast, so a dish 86'd on one screen greys out
      // everywhere without a refetch.
      menu_channel: "",
      clickedItems: new Set(),
      struckThroughItems: {},
      loggeduser: "",
      showModal: false,
      kot_alert_time: "",
      audio_alert: 0,
      isOnline: navigator.onLine,
      statusMessage: "",
      daily_order_number:0,
      loadingKots: true,
      kotsError: null,
      kotErrorAlert: null,
      showKotErrorAlert: false,
      // Handed to <KitchenMessages> so the whole display shares one socket
      // rather than opening a second connection per component.
      socketRef: null,
      socketConnected: false,
      detailsKot: null,

      // --- Board controls -------------------------------------------------
      filter: "all",
      sort: "oldest",
      isFullscreen: false,
      /** Mirrors the sound module so the toolbar stays reactive. */
      soundState: { muted: false, volume: 0.8, blocked: false, unlocked: false },
      unsubscribeSound: null,
      teardownUnlock: null,

      // --- Ticket actions -------------------------------------------------
      /** Name of the ticket with a request in flight; disables its buttons. */
      busyKot: "",

      // --- Recall ---------------------------------------------------------
      recallOpen: false,
      recallTickets: [],
      recallLoading: false,
      recallBusy: "",

      // --- Shift stats ----------------------------------------------------
      stats: { served_today: 0, avg_minutes: null },
      statsTimer: null,

      // --- Menu availability ("86") ---------------------------------------
      /** Items currently off the menu for this branch. */
      unavailable: [],
      /** The item row a long-press opened the 86 prompt for. */
      eightySixTarget: null,
      eightySixBusy: false,
    };
  },
  methods: {
    auth() {
      return new Promise((resolve, reject) => {
        const auth = frappe.auth();
        auth
          .getLoggedInUser()
          .then((user) => {
            this.loggeduser = user;
            resolve();
          })
          .catch((error) => {
            console.error(error);
            reject(error);
          });
      });
    },
    fetchKOT() {
      return new Promise((resolve, reject) => {
        try {
          this.call
            .get("ury.ury.api.ury_kot_display.kot_list", {})
            .then((result) => {
              this.branch = result.message.Branch;
              this.kot_alert_time = result.message.kot_alert_time;
              this.audio_alert = result.message.audio_alert;
              this.daily_order_number = result.message.daily_order_number;
              this.kot_channel = `kot_update_${this.branch}_${this.production}`;
              this.kot_error_channel = `kot_error_${this.branch}_${this.production}`;
              this.kot_item_channel = `kot_item_update_${this.branch}_${this.production}`;
              this.menu_channel = `menu_availability_${this.branch}`;
              this.kot = result.message.KOT;
              this.kotsError = null;
              this.loadingKots = false;
              this.updateQtyColorTable();
              this.updateTimeRemaining();
              resolve();
            })
            .catch((error) => {
              console.error(error);
              // A failed load must never render as an empty board. "Kitchen
              // clear" and "the feed is down" look identical once the list
              // is empty, and only one of them means it is safe to stand
              // still (UX-19).
              this.kotsError = error;
              this.loadingKots = false;
              reject(error);
            });
        } catch (error) {
          this.kotsError = error;
          this.loadingKots = false;
          reject(error);
        }
      });
    },

    /** Re-runs the ticket fetch after a failure, without reloading the app —
        a kitchen screen that reloads loses its socket and its scroll. */
    retryFetchKot() {
      this.loadingKots = true;
      this.kotsError = null;
      this.fetchKOT().catch(() => {});
    },

    /** Shift counters for the toolbar. Failure is silent: a missing number
        must not make the board look broken. */
    fetchStats() {
      this.call
        .get("ury.ury.api.ury_kot_display.kitchen_stats", {})
        .then((result) => {
          if (result && result.message) this.stats = result.message;
        })
        .catch(() => {});
    },

    confirmOrder(kot) {
      const now = new Date();
      this.currentTime = now.toLocaleTimeString();
      this.busyKot = kot.name;
      this.call
        .post("ury.ury.api.ury_kot_display.confirm_cancel_kot", {
          name: kot.name,
        })
        .then(() => {
          kot.showDiv = !kot.showDiv;
          this.removeAllItemsFromLocalStorage(kot);
          this.alertSound("served");
        })
        .catch((error) => {
          console.error(error);
          this.flash(this.$t("kot.action_failed"));
        })
        .finally(() => {
          this.busyKot = "";
        });
    },
    async serveOrder(kot) {
      const now = new Date();
      this.currentTime = now.toLocaleTimeString();
      this.busyKot = kot.name;

      this.call
        .post("ury.ury.api.ury_kot_display.serve_kot", {
          name: kot.name,
          time: this.currentTime,
        })
        .then(() => {
          kot.showDiv = !kot.showDiv;
          this.removeAllItemsFromLocalStorage(kot);
          this.alertSound("served");
          this.flash(this.$t("kot.served_toast", { table: this.destinationLabel(kot) }));
          // The served list backs Recall, so it is now one ticket out of date.
          this.fetchStats();
          if (this.recallOpen) this.fetchRecall();
        })
        .catch((error) => {
          console.error(error);
          this.flash(this.$t("kot.action_failed"));
        })
        .finally(() => {
          this.busyKot = "";
        });
    },

    /**
     * Claim a ticket for the line.
     *
     * Optimistic: the badge appears on the card immediately and is rolled back
     * if the call fails, because a cook taps "start" and turns to the pass —
     * they will not be watching for a spinner.
     */
    startPrep(kot) {
      const previous = kot.start_time_prep;
      kot.start_time_prep = new Date().toLocaleTimeString("en-GB", { hour12: false });
      this.busyKot = kot.name;

      this.call
        .post("ury.ury.api.ury_kot_display.start_kot_prep", { name: kot.name })
        .then((result) => {
          if (result && result.message && result.message.start_time_prep) {
            // Trust the server's clock over the display's.
            kot.start_time_prep = result.message.start_time_prep;
          }
        })
        .catch((error) => {
          console.error(error);
          kot.start_time_prep = previous;
          this.flash(this.$t("kot.action_failed"));
        })
        .finally(() => {
          this.busyKot = "";
        });
    },

    // --- Menu availability --------------------------------------------------

    fetchUnavailable() {
      this.call
        .get("ury.ury.api.ury_kot_display.unavailable_items", {})
        .then((result) => {
          this.unavailable = (result && result.message) || [];
        })
        .catch(() => {});
    },

    isUnavailable(item) {
      return this.unavailable.some((row) => row.item === item);
    },

    /**
     * Opens the 86 prompt for one line.
     *
     * Behind a long press rather than a tap, because the tap on an item is
     * already "I plated this" and that is the gesture used hundreds of times a
     * shift. Taking a dish off the menu is rare and consequential, so it gets
     * a deliberate gesture and a confirmation.
     */
    askEightySix(kotitem) {
      this.eightySixTarget = kotitem;
    },

    /**
     * 550ms is long enough that plating taps never trigger it, short enough
     * that it does not feel broken. The click that follows the press is
     * suppressed so opening the prompt does not also plate the item.
     */
    beginLongPress(kotitem) {
      this.cancelLongPress();
      this._longPressTimer = setTimeout(() => {
        this._longPressFired = true;
        this.askEightySix(kotitem);
      }, 550);
    },

    cancelLongPress() {
      clearTimeout(this._longPressTimer);
    },

    setAvailability(item, available) {
      this.eightySixBusy = true;
      this.call
        .post("ury.ury.api.ury_kot_display.set_item_availability", {
          item,
          available: available ? 1 : 0,
        })
        .then(() => {
          this.eightySixTarget = null;
          this.fetchUnavailable();
          this.flash(
            available
              ? this.$t("eightysix.restored_toast")
              : this.$t("eightysix.removed_toast")
          );
        })
        .catch((error) => {
          console.error(error);
          this.flash(this.$t("kot.action_failed"));
        })
        .finally(() => {
          this.eightySixBusy = false;
        });
    },

    openRecall() {
      this.recallOpen = true;
      this.fetchRecall();
    },

    fetchRecall() {
      this.recallLoading = true;
      this.call
        .get("ury.ury.api.ury_kot_display.served_kot_list", {})
        .then((result) => {
          const tickets = (result && result.message && result.message.KOT) || [];
          // Only this station's tickets: a grill cook recalling a ticket from
          // the bar station would be recalling somebody else's mistake.
          this.recallTickets = tickets.filter((t) => t.production === this.production);
        })
        .catch((error) => {
          console.error(error);
          this.recallTickets = [];
        })
        .finally(() => {
          this.recallLoading = false;
        });
    },

    recallTicket(ticket) {
      this.recallBusy = ticket.name;
      this.call
        .post("ury.ury.api.ury_kot_display.recall_kot", { name: ticket.name })
        .then(() => {
          this.recallTickets = this.recallTickets.filter((t) => t.name !== ticket.name);
          this.flash(this.$t("recall.restored"));
          this.fetchKOT();
          this.fetchStats();
        })
        .catch((error) => {
          console.error(error);
          this.flash(this.$t("kot.action_failed"));
        })
        .finally(() => {
          this.recallBusy = "";
        });
    },

    async orderDelayNotify(kot) {
      const now = new Date();
      this.currentTime = now.toLocaleTimeString();

      this.call
        .post(
          "ury.ury.api.ury_kot_notification.order_delay_notification",
          {
            id: kot.name,
          }
        )
        .then(() => {})
        .catch((error) => console.error(error));
    },
    /**
     * Plate or un-plate one line of a ticket.
     *
     * This lived in `localStorage` keyed by `<kot>_<row>_strike`, which meant
     * the progress was per-browser: a refresh wiped it, a second screen in the
     * same kitchen never saw it, and no report could be built from it. It is a
     * field on the row now, and the server broadcasts the change so every
     * screen on this station stays in step.
     *
     * Optimistic, and rolled back on failure — a cook taps and turns away.
     */
    toggleItemStrikeThrough(kotitem, kot) {
      // A long press already opened the 86 prompt; the browser still delivers
      // the click afterwards, and plating the item here would be a surprise.
      if (this._longPressFired) {
        this._longPressFired = false;
        return;
      }

      const next = !kotitem.striked;
      kotitem.striked = next;

      this.call
        .post("ury.ury.api.ury_kot_display.set_kot_item_prepared", {
          name: kot.name,
          row: kotitem.name,
          prepared: next ? 1 : 0,
        })
        .catch((error) => {
          console.error(error);
          kotitem.striked = !next;
          this.flash(this.$t("kot.action_failed"));
        });
    },

    /** Applies an item-progress broadcast from another screen. */
    applyItemUpdate(payload) {
      if (!payload || !payload.kot) return;
      const kot = this.kot.find((k) => k.name === payload.kot);
      if (!kot) return;
      const row = (kot.kot_items || []).find((i) => i.name === payload.row);
      if (row) row.striked = !!payload.prepared;
    },

    updateColorandTable(kot, restaurant_table, type, table_takeaway, custom_merged_tables) {
      if (restaurant_table === undefined) {
        kot.tableortakeaway = "Takeaway";
      } else {
        if (table_takeaway == 1) {
          kot.tableortakeaway = "Takeaway";
        } else {
          let label = restaurant_table;
          if (custom_merged_tables) {
            const partners = custom_merged_tables
              .split(",")
              .map((name) => name.trim())
              .filter(Boolean);
            if (partners.length) {
              label = [restaurant_table, ...partners].join(" + ");
            }
          }
          kot.tableortakeaway = label;
        }
      }
      if (type == "Order Modified") {
        kot.color = "bg-[#fff0cb] border border-[#f0b83e]";
      } else if (type == "Partially cancelled" || type == "Cancelled") {
        kot.color = "bg-[#fff0ec] border border-[#f3a79a]";
      } else if (restaurant_table === undefined || table_takeaway == 1) {
        kot.color = "bg-[#fff8e8] border border-[#f0d58e]";
      } else {
        kot.color = "bg-[#fffdf8] border border-[#eadfce]";
      }
    },
    updateQtyColorTable() {
      this.kot.forEach((kot) => {
        this.updateColorandTable(
          kot,
          kot.restaurant_table,
          kot.type,
          kot.table_takeaway,
          kot.custom_merged_tables
        );

        kot.kot_items.forEach((kotitem) => {
          // `prepared` comes from the row itself, so the board shows the same
          // progress on every screen and survives a reload.
          kotitem.striked = !!kotitem.prepared;
          this.calculateQty(
            kotitem,
            kotitem.quantity,
            kot.type,
            kotitem.cancelled_qty
          );
        });
      });
    },
    calculateQty(kotitem, qty, type, cancelled_qty) {
      kotitem.qty = qty;
      if (type == "Partially cancelled" || type == "Cancelled") {
        kotitem.qty = qty - cancelled_qty;
      }
    },
    /**
     * Clears any per-item progress this browser stored before the state moved
     * to the server. Kept so displays upgrading in place do not carry stale
     * keys forever; it is a no-op once a screen has been cleaned.
     */
    removeAllItemsFromLocalStorage(kot) {
      try {
        Object.keys(localStorage)
          .filter((key) => key.startsWith(`${kot.name}_`))
          .forEach((key) => localStorage.removeItem(key));
      } catch {
        /* Blocked site data: nothing to clean. */
      }
    },

    updateTimeRemaining() {
      this.kot.forEach((kot) => {
        const minutes = this.elapsedMinutes(kot);
        kot.timeRemaining = this.formatElapsed(kot);

        const cancelled = kot.type === "Cancelled" || kot.type === "Partially cancelled";

        // Fire the delay alert once per ticket, not once per tick. The old
        // `minutes === alert_time` test stayed true for a whole minute, which
        // was harmless at a 60s interval but would repeat at the faster one
        // below — so the ticket itself remembers it has already alerted.
        if (minutes >= this.alertMinutes && !kot._delayNotified && !cancelled) {
          kot._delayNotified = true;
          this.orderDelayNotify(kot);
          // Audible too: nobody is staring at the board when a ticket ages out.
          this.alertSound("late");
        }
        kot.timecolor = minutes >= this.alertMinutes ? "text-[#DC0000]" : "text-black";
      });
    },

    /**
     * Minutes since the ticket was fired.
     *
     * The old version rebuilt the timestamp from today's date and the ticket's
     * time-of-day, which reported a negative age for anything fired before
     * midnight on a kitchen that works past it. The KOT carries its own date,
     * so use it; the wrap-around correction only applies to the fallback path.
     */
    elapsedMinutes(kot) {
      const placed = this.placedAt(kot);
      if (!placed) return 0;
      return Math.max(0, Math.floor((Date.now() - placed) / 60000));
    },

    placedAt(kot) {
      if (!kot || !kot.time) return null;

      if (kot.date) {
        const exact = new Date(`${kot.date}T${kot.time}`);
        if (!Number.isNaN(exact.getTime())) return exact.getTime();
      }

      const [h, m, s] = String(kot.time).split(":");
      const now = new Date();
      const guess = new Date(
        now.getFullYear(), now.getMonth(), now.getDate(),
        Number(h) || 0, Number(m) || 0, Number(s) || 0
      );
      // Fired "later today" can only mean it was fired before midnight.
      if (guess.getTime() > now.getTime()) guess.setDate(guess.getDate() - 1);
      return guess.getTime();
    },

    /** `mm:ss` under an hour, `h:mm` beyond it, always zero padded. */
    formatElapsed(kot) {
      const placed = this.placedAt(kot);
      if (!placed) return "0:00";

      const seconds = Math.max(0, Math.floor((Date.now() - placed) / 1000));
      const pad = (n) => String(n).padStart(2, "0");

      if (seconds < 3600) return `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`;
      return `${Math.floor(seconds / 3600)}:${pad(Math.floor((seconds % 3600) / 60))}`;
    },

    /**
     * How close a ticket is to breaching the branch's promise time.
     *
     * Three bands rather than the old two: a cook needs to know which ticket
     * is *about* to be late while there is still time to do something about
     * it, not only which one already is.
     */
    urgency(kot) {
      if (kot.type === "Cancelled" || kot.type === "Partially cancelled") return "cancelled";
      const minutes = this.elapsedMinutes(kot);
      if (minutes >= this.alertMinutes) return "late";
      if (minutes >= this.alertMinutes * 0.6) return "warn";
      return "ok";
    },

    urgencyClass(kot) {
      return this.urgency(kot) === "late" ? "ring-2 ring-red-400" : "";
    },

    /**
     * What to show for the ticket's destination.
     *
     * `tableortakeaway` doubles as a sentinel ("Takeaway") that the rest of
     * the component compares against, so the English value stays in the data
     * and only the label is translated here.
     */
    destinationLabel(kot) {
      return kot.tableortakeaway === "Takeaway"
        ? this.$t("kot.takeaway")
        : kot.tableortakeaway;
    },

    /** Human label for a ticket's state; falls back to the raw value. */
    statusLabel(type) {
      const key = `kot.status.${type}`;
      const label = this.$t(key);
      return label === key ? type : label;
    },

    statusClass(type) {
      return {
        "Cancelled": "bg-[#fff0ec] text-[#c83d2d]",
        "Partially cancelled": "bg-[#fff0ec] text-[#c83d2d]",
        "Duplicate": "bg-[#fff0ec] text-[#c83d2d]",
        "Order Modified": "bg-[#fff8e8] text-[#8a6100]",
      }[type] || "bg-white/70 text-[#735d4e]";
    },

    openDetails(kot) {
      this.detailsKot = kot;
    },

    /** Serve/Confirm invoked from inside the detail sheet. */
    onDetailsAction(kot) {
      this.detailsKot = null;
      if (kot.type === "Cancelled" || kot.type === "Partially cancelled") {
        this.confirmOrder(kot);
      } else {
        this.serveOrder(kot);
      }
    },

    /** Items a cook has already plated, for the ticket's progress counter. */
    doneCount(kot) {
      return (kot.kot_items || []).filter((i) => i.striked).length;
    },

    progressPercent(kot) {
      const total = (kot.kot_items || []).length;
      if (!total) return 0;
      return Math.round((this.doneCount(kot) / total) * 100);
    },

    // --- Sound / screen controls -------------------------------------------

    /**
     * Plays an automatic alert, subject to the branch's own setting.
     *
     * Every unprompted noise the board makes goes through here, so
     * "Enable KOT Audio Alert" on the POS Profile is honoured in one place
     * rather than being re-checked at each call site. The toolbar's mute is
     * layered on top of this inside the sound module, and the test button
     * deliberately bypasses both so audio can always be verified.
     */
    alertSound(kind) {
      if (this.audio_alert !== 1) return;
      playSound(kind);
    },

    /** Chooses the tone that matches what just arrived. */
    alertFor(type) {
      if (type === "Cancelled" || type === "Partially cancelled") return "cancelled";
      if (type === "Order Modified") return "modified";
      return "new_order";
    },

    onToggleMute() {
      const muted = toggleMuted();
      // Unmuting is a user gesture, which is exactly when the browser will let
      // us satisfy the autoplay policy — so take the opportunity.
      if (!muted) unlockAudio().then(() => previewSound("served"));
    },

    onSetVolume(volume) {
      setVolume(volume);
    },

    onTestSound() {
      unlockAudio().then(() => previewSound("new_order"));
    },

    onEnableAudio() {
      unlockAudio().then((ok) => {
        if (ok) previewSound("new_order");
      });
    },

    async onToggleFullscreen() {
      this.isFullscreen = await toggleFullscreen();
    },

    redirectToLogin() {
      var currentDomain = window.location.origin;
      window.location.href =
        currentDomain + "/login?redirect-to=mosaic/" + this.production;
    },
    hideKotErrorAlert() {
      this.showKotErrorAlert = false;
      this.kotErrorAlert = null;
    },

    /** One transient message slot, auto-clearing. */
    flash(message) {
      this.statusMessage = message;
      clearTimeout(this._flashTimer);
      this._flashTimer = setTimeout(() => {
        this.statusMessage = "";
      }, 3000);
    },

    handleOnline() {
      this.isOnline = true;
      this.flash(this.$t("kot.back_online"));
      this.fetchKOT();
      this.fetchStats();
    },
    handleOffline() {
      this.isOnline = false;
      // No auto-clear: being offline is a state, not an event.
      clearTimeout(this._flashTimer);
      this.statusMessage = this.$t("kot.offline");
    },
    onFullscreenChange() {
      this.isFullscreen = isFullscreen();
    },
  },
  mounted() {
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
    document.addEventListener("fullscreenchange", this.onFullscreenChange);

    // Audio has to be armed by a real gesture; do it on the first touch
    // anywhere rather than demanding the user find a specific button.
    this.unsubscribeSound = onSoundChange((s) => { this.soundState = s; });
    this.teardownUnlock = installUnlockOnFirstGesture();
    preloadSounds();

    // A wall-mounted board must not let the OS blank the screen mid-service.
    enableWakeLock();

    const self = this;

    this.auth()
      .then(() => {
        // `socket` is created at module scope after the site name resolves,
        // so it only becomes available here.
        this.socketRef = socket;
        this.socketConnected = !!(socket && socket.connected);
        if (socket) {
          // Reconnecting only flipped the indicator green. Tickets pushed
          // while the socket was down are never replayed, so the board went
          // on claiming it was live while missing every order placed during
          // the gap (UX-22). The indicator now follows an actual resync, not
          // the transport coming back.
          socket.on("connect", () => {
            this.fetchKOT()
              .then(() => {
                this.socketConnected = true;
                this.fetchStats();
                this.fetchUnavailable();
              })
              .catch(() => {
                // Socket up, data not confirmed — not live yet, and the
                // error state from fetchKOT says why.
                this.socketConnected = false;
              });
          });
          socket.on("disconnect", () => { this.socketConnected = false; });
        }
        self.fetchKOT().then(() => {
          this.fetchStats();
          this.fetchUnavailable();

          socket.on(this.kot_channel, (doc) => {
            // An uploaded POS Profile tone, when one is configured, replaces
            // the bundled new-order chime. Previously a missing attachment
            // meant the client requested `origin + "null"`, a 404, and the
            // kitchen heard nothing at all.
            if (doc.audio_file) {
              setSoundOverrides({ new_order: doc.audio_file });
            }
            // The branch's own "Enable KOT Audio Alert" setting still decides
            // whether this station makes any noise; the toolbar's mute is a
            // second, per-screen control on top of it. Note this gate covers
            // the sound only — the ticket itself must reach the board either
            // way, or a kitchen with alerts switched off would stop receiving
            // live orders entirely.
            this.alertSound(this.alertFor(doc.kot && doc.kot.type));

            let kottime = localStorage.getItem("kot_time");
            if (doc.last_kot_time !== null) {
              if (doc.last_kot_time !== kottime) {
                this.fetchKOT();
              }
            }
            this.kot.unshift(doc.kot);
            this.updateQtyColorTable();
            this.updateTimeRemaining();
            setTimeout(()=>{
              if (doc.kot.type === "Cancelled"){
                this.fetchKOT();
              }
            },1500)
            localStorage.setItem("kot_time", doc.kot.time);
          });

          // Another screen on this station plated an item.
          socket.on(this.kot_item_channel, (payload) => {
            this.applyItemUpdate(payload);
          });

          // Somebody took a dish off the menu, here or at the till.
          socket.on(this.menu_channel, () => {
            this.fetchUnavailable();
          });

          // New socket listener for KOT error alerts (delayed orders)
          socket.on(this.kot_error_channel, (doc) => {
            // Look up the matching KOT in the local array to get table/order info
            const matchingKot = this.kot.find(k => k.name === doc.kot);

            this.kotErrorAlert = {
              invoice: doc.invoice,
              tableortakeaway: matchingKot?.tableortakeaway || 'Table/Takeaway info unavailable',
              order_no: matchingKot?.order_no || 'N/A',
              timestamp: new Date().toLocaleTimeString()
            };
            this.showKotErrorAlert = true;
            this.alertSound("late");
            // Auto-hide after 8 seconds
            setTimeout(() => {
              this.hideKotErrorAlert();
            }, 8000);
          });
        });
      })
      .catch((error) => {
        console.error("Authentication error:", error);
        this.showModal = true;
      });
    // A kitchen display is watched continuously; a minute-long freeze on the
    // age of a ticket makes the board look stalled. Ticking every 15s is
    // still cheap (it only rewrites two reactive fields per ticket) and the
    // delay alert is de-duplicated above, so the faster tick cannot spam it.
    this.ageTimer = setInterval(this.updateTimeRemaining, 15000);
    // Shift counters change only as tickets are served; a slow poll is plenty.
    this.statsTimer = setInterval(this.fetchStats, 120000);
  },
  /**
   * Vue 3 renamed this hook; the file still declared the Vue 2 `beforeDestroy`,
   * which is never called — so every timer and window listener here survived
   * navigating between stations and accumulated.
   */
  beforeUnmount() {
    clearInterval(this.ageTimer);
    clearInterval(this.statsTimer);
    clearTimeout(this._flashTimer);
    clearTimeout(this._longPressTimer);
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
    document.removeEventListener("fullscreenchange", this.onFullscreenChange);
    if (this.unsubscribeSound) this.unsubscribeSound();
    if (this.teardownUnlock) this.teardownUnlock();
    disableWakeLock();
    if (socket) {
      if (this.kot_channel) socket.off(this.kot_channel);
      if (this.kot_error_channel) socket.off(this.kot_error_channel);
      if (this.kot_item_channel) socket.off(this.kot_item_channel);
      if (this.menu_channel) socket.off(this.menu_channel);
    }
  },
  computed: {
    /** The branch's promise time, with a sane fallback when unconfigured. */
    alertMinutes() {
      const configured = Number(this.kot_alert_time);
      return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_ALERT_MINUTES;
    },

    /**
     * Tickets this station should cook.
     *
     * The board used to iterate every KOT and hide the other stations' cards
     * with v-if, which left empty grid cells where they had been.
     */
    stationKots() {
      return this.kot.filter((k) => !k.showDiv && k.production === this.production);
    },

    /** Filter tallies, computed once over the station's tickets so the
        toolbar badges and the board can never disagree. */
    counts() {
      const all = this.stationKots;
      return {
        all: all.length,
        new: all.filter((k) => !k.start_time_prep).length,
        preparing: all.filter((k) => !!k.start_time_prep).length,
        late: all.filter((k) => this.urgency(k) === "late").length,
      };
    },

    visibleKots() {
      let list = this.stationKots;

      if (this.filter === "new") list = list.filter((k) => !k.start_time_prep);
      else if (this.filter === "preparing") list = list.filter((k) => !!k.start_time_prep);
      else if (this.filter === "late") list = list.filter((k) => this.urgency(k) === "late");

      // Oldest first by default: a kitchen works a queue. `slice` because
      // `sort` mutates, and mutating a computed's source re-triggers it.
      const direction = this.sort === "oldest" ? 1 : -1;
      return list
        .slice()
        .sort((a, b) => ((this.placedAt(a) || 0) - (this.placedAt(b) || 0)) * direction);
    },

    /** Kept for templates and any external reference to the old name. */
    activeCount() {
      return this.stationKots.length;
    },
    sortedKotItems() {
      return (kot) => {
        return kot.kot_items.sort((a, b) => a.serve_priority - b.serve_priority);
      };
    },
  },
};
</script>
<style>
.bg-gray-100 {
  background-color: rgba(0, 0, 0, 0.2);
}
</style>
