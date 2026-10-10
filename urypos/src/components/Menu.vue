<template>
  <orderInfo />
  <Search />
  <div v-if="this.menu.paginatedItems.length > 0">
    <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      <!--
        A menu item.

        The card now carries the quantity itself: once an item is in the cart
        it gets an amber wash and a count in the corner, so a waiter taking a
        long order can see what they have already added while scrolling,
        instead of only from the cart screen. The two typography branches the
        old markup switched on `viewItemImage` are gone — the name and price
        read the same either way, and only the image is conditional.
      -->
      <article
        v-for="(item, itemIndex) in this.menu.paginatedItems"
        :key="item.item"
        :style="{ '--i': itemIndex }"
        class="pos-card animate-fade-in-up stagger-fast relative flex flex-col overflow-hidden p-2.5 transition-colors duration-fast"
        :class="item.qty ? 'border-accent bg-secondary/40' : ''"
      >
        <span
          v-if="item.qty"
          class="absolute end-2 top-2 z-10 inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-accent px-1.5 text-sm font-bold text-accent-foreground tabular-nums shadow-card"
        >
          {{ item.qty }}
        </span>

        <div class="w-full" v-if="this.auth.viewItemImage">
          <div v-if="item.item_image" class="aspect-square w-full overflow-hidden rounded-xl">
            <img
              :src="this.menu.getFullImagePath(item.item_image)"
              :alt="item.item_name"
              loading="lazy"
              class="h-full w-full object-cover"
            />
          </div>
          <!--
            No photo. The old fallback fetched a 640×640 placeholder from
            dummyimage.com on every such item — a network round trip per card,
            to an external host, on a POS that is regularly offline. The
            initials are drawn locally instead.
          -->
          <div
            v-else
            class="flex aspect-square w-full items-center justify-center rounded-xl bg-muted"
          >
            <span class="text-3xl font-bold text-muted-foreground/60">
              {{ this.menu.itemNameExtract(item.item_name) }}
            </span>
          </div>
        </div>

        <h2 class="mt-2 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-foreground">
          {{ item.item_name }}
        </h2>

        <p class="pos-money mt-0.5 text-base text-foreground">
          {{ this.invoiceData.currency }} {{ item.rate }}
        </p>

        <div class="mt-2.5">
          <button
            v-if="!item.qty"
            type="button"
            class="pos-btn-ghost w-full"
            @click="
              item.showInput = true;
              this.menu.addToCart(item);
            "
          >
            {{ $t('cart.add_plus') }}
          </button>

          <!-- Stepper. Equal-weight ends with the count between them, sized so
               a thumb cannot hit the wrong one. -->
          <div v-else class="flex items-stretch overflow-hidden rounded-xl border border-border">
            <button
              type="button"
              class="press flex h-11 w-11 shrink-0 items-center justify-center bg-card text-xl font-bold transition-colors duration-fast hover:bg-muted disabled:opacity-40"
              :class="canRemove ? 'text-foreground' : 'text-muted-foreground/60'"
              :disabled="this.recentOrders.restaurantTable"
              :aria-label="$t('cart.decrease')"
              @click="canRemove && this.menu.decrementItemQuantity(item)"
            >
              &minus;
            </button>

            <button
              type="button"
              class="flex h-11 min-w-0 flex-1 items-center justify-center border-x border-border bg-card text-base font-bold text-foreground tabular-nums"
              @click="this.menu.showModal(item)"
              :aria-label="$t('cart.quantity')"
            >
              {{ item.qty }}
            </button>

            <button
              type="button"
              class="press flex h-11 w-11 shrink-0 items-center justify-center bg-card text-xl font-bold text-foreground transition-colors duration-fast hover:bg-muted"
              :aria-label="$t('cart.increase')"
              @click="this.menu.incrementItemQuantity(item)"
            >
              +
            </button>
          </div>
        </div>
      </article>
      <div
        v-if="menu.showDialog"
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
                @click="menu.showDialog = false"
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
                id="quantity"
                class="mt-4 w-full appearance-none rounded-xl border p-2 leading-tight text-foreground shadow focus:outline-none"
                v-model="this.menu.quantity"
                v-bind:readonly="
                  this.recentOrders.editPrintedInvoice === 1 &&
                  this.auth.removeTableOrderItem === 0
                "
                :disabled="this.recentOrders.restaurantTable"
              />
              <label
                for="comments"
                class="mt-6 block text-left text-foreground"
              >
                {{ $t('order.comments') }}
              </label>
              <input
                type="text"
                id="Comments"
                class="mt-4 w-full rounded-xl border p-2 leading-tight text-foreground shadow focus:outline-none"
                v-model="this.menu.itemComments"
              />
            </div>
            <div class="flex justify-end">
              <button
                @click="this.menu.addToCartAndUpdateQty(item)"
                class="mt-8 rounded-xl bg-primary px-3 py-2 text-primary-foreground hover:bg-primary"
              >
                {{ $t('common.add') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div v-else>
    <div
      v-if="this.menu.items.length === 0"
      class="flex h-screen items-center justify-center"
    >
      <div class="text-center">
        {{ $t('menu.items_not_found_hint') }}
      </div>
    </div>
    <div v-else class="flex h-screen items-center justify-center">
      <div class="text-center">{{ $t('menu.items_not_found') }}</div>
    </div>
  </div>
  <div
    class="mt-4 flex justify-center"
    v-if="this.menu.paginatedItems.length > 0"
  >
    <button
      :class="{ hidden: this.menu.currentPage === 1 }"
      :disabled="this.menu.currentPage === 1"
      @click="this.menu.currentPage -= 1"
      class="mr-2 rounded-md border px-2 py-1"
    >
      {{ $t('common.previous') }}
    </button>
    <div v-for="pageNumber in this.menu.pageNumbers">
      <button
        v-if="
          pageNumber === this.menu.currentPage ||
          Math.abs(pageNumber - this.menu.currentPage) <= 2
        "
        :key="pageNumber"
        @click="this.menu.currentPage = pageNumber"
        :class="{ 'bg-muted': pageNumber === this.menu.currentPage }"
        class="mr-2 rounded-md border px-2 py-1"
      >
        {{ pageNumber }}
      </button>
      <span
        v-else-if="
          this.menu.pageNumbers.indexOf(pageNumber) === 0 ||
          this.menu.pageNumbers.indexOf(pageNumber) ===
            this.menu.pageNumbers.length - 1
        "
      >
        ...
      </span>
    </div>
    <button
      :disabled="this.menu.currentPage === this.menu.totalPages"
      @click="this.menu.currentPage += 1"
      :class="{ hidden: this.menu.currentPage === this.menu.totalPages }"
      class="rounded-md border px-2 py-1"
    >
      {{ $t('common.next') }}
    </button>
  </div>
</template>

<script>
import Search from "./Search.vue";
import orderInfo from "./orderInfo.vue";
import frappe from "@/stores/frappeSdk.js";
import { useMenuStore } from "@/stores/Menu.js";
import { useAuthStore } from "@/stores/Auth.js";
import { usetoggleRecentOrder } from "@/stores/recentOrder.js";
import { useInvoiceDataStore } from "@/stores/invoiceData.js";

export default {
  data() {
    return {
      frappe: frappe,
    };
  },
  setup() {
    const menu = useMenuStore();
    const auth = useAuthStore();
    const recentOrders = usetoggleRecentOrder();
    const invoiceData = useInvoiceDataStore();
    return { menu, auth, recentOrders, invoiceData };
  },
  computed: {
    /**
     * Whether this till may take items back off a ticket.
     *
     * The same two-clause test was inlined twice per item card — once to
     * colour the minus button and once to guard its click — so the two could
     * disagree and show an enabled control that does nothing.
     */
    canRemove() {
      return (
        this.recentOrders.editPrintedInvoice === 0 ||
        this.auth.removeTableOrderItem === 1
      );
    },
  },
  name: "Menu",
  components: {
    Search,
    orderInfo,
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