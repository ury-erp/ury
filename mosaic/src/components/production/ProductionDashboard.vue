<template>
  <div class="p-6" style="font-family: var(--s)">

    <!-- Loading -->
    <div v-if="loading" class="text-center py-10">
      <h2 class="text-lg font-semibold" style="color: var(--t3)">
        Loading Production Dashboard...
      </h2>
    </div>

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
        :disabled="!!unit.disable"
        @open="!unit.disable && openProduction(unit.name)"
      />
    </div>

  </div>
</template>

<script>
import ProductionCard from "./ProductionCard.vue";
import { FrappeApp } from "frappe-js-sdk";

const frappe = new FrappeApp(window.location.origin);

export default {
  name: "ProductionDashboard",

  components: {
    ProductionCard,
  },

  data() {
    return {
      loading: true,
      dashboard: [],
      db: frappe.db(),
    };
  },

  mounted() {
    this.loadDashboard();
  },

  methods: {
    async loadDashboard() {
      try {
        const result = await this.db.getDocList("URY Production Unit", {
          fields: ["name", "disable"],
          orderBy: {
            field: "name",
            order: "asc",
          },
        });

        const units = result || [];

        for (let unit of units) {
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

        console.log("Dashboard:", units);
        this.dashboard = units;
      } catch (error) {
        console.error(error);
      } finally {
        this.loading = false;
      }
    },

    openProduction(productionName) {
      this.$router.push(`/${productionName}`);
    },
  },
};
</script>