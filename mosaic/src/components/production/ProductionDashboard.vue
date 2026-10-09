<template>
  <div class="p-6" style="font-family: var(--s)">

    <!-- Loading -->
    <div v-if="scope.error || error" role="alert" class="text-center py-10 text-[var(--rd)]">{{ scope.error || error }}</div>
    <div v-else-if="loading || scope.loading" class="text-center py-10">
      <h2 class="text-lg font-semibold" style="color: var(--t3)">
        Loading Production Dashboard...
      </h2>
    </div>

    <div v-else-if="!dashboard.length" class="text-center py-10 text-[var(--t3)]">No production units for the selected company and branch.</div>
    <!-- Production Cards -->
    <div
      v-else
      class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
    >
      <ProductionCard
        v-for="unit in dashboard"
        :key="unit.name"
        :title="unit.name"
        :activeOrders="unit.active_orders"
        :servedOrders="unit.served_orders"
        :totalOrders="unit.total_orders"
        :disabled="!unit.enabled"
        @open="unit.enabled && openProduction(unit.name)"
      />
    </div>

  </div>
</template>

<script>
import ProductionCard from "./ProductionCard.vue";
import { FrappeApp } from "frappe-js-sdk";
import { productionScopeKey } from "../../composables/productionScope";

const frappe = new FrappeApp(window.location.origin);

export default {
  name: "ProductionDashboard",
  inject: { scope: { from: productionScopeKey } },

  components: {
    ProductionCard,
  },

  data() {
    return {
      loading: true,
      dashboard: [],
      db: frappe.db(),
      error: "",
      requestId: 0,
    };
  },

  computed: {
    selectedScope() {
      return [this.scope.ready, this.scope.company, this.scope.branch];
    },
  },

  watch: {
    selectedScope: { handler: "loadDashboard", immediate: true },
  },

  beforeUnmount() {
    this.requestId++;
  },

  methods: {
    async loadDashboard() {
      const request = ++this.requestId;
      this.dashboard = [];
      this.error = "";
      this.loading = true;
      if (!this.scope.ready) return;
      try {
        const filters = [];
        if (this.scope.company !== "all") filters.push(["company", "=", this.scope.company]);
        if (this.scope.branch !== "all") filters.push(["branch", "=", this.scope.branch]);
        const result = await this.db.getDocList("URY Production Unit", {
          fields: ["name", "enabled"],
          filters,
          limit: 0,
          orderBy: {
            field: "name",
            order: "asc",
          },
        });

        const units = result || [];

        for (let unit of units) {
          if (request !== this.requestId) return;
          const [active, served, total] = await Promise.all([
            this.db.getCount("URY KOT", [
              ["production", "=", unit.name],
              ["docstatus", "=", 1],
              ["order_status", "=", "Ready For Prepare"],
            ]),
            this.db.getCount("URY KOT", [
              ["production", "=", unit.name],
              ["docstatus", "=", 1],
              ["order_status", "=", "Served"],
            ]),
            this.db.getCount("URY KOT", [
              ["production", "=", unit.name],
              ["docstatus", "=", 1],
            ]),
          ]);

          unit.active_orders = active;
          unit.served_orders = served;
          unit.total_orders = total;
        }

        if (request === this.requestId) this.dashboard = units;
      } catch (error) {
        if (request === this.requestId) this.error = "Unable to load production units. Please reload to retry.";
      } finally {
        if (request === this.requestId) this.loading = false;
      }
    },

    openProduction(productionName) {
      this.$router.push({ name: "KOT", params: { production: productionName } });
    },
  },
};
</script>
