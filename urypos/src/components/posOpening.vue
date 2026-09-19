<template>
  <div class="mt-10 flex items-center justify-between">
    <div class="flex items-center">
      <h3 class="mr-3 text-lg font-semibold text-foreground">
        {{ $t('pos.opening_entry') }}
      </h3>
      <span
        class="me-2 rounded-xl px-2.5 py-0.5 text-sm font-medium"
        :class="{
          'bg-destructive/10 text-destructive':
            this.posOpen.getBadgeType() === 'red',

          'bg-warning/10 text-warning':
            this.posOpen.getBadgeType() === 'yellow',
        }"
      >
        <span class="text-xs">{{ this.posOpen.getBadgeText() }}</span>
      </span>
    </div>
    <div class="flex space-x-4">
      <button
        @click="this.posOpen.savePosOpening()"
        class="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary focus:outline-none"
        v-if="this.posOpen.posOpencreation"
      >
        {{ $t('common.save') }}
      </button>
      <button
        v-if="this.posOpen.posOpenSaved"
        @click="this.posOpen.showSumbitPosOpenModal()"
        class="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary focus:outline-none"
      >
        {{ $t('common.submit') }}
      </button>
    </div>
  </div>

  <div class="mb-6 mt-6 grid gap-6 md:grid-cols-2">
    <div>
      <label
        for="startDate"
        class="mb-2 block text-sm font-medium text-foreground"
        >{{ $t('pos.period_start') }}</label
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
        class="mb-2 block text-sm font-medium text-foreground"
      >
        <label
          for="postingDate"
          class="mb-2 block text-sm font-medium text-foreground"
          >{{ $t('pos.posting_date') }}</label
        >
      </label>
      <input
        v-model="this.posOpen.postingDate"
        readonly
        class="block w-full rounded-md border border-input text-sm text-foreground focus:border-ring focus:ring-ring"
        type="text"
      />
    </div>
  </div>
  <hr class="my-6 border-t border-input" />
  <div class="mb-6 mt-6 grid gap-6 md:grid-cols-2">
    <div>
      <label
        for="company"
        class="mb-2 block text-sm font-medium text-foreground"
        >{{ $t('pos.company') }}</label
      >
      <input
        type="text"
        id="company"
        v-model="this.invoiceData.company"
        class="b block w-full rounded-md border border-input text-sm text-foreground focus:border-ring focus:ring-ring"
        required
      />
    </div>
    <div>
      <label
        for="cashier"
        class="mb-2 block text-sm font-medium text-foreground"
        >{{ $t('pos.cashier') }}</label
      >
      <input
        type="text"
        id="cashier"
        v-model="this.invoiceData.cashier"
        class="block w-full rounded-md border border-input text-sm text-foreground focus:border-ring focus:ring-ring"
        required
      />
    </div>
    <div>
      <label
        for="posProfile"
        class="mb-2 block text-sm font-medium text-foreground"
        >{{ $t('pos.profile') }}</label
      >
      <input
        type="text"
        id="posProfile"
        class="block w-full rounded-md border border-input text-sm text-foreground focus:border-ring focus:ring-ring"
        v-model="this.invoiceData.posProfile"
        required
      />
    </div>
    <div>
      <label
        for="branch"
        class="mb-2 block text-sm font-medium text-foreground"
        >{{ $t('pos.branch') }}</label
      >
      <input
        type="text"
        id="branch"
        class="block w-full rounded-md border border-input text-sm text-foreground focus:border-ring focus:ring-ring"
        v-model="this.invoiceData.branch"
        required
      />
    </div>
  </div>
  <hr class="my-6 border-t border-input" />
  <h3 class="mb-3 text-base font-semibold text-foreground">
    {{ $t('pos.opening_balance_details') }}
  </h3>

  <div class="relative overflow-x-auto shadow-md sm:rounded-lg">
    <table class="w-full text-left text-sm text-muted-foreground">
      <thead
        class="bg-muted text-base font-semibold uppercase text-foreground"
      >
        <tr>
          <th scope="col" class="px-6 py-3">{{ $t('payment.mode') }}</th>
          <th scope="col" class="px-6 py-3 text-center">{{ $t('pos.opening_amount') }}</th>
          <th scope="col" class="px-6 py-3"></th>
        </tr>
      </thead>
      <tbody>
        <tr
          class="border-b bg-card"
          v-for="(modeOfPayment, index) in invoiceData.modeOfPaymentList"
          :key="index"
        >
          <th
            scope="row"
            class="whitespace-nowrap px-6 py-4 font-medium text-foreground"
          >
            {{ modeOfPayment.mode_of_payment }}
          </th>
          <td
            class="px-6 py-4 text-center font-medium text-foreground"
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

  <hr class="my-6 border-t border-input" />

  <div
    v-if="this.posOpen.showSumbitPosOpen"
    class="fixed inset-0 z-10 mt-20 overflow-y-auto bg-muted"
  >
    <div class="mt-5 flex items-center justify-center">
      <div class="w-full rounded-lg bg-card p-6 shadow-raised md:max-w-md">
        <div class="flex items-center justify-between">
          <h3 class="text-xl text-foreground">{{ $t('common.confirm') }}</h3>
          <span class="sr-only">{{ $t('common.close') }}</span>
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
          class="mt-5 block text-left text-base text-foreground"
        >
          Permanently Submit{{ this.posOpen.posOpenEntryName }}?
        </h3>
        <div class="flex justify-end">
          <button
            @click="this.posOpen.showSumbitPosOpen = false"
            class="mr-3 mt-6 rounded-xl border border-input bg-muted px-3 py-2"
          >
            {{ $t('common.no') }}
          </button>
          <button
            @click="this.posOpen.sumbitPosOpening()"
            class="mt-6 rounded-xl bg-primary px-3 py-2 text-primary-foreground hover:bg-primary"
          >
            {{ $t('common.yes') }}
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
