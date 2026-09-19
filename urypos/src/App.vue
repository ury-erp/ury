<template>
  <Header />

  <!--
    The shell owns the offsets for the fixed chrome, so no screen has to know
    how tall the brand bar is or whether navigation is a bottom bar or a rail.
    The header used to ship its own spacer div for this, which meant the
    bottom chrome had no equivalent and every screen padded itself by hand.
  -->
  <main class="pos-shell">
    <div class="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
      <NotificationModal />

      <!-- The step strip belongs to the order-taking flow, not to the order
           log or the opening/closing screens, so it is placed here and asks
           the route whether it applies. -->
      <OrderSteps v-if="showSteps" />

      <router-view></router-view>
    </div>
  </main>

  <Tabs />
</template>

<script>
import { useAuthStore } from "@/stores/Auth.js";
import Tabs from "./components/bottomTabs.vue";
import Header from "./components/Header.vue";
import NotificationModal from "./components/NotificationModal.vue";
import OrderSteps from "./components/OrderSteps.vue";

export default {
  name: "App",
  components: {
    Tabs,
    Header,
    NotificationModal,
    OrderSteps,
  },
  computed: {
    /** The four screens that make up taking one order. */
    showSteps() {
      return ["/", "/Table", "/Customer", "/Menu", "/Cart"].includes(
        this.$route.path
      );
    },
  },
  setup() {
    const auth = useAuthStore();
    return { auth };
  },
  mounted() {
    this.auth.fetchUserDetails();
  },
};
</script>
