<template>
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

export default {
  name: "App",
  components: {
    Tabs,
    Header,
    NotificationModal,
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
