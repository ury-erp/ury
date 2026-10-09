<template>
  <Header />

  <div class="bg-[var(--bg)] min-h-screen">
    <router-view />
  </div>
</template>

<script>
import Header from "./components/Header.vue";
import { createProductionScope, productionScopeKey } from "./composables/productionScope";

export default {
  name: "App",

  provide() {
    return { [productionScopeKey]: this.productionScope.scope };
  },

  data() {
    return { productionScope: createProductionScope() };
  },

  mounted() {
    this.productionScope.initialize();
  },

  components: {
    Header,
  },
};
</script>
