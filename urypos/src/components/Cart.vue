<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-border bg-opacity-50 text-lg"
    v-if="this.invoiceData.invoiceUpdating"
  >
    {{ $t('order.updating') }}
  </div>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-border bg-opacity-50 text-lg"
    v-if="this.invoiceData.kotPrinting"
  >
    {{ $t('order.kot_reprinting') }}
  </div>
  <div class="mt-5">
    <orderInfo />

    <!--
      Ticket-level actions.

      These were three unlabelled grey buttons floated right with `mr-4`,
      indistinguishable from each other and from the page. They are now a
      wrapping row of named controls with the destructive one clearly
      destructive, so "cancel the order" cannot be hit while reaching for
      "reprint".
    -->
    <div class="mt-3 flex flex-wrap gap-2" v-if="this.menu.cart.length > 0">
      <!--
        The one action that sends the cart to the kitchen.

        It used to read "Update" unconditionally, because its `v-if` was the
        store's submit-in-flight flag rather than anything about the order.
        The label now follows what is actually happening: a new ticket is
        sent, an existing one is updated.
      -->
      <button
        class="pos-btn-primary pos-btn-lg"
        v-if="this.invoiceData.showUpdateButtton === true"
        @click="this.invoiceData.invoiceCreation()"
      >
        {{ $t(this.invoiceData.submitLabelKey) }}
      </button>

      <button
        class="pos-btn-ghost"
        v-if="this.invoiceData.enableKotReprint"
        @click="this.invoiceData.kotReprint()"
      >
        {{ $t('order.kot_reprint') }}
      </button>

      <button
        class="pos-btn-ghost ms-auto text-destructive"
        v-if="
          (this.recentOrders.invoicePrinted === 0 ||
            this.table.invoicePrinted === 0) &&
          !this.auth.cashier
        "
        @click="this.invoiceData.showCancelInvoiceModal()"
      >
        {{ $t('common.cancel') }}
      </button>
    </div>
  </div>

  <!-- Empty cart. The old copy was the generic "nothing to show" centred in a
       full viewport height; it now says what is missing and offers the way
       out, which on this screen is always "go add something". -->
  <div
    class="flex flex-col items-center justify-center py-24 text-center animate-fade-in"
    v-if="this.menu.cart.length === 0"
  >
    <div class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
      <svg class="h-8 w-8 text-muted-foreground" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M2 3h2.5l2.2 11.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.55L21 7H6" />
      </svg>
    </div>
    <p class="pos-title">{{ $t('cart.empty_title') }}</p>
    <p class="mt-1 text-sm text-muted-foreground">{{ $t('cart.empty_body') }}</p>
    <router-link to="/Menu" class="pos-btn-primary mt-5">
      {{ $t('menu.title') }}
    </router-link>
  </div>

  <!--
    The ticket.

    Was a three-column grid whose header declared two of the three columns, so
    the delete column had no heading and the widths never lined up between the
    header row and the item rows. It is a list now: each row owns its own
    layout, and the quantity and price sit together where they are compared.
  -->
  <div class="pos-card mt-5 overflow-hidden" v-if="this.menu.cart.length > 0">
    <div class="flex items-center justify-between border-b border-border bg-muted px-4 py-2.5">
      <span class="pos-label">{{ $t('menu.item_name') }}</span>
      <span class="pos-label">{{ $t('menu.quantity') }}</span>
    </div>

    <ul class="divide-y divide-border">
      <li
        v-for="(cart_item, index) in this.menu.cart"
        :key="index"
        class="flex items-center gap-3 px-4 py-3"
      >
        <span class="min-w-0 flex-1 text-base font-semibold text-foreground">
          {{ cart_item.item_name }}
        </span>

        <button
          type="button"
          class="press h-10 min-w-[3rem] rounded-xl border border-border bg-card text-base font-bold text-foreground tabular-nums transition-colors duration-fast hover:bg-muted"
          :aria-label="$t('cart.quantity')"
          @click="
            this.menu.showModal(cart_item);
            menu.showDialogCart = true;
          "
        >
          {{ parseInt(cart_item.qty) }}
        </button>

        <button
          class="press flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-destructive transition-colors duration-fast hover:bg-destructive/10 disabled:opacity-40"
          type="button"
          :disabled="this.recentOrders.restaurantTable || !canRemove"
          :aria-label="$t('common.delete')"
          @click="canRemove && this.menu.removeItemFromCart(index)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6Z"></path>
            <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1ZM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118ZM2.5 3h11V2h-11v1Z"></path>
          </svg>
        </button>
      </li>
    </ul>

    <!-- The total belongs on the ticket, not in a read-only text input two
         sections below it. -->
    <div class="flex items-center justify-between border-t-2 border-border bg-muted px-4 py-3.5">
      <span class="text-sm font-bold uppercase tracking-wider text-muted-foreground">
        {{ $t('totals.grand_total') }}
      </span>
      <span class="pos-money text-xl text-foreground">
        {{ this.invoiceData.currency }}
        {{ this.menu.grand_total || this.table.grandTotal || invoiceData.grandTotal }}
      </span>
    </div>
  </div>

  <div class="mt-5 space-y-4" v-if="this.menu.cart.length > 0">
    <div v-if="this.menu.selectedOrderType === 'Aggregators'">
      <label for="aggregatorId" class="pos-label mb-1.5 block">
        {{ $t('order.aggregator_id') }}
      </label>
      <input id="aggregatorId" class="pos-input md:w-3/5 lg:w-2/5" v-model="this.menu.aggregatorId" />
    </div>

    <div>
      <label for="comments" class="pos-label mb-1.5 block">
        {{ $t('order.comments') }}
      </label>
      <input id="comments" class="pos-input md:w-3/5 lg:w-2/5" v-model="this.menu.comments" />
    </div>
  </div>

  <div
    v-if="this.invoiceData.cancelInvoiceFlag === true"
    class="fixed inset-0 z-10 mt-20 overflow-y-auto bg-muted"
  >
    <div class="mt-20 flex items-center justify-center">
      <div class="w-full rounded-lg bg-card p-6 shadow-raised md:max-w-md">
        <div class="flex justify-end">
          <span class="sr-only">{{ $t('common.close') }}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            @click="this.invoiceData.cancelInvoiceFlag = false"
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
          {{ $t('order.confirm_cancel') }}
        </h2>
        <div class="relative">
          <label
            for="cancelReason"
            class="mt-6 block text-left text-foreground"
          >
            {{ $t('order.reason') }}
          </label>
          <input
            type="text"
            id="cancelReason"
            class="mt-4 w-full appearance-none rounded-xl border p-2 leading-tight text-foreground shadow focus:outline-none"
            v-model="this.invoiceData.cancelReason"
          />
        </div>
        <div class="flex justify-end">
          <button
            @click="this.invoiceData.cancelInvoiceFlag = false"
            class="mr-3 mt-6 rounded-xl border border-input bg-muted px-3 py-2"
          >
            {{ $t('common.no') }}
          </button>
          <button
            @click="handleConfirmCancellation()"
            class="mt-6 rounded-xl bg-primary px-3 py-2 text-primary-foreground hover:bg-primary"
          >
            {{ $t('common.yes') }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <div
    v-if="menu.showDialogCart"
    class="fixed inset-0 z-10 mt-20 overflow-y-auto bg-muted"
  >
    <div class="mt-10 flex items-center justify-center">
      <div class="w-full rounded-lg bg-card p-6 shadow-raised md:max-w-md">
        <div class="flex justify-end">
          <span class="sr-only">{{ $t('common.close') }}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            @click="menu.showDialogCart = false"
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
          {{ $t('common.enter_details') }}
        </h2>
        <div class="relative">
          <label
            for="quantity"
            class="mt-6 block text-left text-foreground"
          >
            {{ $t('menu.quantity') }}
          </label>
          <input
            type="number"
            id="modeOfPayment"
            class="mt-4 w-full appearance-none rounded-xl border p-2 leading-tight text-foreground shadow focus:outline-none"
            v-model="this.menu.quantity"
            v-bind:readonly="
              this.recentOrders.editPrintedInvoice === 1 &&
              this.auth.removeTableOrderItem === 0
            "
            :disabled="this.recentOrders.restaurantTable"
          />
          <label
            for="Comments"
            class="mt-6 block text-left text-foreground"
          >
            {{ $t('order.comments') }}
          </label>
          <input
            type="text"
            id="Comments"
            class="mt-4 w-full appearance-none rounded-xl border p-2 leading-tight text-foreground shadow focus:outline-none"
            v-model="this.menu.itemComments"
          />
        </div>
        <div class="flex justify-end">
          <button
            @click="
              this.menu.addToCartAndUpdateQty(item);
              menu.showDialogCart = false;
            "
            class="mt-8 rounded-xl bg-primary px-3 py-2 text-primary-foreground hover:bg-primary"
          >
            {{ $t('common.add') }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <div
    class="mt-4 w-full divide-y divide-border bg-card"
    v-if="this.menu.cart.length > 0"
  >
    <details>
      <summary class="question w-full cursor-pointer select-none py-3">
        {{ $t('common.additional_details') }}
      </summary>
      <div class="additional-details m-3">
        <label
          for="invoiceNo"
          class="mt-10 block text-sm font-medium text-foreground"
          v-if="this.table.invoiceNo || invoiceData.invoiceNumber"
        >
          {{ $t('order.invoice') }}
        </label>
        <input
          class="invoiceNo mt-3 block w-full rounded-md border bg-muted p-2.5 text-sm text-foreground md:w-3/5 lg:w-2/5"
          :value="this.table.invoiceNo || invoiceData.invoiceNumber"
          v-if="this.table.invoiceNo || invoiceData.invoiceNumber"
          readonly
        />
        <label
          for="waiter"
          class="mt-10 block text-sm font-medium text-foreground"
          :class="{ hidden: this.invoiceData.waiter === '' }"
        >
          {{ $t('tables.waiter') }}
        </label>
        <input
          class="waiter mt-3 block w-full rounded-md border bg-muted p-2.5 text-sm text-foreground md:w-3/5 lg:w-2/5"
          :class="{ hidden: this.invoiceData.waiter === '' }"
          :value="
            this.table.previousWaiter !== null &&
            this.table.previousWaiter !== undefined
              ? this.table.previousWaiter
              : this.recentOrders.recentWaiter !== null &&
                this.recentOrders.recentWaiter !== undefined
              ? this.recentOrders.recentWaiter
              : this.invoiceData.waiter
          "
          readonly
        />
        <label
          for="posProfile"
          class="mt-10 block text-sm font-medium text-foreground"
          :class="{ hidden: this.invoiceData.posProfile === '' }"
        >
          {{ $t('pos.profile') }}
        </label>
        <input
          class="posProfile mt-3 block w-full rounded-md border bg-muted p-2.5 text-sm text-foreground md:w-3/5 lg:w-2/5"
          :class="{ hidden: this.invoiceData.posProfile === '' }"
          v-model="this.invoiceData.posProfile"
          readonly
        />
        <label
          for="cashier"
          class="mt-10 block text-sm font-medium text-foreground"
          :class="{ hidden: this.invoiceData.cashier === '' }"
        >
          {{ $t('pos.cashier') }}
        </label>
        <input
          class="mt-3 block w-full rounded-md border bg-muted p-2.5 text-sm text-foreground md:w-3/5 lg:w-2/5"
          :class="{ hidden: this.invoiceData.cashier === '' }"
          v-model="this.invoiceData.cashier"
          readonly
        />
      </div>
    </details>
  </div>
</template>

<script>
import orderInfo from "./orderInfo.vue";
import { useMenuStore } from "@/stores/Menu.js";
import { useTableStore } from "@/stores/Table.js";
import { useInvoiceDataStore } from "@/stores/invoiceData.js";
import { useAuthStore } from "@/stores/Auth.js";
import { usetoggleRecentOrder } from "@/stores/recentOrder.js";
import { useNotifications } from "@/stores/Notification.js";

export default {
  name: "Cart",
  components: {
    orderInfo,
  },
  methods: {
    handleConfirmCancellation() {
      console.log(this.invoiceData.cancelReason);
      console.log(!this.invoiceData.cancelReason || this.invoiceData.cancelReason.trim() === '');
      if (!this.invoiceData.cancelReason || this.invoiceData.cancelReason.trim() === '') {
        this.notification.createNotification('Please enter a reason for cancellation');
        return;
      }
      this.invoiceData.cancelInvoice();
      this.invoiceData.cancelInvoiceFlag = false;
    },
  },
  setup() {
    const menu = useMenuStore();
    const table = useTableStore();
    const auth = useAuthStore();
    const recentOrders = usetoggleRecentOrder();
    const invoiceData = useInvoiceDataStore();
    const notification = useNotifications();
    return { menu, table, invoiceData, auth, recentOrders, notification };
  },
  computed: {
    /**
     * Whether this till may take a line back off the ticket.
     *
     * The same test was inlined in the delete handler only, so the button
     * looked enabled on a printed invoice and silently did nothing. It now
     * drives the `disabled` state too.
     */
    canRemove() {
      return (
        this.recentOrders.editPrintedInvoice === 0 ||
        this.auth.removeTableOrderItem === 1
      );
    },
  },
  mounted() {
    window.scrollTo(0, 0);
  },
};
</script>
<style>
.bg-muted {
  background-color: rgba(0, 0, 0, 0.2);
}
</style>
