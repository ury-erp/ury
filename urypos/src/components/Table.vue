<template>
  <!--
    Room / order-type filters.

    These were four sibling divs inside one grid, each carrying its own
    `ml-5` and `mb-3` to push itself into place, which fell apart in RTL and
    at tablet width. A flex row of labelled fields lets each control size to
    its content and wrap instead.
  -->
  <div class="mb-5 flex flex-wrap items-end gap-3">
    <div class="pos-field min-w-[10rem] flex-1">
      <label for="room">{{ $t('tables.select_room') }}</label>
      <select
        class="pos-select"
        id="room"
        v-model="table.selectedRoom"
        @change="table.handleRoomChange"
      >
        <option
          v-for="(room, index) in table.rooms"
          :key="index"
          :value="room.name"
        >
          {{ room.name }}
        </option>
      </select>
    </div>

    <!--
      Dine-in / takeaway.

      Was a hand-built sliding switch: an absolutely positioned white knob
      driven by an inline `transform`, with the label sitting on top of it.
      It gave no hint that it was a two-way choice and inverted in RTL. A
      segmented control states both options and marks the live one.
    -->
    <div
      v-if="!this.auth.cashier"
      class="inline-flex rounded-xl bg-muted p-1"
      role="group"
      :aria-label="$t('tables.title')"
    >
      <button
        v-for="option in tableTypeOptions"
        :key="option.takeaway"
        type="button"
        class="press min-h-[2.25rem] rounded-lg px-4 text-sm font-bold transition-colors duration-fast"
        :class="table.isTakeaeay === option.takeaway
          ? 'bg-card text-foreground shadow-card'
          : 'text-muted-foreground hover:text-foreground'"
        :aria-pressed="table.isTakeaeay === option.takeaway"
        @click="table.isTakeaeay !== option.takeaway && table.toggleTableTypeSwitch()"
      >
        {{ option.label }}
      </button>
    </div>

    <div class="pos-field min-w-[10rem] flex-1" v-if="this.auth.cashier">
      <label for="orderType">{{ $t('order.type') }}</label>
      <select
        class="pos-select"
        id="orderType"
        v-model="menu.selectedOrderType"
        @change="menu.orderTypeSelection()"
        :disabled="recentOrders.pastOrderType !== null && recentOrders.pastOrderType !== ''"
      >
        <option v-for="(type, index) in menu.orderType" :key="index">
          {{ type.name }}
        </option>
      </select>
    </div>

    <div
      class="pos-field min-w-[10rem] flex-1"
      v-if="this.menu.selectedOrderType === 'Aggregators' && this.auth.cashier"
    >
      <label for="aggregator">{{ $t('order.aggregators_list') }}</label>
      <select
        class="pos-select"
        id="aggregator"
        v-model="menu.selectedAggregator"
        @change="menu.handleAggregatorChange"
        :disabled="menu.cartHasValue || recentOrders.pastOrderType !== null && recentOrders.pastOrderType !== ''"
      >
        <option
          v-for="(aggregator, index) in menu.aggregatorList"
          :key="index"
          :value="aggregator.customer"
        >
          {{ aggregator.customer }}
        </option>
      </select>
    </div>
  </div>

  <div v-if="!this.table.isTakeaeay" class="m-auto">
    <div class="flow-root">
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-border bg-opacity-50 text-lg"
        v-if="this.invoiceData.isPrinting"
      >
        {{ $t('order.printing_invoice') }}
      </div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        <!--
          A table tile.

          Redesigned around how the screen is actually read: a waiter scans a
          room for "which table needs me", so state is carried by a coloured
          rail down the tile's leading edge and a word, not by a small pale
          badge the old card tucked in a corner. The table's own name is the
          largest thing on the tile, and how long it has been seated sits
          directly under it.
        -->
        <article
          v-for="(table, tableIndex) in auth.cashier
            ? this.table.tables
            : this.table.filteredTables"
          :key="table.name"
          :style="{ '--i': tableIndex }"
          class="pos-card animate-fade-in-up stagger-fast relative flex flex-col overflow-hidden"
        >
          <span
            class="absolute inset-y-0 start-0 w-1.5"
            :class="railClass(table)"
            aria-hidden="true"
          ></span>

          <header class="flex items-start justify-between gap-1 ps-4 pe-1 pt-3">
            <span :class="badgeClass(table)">
              <span class="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true"></span>
              {{ this.table.getBadgeText(table) }}
            </span>

            <div class="relative" v-if="table.occupied !== 1">
              <button
                class="press inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-fast hover:bg-muted"
                type="button"
                :aria-label="$t('tables.table_merge')"
                @click="this.table.toggleDropdown(table.name)"
              >
                <svg class="h-5 w-5" aria-hidden="true" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z"></path>
                </svg>
              </button>

              <div
                class="absolute end-0 z-10 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-popover shadow-raised animate-scale-in"
                v-show="this.table.activeDropdown === table.name"
              >
                <button
                  v-if="table.occupied !== 1"
                  type="button"
                  class="block w-full px-4 py-2.5 text-start text-sm font-semibold text-foreground transition-colors duration-fast hover:bg-muted"
                  @click="this.table.openMergeFreeModal(table)"
                >{{ $t('tables.table_merge') }}</button>
                <button
                  v-if="table.occupied === 1"
                  type="button"
                  class="block w-full px-4 py-2.5 text-start text-sm font-semibold text-foreground transition-colors duration-fast hover:bg-muted"
                  @click="this.table.showModal = true"
                >{{ $t('tables.table_transfer') }}</button>
                <button
                  v-if="table.occupied === 1 && this.auth.hasAccess"
                  type="button"
                  class="block w-full px-4 py-2.5 text-start text-sm font-semibold text-foreground transition-colors duration-fast hover:bg-muted"
                  @click="this.table.showModalCaptainTransfer = true"
                >{{ $t('tables.captain_transfer') }}</button>
              </div>
            </div>
          </header>

          <!-- Identity. Tapping an occupied tile opens its order, which is the
               single most common action on this screen. -->
          <div
            class="flex-1 px-4 pt-2 text-center"
            :class="table.occupied === 1 && !this.auth.restrictTableOrder ? 'cursor-pointer' : ''"
            @click="
              table.occupied === 1 && !this.auth.restrictTableOrder
                ? this.table.routeToMenu(table)
                : ''
            "
          >
            <h2 class="flex items-center justify-center gap-1.5 text-2xl font-bold leading-tight text-foreground">
              <span class="truncate">{{ table.name }}</span>
              <svg
                v-if="table.merged_with"
                class="h-4 w-4 shrink-0 text-muted-foreground"
                fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"
                :aria-label="$t('tables.merged_table')"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
              </svg>
            </h2>

            <p
              v-if="table.occupied === 1"
              class="mt-1 text-sm font-semibold tabular-nums bidi-isolate"
              :class="this.table.getBadgeType(table) === 'red' ? 'text-destructive' : 'text-muted-foreground'"
            >
              {{ this.table.getTimeDifference(table) }}
            </p>
            <p v-else class="mt-1 text-sm text-muted-foreground">
              {{ table.no_of_seats ? $t('tables.seats', { count: table.no_of_seats }) : '&nbsp;' }}
            </p>
          </div>

          <!-- Actions -->
          <footer class="p-3">
            <button
              v-if="table.occupied != 1"
              type="button"
              class="pos-btn-primary w-full"
              :disabled="this.auth.restrictTableOrder"
              @click="
                !this.auth.restrictTableOrder &&
                  this.table.addToSelectedTables(table)
              "
            >
              {{ $t('tables.open_table') }}
              <svg class="h-4 w-4 rtl-flip" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>

            <div v-else class="flex items-center gap-2">
              <button
                type="button"
                class="pos-btn-primary flex-1"
                @click="this.invoiceData.billing(table)"
              >
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M6 19H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h3V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v4h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-2zm0-2v-1a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1h2V9H4v8h2zM8 4v3h8V4H8zm0 13v3h8v-3H8zm-3-7h3v2H5v-2z" />
                </svg>
                {{ $t('order.bill') }}
              </button>

              <button
                type="button"
                class="pos-btn-ghost shrink-0 px-3"
                :disabled="this.auth.restrictTableOrder"
                :aria-label="$t('order.view_order')"
                @click="
                  !this.auth.restrictTableOrder && this.table.routeToCart(table)
                "
              >
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"></path>
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"></path>
                </svg>
              </button>
            </div>
          </footer>
        </article>
      </div>
    </div>

    <div
      v-if="this.table.tables.length === 0"
      class="inset-0 mt-16 flex items-center justify-center"
    >
      <div class="text-center">
        {{ $t('tables.none_for_room') }}
        <span class="font-medium">{{ this.table.selectedRoom }}.</span>
      </div>
    </div>
  </div>
  <div v-else>
    <takeAwayTable />
  </div>

  <div
    v-if="table.showModal"
    class="fixed inset-0 z-10 overflow-y-auto bg-muted"
  >
    <div class="mt-20 flex items-center justify-center">
      <div class="mt-10 w-full rounded-xl bg-card p-6 shadow-raised md:max-w-md">
        <div class="flex justify-end">
          <span class="sr-only">{{ $t('common.close') }}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            @click="this.table.showModal = false"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>

        <h2
          class="mt-1 block text-left text-xl font-medium text-foreground"
        >
          {{ $t('tables.table_transfer') }}
        </h2>
        <div class="relative" ref="container">
          <label
            for="newTable"
            class="mt-6 block text-left text-foreground"
          >
            {{ $t('tables.new_table') }}
          </label>
          <input
            type="text"
            class="mt-4 w-full appearance-none rounded-xl border p-2 leading-tight text-foreground shadow focus:outline-none"
            v-model="table.newTable"
            @click="
              this.table.showTable = true;
              this.table.tableSearch();
            "
          />
          <div
            v-if="this.table.showTable"
            class="absolute left-0 top-full z-10 max-h-64 w-full overflow-y-scroll rounded-xl bg-card shadow"
            ref="dropdown"
          >
            <div
              class="h-16 w-full rounded-xl p-4 hover:bg-muted"
              v-for="(tables, index) in this.table.searchTable"
              :key="index"
              @click="this.table.selectTable(tables)"
            >
              <h1 class="text-base font-semibold leading-normal">
                {{ tables.name }}
              </h1>
            </div>
          </div>
        </div>
        <label
          for="newTable"
          class="mt-6 block text-left text-foreground"
        >
          {{ $t('tables.current_table') }}
        </label>
        <input
          type="text"
          id="newTable"
          class="mt-4 w-full appearance-none rounded-xl border p-2 leading-tight text-foreground shadow focus:outline-none"
          :value="table.tableName"
          readonly
        />
        <div class="flex justify-end">
          <button
            @click="
              this.table.showModal = false;
              this.table.tableTransfer(table);
            "
            class="mt-8 rounded-xl bg-primary px-3 py-2 text-primary-foreground hover:bg-primary"
          >
            {{ $t('tables.transfer') }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <div
    v-if="table.showModalMergeFree"
    class="fixed inset-0 z-10 overflow-y-auto bg-muted"
  >
    <div class="mt-20 flex items-center justify-center">
      <div class="mt-10 w-full rounded-xl bg-card p-6 shadow-raised md:max-w-md">
        <div class="flex justify-end">
          <span class="sr-only">{{ $t('common.close') }}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 cursor-pointer"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            @click="this.table.showModalMergeFree = false"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 class="mt-1 block text-left text-xl font-medium text-foreground">
          Merge with {{ table.mergeSourceTable }}
        </h2>
        <div class="mt-4 text-left">
          <label for="mergeSelect" class="block text-sm font-medium text-foreground">{{ $t('tables.select_to_merge') }}</label>
          <select id="mergeSelect" v-model="table.selectedMergedTable" class="mt-1 block w-full rounded-xl border-input py-2 pl-3 pr-10 text-base focus:border-ring focus:outline-none focus:ring-ring sm:text-sm">
            <option value="" disabled>{{ $t('tables.select_table') }}</option>
            <option v-for="(t, index) in table.transferTable" :key="index" :value="t.name">{{t.name}}</option>
          </select>
        </div>
        <div class="flex justify-end">
          <button
            @click="
              this.table.showModalMergeFree = false;
              this.table.mergeFreeTablesAction();
            "
            class="mt-8 rounded-xl bg-primary px-3 py-2 text-primary-foreground hover:bg-primary"
            :disabled="!table.selectedMergedTable"
            :class="{'opacity-50 cursor-not-allowed': !table.selectedMergedTable}"
          >
            {{ $t('tables.merge_tables') }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <div
    v-if="table.showModalCaptainTransfer"
    class="fixed inset-0 z-10 overflow-y-auto bg-muted"
  >
    <div class="mt-20 flex items-center justify-center">
      <div class="mt-10 w-full rounded-xl bg-card p-6 shadow-raised md:max-w-md">
        <div class="flex justify-end">
          <span class="sr-only">{{ $t('common.close') }}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            @click="table.showModalCaptainTransfer = false"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h2
          class="mt-1 block text-left text-xl font-medium text-foreground"
        >
          {{ $t('tables.captain_transfer') }}
        </h2>
        <div class="relative" ref="container">
          <label
            for="newTable"
            class="mt-6 block text-left text-foreground"
          >
            {{ $t('tables.new_captain') }}
          </label>
          <input
            type="text"
            class="mt-4 w-full appearance-none rounded-xl border p-2 leading-tight text-foreground shadow focus:outline-none"
            @click="
              this.table.showCaptain = true;
              this.table.fetchCaptain();
            "
            v-model="this.table.newCaptain"
          />
          <div
            v-if="this.table.showCaptain"
            class="absolute left-0 top-full z-10 max-h-64 w-full overflow-y-scroll rounded-xl bg-card shadow"
            ref="dropdown"
          >
            <div
              class="h-16 w-full rounded-xl p-4 hover:bg-muted"
              v-for="(captain, index) in this.table.searchCaptian"
              :key="index"
              @click="this.table.selectcaptain(captain)"
            >
              <h1 class="text-base font-semibold leading-normal">
                {{ captain.name }}
              </h1>
            </div>
          </div>
        </div>
        <label
          for="newTable"
          class="mt-6 block text-left text-foreground"
        >
          {{ $t('tables.current_captain') }}
        </label>
        <input
          type="text"
          id="newTable"
          class="mt-4 w-full appearance-none rounded-xl border p-2 leading-tight text-foreground shadow focus:outline-none"
          :value="this.table.currentCaptain"
          readonly
        />
        <div class="flex justify-end">
          <button
            @click="
              this.table.showModalCaptainTransfer = false;
              this.table.captianTransfer();
            "
            class="mt-8 rounded-xl bg-primary px-3 py-2 text-primary-foreground hover:bg-primary"
          >
            {{ $t('tables.transfer') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { useTableStore } from "@/stores/Table.js";
import { useAuthStore } from "@/stores/Auth.js";
import { useMenuStore } from "@/stores/Menu.js";
import takeAwayTable from "./takeAwayTable.vue";
import { usetoggleRecentOrder } from "@/stores/recentOrder.js";
import { useInvoiceDataStore } from "@/stores/invoiceData.js";

export default {
  name: "Table",
  components: {
    takeAwayTable,
  },
  setup() {
    const table = useTableStore();
    const invoiceData = useInvoiceDataStore();
    const auth = useAuthStore();
    const menu = useMenuStore();
    const recentOrders = usetoggleRecentOrder();
    
    return { table, invoiceData, auth, menu,recentOrders };
  },
  computed: {
    /**
     * Dine-in / takeaway as two labelled options.
     *
     * The store's `tableTypeLabel` returns a hardcoded English string, so it
     * cannot be shown on an Arabic floor. The labels are resolved here and
     * the store keeps owning the state.
     */
    tableTypeOptions() {
      return [
        { takeaway: false, label: this.$t("tables.dine_in") },
        { takeaway: true, label: this.$t("tables.takeaway") },
      ];
    },
  },
  methods: {
    /**
     * Table state, mapped once.
     *
     * The store returns a colour name ("red", "yellow", "green", "default")
     * rather than a state, which is backwards — the view should not be told
     * which hue to paint. Rather than change the store and every caller, the
     * mapping is pinned here so the tile has exactly one place deciding how a
     * state looks.
     */
    stateOf(table) {
      return {
        green: "free",
        default: "active",
        yellow: "occupied",
        red: "attention",
      }[this.table.getBadgeType(table)] || "free";
    },

    railClass(table) {
      return {
        free: "bg-success",
        active: "bg-primary",
        occupied: "bg-warning",
        // The one state that needs a waiter to move; it pulses so it is
        // findable in a room of thirty tiles.
        attention: "bg-destructive animate-pulse-soft",
      }[this.stateOf(table)];
    },

    badgeClass(table) {
      return {
        free: "pos-badge-success",
        active: "pos-badge-accent",
        occupied: "pos-badge-warning",
        attention: "pos-badge-danger",
      }[this.stateOf(table)];
    },
  },
};
</script>
