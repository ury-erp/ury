<template>
  <Header />

  <div class="bg-slate-300 min-h-screen">
    <router-view />
  </div>
</template>

<script>
import Header from "./components/Header.vue";

export default {
  name: "App",

  components: {
    Header,
  },
};
</script>