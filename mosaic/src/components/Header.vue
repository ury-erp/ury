<template>
  <header class="kitchen-header px-5 md:px-8 py-3 flex justify-between items-center">
    <router-link to="/" class="flex items-center gap-3 cursor-pointer">
      <span class="brand-mark"><img :src="imagePath" alt="Smart Restro"></span>
      <span class="hidden sm:block brand-name">Smart <strong>Restro</strong></span>
      <span class="header-divider hidden md:block"></span>
      <span class="hidden md:block header-context">{{ $t('header.kitchen_display') }}</span>
    </router-link>
    <div class="flex items-center gap-4">
      <button 
        class="header-icon-button" 
        @click="reloadKOT"
      >
        <svg class="w-5 h-5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 18 20">
          <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 1v5h-5M2 19v-5h5m10-4a8 8 0 0 1-14.947 3.97M1 10a8 8 0 0 1 14.947-3.97"/>
        </svg> 
      </button>

      <!-- Reused POS User Dropdown -->
      <div class="relative" ref="userMenuRef">
        <button
          @click="toggleUserMenu"
          class="flex items-center gap-2 px-3 h-11 rounded-xl hover:bg-white/10 transition-colors text-white/85 hover:text-white"
        >
          <div class="w-8 h-8 bg-[#f05b42] rounded-lg flex items-center justify-center">
            <svg class="w-4 h-4 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <span class="text-sm font-semibold">{{ userName }}</span>
          <svg class="w-4 h-4 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <div v-if="showUserMenu" class="absolute right-0 mt-2 w-60 bg-[#fffdf8] rounded-2xl shadow-2xl border border-[#eadfce] z-50 overflow-hidden">
          <div class="p-4 border-b border-[#eadfce] bg-[#fff8e8]">
            <p class="text-sm font-semibold text-gray-900">{{ userName }}</p>
            <p class="text-sm font-semibold text-gray-500">{{ userId }}</p>
          </div>
          <div class="py-2">
            <button
              @click="switchToDashboard"
              class="flex justify-start items-center w-full px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-[#fff2d7] transition-colors"
            >
              <svg class="w-4 h-4 me-3 text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="20" height="14" x="2" y="3" rx="2"/>
                <line x1="8" x2="16" y1="21" y2="21"/>
                <line x1="12" x2="12" y1="17" y2="21"/>
              </svg>
              {{ $t('header.switch_to_dashboard') }}
            </button>
            
            <button
              @click="logout"
              class="flex justify-start items-center w-full px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
            >
              <svg class="w-4 h-4 me-3 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" x2="9" y1="12" y2="12"/>
              </svg>
              {{ $t('header.logout') }}
            </button>

            <!-- Language picker: each option labelled in its own script so a
                 user stuck in a language they can't read can still switch. -->
            <div class="border-t border-gray-200 mt-1 pt-2">
              <p class="px-4 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
                {{ $t('language.label') }}
              </p>
              <button
                v-for="(label, code) in $lang.supported"
                :key="code"
                :lang="code"
                @click="$lang.set(code)"
                class="flex justify-between items-center w-full px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <span>{{ label }}</span>
                <span v-if="code === $lang.active()" class="text-blue-600">&#10003;</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<script>
import smartLogo from "../../../smart_logo.png";

export default {
  name: "Header",
  data() {
    return {
      imagePath: smartLogo,
      showUserMenu: false,
      userName: "User",
      userId: "user@example.com"
    };
  },
  methods: {
    reloadKOT() {
      window.location.reload();
    },
    toggleUserMenu() {
      this.showUserMenu = !this.showUserMenu;
    },
    switchToDashboard() {
      this.showUserMenu = false;
      window.location.href = '/ury/dashboard';
    },
    async logout() {
      this.showUserMenu = false;
      try {
        await fetch('/api/method/logout', { method: 'POST' });
      } catch (e) {
        console.error(e);
      }
      window.location.href = '/login?redirect-to=%2Fmosaic';
    },
    handleClickOutside(event) {
      if (this.$refs.userMenuRef && !this.$refs.userMenuRef.contains(event.target)) {
        this.showUserMenu = false;
      }
    },
    async fetchUser() {
      try {
        const res = await fetch('/api/method/frappe.auth.get_logged_user');
        const data = await res.json();
        if (data.message) {
          this.userId = data.message;
          const userRes = await fetch(`/api/method/frappe.client.get_value?doctype=User&filters={"name":"${data.message}"}&fieldname=full_name`);
          const userData = await userRes.json();
          if (userData.message && userData.message.full_name) {
            this.userName = userData.message.full_name;
          } else {
            this.userName = data.message;
          }
        }
      } catch (err) {
        console.error("Failed to fetch user", err);
      }
    }
  },
  mounted() {
    document.addEventListener('mousedown', this.handleClickOutside);
    this.fetchUser();
  },
  unmounted() {
    document.removeEventListener('mousedown', this.handleClickOutside);
  }
};
</script>
