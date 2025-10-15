<template>
  <div class="mt-3 flex flex-col md:flex-row">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-gray-300 bg-opacity-50 text-lg"
      v-if="this.invoiceData.isPrinting"
    >
      Printing Invoice
    </div>

    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-gray-300 bg-opacity-50 text-lg"
      v-if="this.recentOrders.isLoading"
    >
      Payment Being Processing
    </div>
    <div
      class="max-w-lg flex-1 rounded-lg border border-gray-200 bg-white p-4 shadow dark:border-gray-700 dark:bg-gray-800 sm:p-8"
    >
      <div class="mb-4 flex items-center justify-between">
        <h5
          class="text-xl font-bold leading-none text-gray-900 dark:text-white"
        >
          Recent Orders
        </h5>
      </div>
      <div class="w-full" @click="this.recentOrders.showOrder = false">
        <input
          type="search"
          id="orderSeach"
          class="block w-full rounded-lg border-gray-300 bg-gray-50 p-2.5 pl-10 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
          placeholder="Search by Invoice Id or Customer Name or Mobile Number"
          v-model="this.recentOrders.searchOrder"
          @input="this.recentOrders.handleSearchInput"
        />
        <select
          id="status"
          class="mt-4 block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
          v-model="this.recentOrders.selectedStatus"
          @change="this.recentOrders.handleStatusChange"
        >
          <option value="Draft">Draft</option>
          <option value="Unbilled">Unbilled</option>
          <option
            value="Recently Paid"
            v-if="auth.viewAllStatus === 0 && invoiceData.paidLimit > 0"
          >
            Recently Paid
          </option>
          <option value="Paid" v-if="this.auth.viewAllStatus === 1">
            Paid
          </option>
          <option value="Consolidated" v-if="this.auth.viewAllStatus === 1">
            Consolidated
          </option>
          <option value="Return" v-if="this.auth.viewAllStatus === 1">
            Return
          </option>
        </select>
      </div>
      <div class="flow-root">
        <ul role="list" class="divide-y divide-gray-200 dark:divide-gray-700">
          <li
            class="mt-2 py-3 sm:py-4"
            :class="{
              'bg-gray-200': this.recentOrders.setBackground === index,
            }"
            v-for="(recentOrder, index) in this.recentOrders.filteredOrders"
            :key="recentOrder.name"
            @click="
              this.recentOrders.viewRecentOrder(recentOrder);
              this.recentOrders.setBackground = index;
            "
          >
          <div class="flex w-full">
              <div class="w-3/5">
                <p
                  class="truncate text-base font-medium text-gray-900 dark:text-white"
                >
                  {{ recentOrder.name }}
                </p>
                <p class="truncate text-sm text-gray-600 dark:text-gray-400">
                  {{ recentOrder.mobile_number }},{{ recentOrder.customer }}
                </p>
              </div>
              <div class="w-2/5 flex">
                <p class="text-base font-medium text-gray-900 dark:text-white overflow-hidden text-ellipsis">
                  {{
                    recentOrder.restaurant_table
                      ? recentOrder.restaurant_table
                      : recentOrder.order_type
                  }}
                </p>
              </div>
              <div class="w-1/5 text-right">
                <p
                  class="truncate text-base font-medium text-gray-900 dark:text-white"
                  >
                  {{ this.invoiceData.currency }}
                  {{ recentOrder.grand_total }}
                </p>
                <p class="truncate text-sm text-gray-600 dark:text-gray-400">
                  {{
                    this.recentOrders.getFormattedTime(
                      recentOrder.posting_time
                    )
                  }}
                </p>
              </div>
            </div>
          </li>
        </ul>
      </div>
      <div class="mt-4 flex justify-center">
        <button
          :class="{ hidden: this.recentOrders.currentPage === 1 }"
          @click="this.recentOrders.previousPageClick()"
          class="mr-2 w-[80px] rounded-md border px-2 py-1"
        >
          Previous
        </button>
        <button class="mr-2 rounded-md border px-2 py-1">
          {{ this.recentOrders.currentPage }}
        </button>
        <button
          @click="this.recentOrders.nextPageClick()"
          v-if="this.recentOrders.next"
          class="w-[80px] rounded-md border px-2 py-1"
        >
          Next
        </button>
      </div>
    </div>
    <div
      class="mt-5 max-w-lg flex-1 rounded-lg border border-gray-200 bg-white p-4 shadow dark:border-gray-700 dark:bg-gray-800 sm:p-8 md:ml-10 md:mt-0"
      v-if="this.recentOrders.showOrder"
    >
      <div class="flex items-center space-x-4">
        <div class="min-w-0 flex-1">
          <p
            class="truncate text-xl font-semibold text-gray-900 dark:text-white"
          >
            {{ this.recentOrders.selectedOrder.customer }}
          </p>
          <p
            class="truncate text-xl font-semibold text-gray-900 dark:text-white"
          >
            {{ this.recentOrders.selectedOrder.mobile_number }}
          </p>
          <p
            class="mr-2 mt-2 truncate text-sm text-gray-500 dark:text-gray-400"
          >
            {{ this.recentOrders.postingDate }}
          </p>

          <p
            class="mr-2 mt-2 truncate text-sm text-gray-500 dark:text-gray-400"
            v-if="this.recentOrders.selectedOrder.waiter"
          >
            Waiter : {{ this.recentOrders.selectedOrder.waiter }}
          </p>
        </div>
        <div class="items-center space-x-4 text-right">
          <div class="min-w-0 flex-1">
            <p
              class="mr-2 truncate text-xl font-semibold text-gray-900 dark:text-white"
            >
              {{ this.invoiceData.currency }}
              {{
                this.recentOrders.selectedOrder.status === "Draft"
                  ? "0.00"
                  : this.recentOrders.selectedOrder.grand_total
              }}
            </p>
            <p
              class="mr-2 mt-2 truncate text-sm text-gray-500 dark:text-gray-400"
            >
              {{ this.recentOrders.selectedOrder.name }}
            </p>

            <div class="ml-5 mt-2">
              <Badge
                :type="
                  this.recentOrders.getBadgeType(
                    this.recentOrders.selectedOrder
                  )
                "
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  class="bi bi-dot"
                  viewBox="0 0 16 16"
                >
                  <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
                </svg>
                <span class="text-xs">
                  {{ this.recentOrders.selectedOrder.status }}
                </span>
              </Badge>
            </div>
          </div>
        </div>
      </div>
      <div class="mb-2 mt-4">
        <p class="truncate text-lg font-semibold text-gray-900 dark:text-white">
          Items
        </p>
      </div>
      <div class="w-full rounded bg-gray-50 p-2">
        <div
          class="ml-2 mt-2"
          v-for="items in this.recentOrders.recentOrderListItems"
        >
          <div class="flex items-center space-x-4">
            <div class="min-w-2 flex-1">
              <p class="truncate text-base text-gray-800 dark:text-white">
                {{ items.item_name }}
              </p>
            </div>
            <div class="flex items-center space-x-4 text-right">
              <p class="text-base text-gray-800 dark:text-white">
                {{ items.qty }}
              </p>
            </div>
            <div class="items-center space-x-4 text-right">
              <p class="mr-5 truncate text-base text-gray-800 dark:text-white">
                {{ this.invoiceData.currency }} {{ items.amount }}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div
        class="mt-4 rounded-md border-2 border-dotted"
        :class="[
          {
            'border-gray-600': !recentOrders.showDiscount,
            'border-green-500': recentOrders.showDiscount,
            'border-red-500':recentOrders.totalAmount <= 0
          },
        ]"
        v-if="
          invoiceData.enableDiscount == 1 &&
          !recentOrders.showInput &&
          this.recentOrders.selectedStatus === 'Draft'
        "
      >
        <div
          @click="recentOrders.toggleDiscount"
          :class="{
            'flex p-3': !recentOrders.showInput && !recentOrders.showDiscount,
            'flex p-3 text-green-500': recentOrders.showDiscount,
            'flex p-3 text-red-500':recentOrders.totalAmount <= 0
          }"
        >
        <svg
            class="discount-icon"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            stroke="currentColor"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M19 15.6213C19 15.2235 19.158 14.842 19.4393 14.5607L20.9393 13.0607C21.5251 12.4749 21.5251 11.5251 20.9393 10.9393L19.4393 9.43934C19.158 9.15804 19 8.7765 19 8.37868V6.5C19 5.67157 18.3284 5 17.5 5H15.6213C15.2235 5 14.842 4.84196 14.5607 4.56066L13.0607 3.06066C12.4749 2.47487 11.5251 2.47487 10.9393 3.06066L9.43934 4.56066C9.15804 4.84196 8.7765 5 8.37868 5H6.5C5.67157 5 5 5.67157 5 6.5V8.37868C5 8.7765 4.84196 9.15804 4.56066 9.43934L3.06066 10.9393C2.47487 11.5251 2.47487 12.4749 3.06066 13.0607L4.56066 14.5607C4.84196 14.842 5 15.2235 5 15.6213V17.5C5 18.3284 5.67157 19 6.5 19H8.37868C8.7765 19 9.15804 19.158 9.43934 19.4393L10.9393 20.9393C11.5251 21.5251 12.4749 21.5251 13.0607 20.9393L14.5607 19.4393C14.842 19.158 15.2235 19 15.6213 19H17.5C18.3284 19 19 18.3284 19 17.5V15.6213Z"
              stroke-miterlimit="10"
              stroke-linecap="round"
              stroke-linejoin="round"
            ></path>
            <path
              d="M15 9L9 15"
              stroke-miterlimit="10"
              stroke-linecap="round"
              stroke-linejoin="round"
            ></path>
            <path
              d="M10.5 9.5C10.5 10.0523 10.0523 10.5 9.5 10.5C8.94772 10.5 8.5 10.0523 8.5 9.5C8.5 8.94772 8.94772 8.5 9.5 8.5C10.0523 8.5 10.5 8.94772 10.5 9.5Z"
              fill="white"
              stroke-linecap="round"
              stroke-linejoin="round"
            ></path>
            <path
              d="M15.5 14.5C15.5 15.0523 15.0523 15.5 14.5 15.5C13.9477 15.5 13.5 15.0523 13.5 14.5C13.5 13.9477 13.9477 13.5 14.5 13.5C15.0523 13.5 15.5 13.9477 15.5 14.5Z"
              fill="white"
              stroke-linecap="round"
              stroke-linejoin="round"
            ></path>
          </svg>

          <template v-if="!recentOrders.showDiscount">
            <span>Add Discount</span>
          </template>

          <template v-else>
            <span v-if="recentOrders.totalAmount > 0">
              Additional {{ recentOrders.percentage }}% discount Applied
            </span>
            <span v-else class="text-red-500">
              {{ recentOrders.percentage }}% cannot be Applied
            </span>
          </template>
        </div>
      </div>
      <div class="relative mb-6 mt-6" v-if="this.recentOrders.showInput">
        <input
          type="number"
          class="block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 pl-10 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
          placeholder="Enter Discount Percentage"
          v-model="this.recentOrders.percentage"
          @input="this.recentOrders.updatePercentage"
          @keyup.enter="this.recentOrders.applyDiscount"
          @keyup="this.recentOrders.resetTimer"
        />
      </div>
      <div class="mb-2 mt-5">
        <p class="truncate text-lg font-semibold text-gray-900 dark:text-white">
          Totals
        </p>
      </div>
      <div class="w-full rounded bg-gray-50 p-2">
        <div class="ml-2 mt-2 flex items-center space-x-4">
          <div class="min-w-2 flex-1">
            <p class="truncate text-base text-gray-800 dark:text-white">
              Net Total
            </p>
          </div>

          <div class="items-center space-x-4 text-right">
            <p class="mr-5 truncate text-base text-gray-800 dark:text-white">
              {{ this.invoiceData.currency }} {{ this.recentOrders.netTotal }}
            </p>
          </div>
        </div>
        <div class="ml-2" v-for="tax in this.recentOrders.texDetails">
          <div class="mt-2 flex items-center space-x-4">
            <div class="min-w-2 flex-1">
              <p class="truncate text-base text-gray-800 dark:text-white">
                {{ tax.description }}
              </p>
            </div>

            <div class="items-center space-x-4 text-right">
              <p class="mr-5 truncate text-base text-gray-800 dark:text-white">
                {{ this.invoiceData.currency }} {{ tax.rate }}
              </p>
            </div>
          </div>
        </div>
        <div
          class="ml-2 mt-2 flex items-center space-x-4"
          v-if="this.recentOrders.additionalPiscountPercentage"
        >
          <div class="min-w-2 flex-1">
            <p
              class="truncate text-base font-semibold text-gray-800 dark:text-white"
            >
              Discount({{ this.recentOrders.additionalPiscountPercentage }})
            </p>
          </div>
          <div class="items-center space-x-4 text-right">
            <p
              class="mr-5 truncate text-base font-semibold text-gray-800 dark:text-white"
            >
              {{ this.invoiceData.currency }}
              {{ this.recentOrders.discountAmount }}
            </p>
          </div>
        </div>
        <div class="ml-2 mt-2 flex items-center space-x-4">
          <div class="min-w-2 flex-1">
            <p
              class="truncate text-base font-semibold text-gray-800 dark:text-white"
            >
              Grand Total
            </p>
          </div>
          <div class="items-center space-x-4 text-right">
            <p
              class="mr-5 truncate text-base font-semibold text-gray-800 dark:text-white"
            >
              {{ this.invoiceData.currency }}
              {{
                this.recentOrders.totalAmount > 0
                  ? this.recentOrders.totalAmount
                  : this.recentOrders.grandTotal
              }}
            </p>
          </div>
        </div>
      </div>
      <div
        class="mt-2 rounded px-4 py-2 text-center"
        v-if="
          this.recentOrders.selectedStatus !== 'Draft' &&
          recentOrders.selectedStatus !== 'Unbilled'
        "
      >
        <button
          type="button"
          class="mb-2 mr-2 rounded-lg border border-gray-400 bg-white px-5 py-2.5 text-sm font-medium text-gray-800 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400"
          @click="this.invoiceData.printFunction()"
        >
          Print Receipt
        </button>
      </div>
      <div
        class="mt-2 rounded px-4 py-2 text-center"
        v-if="
          this.recentOrders.selectedStatus === 'Draft' ||
          recentOrders.selectedStatus === 'Unbilled'
        "
      >
        <button
          type="button"
          class="mb-2 mr-2 w-36 rounded-lg border bg-white px-5 py-2.5 text-sm font-medium focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400"
          :class="{
            'border-gray-200 text-gray-300':
              this.recentOrders.orderType === 'Aggregators',
            'border-gray-300 text-gray-700':
              this.recentOrders.orderType !== 'Aggregators',
          }"
          @click="
            this.recentOrders.orderType !== 'Aggregators'
              ? this.recentOrders.editOrder()
              : ''
          "
        >
          Edit
        </button>
        <button
          type="button"
          class="mb-2 mr-2 w-36 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400"
          @click="this.invoiceData.printFunction()"
        >
          Print Receipt
        </button>
      </div>
      <div
        class="mt-2 rounded px-4 py-2 text-center"
        v-if="
          this.recentOrders.selectedStatus === 'Draft' ||
          this.recentOrders.selectedStatus === 'Unbilled'
        "
      >
        <button
          type="button"
          class="mb-2 mr-2 w-36 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400"
          @click="this.recentOrders.billing()"
        >
          Make Payment
        </button>
        <button
          type="button"
          class="mb-2 mr-2 w-36 rounded-lg border bg-white px-5 py-2.5 text-sm font-medium focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400"
          :class="{
            'border-gray-200 text-gray-300':
              this.recentOrders.invoicePrinted === 1 ||
              this.recentOrders.selectedStatus === 'Unbilled',
            'border-gray-300 text-gray-700': !(
              this.recentOrders.invoicePrinted === 1 ||
              this.recentOrders.selectedStatus === 'Unbilled'
            ),
          }"
          @click="
            this.recentOrders.invoicePrinted === 0 &&
            this.recentOrders.selectedStatus === 'Draft'
              ? this.recentOrders.showCancelInvoiceModal()
              : ''
          "
        >
          Cancel Order
        </button>
      </div>
      <div
        v-if="this.recentOrders.cancelInvoiceFlag === true"
        class="fixed inset-0 z-10 mt-20 overflow-y-auto bg-gray-100"
      >
        <div class="mt-20 flex items-center justify-center">
          <div class="w-full rounded-lg bg-white p-6 shadow-lg md:max-w-md">
            <div class="flex justify-end">
              <span class="sr-only">Close</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                @click="this.recentOrders.cancelInvoiceFlag = false"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h2
              class="mt-1 block text-left text-xl font-medium text-gray-900 dark:text-white"
            >
              Are you sure to cancel
            </h2>
            <div class="relative">
              <label
                for="cancelReason"
                class="mt-6 block text-left text-gray-900 dark:text-white"
              >
                Reason
              </label>
              <input
                type="text"
                id="cancelReason"
                class="mt-4 w-full appearance-none rounded border p-2 leading-tight text-gray-900 shadow focus:outline-none"
                v-model="this.recentOrders.cancelReason"
              />
            </div>
            <div class="flex justify-end">
              <button
                @click="this.recentOrders.cancelInvoiceFlag = false"
                class="mr-3 mt-6 rounded border border-gray-300 bg-gray-50 px-3 py-2"
              >
                No
              </button>
              <button
                @click="handleConfirmCancellation()"
                class="mt-6 rounded bg-blue-500 px-3 py-2 text-white hover:bg-blue-600"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      </div>
      <div
        v-if="this.recentOrders.showPayment"
        class="fixed inset-0 z-10 mt-14 overflow-y-auto bg-gray-100"
      >
        <div class="mt-10 flex items-center justify-center">
          <div class="h-82 w-full rounded-lg bg-white p-6 shadow-lg md:w-3/5">
            <div class="flex justify-end">
              <span class="sr-only">Close</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                @click="this.recentOrders.showPayment = false"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h2
              class="mt-1 block text-left text-xl font-medium text-gray-900 dark:text-white"
            >
              Select Mode Of Payment
            </h2>
            <div class="mt-8 flex items-center justify-center">
              <div class="w-full max-w-full overflow-x-auto">
                <div class="flex flex-nowrap">
                  <div
                    v-for="(
                      modeOfPayment, index
                    ) in recentOrders.modeOfPaymentList"
                    :key="index"
                    class="mr-4 w-64 flex-shrink-0 rounded-lg border border-gray-200 bg-white p-4 shadow dark:border-gray-700 dark:bg-gray-800"
                  >
                    <label
                      :for="'modeofPayments-' + index"
                      class="block text-left text-lg dark:text-white"
                    >
                      {{ modeOfPayment.mode_of_payment }}
                    </label>
                    <input
                      :id="'modeofPayments-' + index"
                      type="number"
                      name="modeofPayments"
                      class="block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-500 dark:bg-gray-600 dark:text-white dark:placeholder-gray-400"
                      required
                      v-model.number="modeOfPayment.value"
                      @click="recentOrders.calculatePaidAmount(modeOfPayment)"
                      @input="
                        recentOrders.changePaidAmount(
                          modeOfPayment.mode_of_payment,
                          $event.target.value
                        )
                      "
                    />
                  </div>
                </div>
              </div>
            </div>
            <div v-if="recentOrders.changeAmount > 0" class="mt-4 p-4 bg-gray-50 rounded-lg">
              <div class="flex justify-between items-center mt-2 text-green-600">
                <span class="text-lg font-medium">Change Amount:</span>
                <span class="text-lg">₹ {{ recentOrders.changeAmount.toFixed(2) }}</span>
              </div>
            </div>
            <div class="flex justify-end">
              <button
                @click="
                  this.recentOrders.showPayment = false;
                  this.recentOrders.makePayment();
                "
                class="mt-10 rounded bg-blue-500 px-3 py-2 text-white hover:bg-blue-600"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { usetoggleRecentOrder } from "@/stores/recentOrder.js";
import { useInvoiceDataStore } from "@/stores/invoiceData.js";
import { useAuthStore } from "@/stores/Auth.js";
import { Badge } from "flowbite-vue";
import { useNotifications } from "@/stores/Notification.js";
export default {
  name: "RecentOrder",
  components: {
    Badge,
  },
  methods: {
    handleConfirmCancellation() {
      if (!this.recentOrders.cancelReason || this.recentOrders.cancelReason.trim() === '') {
        this.notification.createNotification('Please enter a reason for cancellation');
        return;
      }
      this.recentOrders.cancelInvoice();
      this.recentOrders.cancelInvoiceFlag = false;
    },
  },
  setup() {
    const recentOrders = usetoggleRecentOrder();
    const invoiceData = useInvoiceDataStore();
    const auth = useAuthStore();
    const notification = useNotifications();
    return { recentOrders, invoiceData, auth, notification };
  },
  mounted() {
    this.recentOrders.handleStatusChange();
  },
};
</script>
<style>
.bg-gray-100 {
  background-color: rgba(0, 0, 0, 0.2);
}
</style>
