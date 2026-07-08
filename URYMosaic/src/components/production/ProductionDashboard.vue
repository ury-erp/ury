<template>
  <div class="p-6">

    <!-- Loading -->
    <div v-if="loading" class="text-center py-10">
      <h2 class="text-lg font-semibold text-gray-500">
        Loading Production Dashboard...
      </h2>
    </div>

    <!-- Production Cards -->
    <div
      v-else
      class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
    >
      <ProductionCard
        v-for="unit in dashboard"
        :key="unit.name"
        :title="unit.name"
        :activeOrders="unit.active_orders"
        :servedOrders="unit.served_orders"
        :totalOrders="unit.total_orders"
        @open="openProduction(unit.name)"
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
      call: frappe.call(),
    };
  },

  mounted() {
    this.loadDashboard();
  },

  methods: {
    loadDashboard() {
      console.log("this.call =", this.call);

      this.call
        .get("ury.ury.api.ury_mosaic.get_production_dashboard")
        .then((result) => {
          console.log(result);
          this.dashboard = result.message || [];
          this.loading = false;
        })
        .catch((error) => {
          console.error(error);
          this.loading = false;
        });
    },
    openProduction(productionName) {
      this.$router.push(`/${productionName}`);
    },
  },
};
</script>