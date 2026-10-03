<template>
  <div class="mx-auto max-w-7xl px-4 py-6 md:px-7 md:py-8">
    <!-- Which station is this screen for? Said once, with the kitchen art. -->
    <header class="station-hero animate-fade-in">
      <div class="station-hero__copy">
        <span class="station-hero__eyebrow">{{ $t('production.eyebrow') }}</span>
        <h1 class="station-hero__title">{{ $t('production.title') }}</h1>
        <p class="station-hero__body">{{ $t('production.subtitle') }}</p>
      </div>
      <img
        class="station-hero__art"
        :src="heroArt"
        alt=""
        width="420"
        height="300"
        decoding="async"
      />
    </header>

    <!-- Loading: placeholder cards in the real grid, so the page keeps its
         shape instead of collapsing and re-expanding when stations land. -->
    <div
      v-if="loading"
      class="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
      aria-busy="true"
      :aria-label="$t('production.loading')"
    >
      <div v-for="n in 3" :key="n" aria-hidden="true" class="station-skeleton animate-pulse-soft" />
    </div>

    <EmptyState
      v-else-if="failed"
      role="alert"
      image="kitchen-offline"
      :title="$t('production.load_failed')"
      :body="$t('production.load_failed_hint')"
    >
      <button type="button" class="btn-kitchen press" @click="loadDashboard">{{ $t('kot.retry') }}</button>
    </EmptyState>

    <EmptyState
      v-else-if="!stations.length"
      image="kitchen-stations"
      :title="$t('production.none_title')"
      :body="$t('production.none_body')"
    />

    <div v-else class="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      <ProductionCard
        v-for="(unit, i) in stations"
        :key="unit.name"
        :style="{ '--i': i }"
        :title="unit.name"
        :waiting="unit.waiting"
        :served="unit.served"
        :orders="unit.orders"
        :disabled="unit.disabled"
        @open="openProduction(unit.name)"
      />
    </div>
  </div>
</template>

<script>
import ProductionCard from "./ProductionCard.vue";
import EmptyState from "../EmptyState.vue";

export default {
  name: "ProductionDashboard",

  components: {
    ProductionCard,
    EmptyState,
  },

  data() {
    return {
      loading: true,
      failed: false,
      // Served by Frappe from ury/public, shared with the other Smart Restro apps.
      heroArt: "/assets/ury/illustrations/kitchen-stations.svg",
      stations: [],
    };
  },

  mounted() {
    this.loadDashboard();
  },

  methods: {
    // One call for every station, counted with the board's own rules, so the
    // numbers here match what the station opens to.
    async loadDashboard() {
      this.loading = true;
      this.failed = false;
      try {
        const res = await fetch("/api/method/ury.ury.api.ury_kot_display.station_summary", {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        this.stations = data.message || [];
      } catch (error) {
        console.error(error);
        this.failed = true;
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
