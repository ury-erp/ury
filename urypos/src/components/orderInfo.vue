<template>
  <nav class="mb-3 mt-1 flex" aria-label="Breadcrumb" v-if="this.auth.cashier">
    <ol
      class="inline-flex items-center space-x-1 rtl:space-x-reverse md:space-x-2"
    >
      <li>
        <div class="flex items-center">
          <span class="text-base font-medium text-gray-700 dark:text-gray-400"
            >Order</span
          >
        </div>
      </li>
      <li aria-current="page">
        <div class="flex items-center">
          <svg
            class="mx-1 h-3 w-3 text-gray-400 rtl:rotate-180"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 6 10"
          >
            <path
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="m1 9 4-4-4-4"
            />
          </svg>
          <span
            class="ms-1 text-base font-medium text-gray-500 dark:text-gray-400 md:ms-2"
            >{{ this.recentOrders.orderNumber }}</span
          >
        </div>
      </li>
    </ol>
  </nav>
</template>
<script>
import { useAuthStore } from "@/stores/Auth.js";
import { usetoggleRecentOrder } from "@/stores/recentOrder.js";
export default {
  setup() {
    const auth = useAuthStore();
    const recentOrders = usetoggleRecentOrder();
    return { auth, recentOrders };
  },
  name: "orderInfo",
};
</script>
