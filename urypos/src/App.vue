<template>
  <!--
    OfflineBar sits above the Header so its spacer div correctly pushes
    the fixed header's content spacer down the page. The bar itself is
    fixed-positioned (top-16/top-20) so render order here only affects
    the spacer div that compensates for its height in normal flow.
  -->

  <!-- Sprint 5: offline status bar + flow spacer -->
  <OfflineBar />

  <Header />

  <div class="container mx-auto mb-16 p-4">
    <NotificationModal />

    <router-view></router-view>
  </div>

  <Tabs />
</template>

<script>
import { useAuthStore } from "@/stores/Auth.js";
import Tabs from "./components/bottomTabs.vue";
import Header from "./components/Header.vue";
import NotificationModal from "./components/NotificationModal.vue";

// ── Sprint 5: offline indicator ───────────────────────────────────────────────
import OfflineBar from "./components/OfflineBar.vue";
// ─────────────────────────────────────────────────────────────────────────────

export default {
  name: "App",
  components: {
    Tabs,
    Header,
    NotificationModal,
    // Sprint 5
    OfflineBar,
  },
  setup() {
    const auth = useAuthStore();
    return { auth };
  },
  mounted() {
    this.auth.fetchUserDetails();
  },
  computed: {
    isLoginPage() {
      return this.$route.path === "/";
    },
  },
};
</script>
