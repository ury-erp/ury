<template>
  <div>
    <Header />
    <KOT />
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
};
</script>