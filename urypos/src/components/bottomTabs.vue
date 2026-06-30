<template>
  <div
    class="fixed bottom-0 left-0 z-50 h-16 w-full border-t border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-700"
    v-if="!this.tabClick.isLoginPage"
    id="tab"
  >
    <div
      class="mx-auto grid h-full max-w-lg font-medium"
      :class="[
        {
          'grid-cols-4': !auth.cashier,
          'grid-cols-5': auth.cashier,
        },
      ]"
    >
      <router-link
        :to="invoiceData.invoiceUpdating ? '#' : '/Table'"
        class="group inline-flex flex-col items-center justify-center border-x border-gray-200 px-5 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800"
      >
        <svg
          class="h-6 w-6"
          :class="[
            {
              'text-gray-500': this.tabClick.currentTab !== '/Table',
              'text-blue-600': this.tabClick.currentTab === '/Table',
            },
          ]"
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
          ></path>
        </svg>

        <span
          class="text-sm"
          :class="[
            {
              'text-gray-500': this.tabClick.currentTab !== '/Table',
              'text-blue-600': this.tabClick.currentTab === '/Table',
            },
          ]"
          >Table</span
        >
      </router-link>

      <router-link
        :to="invoiceData.invoiceUpdating ? '#' : '/Menu'"
        class="group inline-flex flex-col items-center justify-center border-r border-gray-200 px-5 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800"
        @click="this.tabClick.clickMenuTab()"
      >
        <svg
          class="h-6 w-6"
          :class="[
            {
              'text-gray-500': this.tabClick.currentTab !== '/Menu',
              'text-blue-600': this.tabClick.currentTab === '/Menu',
            },
          ]"
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"></path>
          <path
            fill-rule="evenodd"
            d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
            clip-rule="evenodd"
          ></path>
        </svg>

        <span
          class="text-sm"
          :class="[
            {
              'text-gray-500': this.tabClick.currentTab !== '/Menu',
              'text-blue-600': this.tabClick.currentTab === '/Menu',
            },
          ]"
          >Menu</span
        ></router-link
      >
      <router-link
        :to="invoiceData.invoiceUpdating ? '#' : '/Customer'"
        class="group inline-flex flex-col items-center justify-center px-5 hover:bg-gray-50 dark:hover:bg-gray-800"
        @click="!this.auth.cashier && this.tabClick.checkActiveTable()"
      >
        <svg
          class="h-6 w-6"
          :class="[
            {
              'text-gray-500': this.tabClick.currentTab !== '/Customer',
              'text-blue-600': this.tabClick.currentTab === '/Customer',
            },
          ]"
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
            clip-rule="evenodd"
          ></path>
        </svg>

        <span
          class="text-sm"
          :class="[
            {
              'text-gray-500': this.tabClick.currentTab !== '/Customer',
              'text-blue-600': this.tabClick.currentTab === '/Customer',
            },
          ]"
          >Customer</span
        ></router-link
      >
      <router-link
        to="/Cart"
        class="group inline-flex flex-col items-center justify-center border-x border-gray-200 px-5 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800"
        @click="!this.auth.cashier && this.tabClick.checkActiveTable()"
      >
        <svg
          aria-hidden="true"
          :class="[
            {
              'text-gray-500': this.tabClick.currentTab !== '/Cart',
              'text-blue-600': this.tabClick.currentTab === '/Cart',
            },
          ]"
          class="h-6 w-6 group-hover:text-blue-600 dark:text-gray-400 dark:group-hover:text-blue-500"
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"
          ></path>
        </svg>

        <span
          class="text-sm group-hover:text-blue-600 dark:text-gray-400 dark:group-hover:text-blue-500"
          :class="[
            {
              'text-gray-500': this.tabClick.currentTab !== '/Cart',
              'text-blue-600': this.tabClick.currentTab === '/Cart',
            },
          ]"
          >Cart</span
        >
      </router-link>
      <router-link
        :to="invoiceData.invoiceUpdating ? '#' : '/recentOrder'"
        v-if="this.auth.cashier"
        class="group inline-flex flex-col items-center justify-center border-x border-gray-200 px-5 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800"
      >
        <svg
          class="h-5 w-5"
          :class="[
            {
              'text-gray-500': this.tabClick.currentTab !== '/recentOrder',
              'text-blue-600': this.tabClick.currentTab === '/recentOrder',
            },
          ]"
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M14.066 0H7v5a2 2 0 0 1-2 2H0v11a1.97 1.97 0 0 0 1.934 2h12.132A1.97 1.97 0 0 0 16 18V2a1.97 1.97 0 0 0-1.934-2Zm-3 15H4.828a1 1 0 0 1 0-2h6.238a1 1 0 0 1 0 2Zm0-4H4.828a1 1 0 0 1 0-2h6.238a1 1 0 1 1 0 2Z"
          />
          <path
            d="M5 5V.13a2.96 2.96 0 0 0-1.293.749L.879 3.707A2.98 2.98 0 0 0 .13 5H5Z"
          />
        </svg>

        <span
          class="text-sm"
          :class="[
            {
              'text-gray-500': this.tabClick.currentTab !== '/recentOrder',
              'text-blue-600': this.tabClick.currentTab === '/recentOrder',
            },
          ]"
          >OrderLog</span
        >
      </router-link>
    </div>
  </div>
</template>

<script>
import { useAuthStore } from "@/stores/Auth.js";
import { tabFunctions } from "@/stores/bottomTabs.js";
import { useInvoiceDataStore } from "@/stores/invoiceData.js";
export default {
  name: "Bottom Tabs",
  setup() {
    const auth = useAuthStore();
    const invoiceData = useInvoiceDataStore();
    const tabClick = tabFunctions();
    return { auth, tabClick, invoiceData };
  },
};
</script>
