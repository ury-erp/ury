<template>
  <div class="flow-root">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-border bg-opacity-50 text-lg"
      v-if="this.invoiceData.isPrinting"
    >
      {{ $t('order.printing_invoice') }}
    </div>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      <div
        w-full
        class="w-full max-w-sm rounded-xl border border-border bg-card shadow"
        v-for="table in this.table.takeAway"
        :key="table.name"
      >
        <div class="flex justify-between">
          <div class="flex justify-start px-2 pt-2">
            <span
              class="me-2 rounded-xl px-2.5 py-0.5 text-sm font-medium"
              :class="{
                'bg-secondary text-primary':
                  this.table.getBadgeType(table) === 'default',
                'bg-destructive/10 text-destructive':
                  this.table.getBadgeType(table) === 'red',
                'bg-warning/10 text-warning':
                  this.table.getBadgeType(table) === 'yellow',
                'bg-success/10 text-success':
                  this.table.getBadgeType(table) === 'green',
              }"
            >
              {{ this.table.getBadgeText(table) }}
            </span>
          </div>
          <div class="relative" v-if="table.occupied !== 1">
            <button
              class="inline-block rounded-xl p-1.5 text-sm text-muted-foreground"
              type="button"
              @click="this.table.toggleDropdown(table.name)"
            >
              <svg
                class="h-6 w-6"
                aria-hidden="true"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z"
                ></path>
              </svg>
            </button>
            <div
              class="absolute right-0 z-10 w-36 divide-y divide-border rounded-xl bg-card shadow"
              v-show="this.table.activeDropdown === table.name"
            >
              <ul class="py-2">
                <li v-if="table.occupied !== 1">
                  <a
                    href="#"
                    class="block px-4 py-2 text-sm text-foreground hover:bg-muted"
                    @click="this.table.openMergeFreeModal(table)"
                    >{{ $t('tables.table_merge') }}</a
                  >
                </li>
                <li v-if="table.occupied === 1">
                  <a
                    href="#"
                    class="block px-4 py-2 text-sm text-foreground hover:bg-muted"
                    @click="this.table.showModal = true"
                    >{{ $t('tables.table_transfer') }}</a
                  >
                </li>
                <li v-if="table.occupied === 1 && this.auth.hasAccess">
                  <a
                    href="#"
                    class="block px-4 py-2 text-sm text-foreground hover:bg-muted"
                    @click="this.table.showModalCaptainTransfer = true"
                    >{{ $t('tables.captain_transfer') }}</a
                  >
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div class="flex flex-col pb-4">
          <div
            class="mt-1 text-center"
            @click="
              table.occupied === 1 && !this.auth.restrictTableOrder
                ? this.table.routeToMenu(table)
                : ''
            "
          >
            <h5
              class="mt-2 text-xl font-medium text-foreground flex justify-center items-center gap-2"
              :class="{ 'mt-3': table.occupied === 0 }"
            >
              {{ table.name }}
              <svg v-if="table.merged_with" class="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" :title="$t('tables.merged_table')">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
              </svg>
            </h5>
            <span class="text-sm text-muted-foreground">{{
              table.occupied === 1 ? this.table.getTimeDifference(table) : ""
            }}</span>
          </div>
          <div class="mt-8 text-center" v-if="table.occupied != 1">
            <button
              type="button"
              class="inline-flex items-center rounded-xl px-2 py-2.5 text-center text-sm font-medium text-primary-foreground hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-ring"
              :class="[
                {
                  'bg-primary': !this.auth.restrictTableOrder,
                  'pointer-events-none bg-primary/40':
                    this.auth.restrictTableOrder,
                },
              ]"
              @click="
                !this.auth.restrictTableOrder &&
                  this.table.addToSelectedTables(table)
              "
            >
              {{ $t('tables.open_table') }}
              <svg
                class="ml-2 h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z"
                ></path>
              </svg>
            </button>
          </div>
          <div class="mt-2 flex justify-center" v-if="table.occupied === 1">
            <button
              type="button"
              class="mb-2 me-2 inline-flex items-center rounded-xl bg-primary px-5 py-2.5 text-center text-sm font-medium text-primary-foreground hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-ring"
              @click="this.invoiceData.billing(table)"
            >
              <svg
                class="svg-icon mr-2"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="white"
              >
                <path
                  d="M6 19H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h3V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v4h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-2zm0-2v-1a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1h2V9H4v8h2zM8 4v3h8V4H8zm0 13v3h8v-3H8zm-3-7h3v2H5v-2z"
                />
              </svg>
              {{ $t('order.bill') }}
            </button>
            <div
              class="relative inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border hover:bg-primary hover:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              :class="[
                {
                  'border-primary text-primary':
                    !this.auth.restrictTableOrder,
                  'pointer-events-none border-border text-muted-foreground':
                    this.auth.restrictTableOrder,
                },
              ]"
              @click="
                !this.auth.restrictTableOrder && this.table.routeToCart(table)
              "
            >
              <svg
                aria-hidden="true"
                class="h-10 w-6"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"></path>
                <path
                  fill-rule="evenodd"
                  d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                  clip-rule="evenodd"
                ></path>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div
    v-if="this.table.takeAway.length === 0"
    class="inset-0 mt-16 flex items-center justify-center"
  >
    <div class="text-center">
      {{ $t('tables.none_takeaway_for_room') }}
      <span class="font-medium">{{ this.table.selectedRoom }}.</span>
    </div>
  </div>
</template>

<script>
import { useTableStore } from "@/stores/Table.js";
import { useInvoiceDataStore } from "@/stores/invoiceData.js";
import { useAuthStore } from "@/stores/Auth.js";

export default {
  name: "takeAwayTable",

  setup() {
    const table = useTableStore();
    const invoiceData = useInvoiceDataStore();
    const auth = useAuthStore();
    return { table, invoiceData, auth };
  },
};
</script>