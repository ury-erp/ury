<template>
  <div >
    <nav
      class="fixed left-0 top-0 z-20 w-full border-b border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900"
    >
      <div
        class="mx-auto flex max-w-screen-2xl items-center justify-between p-4"
      >
        <!-- Logo/Title Section -->
        <div class="flex items-center">
          <template
            v-if="
              this.tabClick.currentTab === '/Table' ||
              this.auth.cashier ||
              this.tabClick.isLoginPage
            "
          >
            <a href="/urypos/Table" class="flex-shrink-0">
              <img :src="imagePath" alt="URY POS logo" class="w-32 lg:w-44" />
            </a>
          </template>
          <template v-else>
            <h3
              class="mb-2 mt-2 p-1 text-2xl font-medium text-gray-900 dark:text-white lg:text-3xl"
            >
              {{ this.table.selectedTable }}
            </h3>
          </template>
        </div>

        <!-- User Menu Section -->
        <div
          v-if="!this.tabClick.isLoginPage"
          class="relative ml-4 flex-shrink-0"
        >
          <button
            type="button"
            class="flex items-center rounded-full bg-gray-100 p-1 text-sm hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
            id="user-menu-button"
            aria-expanded="false"
            @click="this.auth.toggleDropdown()"
            ref="dropdownButton"
          >
            <div
              class="relative inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gray-200 dark:bg-gray-600 sm:h-8 sm:w-8"
            >
              <span
                class="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {{ this.auth.sessionUser.charAt(0).toUpperCase() }}
              </span>
            </div>
          </button>

          <!-- New Dropdown Menu Style -->
          <div
            v-show="this.auth.activeDropdown"
            class="absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
          >
            <div class="py-1">
              <a
                href="#"
                class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                {{ this.auth.getLoginAvatar() }}
              </a>
              <a
                href="#"
                class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                @click="reload"
              >
                Reload
              </a>

              <a
                href="#"
                class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                @click="this.auth.routeToHome()"
                >Switch To Desk
              </a>
              <div class="border-t border-gray-200"></div>
              <a
                href="#"
                class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                @click="this.auth.logOut"
              >
                Log out
              </a>
            </div>
          </div>
        </div>
      </div>
    </nav>

    <!-- Spacer for Fixed Header -->
    <div class="h-16 sm:h-20"></div>
  </div>
</template>

<script>
import { useAuthStore } from "@/stores/Auth.js";
import { posOpening } from "@/stores/posOpening.js";
import { posClosing } from "@/stores/posClosing.js";
import uriPosImage from "@/assets/logos/URY_POS.jpg";
import { tabFunctions } from "@/stores/bottomTabs.js";
import { useTableStore } from "@/stores/Table.js";

export default {
  name: "Header",
  setup() {
    const auth = useAuthStore();
    const posOpen = posOpening();
    const posClose = posClosing();
    const tabClick = tabFunctions();
    const table = useTableStore();

    return { auth, posOpen, posClose, tabClick, table };
  },
  data() {
    return {
      imagePath: uriPosImage,
    };
  },
  methods: {
    reload() {
      window.location.reload();
    },
  },
};
</script>
