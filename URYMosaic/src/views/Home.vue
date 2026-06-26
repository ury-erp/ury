<template>
  <div>
    <Header @refresh="handleRefresh" />
    <KOT ref="kotRef" />
  </div>
</template>

<script>
import KOT from "../components/kot.vue";
import Header from "../components/Header.vue";

export default {
  name: "Home",
  components: {
    KOT,
    Header,
  },
  methods: {
    handleRefresh() {
      if (this.$refs.kotRef && typeof this.$refs.kotRef.fetchKOT === 'function') {
        this.$refs.kotRef.fetchKOT();
      }
    },
  },
};
</script>