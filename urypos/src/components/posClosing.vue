<template>
  <div class="mt-10 flex items-center justify-between">
    <div class="flex items-center">
      <h3 class="mr-3 text-lg font-semibold text-gray-900 dark:text-white">
        POS Closing Entry
      </h3>
      <span
        class="me-2 rounded px-2.5 py-0.5 text-sm font-medium"
        :class="{
          'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300':
            this.posClose.getBadgeType() === 'red',
          'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300':
            this.posClose.getBadgeType() === 'default',

          'bg-yellow-100 text-yellow-800':
            this.posClose.getBadgeType() === 'yellow',
        }"
      >
        <span class="text-xs">{{ this.posClose.getBadgeText() }}</span>
      </span>
    </div>
    <div class="flex space-x-4">
      <button
        @click="this.posClose.savePosClosing()"
        class="rounded-md bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 focus:outline-none"
        v-if="this.posClose.posClosing"
      >
        Save
      </button>
      <button
        v-if="this.posClose.posCloseSaved"
        @click="this.posClose.showSumbitPosCloseModal()"
        class="rounded-md bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 focus:outline-none"
      >
        Submit
      </button>
    </div>
  </div>
  <h3 class="text-base font-normal text-gray-900 dark:text-white">
    Period Details
  </h3>

  <div class="mb-6 mt-6 grid gap-6 md:grid-cols-2">
    <div>
      <label
        for="startDate"
        class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
        >Period Start Date</label
      >
      <input
        v-model="this.posClose.startDate"
        readonly
        class="block w-full rounded-md border border-gray-300 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
        type="text"
      />
    </div>
    <div>
      <label
        for="postingDate"
        class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
      >
        <label
          for="postingDate"
          class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
          >Posting Date</label
        >
      </label>
      <input
        v-model="this.posClose.postingDate"
        readonly
        class="block w-full rounded-md border border-gray-300 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
        type="text"
      />
    </div>
    <div>
      <label
        for="endDate"
        class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
        >Period End Date</label
      >

      <date-picker
        v-model:value="this.posClose.periodEndDate"
        :default-value="new Date()"
        class="my-custom-date-picker"
        type="datetime"
      ></date-picker>
    </div>
    <div>
      <label
        for="postingTime"
        class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
        >Posting Time</label
      >
      <date-picker
        v-model:value="this.posClose.postingTime"
        :default-value="this.posClose.postingTime"
        type="time"
        class="my-custom-time-picker"
      ></date-picker>
    </div>

    <div class="mb-6 gap-6 md:grid-cols-2">
      <div class="relative" ref="container">
        <label
          for="posOpen"
          class="block text-sm font-medium text-gray-900 dark:text-white"
        >
          POS Opening Entry
        </label>
        <input
          type="text"
          id="posOpen"
          class="block w-full rounded-md border border-gray-300 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
          v-model="this.posClose.selectedPosOpenEntry"
          @click="this.posClose.selectPosOpen()"
          required
        />
        <div
          v-if="this.posClose.showPosOpen"
          class="block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
          ref="dropdown"
        >
          <div
            class="h-10 rounded-lg p-2 hover:bg-gray-100"
            v-for="(posOpen, index) in this.posClose.posOpenEntries"
            :key="index"
            @click="this.posClose.selectPos(posOpen)"
          >
            <h1 class="text-base font-medium leading-normal">
              {{ posOpen.name }}
            </h1>
          </div>
        </div>
      </div>
    </div>
  </div>
  <hr class="my-6 border-t border-gray-300" />

  <h3 class="text-base font-semibold text-gray-900 dark:text-white">
    User Details
  </h3>
  <div class="mb-6 mt-5 grid gap-6 md:grid-cols-2">
    <div class="md:col-span-1">
      <label
        for="company"
        class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
      >
        Company
      </label>
      <input
        type="text"
        id="company"
        v-model="this.invoiceData.company"
        class="block w-full rounded-md border border-gray-300 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
        required
      />
    </div>
    <div class="flex flex-col justify-between md:col-span-1">
      <div class="mb-6">
        <label
          for="posProfile"
          class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
          >POS Profile</label
        >
        <input
          type="text"
          id="posProfile"
          class="block w-full rounded-md border border-gray-300 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
          v-model="this.invoiceData.posProfile"
          required
        />
      </div>
      <div>
        <label
          for="cashier"
          class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
          >Cashier</label
        >
        <input
          type="text"
          id="cashier"
          v-model="this.posClose.cashier"
          class="block w-full rounded-md border border-gray-300 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
          required
        />
      </div>
    </div>
  </div>
  <div v-if="this.posClose.openingBalance.length > 0">
    <hr class="my-6 border-t border-gray-300" />
    <h3 class="mb-3 text-base font-semibold text-gray-900 dark:text-white">
      Modes of Payment
    </h3>

    <h3 class="mb-3 text-sm font-normal text-gray-900 dark:text-white">
      Payment Reconciliation
    </h3>

    <div class="relative overflow-x-auto shadow-md sm:rounded-lg">
      <table class="w-full text-left text-sm text-gray-500 dark:text-gray-400">
        <thead
          class="bg-gray-50 text-base font-semibold uppercase text-gray-900 dark:text-white"
        >
          <tr>
            <th scope="col" class="px-6 py-3">Mode of Payment</th>
            <th scope="col" class="px-6 py-3 text-center">Opening Amount</th>
            <th scope="col" class="px-6 py-3 text-center">Closing Amount</th>
            <th scope="col" class="px-6 py-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            class="border-b bg-white dark:border-gray-700 dark:bg-gray-900"
            v-for="(modeOfPayment, index) in posClose.openingBalance"
            :key="index"
          >
            <th
              scope="row"
              class="whitespace-nowrap px-6 py-4 font-medium text-gray-900 dark:text-white"
            >
              {{ modeOfPayment.mode_of_payment }}
            </th>
            <td
              class="px-6 py-4 text-center font-medium text-gray-900 dark:text-white"
            >
              <input
                type="number"
                id="amount"
                name="amount"
                v-model="modeOfPayment.opening_amount"
                class="border-none text-center"
              />
            </td>
            <td
              class="px-6 py-4 text-center font-medium text-gray-900 dark:text-white"
            >
              <input
                type="number"
                id="amount"
                name="amount"
                v-model="this.posClose.closingAmount"
                class="border-none text-center"
              />
            </td>

            <td class="px-6 py-4">
              <button
                class="p-2 text-center"
                type="button"
                @click="this.posClose.deleteRow(index)"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="25"
                  height="25"
                  fill="currentColor border"
                  class="bi bi-trash"
                  viewBox="0 0 16 16"
                >
                  <path
                    d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6Z"
                  ></path>
                  <path
                    d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1ZM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118ZM2.5 3h11V2h-11v1Z"
                  ></path>
                </svg>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <hr class="my-6 border-t border-gray-300" />

  <h3 class="text-base font-semibold text-gray-900 dark:text-white">Totals</h3>
  <div class="mb-6 mt-6 grid gap-6 md:grid-cols-2">
    <div>
      <label
        for="grandTotal"
        class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
      >
        Grand Total</label
      >
      <input
        type="text"
        id="grandTotal"
        v-model="this.posClose.grandTotal"
        class="b block w-full rounded-md border border-gray-300 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
        required
      />
    </div>
    <div>
      <label
        for="totalInvoices"
        class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
        >Total Invoices</label
      >
      <input
        type="text"
        id="totalInvoices"
        v-model="this.posClose.totalInvoices"
        class="block w-full rounded-md border border-gray-300 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
        required
      />
    </div>
    <div>
      <label
        for="netTotak"
        class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
        >Net Total</label
      >
      <input
        type="text"
        id="netTotak"
        class="block w-full rounded-md border border-gray-300 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
        v-model="this.posClose.netTotal"
        required
      />
    </div>
    <div>
      <label
        for="totalQty"
        class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
        >Total Quantity</label
      >
      <input
        type="text"
        id="totalQty"
        class="block w-full rounded-md border border-gray-300 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
        v-model="this.posClose.totalQty"
        required
      />
    </div>
  </div>
  <hr class="my-6 border-t border-gray-300" />
  <div
    v-if="this.posClose.showSumbitPosclose"
    class="fixed inset-0 z-10 mt-20 overflow-y-auto bg-gray-100"
  >
    <div class="mt-3 flex items-center justify-center">
      <div class="w-full rounded-lg bg-white p-6 shadow-lg md:max-w-md">
        <div class="flex items-center justify-between">
          <h3 class="text-xl text-gray-900 dark:text-white">Confirm</h3>
          <span class="sr-only">Close</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 cursor-pointer"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            @click="this.posClose.showSumbitPosclose = false"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>

        <h3
          class="mt-5 block text-left text-base text-gray-900 dark:text-white"
        >
          Permanently Submit{{ this.posClose.posClosingEntry }}?
        </h3>
        <div class="flex justify-end">
          <button
            @click="this.posClose.showSumbitPosclose = false"
            class="mr-3 mt-6 rounded border border-gray-300 bg-gray-50 px-3 py-2"
          >
            No
          </button>
          <button
            @click="this.posClose.sumbitPosClosing()"
            class="mt-6 rounded bg-blue-500 px-3 py-2 text-white hover:bg-blue-600"
          >
            Yes
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { useInvoiceDataStore } from "@/stores/invoiceData.js";
import { posClosing } from "@/stores/posClosing.js";
import DatePicker from "vue-datepicker-next";
import "vue-datepicker-next/index.css";
import { Badge } from "flowbite-vue";

export default {
  name: "posClose",
  components: { DatePicker, Badge },
  setup() {
    const invoiceData = useInvoiceDataStore();
    const posClose = posClosing();
    return { invoiceData, posClose };
  },
  mounted() {
    this.posClose.setFormattedDate();
  },
  data() {
    return {
      search: "",
      selectedCustomer: null,
    };
  },
};
</script>
<style>
.my-custom-time-picker {
  width: 100%;
  color: black;
}
</style>
