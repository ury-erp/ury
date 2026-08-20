<template>
  <header class="bg-white p-4 flex justify-between items-center border-b border-gray-200">
    <router-link to="/" class="flex items-center cursor-pointer">
      <img :src="imagePath" alt="Logo" class="ml-20 w-40 h-15 mr-2">
    </router-link>
    <div class="flex items-center gap-4">
      <button class="hover:bg-slate-300 text-blue font-semibold px-6 py-1 rounded-md flex items-center gap-2" @click="reloadKOT">
        <svg class="w-6 h-6 text-blue-800" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 18 20">
          <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 1v5h-5M2 19v-5h5m10-4a8 8 0 0 1-14.947 3.97M1 10a8 8 0 0 1 14.947-3.97"/>
        </svg> 
        Refresh
      </button>

      <!-- Reused POS User Dropdown -->
      <div class="relative" ref="userMenuRef">
        <button
          @click="toggleUserMenu"
          class="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-600 hover:text-gray-900"
        >
          <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
            <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <span class="text-sm font-medium">{{ userName }}</span>
          <svg class="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <div v-if="showUserMenu" class="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div class="p-4 border-b border-gray-200">
            <p class="text-sm font-medium text-gray-900">{{ userName }}</p>
          </div>
          <div class="py-2">
            <button
              @click="switchToDashboard"
              class="flex justify-start items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <svg class="w-4 h-4 mr-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Switch to Dashboard
            </button>
            
            <button
              @click="logout"
              class="flex justify-start items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <svg class="w-4 h-4 mr-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<script>
import urimosaicImage from "@/assets/logos/mosaic.jpg";

export default {
  name: "Header",
  data() {
    return {
      imagePath: urimosaicImage,
      showUserMenu: false,
      userName: "User" // Update with actual API call if required
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
    logout() {
      this.showUserMenu = false;
      // You can add proper frappe logout API call here if needed
      window.location.href = '/login';
    },
    handleClickOutside(event) {
      if (this.$refs.userMenuRef && !this.$refs.userMenuRef.contains(event.target)) {
        this.showUserMenu = false;
      }
    }
  },
  mounted() {
    document.addEventListener('mousedown', this.handleClickOutside);
  },
  unmounted() {
    document.removeEventListener('mousedown', this.handleClickOutside);
  }
};
</script>
