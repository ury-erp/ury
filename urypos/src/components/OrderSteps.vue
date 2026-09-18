<template>
  <!--
    Order progress.

    Taking an order is four moves — pick a table, say who it is for, choose
    the food, send it — but the app presented them as four peer tabs with no
    order and no sense of completion. A waiter mid-order could not tell what
    was still missing, and the failure mode was finding out at the end, from
    an alert ("Please Select Customer / No of Pax") after the food was
    already chosen.

    This states the sequence, marks what is done, and lets a completed step be
    tapped to go back. Steps ahead of the current one are reachable too — the
    app never enforced an order and it would be wrong to start now — but they
    read as pending rather than as available.
  -->
  <nav
    v-if="steps.length > 1"
    class="mb-5 flex items-center gap-1 overflow-x-auto pb-1"
    :aria-label="$t('steps.label')"
  >
    <template v-for="(step, index) in steps" :key="step.path">
      <router-link
        :to="step.to"
        class="press group flex shrink-0 items-center gap-2 rounded-xl px-2.5 py-1.5 transition-colors duration-fast"
        :class="step.current ? 'bg-secondary' : 'hover:bg-muted'"
        :aria-current="step.current ? 'step' : undefined"
        @click="step.onClick && step.onClick()"
      >
        <span
          class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-fast"
          :class="badgeClass(step)"
        >
          <!-- A tick, not the number, once a step is behind you: the number
               is only useful while it is still something to do. -->
          <svg
            v-if="step.done && !step.current"
            class="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path fill-rule="evenodd" clip-rule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0z" />
          </svg>
          <span v-else>{{ index + 1 }}</span>
        </span>

        <span class="min-w-0">
          <span
            class="block whitespace-nowrap text-sm font-bold leading-tight"
            :class="step.current ? 'text-secondary-foreground' : 'text-foreground'"
          >
            {{ step.label }}
          </span>
          <!-- What the step resolved to, so the strip doubles as a summary of
               the order so far. -->
          <span
            v-if="step.value"
            class="block max-w-[9rem] truncate text-[11px] font-semibold text-muted-foreground"
          >
            {{ step.value }}
          </span>
        </span>
      </router-link>

      <span
        v-if="index < steps.length - 1"
        class="h-px w-4 shrink-0 rounded"
        :class="steps[index + 1].done || steps[index + 1].current ? 'bg-primary' : 'bg-border'"
        aria-hidden="true"
      ></span>
    </template>
  </nav>
</template>

<script>
import { useAuthStore } from "@/stores/Auth.js";
import { useTableStore } from "@/stores/Table.js";
import { useMenuStore } from "@/stores/Menu.js";
import { useCustomerStore } from "@/stores/Customer.js";
import { tabFunctions } from "@/stores/bottomTabs.js";

export default {
  name: "OrderSteps",
  setup() {
    const auth = useAuthStore();
    const table = useTableStore();
    const menu = useMenuStore();
    const customers = useCustomerStore();
    const tabClick = tabFunctions();
    return { auth, table, menu, customers, tabClick };
  },
  computed: {
    /**
     * The sequence, and how far along it the order is.
     *
     * A cashier's first step is the order type rather than a table, which is
     * the same distinction the navigation and the table screen already make.
     */
    steps() {
      const current = this.tabClick.currentTab;

      const seatStep = this.auth.cashier
        ? {
            path: "/Table",
            label: this.$t("order.type"),
            value: this.menu.selectedOrderType,
            done: Boolean(this.menu.selectedOrderType),
          }
        : {
            path: "/Table",
            label: this.$t("tables.title"),
            value: this.table.selectedTable,
            done: Boolean(this.table.selectedTable),
          };

      const list = [
        seatStep,
        {
          path: "/Customer",
          label: this.$t("customer.title"),
          value: this.customerSummary,
          done: Boolean(this.customerSummary),
          onClick: () => !this.auth.cashier && this.tabClick.checkActiveTable(),
        },
        {
          path: "/Menu",
          label: this.$t("menu.title"),
          value: this.itemSummary,
          done: (this.menu.cart || []).length > 0,
          onClick: () => this.tabClick.clickMenuTab(),
        },
        {
          path: "/Cart",
          label: this.$t("cart.title"),
          value: null,
          done: false,
        },
      ];

      return list.map((step) => ({
        ...step,
        to: step.path,
        current: current === step.path,
      }));
    },

    customerSummary() {
      const name = this.customers.search;
      const pax = this.customers.numberOfPax;
      if (name && pax) return `${name} · ${pax}`;
      return name || (pax ? this.$t("customer.pax_count", { count: pax }) : "");
    },

    itemSummary() {
      const count = (this.menu.cart || []).length;
      return count ? this.$t("cart.items_count", { count }) : "";
    },
  },
  methods: {
    badgeClass(step) {
      if (step.current) return "bg-primary text-primary-foreground";
      if (step.done) return "bg-success text-success-foreground";
      return "bg-muted text-muted-foreground";
    },
  },
};
</script>
