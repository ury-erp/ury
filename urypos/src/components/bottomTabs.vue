<template>
  <!--
    Floor navigation, in two shapes.

    The markup is written once and placed twice: a bottom bar on a phone, a
    side rail on a tablet. A POS station is usually a 10" tablet on a stand,
    where a bottom bar wastes the width the screen has and puts the controls
    furthest from the hands holding it — so past `md` the same tabs move to a
    rail on the leading edge.

    Before this it was five near-identical 40-line blocks repeating the same
    active/inactive test twice each, once on the icon and once on the label.
  -->
  <template v-if="!this.tabClick.isLoginPage">
    <!-- Phone -->
    <nav class="pos-tabbar" :aria-label="$t('nav.primary')">
      <div
        class="mx-auto grid h-16 max-w-xl"
        :class="auth.cashier ? 'grid-cols-5' : 'grid-cols-4'"
      >
        <component
          :is="'router-link'"
          v-for="tab in tabs"
          :key="'bar-' + tab.path"
          :to="tab.to"
          class="pos-tab press"
          :class="{ 'pos-tab-active': isActive(tab.path) }"
          :aria-current="isActive(tab.path) ? 'page' : undefined"
          @click="tab.onClick && tab.onClick()"
        >
          <span
            v-if="isActive(tab.path)"
            class="absolute inset-x-3 top-0 h-0.5 rounded-b bg-primary"
            aria-hidden="true"
          ></span>

          <span class="relative">
            <svg class="h-6 w-6" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path v-for="(d, i) in tab.paths" :key="i" :d="d" fill-rule="evenodd" clip-rule="evenodd" />
            </svg>
            <span v-if="tab.badge" :class="badgeClass">
              {{ tab.badge > 99 ? '99+' : tab.badge }}
            </span>
          </span>

          <span class="max-w-full truncate">{{ tab.label }}</span>
        </component>
      </div>
    </nav>

    <!-- Tablet -->
    <nav class="pos-rail" :aria-label="$t('nav.primary')">
      <router-link
        v-for="tab in tabs"
        :key="'rail-' + tab.path"
        :to="tab.to"
        class="pos-tab press"
        :class="{ 'pos-tab-active': isActive(tab.path) }"
        :aria-current="isActive(tab.path) ? 'page' : undefined"
        @click="tab.onClick && tab.onClick()"
      >
        <span
          v-if="isActive(tab.path)"
          class="absolute inset-y-2 start-0 w-1 rounded-e bg-primary"
          aria-hidden="true"
        ></span>

        <span class="relative">
          <svg class="h-7 w-7" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path v-for="(d, i) in tab.paths" :key="i" :d="d" fill-rule="evenodd" clip-rule="evenodd" />
          </svg>
          <span v-if="tab.badge" :class="badgeClass">
            {{ tab.badge > 99 ? '99+' : tab.badge }}
          </span>
        </span>

        <span class="max-w-full truncate">{{ tab.label }}</span>
      </router-link>
    </nav>
  </template>
</template>

<script>
import { useAuthStore } from "@/stores/Auth.js";
import { tabFunctions } from "@/stores/bottomTabs.js";
import { useInvoiceDataStore } from "@/stores/invoiceData.js";
import { useMenuStore } from "@/stores/Menu.js";

/** Icon path data, kept out of the template so the markup stays readable. */
const ICONS = {
  tables: [
    "M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z",
  ],
  menu: [
    "M9 2a1 1 0 000 2h2a1 1 0 100-2H9z",
    "M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z",
  ],
  customer: ["M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"],
  cart: [
    "M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
  ],
  orders: [
    "M14.066 0H7v5a2 2 0 0 1-2 2H0v11a1.97 1.97 0 0 0 1.934 2h12.132A1.97 1.97 0 0 0 16 18V2a1.97 1.97 0 0 0-1.934-2Zm-3 15H4.828a1 1 0 0 1 0-2h6.238a1 1 0 0 1 0 2Zm0-4H4.828a1 1 0 0 1 0-2h6.238a1 1 0 1 1 0 2Z",
    "M5 5V.13a2.96 2.96 0 0 0-1.293.749L.879 3.707A2.98 2.98 0 0 0 .13 5H5Z",
  ],
};

export default {
  name: "Bottom Tabs",
  setup() {
    const auth = useAuthStore();
    const invoiceData = useInvoiceDataStore();
    const tabClick = tabFunctions();
    const menu = useMenuStore();
    return { auth, tabClick, invoiceData, menu };
  },
  computed: {
    /** One definition for the cart count, used by both placements. */
    badgeClass() {
      return "absolute -end-2 -top-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground tabular-nums";
    },

    /**
     * Lines in the cart, not units — a waiter reads "four things to send",
     * and a badge showing 12 because one line has twelve waters would be
     * misleading about how much is on the ticket.
     */
    cartCount() {
      return (this.menu.cart || []).length;
    },

    /**
     * Navigation is blocked while an invoice is being amended, which the old
     * markup expressed by routing to `#`. Kept as-is so behaviour does not
     * change, but expressed once instead of per tab.
     */
    lockedTarget() {
      return this.invoiceData.invoiceUpdating;
    },

    tabs() {
      const list = [
        {
          path: "/Table",
          to: this.lockedTarget ? "#" : "/Table",
          label: this.$t("tables.title"),
          paths: ICONS.tables,
        },
        {
          path: "/Menu",
          to: this.lockedTarget ? "#" : "/Menu",
          label: this.$t("menu.title"),
          paths: ICONS.menu,
          onClick: () => this.tabClick.clickMenuTab(),
        },
        {
          path: "/Customer",
          to: this.lockedTarget ? "#" : "/Customer",
          label: this.$t("customer.title"),
          paths: ICONS.customer,
          onClick: () => !this.auth.cashier && this.tabClick.checkActiveTable(),
        },
        {
          path: "/Cart",
          to: "/Cart",
          label: this.$t("cart.title"),
          paths: ICONS.cart,
          badge: this.cartCount,
          onClick: () => !this.auth.cashier && this.tabClick.checkActiveTable(),
        },
      ];

      if (this.auth.cashier) {
        list.push({
          path: "/recentOrder",
          to: this.lockedTarget ? "#" : "/recentOrder",
          label: this.$t("order.order_log"),
          paths: ICONS.orders,
        });
      }

      return list;
    },
  },
  methods: {
    isActive(path) {
      return this.tabClick.currentTab === path;
    },
  },
};
</script>
