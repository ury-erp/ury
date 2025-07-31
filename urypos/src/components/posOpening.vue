<template>
  <div class="mt-10 flex items-center justify-between">
    <div class="flex items-center">
      <h3 class="mr-3 text-lg font-semibold text-gray-900 dark:text-white">
        POS Opening Entry
      </h3>
      <span
        class="me-2 rounded px-2.5 py-0.5 text-sm font-medium"
        :class="{
          'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300':
            this.posOpen.getBadgeType() === 'red',

          'bg-yellow-100 text-yellow-800':
            this.posOpen.getBadgeType() === 'yellow',
        }"
      >
        <span class="text-xs">{{ this.posOpen.getBadgeText() }}</span>
      </span>
    </div>
    <div class="flex space-x-4">
      <button
        @click="this.posOpen.savePosOpening()"
        class="rounded-md bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 focus:outline-none"
        v-if="this.posOpen.posOpencreation"
      >
        Save
      </button>
      <button
        v-if="this.posOpen.posOpenSaved"
        @click="this.posOpen.showSumbitPosOpenModal()"
        class="rounded-md bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 focus:outline-none"
      >
        Submit
      </button>
    </div>
  </div>

  <div class="mb-6 mt-6 grid gap-6 md:grid-cols-2">
    <div>
      <label
        for="startDate"
        class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
        >Period Start Date</label
      >
      <date-picker
        v-model:value="this.posOpen.startDate"
        :default-value="new Date()"
        class="my-custom-date-picker"
        type="datetime"
      ></date-picker>
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
        v-model="this.posOpen.postingDate"
        readonly
        class="block w-full rounded-md border border-gray-300 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
        type="text"
      />
    </div>
  </div>
  <hr class="my-6 border-t border-gray-300" />
  <div class="mb-6 mt-6 grid gap-6 md:grid-cols-2">
    <div>
      <label
        for="company"
        class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
        >Company</label
      >
      <input
        type="text"
        id="company"
        v-model="this.invoiceData.company"
        class="b block w-full rounded-md border border-gray-300 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
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
        v-model="this.invoiceData.cashier"
        class="block w-full rounded-md border border-gray-300 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
        required
      />
    </div>
    <div>
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
        for="branch"
        class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
        >Branch</label
      >
      <input
        type="text"
        id="branch"
        class="block w-full rounded-md border border-gray-300 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
        v-model="this.invoiceData.branch"
        required
      />
    </div>
  </div>
  <hr class="my-6 border-t border-gray-300" />
  <h3 class="mb-3 text-base font-semibold text-gray-900 dark:text-white">
    Opening Balance Details
  </h3>

  <div class="relative overflow-x-auto shadow-md sm:rounded-lg">
    <table class="w-full text-left text-sm text-gray-500 dark:text-gray-400">
      <thead
        class="bg-gray-50 text-base font-semibold uppercase text-gray-900 dark:text-white"
      >
        <tr>
          <th scope="col" class="px-6 py-3">Mode of Payment</th>
          <th scope="col" class="px-6 py-3 text-center">Opening Amount</th>
          <th scope="col" class="px-6 py-3"></th>
        </tr>
      </thead>
      <tbody>
        <tr
          class="border-b bg-white dark:border-gray-700 dark:bg-gray-900"
          v-for="(modeOfPayment, index) in invoiceData.modeOfPaymentList"
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
              @input="posOpen.changePaidAmount(modeOfPayment.opening_amount)"
            />
          </td>

          <td class="px-6 py-4">
            <button
              class="p-2 text-center"
              type="button"
              @click="this.posOpen.deleteRow(index)"
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

  <hr class="my-6 border-t border-gray-300" />

  <div
    v-if="this.posOpen.showSumbitPosOpen"
    class="fixed inset-0 z-10 mt-20 overflow-y-auto bg-gray-100"
  >
    <div class="mt-5 flex items-center justify-center">
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
            @click="this.posOpen.showSumbitPosOpen = false"
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
          Permanently Submit{{ this.posOpen.posOpenEntryName }}?
        </h3>
        <div class="flex justify-end">
          <button
            @click="this.posOpen.showSumbitPosOpen = false"
            class="mr-3 mt-6 rounded border border-gray-300 bg-gray-50 px-3 py-2"
          >
            No
          </button>
          <button
            @click="this.posOpen.sumbitPosOpening()"
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
import { posOpening } from "@/stores/posOpening.js";

import DatePicker from "vue-datepicker-next";
import "vue-datepicker-next/index.css";
export default {
  name: "posOpen",
  components: { DatePicker },
  setup() {
    const invoiceData = useInvoiceDataStore();
    const posOpen = posOpening();
    return { invoiceData, posOpen };
  },
  mounted() {
    this.posOpen.setFormattedDate();
  },
};
</script>
<style>
.my-custom-date-picker {
  width: 100%;
  color: black;
}
</style>
